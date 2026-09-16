

const express = require("express");
const router = express.Router();

const { db } = require("./database");
const { requireAuth, requireAdmin } = require("./auth");

const { Pool } = require("pg");

/* =========================================================
   SUPABASE / POSTGRES CONNECTION
========================================================= */

let pgPool = null;

if (process.env.DATABASE_URL) {
    try {
        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });

        console.log("CHAT: Supabase PostgreSQL pool initialized.");
    } catch (error) {
        console.error(
            "CHAT: PostgreSQL pool initialization failed:",
            error.message
        );
    }
}

/* =========================================================
   TABLE SETUP / MIGRATION
========================================================= */

function setupChatTable() {

    try {

        const tableInfo = db.prepare(`
            PRAGMA table_info(support_chat_messages)
        `).all();

        /* -------------------------------------------------
           TABLE DOES NOT EXIST
        ------------------------------------------------- */

        if (!tableInfo || tableInfo.length === 0) {

            db.prepare(`
                CREATE TABLE support_chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    user_source TEXT NOT NULL DEFAULT 'sqlite',
                    sender_type TEXT NOT NULL CHECK (
                        sender_type IN ('customer', 'admin')
                    ),
                    message TEXT NOT NULL,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `).run();

            console.log(
                "CHAT: support_chat_messages table created."
            );

        } else {

            /* -------------------------------------------------
               OLD TABLE EXISTS WITHOUT user_source
            ------------------------------------------------- */

            const hasUserSource = tableInfo.some(
                column => column.name === "user_source"
            );

            if (!hasUserSource) {

                db.prepare(`
                    ALTER TABLE support_chat_messages
                    ADD COLUMN user_source TEXT
                    NOT NULL DEFAULT 'sqlite'
                `).run();

                console.log(
                    "CHAT: user_source column added to support_chat_messages."
                );
            }
        }

        /* -------------------------------------------------
           INDEXES
        ------------------------------------------------- */

        db.prepare(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_user_source
            ON support_chat_messages(user_id, user_source)
        `).run();

        db.prepare(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_created_at
            ON support_chat_messages(created_at)
        `).run();

        console.log("CHAT: database structure ready.");

    } catch (error) {

        console.error(
            "CHAT: Database setup failed:",
            error.message
        );
    }
}

setupChatTable();

/* =========================================================
   HELPERS
========================================================= */

/*
   req.user comes from auth.js.

   The current auth.js session contains the user ID and role,
   but chat needs to know whether that ID belongs to SQLite
   or Supabase.

   We therefore check SQLite using ID + email + role.

   If exact SQLite user exists -> sqlite.
   Otherwise customer -> supabase.
*/

function getCustomerSource(req) {

    try {

        if (!req.user) {
            return null;
        }

        const userId = Number(req.user.id);

        if (!Number.isInteger(userId)) {
            return null;
        }

        const email = String(
            req.user.email || ""
        ).trim().toLowerCase();

        const role = String(
            req.user.role || "customer"
        ).trim().toLowerCase();

        /* -------------------------------------------------
           CHECK SQLITE
        ------------------------------------------------- */

        const sqliteUser = db.prepare(`
            SELECT id, email, role
            FROM users
            WHERE id = ?
            LIMIT 1
        `).get(userId);

        if (sqliteUser) {

            const sqliteEmail = String(
                sqliteUser.email || ""
            ).trim().toLowerCase();

            const sqliteRole = String(
                sqliteUser.role || "customer"
            ).trim().toLowerCase();

            if (
                sqliteEmail === email &&
                sqliteRole === role
            ) {
                return "sqlite";
            }
        }

        /* -------------------------------------------------
           CUSTOMER NOT FOUND IN SQLITE
           -> SUPABASE
        ------------------------------------------------- */

        if (
            role === "customer" &&
            pgPool
        ) {
            return "supabase";
        }

        return null;

    } catch (error) {

        console.error(
            "CHAT: getCustomerSource error:",
            error.message
        );

        return null;
    }
}

/* =========================================================
   GET CUSTOMER BY SOURCE
========================================================= */

