/* =========================================================
   U.S TRAVEL & TOURS
   LIVE CHAT BACKEND
   SUPABASE / POSTGRESQL PERSISTENT VERSION
========================================================= */

const express = require("express");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();

/* =========================================================
   CONFIG
========================================================= */

const OWNER_EMAIL =
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(process.env.SMTP_PORT) || 587;

const SMTP_SECURE =
    String(process.env.SMTP_SECURE).toLowerCase() === "true";

const SMTP_USER =
    process.env.SMTP_USER || "";

const SMTP_PASS =
    process.env.SMTP_PASS || "";

const MAIL_FROM =
    process.env.MAIL_FROM ||
    SMTP_USER ||
    OWNER_EMAIL;

const MAX_MESSAGE_LENGTH = 2000;

/* =========================================================
   SUPABASE / POSTGRESQL
========================================================= */

if (!process.env.DATABASE_URL) {
    console.error(
        "CHAT DATABASE ERROR: DATABASE_URL is not configured."
    );
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : undefined,

    max: 5,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 10000
});

pool.on("error", function (error) {
    console.error(
        "CHAT POSTGRES POOL ERROR:",
        error
    );
});

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

let databaseReady = false;

const databaseInitialization =
    initializeDatabase();

async function initializeDatabase() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_conversations (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id BIGSERIAL PRIMARY KEY,
                conversation_id BIGINT NOT NULL,
                sender_type TEXT NOT NULL
                    CHECK (
                        sender_type IN ('customer', 'admin')
                    ),
                sender_user_id BIGINT,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_messages_conversation
            ON chat_messages(conversation_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_messages_created
            ON chat_messages(created_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_conversations_updated
            ON chat_conversations(updated_at DESC)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_conversations_user
            ON chat_conversations(user_id)
        `);

        databaseReady = true;

        console.log(
            "CHAT DATABASE: Supabase chat tables ready."
        );

    } catch (error) {

        console.error(
            "CHAT DATABASE INITIALIZATION ERROR:",
            error
        );

        throw error;
    }
}

/* =========================================================
   WAIT FOR DATABASE
========================================================= */

async function waitForDatabase() {

    if (!databaseReady) {
        await databaseInitialization;
    }
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function runQuery(
    sql,
    params = []
) {

    await waitForDatabase();

    return pool.query(
        sql,
        params
    );
}

async function getRow(
    sql,
    params = []
) {

    const result =
        await runQuery(
            sql,
            params
        );

    return result.rows[0] || null;
}

async function getRows(
    sql,
    params = []
) {

    const result =
        await runQuery(
            sql,
            params
        );

    return result.rows || [];
}

/* =========================================================
   SMTP
========================================================= */

let transporter = null;

if (SMTP_USER && SMTP_PASS) {

    transporter =
        nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,

            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            }
        });

    transporter
        .verify()
        .then(function () {

            console.log(
                "CHAT SMTP: Brevo SMTP connection verified successfully."
            );

        })
        .catch(function (error) {

            console.error(
                "CHAT SMTP VERIFY ERROR:",
                error.message
            );

        });

} else {

    console.warn(
        "CHAT SMTP: SMTP credentials are not configured."
    );
}

/* =========================================================
   HELPERS
========================================================= */

function cleanText(
    value,
    maxLength = MAX_MESSAGE_LENGTH
) {

    if (typeof value !== "string") {
        return "";
    }

    return value
        .replace(/\u0000/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim()
        .slice(0, maxLength);
}

function cleanEmail(value) {

    if (typeof value !== "string") {
        return "";
    }

    return value
        .trim()
        .toLowerCase()
        .slice(0, 254);
}

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);
}

function getUserId(req) {

    if (
        !req.user ||
        !req.user.id
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

function isAdminUser(req) {

    return (
        req.user &&
        (
            req.user.role === "admin" ||
            req.user.role === "owner"
        )
    );
}

/* =========================================================
   CUSTOMER
   GET /api/chat/conversation
========================================================= */

router.get(
    "/conversation",
    requireAuth,
    async function (req, res) {

        try {

            if (isAdminUser(req)) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Customer chat endpoint is not available for administrators."
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

            let conversation =
                await getRow(
                    `
                    SELECT
                        id,
                        user_id,
                        created_at,
                        updated_at
                    FROM chat_conversations
                    WHERE user_id = $1
                    `,
                    [userId]
                );

            if (!conversation) {

                const result =
                    await getRow(
                        `
                        INSERT INTO chat_conversations
                        (
                            user_id
                        )
                        VALUES ($1)
                        RETURNING
                            id,
                            user_id,
                            created_at,
                            updated_at
                        `,
                        [userId]
                    );

                conversation = result;
            }

            return res.json({
                success: true,
                conversation
            });

        } catch (error) {

            console.error(
                "GET CHAT CONVERSATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load chat conversation."
            });
        }
    }
);

/* =========================================================
   CUSTOMER
   GET /api/chat/messages
========================================================= */

router.get(
    "/messages",
    requireAuth,
    async function (req, res) {

        try {

            if (isAdminUser(req)) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Use admin chat endpoints."
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

            const conversation =
                await getRow(
                    `
                    SELECT id
                    FROM chat_conversations
                    WHERE user_id = $1
                    `,
                    [userId]
                );

            if (!conversation) {

                return res.json({
                    success: true,
                    messages: []
                });
            }

            const messages =
                await getRows(
                    `
                    SELECT
                        id,
                        conversation_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    FROM chat_messages
                    WHERE conversation_id = $1
                    ORDER BY id ASC
                    `,
                    [conversation.id]
                );

            /*
               Customer has read admin messages
            */

            await runQuery(
                `
                UPDATE chat_messages
                SET is_read = TRUE
                WHERE conversation_id = $1
                AND sender_type = 'admin'
                `,
                [conversation.id]
            );

            return res.json({
                success: true,
                conversationId:
                    Number(conversation.id),
                messages
            });

        } catch (error) {

            console.error(
                "GET CHAT MESSAGES ERROR:",
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

/* =========================================================
   CUSTOMER
   POST /api/chat/messages
========================================================= */

router.post(
    "/messages",
    requireAuth,
    async function (req, res) {

        try {

            if (isAdminUser(req)) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Administrators cannot use the customer chat endpoint."
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

            const message =
                cleanText(
                    req.body?.message
                );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a message."
                });
            }

            if (
                message.length >
                MAX_MESSAGE_LENGTH
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`
                });
            }

            let conversation =
                await getRow(
                    `
                    SELECT id
                    FROM chat_conversations
                    WHERE user_id = $1
                    `,
                    [userId]
                );

            if (!conversation) {

                conversation =
                    await getRow(
                        `
                        INSERT INTO chat_conversations
                        (
                            user_id
                        )
                        VALUES ($1)
                        RETURNING id
                        `,
                        [userId]
                    );
            }

            const savedMessage =
                await getRow(
                    `
                    INSERT INTO chat_messages
                    (
                        conversation_id,
                        sender_type,
                        sender_user_id,
                        message,
                        is_read
                    )
                    VALUES
                    (
                        $1,
                        'customer',
                        $2,
                        $3,
                        FALSE
                    )
                    RETURNING
                        id,
                        conversation_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    `,
                    [
                        conversation.id,
                        userId,
                        message
                    ]
                );

            await runQuery(
                `
                UPDATE chat_conversations
                SET updated_at = NOW()
                WHERE id = $1
                `,
                [conversation.id]
            );

            /*
               Owner notification
            */

            await notifyOwnerOfCustomerMessage(
                req.user,
                message
            );

            return res.status(201).json({
                success: true,
                message:
                    "Message sent successfully.",
                chatMessage:
                    savedMessage
            });

        } catch (error) {

            console.error(
                "POST CHAT MESSAGE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to send chat message."
            });
        }
    }
);

