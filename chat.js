// =========================================================
// U.S TRAVEL & TOURS
// LIVE SUPPORT CHAT BACKEND
// =========================================================

const express = require("express");
const nodemailer = require("nodemailer");

const { db } = require("./database");
const { requireAuth, requireAdmin } = require("./auth");

const router = express.Router();

console.log("CHAT: Initializing live chat backend...");

// =========================================================
// DATABASE SETUP
// =========================================================

const CHAT_TABLE = "support_chat_messages";

try {

    db.exec(`
        CREATE TABLE IF NOT EXISTS support_chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            user_source TEXT NOT NULL DEFAULT 'sqlite'
                CHECK(user_source IN ('sqlite', 'supabase')),

            sender_type TEXT NOT NULL
                CHECK(sender_type IN ('customer', 'admin')),

            message TEXT NOT NULL,

            is_read INTEGER NOT NULL DEFAULT 0,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_support_chat_user_id
        ON support_chat_messages(user_id);

        CREATE INDEX IF NOT EXISTS idx_support_chat_user_source
        ON support_chat_messages(user_id, user_source);

        CREATE INDEX IF NOT EXISTS idx_support_chat_created_at
        ON support_chat_messages(created_at);

        CREATE INDEX IF NOT EXISTS idx_support_chat_unread
        ON support_chat_messages(
            user_id,
            user_source,
            sender_type,
            is_read
        );
    `);

    // ---------------------------------------------------------
    // Existing installations:
    // Add user_source if old table already exists.
    // ---------------------------------------------------------

    const columns = db
        .prepare(`PRAGMA table_info(${CHAT_TABLE})`)
        .all();

    const hasUserSource = columns.some(
        column => column.name === "user_source"
    );

    if (!hasUserSource) {

        console.log(
            "CHAT DATABASE: Adding user_source column..."
        );

        db.exec(`
            ALTER TABLE support_chat_messages
            ADD COLUMN user_source TEXT NOT NULL DEFAULT 'sqlite';
        `);

        console.log(
            "CHAT DATABASE: user_source column added."
        );
    }

    console.log(
        "CHAT DATABASE: support chat table ready."
    );

} catch (error) {

    console.error(
        "CHAT DATABASE ERROR:",
        error
    );

    throw error;
}

// =========================================================
// EMAIL CONFIGURATION
// =========================================================

let transporter = null;

function createTransporter() {

    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_PORT ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
    ) {

        console.warn(
            "CHAT SMTP: SMTP configuration missing."
        );

        return null;
    }

    return nodemailer.createTransport({

        host: process.env.SMTP_HOST,

        port: Number(
            process.env.SMTP_PORT
        ),

        secure:
            String(
                process.env.SMTP_SECURE || ""
            ).toLowerCase() === "true",

        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }

    });
}

transporter = createTransporter();

// =========================================================
// HELPERS
// =========================================================

function cleanMessage(value) {

    if (
        typeof value !== "string"
    ) {

        return "";
    }

    return value
        .replace(/\u0000/g, "")
        .trim();
}

// ---------------------------------------------------------
// Get authenticated numeric user ID
// ---------------------------------------------------------

function getUserId(req) {

    if (
        !req.user ||
        req.user.id === undefined ||
        req.user.id === null
    ) {

        return null;
    }

    const userId =
        Number(req.user.id);

    if (
        !Number.isInteger(userId) ||
        userId <= 0
    ) {

        return null;
    }

    return userId;
}

// ---------------------------------------------------------
// Determine whether authenticated user is SQLite
// or Supabase.
//
// We intentionally compare email + role so that
// SQLite/Supabase numeric ID collisions do not matter.
// ---------------------------------------------------------

function getAuthenticatedUserSource(req) {

    if (!req.user) {
        return null;
    }

    const userId =
        Number(req.user.id);

    const email =
        String(req.user.email || "")
            .trim()
            .toLowerCase();

    // ---------------------------------------------------------
    // Check exact SQLite user
    // ---------------------------------------------------------

    if (
        Number.isInteger(userId) &&
        userId > 0
    ) {

        const sqliteUser =
            db.prepare(`
                SELECT
                    id,
                    name,
                    email,
                    role
                FROM users
                WHERE id = ?
                LIMIT 1
            `).get(userId);

        if (
            sqliteUser &&
            String(sqliteUser.email || "")
                .trim()
                .toLowerCase() === email &&
            sqliteUser.role === req.user.role
        ) {

            return "sqlite";
        }
    }

    // ---------------------------------------------------------
    // New customers are stored in Supabase.
    // If exact SQLite identity was not found,
    // authenticated customer is treated as Supabase.
    // ---------------------------------------------------------

    if (req.user.role === "customer") {

        return "supabase";
    }

    // Existing admin is SQLite.
    if (req.user.role === "admin") {

        return "sqlite";
    }

    return null;
}

