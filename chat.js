/* =========================================================
   U.S TRAVEL & TOURS
   LIVE CHAT BACKEND
========================================================= */

const express = require("express");
const nodemailer = require("nodemailer");
const db = require("./database");

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
   SMTP
========================================================= */

let transporter = null;

if (SMTP_USER && SMTP_PASS) {

    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    transporter.verify()
        .then(() => {
            console.log(
                "CHAT SMTP: Brevo SMTP connection verified successfully."
            );
        })
        .catch((error) => {
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
   DATABASE HELPERS
========================================================= */

function run(sql, params = []) {
    return new Promise((resolve, reject) => {

        db.run(sql, params, function (error) {

            if (error) {
                reject(error);
                return;
            }

            resolve({
                id: this.lastID,
                changes: this.changes
            });

        });

    });
}


function get(sql, params = []) {
    return new Promise((resolve, reject) => {

        db.get(sql, params, (error, row) => {

            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });

    });
}


function all(sql, params = []) {
    return new Promise((resolve, reject) => {

        db.all(sql, params, (error, rows) => {

            if (error) {
                reject(error);
                return;
            }

            resolve(rows || []);
        });

    });
}

/* =========================================================
   CREATE TABLES
========================================================= */

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender_type TEXT NOT NULL
                CHECK(sender_type IN ('customer', 'admin')),
            sender_user_id INTEGER,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS
        idx_chat_messages_conversation
        ON chat_messages(conversation_id)
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS
        idx_chat_messages_created
        ON chat_messages(created_at)
    `);

    console.log(
        "CHAT DATABASE: chat tables ready."
    );

});

/* =========================================================
   HELPERS
========================================================= */

function cleanText(value, maxLength = MAX_MESSAGE_LENGTH) {

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

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function getUserId(req) {

    if (!req.user || !req.user.id) {
        return null;
    }

    return Number(req.user.id);
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
   GET /api/chat/conversation
   CUSTOMER
========================================================= */

router.get(
    "/conversation",
    requireAuth,
    async (req, res) => {

        try {

            if (isAdminUser(req)) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Customer chat endpoint is not available for administrators."
                });
            }

            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            let conversation = await get(
                `
                SELECT
                    id,
                    user_id,
                    created_at,
                    updated_at
                FROM chat_conversations
                WHERE user_id = ?
                `,
                [userId]
            );

            if (!conversation) {

                const result = await run(
                    `
                    INSERT INTO chat_conversations
                    (
                        user_id
                    )
                    VALUES (?)
                    `,
                    [userId]
                );

                conversation = await get(
                    `
                    SELECT
                        id,
                        user_id,
                        created_at,
                        updated_at
                    FROM chat_conversations
                    WHERE id = ?
                    `,
                    [result.id]
                );
            }

            res.json({
                success: true,
                conversation
            });

        } catch (error) {

            console.error(
                "GET CHAT CONVERSATION ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load chat conversation."
            });

        }

    }
);


/* =========================================================
   GET /api/chat/messages
   CUSTOMER
========================================================= */

router.get(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            if (isAdminUser(req)) {
                return res.status(403).json({
                    success: false,
                    message: "Use admin chat endpoints."
                });
            }

            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            const conversation = await get(
                `
                SELECT id
                FROM chat_conversations
                WHERE user_id = ?
                `,
                [userId]
            );

            if (!conversation) {

                return res.json({
                    success: true,
                    messages: []
                });

            }

            const messages = await all(
                `
                SELECT
                    id,
                    conversation_id,
                    sender_type,
                    message,
                    is_read,
                    created_at
                FROM chat_messages
                WHERE conversation_id = ?
                ORDER BY id ASC
                `,
                [conversation.id]
            );

            /* Customer has read admin messages */

            await run(
                `
                UPDATE chat_messages
                SET is_read = 1
                WHERE conversation_id = ?
                AND sender_type = 'admin'
                `,
                [conversation.id]
            );

            res.json({
                success: true,
                conversationId: conversation.id,
                messages
            });

        } catch (error) {

            console.error(
                "GET CHAT MESSAGES ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load chat messages."
            });

        }

    }
);


/* =========================================================
   POST /api/chat/messages
   CUSTOMER SEND MESSAGE
========================================================= */

router.post(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            if (isAdminUser(req)) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Administrators cannot use the customer chat endpoint."
                });
            }

            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            const message = cleanText(
                req.body?.message
            );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a message."
                });

            }

            if (message.length > MAX_MESSAGE_LENGTH) {

                return res.status(400).json({
                    success: false,
                    message:
                        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`
                });

            }

            let conversation = await get(
                `
                SELECT id
                FROM chat_conversations
                WHERE user_id = ?
                `,
                [userId]
            );

            if (!conversation) {

                const result = await run(
                    `
                    INSERT INTO chat_conversations
                    (
                        user_id
                    )
                    VALUES (?)
                    `,
                    [userId]
                );

                conversation = {
                    id: result.id
                };
            }

            const result = await run(
                `
                INSERT INTO chat_messages
                (
                    conversation_id,
                    sender_type,
                    sender_user_id,
                    message,
                    is_read
                )
                VALUES (?, 'customer', ?, ?, 0)
                `,
                [
                    conversation.id,
                    userId,
                    message
                ]
            );

            await run(
                `
                UPDATE chat_conversations
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [conversation.id]
            );

            const savedMessage = await get(
                `
                SELECT
                    id,
                    conversation_id,
                    sender_type,
                    message,
                    is_read,
                    created_at
                FROM chat_messages
                WHERE id = ?
                `,
                [result.id]
            );

            /* Notify owner by email */

            await notifyOwnerOfCustomerMessage(
                req.user,
                message
            );

            res.status(201).json({
                success: true,
                message: "Message sent successfully.",
                chatMessage: savedMessage
            });

        } catch (error) {

            console.error(
                "POST CHAT MESSAGE ERROR:",
                error
            );

            res.status(500).json({
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
    async (req, res) => {

        try {

            const conversations = await all(
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
                        WHERE m2.conversation_id = c.id
                        AND m2.sender_type = 'customer'
                        AND m2.is_read = 0
                    ) AS unread_count,

                    (
                        SELECT m3.message
                        FROM chat_messages m3
                        WHERE m3.conversation_id = c.id
                        ORDER BY m3.id DESC
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

            res.json({
                success: true,
                conversations
            });

        } catch (error) {

            console.error(
                "GET ADMIN CHAT CONVERSATIONS ERROR:",
                error
            );

            res.status(500).json({
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
    async (req, res) => {

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

            const conversation = await get(
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
                WHERE c.id = ?
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

            const messages = await all(
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
                WHERE conversation_id = ?
                ORDER BY id ASC
                `,
                [conversationId]
            );

            /* Admin opened conversation */

            await run(
                `
                UPDATE chat_messages
                SET is_read = 1
                WHERE conversation_id = ?
                AND sender_type = 'customer'
                `,
                [conversationId]
            );

            res.json({
                success: true,
                conversation,
                messages
            });

        } catch (error) {

            console.error(
                "GET ADMIN CHAT CONVERSATION ERROR:",
                error
            );

            res.status(500).json({
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
    async (req, res) => {

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

            const message = cleanText(
                req.body?.message
            );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a message."
                });

            }

            if (message.length > MAX_MESSAGE_LENGTH) {

                return res.status(400).json({
                    success: false,
                    message:
                        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`
                });

            }

            const conversation = await get(
                `
                SELECT
                    c.id,
                    c.user_id,
                    u.name AS customer_name,
                    u.email AS customer_email
                FROM chat_conversations c
                LEFT JOIN users u
                    ON u.id = c.user_id
                WHERE c.id = ?
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

            const result = await run(
                `
                INSERT INTO chat_messages
                (
                    conversation_id,
                    sender_type,
                    sender_user_id,
                    message,
                    is_read
                )
                VALUES (?, 'admin', ?, ?, 0)
                `,
                [
                    conversationId,
                    adminUserId,
                    message
                ]
            );

            await run(
                `
                UPDATE chat_conversations
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [conversationId]
            );

            const savedMessage = await get(
                `
                SELECT
                    id,
                    conversation_id,
                    sender_type,
                    message,
                    is_read,
                    created_at
                FROM chat_messages
                WHERE id = ?
                `,
                [result.id]
            );

            /* Send email notification to customer */

            await notifyCustomerOfAdminReply(
                conversation,
                message
            );

            res.status(201).json({
                success: true,
                message:
                    "Reply sent successfully.",
                chatMessage: savedMessage
            });

        } catch (error) {

            console.error(
                "ADMIN CHAT REPLY ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to send reply."
            });

        }

    }
);


/* =========================================================
   ADMIN
   MARK CONVERSATION READ
========================================================= */

router.patch(
    "/admin/conversations/:id/read",
    requireAdmin,
    async (req, res) => {

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

            await run(
                `
                UPDATE chat_messages
                SET is_read = 1
                WHERE conversation_id = ?
                AND sender_type = 'customer'
                `,
                [conversationId]
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "MARK CHAT READ ERROR:",
                error
            );

            res.status(500).json({
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
    (error, req, res, next) => {

        console.error(
            "CHAT ROUTER ERROR:",
            error
        );

        res.status(500).json({
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