async function getCustomerBySource(
    userId,
    source
) {

    const numericId = Number(userId);

    if (!Number.isInteger(numericId)) {
        return null;
    }

    if (source === "sqlite") {

        const user = db.prepare(`
            SELECT
                id,
                name,
                email,
                role
            FROM users
            WHERE id = ?
            LIMIT 1
        `).get(numericId);

        if (!user) {
            return null;
        }

        return {
            id: Number(user.id),
            name: user.name || "Customer",
            email: user.email || "",
            role: user.role || "customer",
            user_source: "sqlite"
        };
    }

    if (source === "supabase") {

        if (!pgPool) {
            return null;
        }

        try {

            /*
               This query supports common customer table names.
               Primary expected table is users.
            */

            const result = await pgPool.query(`
                SELECT
                    id,
                    name,
                    email,
                    role
                FROM users
                WHERE id = $1
                LIMIT 1
            `, [numericId]);

            if (
                result.rows &&
                result.rows.length > 0
            ) {

                const user = result.rows[0];

                return {
                    id: Number(user.id),
                    name: user.name || "Customer",
                    email: user.email || "",
                    role: user.role || "customer",
                    user_source: "supabase"
                };
            }

        } catch (error) {

            console.error(
                "CHAT: Supabase customer lookup failed:",
                error.message
            );
        }
    }

    return null;
}

/* =========================================================
   GET CUSTOMER SOURCE FROM QUERY
========================================================= */

function getRequestedSource(req) {

    const source = String(
        req.query.source || ""
    ).trim().toLowerCase();

    if (
        source === "sqlite" ||
        source === "supabase"
    ) {
        return source;
    }

    return null;
}

/* =========================================================
   CUSTOMER
   GET MESSAGES
========================================================= */

router.get(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            if (
                !req.user ||
                req.user.role !== "customer"
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Customer access required."
                });
            }

            const userId = Number(req.user.id);

            const userSource = getCustomerSource(req);

            if (!userSource) {

                return res.status(401).json({
                    success: false,
                    message: "Unable to identify customer account."
                });
            }

            const messages = db.prepare(`
                SELECT
                    id,
                    user_id,
                    user_source,
                    sender_type,
                    message,
                    is_read,
                    created_at
                FROM support_chat_messages
                WHERE
                    user_id = ?
                    AND user_source = ?
                ORDER BY created_at ASC, id ASC
            `).all(
                userId,
                userSource
            );

            /* -------------------------------------------------
               MARK ADMIN MESSAGES AS READ
            ------------------------------------------------- */

            db.prepare(`
                UPDATE support_chat_messages
                SET is_read = 1
                WHERE
                    user_id = ?
                    AND user_source = ?
                    AND sender_type = 'admin'
            `).run(
                userId,
                userSource
            );

            return res.json({
                success: true,
                messages
            });

        } catch (error) {

            console.error(
                "CHAT: Customer GET messages error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load chat messages."
            });
        }
    }
);

/* =========================================================
   CUSTOMER
   SEND MESSAGE
========================================================= */

router.post(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            if (
                !req.user ||
                req.user.role !== "customer"
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Customer access required."
                });
            }

            const userId = Number(req.user.id);

            const userSource = getCustomerSource(req);

            if (!userSource) {

                return res.status(401).json({
                    success: false,
                    message: "Unable to identify customer account."
                });
            }

            const message = String(
                req.body.message || ""
            ).trim();

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message: "Message is required."
                });
            }

            if (message.length > 5000) {

                return res.status(400).json({
                    success: false,
                    message: "Message is too long."
                });
            }

            const result = db.prepare(`
                INSERT INTO support_chat_messages (
                    user_id,
                    user_source,
                    sender_type,
                    message,
                    is_read,
                    created_at
                )
                VALUES (
                    ?,
                    ?,
                    'customer',
                    ?,
                    0,
                    CURRENT_TIMESTAMP
                )
            `).run(
                userId,
                userSource,
                message
            );

            const savedMessage = db.prepare(`
                SELECT
                    id,
                    user_id,
                    user_source,
                    sender_type,
                    message,
                    is_read,
                    created_at
                FROM support_chat_messages
                WHERE id = ?
                LIMIT 1
            `).get(result.lastInsertRowid);

            return res.json({
                success: true,
                message: savedMessage
            });

        } catch (error) {

            console.error(
                "CHAT: Customer POST message error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to send message."
            });
        }
    }
);