// ---------------------------------------------------------
// Get customer from SQLite
// ---------------------------------------------------------

function getSQLiteCustomerById(userId) {

    return db.prepare(`
        SELECT
            id,
            name,
            email,
            role
        FROM users
        WHERE id = ?
        LIMIT 1
    `).get(userId);
}

// ---------------------------------------------------------
// Get customer from Supabase
// ---------------------------------------------------------

let supabasePool = null;

try {

    if (process.env.DATABASE_URL) {

        const { Pool } = require("pg");

        supabasePool = new Pool({
            connectionString:
                process.env.DATABASE_URL,

            ssl: {
                rejectUnauthorized: false
            },

            max: 3,

            idleTimeoutMillis: 30000,

            connectionTimeoutMillis: 10000
        });

    }

} catch (error) {

    console.error(
        "CHAT SUPABASE INIT ERROR:",
        error
    );

}

// ---------------------------------------------------------
// Get Supabase customer
// ---------------------------------------------------------

async function getSupabaseCustomerById(userId) {

    if (!supabasePool) {

        return null;
    }

    try {

        const result =
            await supabasePool.query(`
                SELECT
                    id,
                    name,
                    email,
                    role
                FROM users
                WHERE id = $1
                LIMIT 1
            `, [userId]);

        return result.rows[0] || null;

    } catch (error) {

        console.error(
            "CHAT SUPABASE CUSTOMER ERROR:",
            error
        );

        return null;
    }
}

// ---------------------------------------------------------
// Get customer based on source
// ---------------------------------------------------------

async function getCustomerBySource(
    userId,
    source
) {

    if (source === "supabase") {

        const customer =
            await getSupabaseCustomerById(
                userId
            );

        if (
            customer &&
            customer.role === "customer"
        ) {

            return customer;
        }

        return null;
    }

    const customer =
        getSQLiteCustomerById(
            userId
        );

    if (
        customer &&
        customer.role === "customer"
    ) {

        return customer;
    }

    return null;
}

// ---------------------------------------------------------
// Escape HTML
// ---------------------------------------------------------

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------
// Validate source
// ---------------------------------------------------------

function normalizeSource(value) {

    const source =
        String(value || "")
            .trim()
            .toLowerCase();

    if (
        source === "supabase" ||
        source === "sqlite"
    ) {

        return source;
    }

    return null;
}

// =========================================================
// CUSTOMER - GET OWN MESSAGES
// =========================================================

router.get(
    "/messages",
    requireAuth,
    (req, res) => {

        try {

            if (
                !req.user ||
                req.user.role !== "customer"
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Customer access required."
                });
            }

            const userId =
                getUserId(req);

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Authentication required."
                });
            }

            const source =
                getAuthenticatedUserSource(req);

            if (!source) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Unable to identify customer account."
                });
            }

            const messages =
                db.prepare(`
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
                    ORDER BY id ASC
                `).all(
                    userId,
                    source
                );

            // -------------------------------------------------
            // Admin replies become read when customer opens chat
            // -------------------------------------------------

            db.prepare(`
                UPDATE support_chat_messages
                SET is_read = 1
                WHERE
                    user_id = ?
                    AND user_source = ?
                    AND sender_type = 'admin'
            `).run(
                userId,
                source
            );

            return res.json({

                success: true,

                messages

            });

        } catch (error) {

            console.error(
                "CHAT GET CUSTOMER ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load chat messages."
            });
        }
    }
);

// =========================================================
// CUSTOMER - SEND MESSAGE
// =========================================================