/* =========================================================
   ADMIN
   GET /api/chat/admin/conversations
========================================================= */

router.get(
    "/admin/conversations",
    requireAdmin,
    async function (req, res) {

        try {

            const conversations =
                await getRows(
                    `
                    SELECT
                        c.id,
                        c.user_id,
                        c.created_at,
                        c.updated_at,

                        u.name AS customer_name,
                        u.email AS customer_email,

                        (
                            SELECT COUNT(*)
                            FROM chat_messages m2
                            WHERE
                                m2.conversation_id = c.id
                            AND
                                m2.sender_type = 'customer'
                            AND
                                m2.is_read = FALSE
                        ) AS unread_count,

                        (
                            SELECT m3.message
                            FROM chat_messages m3
                            WHERE
                                m3.conversation_id = c.id
                            ORDER BY
                                m3.id DESC
                            LIMIT 1
                        ) AS last_message

                    FROM chat_conversations c

                    LEFT JOIN users u
                        ON u.id = c.user_id

                    ORDER BY
                        c.updated_at DESC,
                        c.id DESC
                    `
                );

            return res.json({
                success: true,
                conversations
            });

        } catch (error) {

            console.error(
                "GET ADMIN CHAT CONVERSATIONS ERROR:",
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

/* =========================================================
   ADMIN
   GET /api/chat/admin/conversations/:id
========================================================= */

router.get(
    "/admin/conversations/:id",
    requireAdmin,
    async function (req, res) {

        try {

            const conversationId =
                Number(req.params.id);

            if (
                !Number.isInteger(conversationId) ||
                conversationId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid conversation ID."
                });
            }

            const conversation =
                await getRow(
                    `
                    SELECT
                        c.id,
                        c.user_id,
                        c.created_at,
                        c.updated_at,
                        u.name AS customer_name,
                        u.email AS customer_email
                    FROM chat_conversations c
                    LEFT JOIN users u
                        ON u.id = c.user_id
                    WHERE c.id = $1
                    `,
                    [conversationId]
                );

            if (!conversation) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Conversation not found."
                });
            }

            const messages =
                await getRows(
                    `
                    SELECT
                        id,
                        conversation_id,
                        sender_type,
                        sender_user_id,
                        message,
                        is_read,
                        created_at
                    FROM chat_messages
                    WHERE conversation_id = $1
                    ORDER BY id ASC
                    `,
                    [conversationId]
                );

            /*
               Admin opened conversation
            */

            await runQuery(
                `
                UPDATE chat_messages
                SET is_read = TRUE
                WHERE conversation_id = $1
                AND sender_type = 'customer'
                `,
                [conversationId]
            );

            return res.json({
                success: true,
                conversation,
                messages
            });

        } catch (error) {

            console.error(
                "GET ADMIN CHAT CONVERSATION ERROR:",
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

/* =========================================================
   ADMIN
   POST /api/chat/admin/conversations/:id/messages
========================================================= */

router.post(
    "/admin/conversations/:id/messages",
    requireAdmin,
    async function (req, res) {

        try {

            const conversationId =
                Number(req.params.id);

            if (
                !Number.isInteger(conversationId) ||
                conversationId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid conversation ID."
                });
            }

            const message =
                cleanText(
                    req.body?.message
                );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a message."
                });
            }

            if (
                message.length >
                MAX_MESSAGE_LENGTH
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`
                });
            }

            const conversation =
                await getRow(
                    `
                    SELECT
                        c.id,
                        c.user_id,
                        u.name AS customer_name,
                        u.email AS customer_email
                    FROM chat_conversations c
                    LEFT JOIN users u
                        ON u.id = c.user_id
                    WHERE c.id = $1
                    `,
                    [conversationId]
                );

            if (!conversation) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Conversation not found."
                });
            }

            const adminUserId =
                getUserId(req);

            const savedMessage =
                await getRow(
                    `
                    INSERT INTO chat_messages
                    (
                        conversation_id,
                        sender_type,
                        sender_user_id,
                        message,
                        is_read
                    )
                    VALUES
                    (
                        $1,
                        'admin',
                        $2,
                        $3,
                        FALSE
                    )
                    RETURNING
                        id,
                        conversation_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    `,
                    [
                        conversationId,
                        adminUserId,
                        message
                    ]
                );

            await runQuery(
                `
                UPDATE chat_conversations
                SET updated_at = NOW()
                WHERE id = $1
                `,
                [conversationId]
            );

            /*
               Customer email notification
            */

            await notifyCustomerOfAdminReply(
                conversation,
                message
            );

            return res.status(201).json({
                success: true,
                message:
                    "Reply sent successfully.",
                chatMessage:
                    savedMessage
            });

        } catch (error) {

            console.error(
                "ADMIN CHAT REPLY ERROR:",
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

/* =========================================================
   ADMIN
   PATCH /api/chat/admin/conversations/:id/read
========================================================= */

router.patch(
    "/admin/conversations/:id/read",
    requireAdmin,
    async function (req, res) {

        try {

            const conversationId =
                Number(req.params.id);

            if (
                !Number.isInteger(conversationId) ||
                conversationId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid conversation ID."
                });
            }

            await runQuery(
                `
                UPDATE chat_messages
                SET is_read = TRUE
                WHERE conversation_id = $1
                AND sender_type = 'customer'
                `,
                [conversationId]
            );

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "MARK CHAT READ ERROR:",
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

/* =========================================================
   EMAIL — OWNER NOTIFICATION
========================================================= */

async function notifyOwnerOfCustomerMessage(
    user,
    message
) {

    if (!transporter) {

        console.warn(
            "CHAT EMAIL: SMTP is not configured. Owner notification skipped."
        );

        return;
    }

    const customerName =
        cleanText(
            user?.name ||
            user?.fullName ||
            "Customer",
            120
        );

    const customerEmail =
        cleanEmail(
            user?.email || ""
        );

    try {

        await transporter.sendMail({

            from: MAIL_FROM,

            to: OWNER_EMAIL,

            replyTo:
                isValidEmail(customerEmail)
                    ? customerEmail
                    : undefined,

            subject:
                `New Live Chat Message — ${customerName}`,

            text:
`A customer has sent a new message through the U.S TRAVEL & TOURS website.

Customer:
${customerName}

Email:
${customerEmail || "Not available"}

Message:
${message}

Please open the Admin Dashboard → Live Chat to reply.`
        });

        console.log(
            "CHAT EMAIL: Owner notification sent."
        );

    } catch (error) {

        console.error(
            "CHAT OWNER EMAIL ERROR:",
            error.message
        );
    }
}

/* =========================================================
   EMAIL — CUSTOMER NOTIFICATION
========================================================= */

async function notifyCustomerOfAdminReply(
    conversation,
    message
) {

    if (!transporter) {

        console.warn(
            "CHAT EMAIL: SMTP is not configured. Customer notification skipped."
        );

        return;
    }

    const customerEmail =
        cleanEmail(
            conversation?.customer_email || ""
        );

    if (!isValidEmail(customerEmail)) {

        console.warn(
            "CHAT EMAIL: Customer email is invalid."
        );

        return;
    }

    const customerName =
        cleanText(
            conversation?.customer_name ||
            "Customer",
            120
        );

    try {

        await transporter.sendMail({

            from: MAIL_FROM,

            to: customerEmail,

            subject:
                "New Reply from U.S TRAVEL & TOURS",

            text:
`Hello ${customerName},

You have received a new reply from U.S TRAVEL & TOURS through the website live chat.

Reply:
${message}

Please log in to your account and open the Live Chat to continue the conversation.

U.S TRAVEL & TOURS`
        });

        console.log(
            `CHAT EMAIL: Customer notification sent to ${customerEmail}`
        );

    } catch (error) {

        console.error(
            "CHAT CUSTOMER EMAIL ERROR:",
            error.message
        );
    }
}

/* =========================================================
   ERROR HANDLER
========================================================= */

router.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            "CHAT ROUTER ERROR:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        return res.status(500).json({
            success: false,
            message:
                "Live chat service error."
        });
    }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