/* =========================================================
   ADMIN
   GET ALL CONVERSATIONS
========================================================= */

router.get(
    "/conversations",
    requireAdmin,
    async (req, res) => {

        try {

            const conversations = [];

            /* =================================================
               SQLITE CUSTOMERS
            ================================================= */

            const sqliteCustomers = db.prepare(`
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    MAX(c.created_at) AS last_message_at,
                    (
                        SELECT c2.message
                        FROM support_chat_messages c2
                        WHERE
                            c2.user_id = u.id
                            AND c2.user_source = 'sqlite'
                        ORDER BY c2.created_at DESC, c2.id DESC
                        LIMIT 1
                    ) AS last_message,
                    (
                        SELECT COUNT(*)
                        FROM support_chat_messages c3
                        WHERE
                            c3.user_id = u.id
                            AND c3.user_source = 'sqlite'
                            AND c3.sender_type = 'customer'
                            AND c3.is_read = 0
                    ) AS unread_count
                FROM users u
                LEFT JOIN support_chat_messages c
                    ON c.user_id = u.id
                    AND c.user_source = 'sqlite'
                WHERE
                    LOWER(COALESCE(u.role, 'customer')) = 'customer'
                GROUP BY
                    u.id,
                    u.name,
                    u.email
                HAVING
                    last_message_at IS NOT NULL
            `).all();

            for (const customer of sqliteCustomers) {

                conversations.push({
                    id: Number(customer.id),
                    name: customer.name || "Customer",
                    email: customer.email || "",
                    user_source: "sqlite",
                    last_message: customer.last_message || "",
                    last_message_at: customer.last_message_at,
                    unread_count: Number(
                        customer.unread_count || 0
                    )
                });
            }

            /* =================================================
               SUPABASE CUSTOMERS
            ================================================= */

            if (pgPool) {

                try {

                    const result = await pgPool.query(`
                        SELECT
                            id,
                            name,
                            email,
                            role
                        FROM users
                        WHERE LOWER(COALESCE(role, 'customer')) = 'customer'
                        ORDER BY id ASC
                    `);

                    for (const customer of result.rows) {

                        const userId = Number(customer.id);

                        const chatInfo = db.prepare(`
                            SELECT
                                (
                                    SELECT message
                                    FROM support_chat_messages
                                    WHERE
                                        user_id = ?
                                        AND user_source = 'supabase'
                                    ORDER BY created_at DESC, id DESC
                                    LIMIT 1
                                ) AS last_message,

                                (
                                    SELECT created_at
                                    FROM support_chat_messages
                                    WHERE
                                        user_id = ?
                                        AND user_source = 'supabase'
                                    ORDER BY created_at DESC, id DESC
                                    LIMIT 1
                                ) AS last_message_at,

                                (
                                    SELECT COUNT(*)
                                    FROM support_chat_messages
                                    WHERE
                                        user_id = ?
                                        AND user_source = 'supabase'
                                        AND sender_type = 'customer'
                                        AND is_read = 0
                                ) AS unread_count
                        `).get(
                            userId,
                            userId,
                            userId
                        );

                        /*
                           Only show Supabase customers who actually
                           have a chat conversation.
                        */

                        if (
                            chatInfo &&
                            chatInfo.last_message_at
                        ) {

                            conversations.push({
                                id: userId,
                                name: customer.name || "Customer",
                                email: customer.email || "",
                                user_source: "supabase",
                                last_message:
                                    chatInfo.last_message || "",
                                last_message_at:
                                    chatInfo.last_message_at,
                                unread_count:
                                    Number(
                                        chatInfo.unread_count || 0
                                    )
                            });
                        }
                    }

                } catch (error) {

                    console.error(
                        "CHAT: Supabase conversations error:",
                        error.message
                    );
                }
            }

            /* =================================================
               SORT BY LATEST MESSAGE
            ================================================= */

            conversations.sort(
                (a, b) => {

                    const timeA = a.last_message_at
                        ? new Date(a.last_message_at).getTime()
                        : 0;

                    const timeB = b.last_message_at
                        ? new Date(b.last_message_at).getTime()
                        : 0;

                    return timeB - timeA;
                }
            );

            return res.json({
                success: true,
                conversations
            });

        } catch (error) {

            console.error(
                "CHAT: Admin conversations error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load conversations."
            });
        }
    }
);