router.post(
    "/messages",
    requireAuth,
    (req, res) => {

        try {

            if (
                !req.user ||
                req.user.role !== "customer"
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Customer access required."
                });
            }

            const userId =
                getUserId(req);

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Authentication required."
                });
            }

            const source =
                getAuthenticatedUserSource(req);

            if (!source) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Unable to identify customer account."
                });
            }

            const message =
                cleanMessage(
                    req.body?.message
                );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message cannot be empty."
                });
            }

            if (message.length > 2000) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message cannot exceed 2000 characters."
                });
            }

            const result =
                db.prepare(`
                    INSERT INTO support_chat_messages
                    (
                        user_id,
                        user_source,
                        sender_type,
                        message,
                        is_read
                    )
                    VALUES
                    (?, ?, 'customer', ?, 0)
                `).run(
                    userId,
                    source,
                    message
                );

            const savedMessage =
                db.prepare(`
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
                `).get(
                    result.lastInsertRowid
                );

            console.log(
                `CHAT: Customer ${userId} (${source}) sent message #${result.lastInsertRowid}`
            );

            return res.status(201).json({

                success: true,

                message:
                    "Message sent successfully.",

                data: savedMessage

            });

        } catch (error) {

            console.error(
                "CHAT SEND CUSTOMER ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to send message."
            });
        }
    }
);

// =========================================================
// ADMIN - CUSTOMER CONVERSATION LIST
// =========================================================

router.get(
    "/conversations",
    requireAdmin,
    async (req, res) => {

        try {

            // -------------------------------------------------
            // SQLite customers
            // -------------------------------------------------

            const sqliteCustomers =
                db.prepare(`
                    SELECT
                        u.id AS user_id,
                        'sqlite' AS user_source,
                        u.name,
                        u.email,

                        (
                            SELECT cm.message
                            FROM support_chat_messages cm
                            WHERE
                                cm.user_id = u.id
                                AND cm.user_source = 'sqlite'
                            ORDER BY cm.id DESC
                            LIMIT 1
                        ) AS last_message,

                        (
                            SELECT cm.created_at
                            FROM support_chat_messages cm
                            WHERE
                                cm.user_id = u.id
                                AND cm.user_source = 'sqlite'
                            ORDER BY cm.id DESC
                            LIMIT 1
                        ) AS last_message_at,

                        (
                            SELECT COUNT(*)
                            FROM support_chat_messages cm
                            WHERE
                                cm.user_id = u.id
                                AND cm.user_source = 'sqlite'
                                AND cm.sender_type = 'customer'
                                AND cm.is_read = 0
                        ) AS unread_count

                    FROM users u

                    WHERE
                        u.role = 'customer'
                        AND EXISTS (
                            SELECT 1
                            FROM support_chat_messages cm2
                            WHERE
                                cm2.user_id = u.id
                                AND cm2.user_source = 'sqlite'
                        )
                `).all();

            // -------------------------------------------------
            // Supabase customers
            // -------------------------------------------------

            let supabaseCustomers = [];

            if (supabasePool) {

                try {

                    const result =
                        await supabasePool.query(`
                            SELECT
                                u.id AS user_id,
                                'supabase' AS user_source,
                                u.name,
                                u.email,

                                (
                                    SELECT cm.message
                                    FROM support_chat_messages cm
                                    WHERE
                                        cm.user_id = u.id
                                        AND cm.user_source = 'supabase'
                                    ORDER BY cm.id DESC
                                    LIMIT 1
                                ) AS last_message,

                                (
                                    SELECT cm.created_at
                                    FROM support_chat_messages cm
                                    WHERE
                                        cm.user_id = u.id
                                        AND cm.user_source = 'supabase'
                                    ORDER BY cm.id DESC
                                    LIMIT 1
                                ) AS last_message_at,

                                (
                                    SELECT COUNT(*)
                                    FROM support_chat_messages cm
                                    WHERE
                                        cm.user_id = u.id
                                        AND cm.user_source = 'supabase'
                                        AND cm.sender_type = 'customer'
                                        AND cm.is_read = 0
                                ) AS unread_count

                            FROM users u

                            WHERE
                                u.role = 'customer'

                                AND EXISTS (
                                    SELECT 1
                                    FROM support_chat_messages cm2
                                    WHERE
                                        cm2.user_id = u.id
                                        AND cm2.user_source = 'supabase'
                                )
                        `);

                    supabaseCustomers =
                        result.rows || [];

                } catch (error) {

                    console.error(
                        "CHAT SUPABASE CONVERSATIONS ERROR:",
                        error
                    );

                }
            }

            const conversations = [
                ...sqliteCustomers,
                ...supabaseCustomers
            ];

            conversations.sort(
                function (a, b) {

                    const dateA =
                        a.last_message_at
                            ? new Date(
                                String(
                                    a.last_message_at
                                ).replace(" ", "T") + "Z"
                            ).getTime()
                            : 0;

                    const dateB =
                        b.last_message_at
                            ? new Date(
                                String(
                                    b.last_message_at
                                ).replace(" ", "T") + "Z"
                            ).getTime()
                            : 0;

                    return dateB - dateA;

                }
            );

            return res.json({

                success: true,

                conversations

            });

        } catch (error) {

            console.error(
                "CHAT ADMIN CONVERSATIONS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load chat conversations."
            });
        }
    }
);