/* =========================================================
   ADMIN
   GET ONE CONVERSATION
========================================================= */

router.get(
    "/conversations/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            const userId = Number(
                req.params.userId
            );

            const source = getRequestedSource(req);

            if (
                !Number.isInteger(userId) ||
                !source
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid customer information."
                });
            }

            const customer =
                await getCustomerBySource(
                    userId,
                    source
                );

            if (!customer) {

                return res.status(404).json({
                    success: false,
                    message: "Customer not found."
                });
            }

            const messages = db.prepare(`
                SELECT
                    id,
                    user_id,
                    user_source,
                    sender_type,
                    message,
                    is_read,
                    created_at
                FROM support_chat_messages
                WHERE
                    user_id = ?
                    AND user_source = ?
                ORDER BY created_at ASC, id ASC
            `).all(
                userId,
                source
            );

            return res.json({
                success: true,
                customer,
                messages
            });

        } catch (error) {

            console.error(
                "CHAT: Admin conversation error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load conversation."
            });
        }
    }
);

/* =========================================================
   ADMIN
   REPLY TO CUSTOMER
========================================================= */

router.post(
    "/conversations/:userId/reply",
    requireAdmin,
    async (req, res) => {

        try {

            const userId = Number(
                req.params.userId
            );

            const source = getRequestedSource(req);

            if (
                !Number.isInteger(userId) ||
                !source
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid customer information."
                });
            }

            const message = String(
                req.body.message || ""
            ).trim();

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message: "Reply message is required."
                });
            }

            if (message.length > 5000) {

                return res.status(400).json({
                    success: false,
                    message: "Message is too long."
                });
            }

            const customer =
                await getCustomerBySource(
                    userId,
                    source
                );

            if (!customer) {

                return res.status(404).json({
                    success: false,
                    message: "Customer not found."
                });
            }

            /* -------------------------------------------------
               SAVE ADMIN REPLY
            ------------------------------------------------- */

            const result = db.prepare(`
                INSERT INTO support_chat_messages (
                    user_id,
                    user_source,
                    sender_type,
                    message,
                    is_read,
                    created_at
                )
                VALUES (
                    ?,
                    ?,
                    'admin',
                    ?,
                    0,
                    CURRENT_TIMESTAMP
                )
            `).run(
                userId,
                source,
                message
            );

            const savedMessage = db.prepare(`
                SELECT
                    id,
                    user_id,
                    user_source,
                    sender_type,
                    message,
                    is_read,
                    created_at
                FROM support_chat_messages
                WHERE id = ?
                LIMIT 1
            `).get(result.lastInsertRowid);

            /* -------------------------------------------------
               EMAIL CUSTOMER
            ------------------------------------------------- */

            try {

                if (
                    customer.email &&
                    typeof require === "function"
                ) {

                    /*
                       Keep email behavior compatible with
                       existing project setup.

                       If your existing project exposes an email
                       helper, this block can be connected there.
                    */

                    console.log(
                        `CHAT: Admin reply saved for ${customer.email}`
                    );
                }

            } catch (emailError) {

                console.error(
                    "CHAT: Email notification error:",
                    emailError.message
                );
            }

            return res.json({
                success: true,
                message: savedMessage
            });

        } catch (error) {

            console.error(
                "CHAT: Admin reply error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to send admin reply."
            });
        }
    }
);

/* =========================================================
   ADMIN
   MARK CONVERSATION READ
========================================================= */

router.patch(
    "/conversations/:userId/read",
    requireAdmin,
    async (req, res) => {

        try {

            const userId = Number(
                req.params.userId
            );

            const source = getRequestedSource(req);

            if (
                !Number.isInteger(userId) ||
                !source
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid customer information."
                });
            }

            db.prepare(`
                UPDATE support_chat_messages
                SET is_read = 1
                WHERE
                    user_id = ?
                    AND user_source = ?
                    AND sender_type = 'customer'
            `).run(
                userId,
                source
            );

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "CHAT: Mark read error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to mark messages as read."
            });
        }
    }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