// =========================================================
// ADMIN - GET CUSTOMER MESSAGES
// =========================================================

router.get(
    "/conversations/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid customer."
                });
            }

            const source =
                normalizeSource(
                    req.query.source
                );

            if (!source) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Customer source is required."
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
                    message:
                        "Customer not found."
                });
            }

            const messages =
                db.prepare(`
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
                    ORDER BY id ASC
                `).all(
                    userId,
                    source
                );

            // -------------------------------------------------
            // Customer messages become read
            // when admin opens conversation.
            // -------------------------------------------------

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

                success: true,

                customer: {

                    id: customer.id,

                    name:
                        customer.name,

                    email:
                        customer.email,

                    user_source:
                        source

                },

                messages

            });

        } catch (error) {

            console.error(
                "CHAT ADMIN MESSAGES ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load conversation."
            });
        }
    }
);

// =========================================================
// ADMIN - REPLY
// =========================================================

router.post(
    "/conversations/:userId/reply",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid customer."
                });
            }

            const source =
                normalizeSource(
                    req.query.source
                );

            if (!source) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Customer source is required."
                });
            }

            const message =
                cleanMessage(
                    req.body?.message
                );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Reply cannot be empty."
                });
            }

            if (message.length > 2000) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Reply cannot exceed 2000 characters."
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
                    message:
                        "Customer not found."
                });
            }

            const result =
                db.prepare(`
                    INSERT INTO support_chat_messages
                    (
                        user_id,
                        user_source,
                        sender_type,
                        message,
                        is_read
                    )
                    VALUES
                    (?, ?, 'admin', ?, 0)
                `).run(
                    userId,
                    source,
                    message
                );

            const savedMessage =
                db.prepare(`
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
                `).get(
                    result.lastInsertRowid
                );

            console.log(
                `CHAT: Admin replied to customer ${userId} (${source})`
            );

            // =================================================
            // EMAIL CUSTOMER
            // =================================================

            if (
                transporter &&
                customer.email &&
                process.env.MAIL_FROM
            ) {

                try {

                    await transporter.sendMail({

                        from:
                            process.env.MAIL_FROM,

                        to:
                            customer.email,

                        subject:
                            "New message from U.S TRAVEL & TOURS",

                        text:
`Hello ${customer.name || "Customer"},

You have received a new message from U.S TRAVEL & TOURS Support.

Support message:

${message}

Please log in to your account to continue the conversation.

U.S TRAVEL & TOURS
Miami, Florida, USA`,

                        html:
`
<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">

    <h2>U.S TRAVEL & TOURS</h2>

    <p>
        Hello ${escapeHtml(
            customer.name || "Customer"
        )},
    </p>

    <p>
        You have received a new message from
        U.S TRAVEL & TOURS Support.
    </p>

    <div style="
        background:#f5f5f5;
        border-left:4px solid #b8944a;
        padding:15px;
        margin:20px 0;
    ">
        ${escapeHtml(message)}
    </div>

    <p>
        Please log in to your account to continue
        the conversation.
    </p>

    <p>
        U.S TRAVEL & TOURS<br>
        Miami, Florida, USA
    </p>

</div>
`
                    });

                    console.log(
                        `CHAT EMAIL: Notification sent to ${customer.email}`
                    );

                } catch (emailError) {

                    console.error(
                        "CHAT EMAIL ERROR:",
                        emailError
                    );
                }
            }

            return res.status(201).json({

                success: true,

                message:
                    "Reply sent successfully.",

                data:
                    savedMessage

            });

        } catch (error) {

            console.error(
                "CHAT ADMIN REPLY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to send reply."
            });
        }
    }
);

// =========================================================
// ADMIN - MARK CUSTOMER CHAT READ
// =========================================================

router.patch(
    "/conversations/:userId/read",
    requireAdmin,
    (req, res) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid customer."
                });
            }

            const source =
                normalizeSource(
                    req.query.source
                );

            if (!source) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Customer source is required."
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
                "CHAT READ ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to update chat."
            });
        }
    }
);

// =========================================================
// EXPORT
// =========================================================

module.exports = router;

console.log(
    "CHAT: Live chat backend loaded."
);
