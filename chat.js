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
            sender_type TEXT NOT NULL
                CHECK(sender_type IN ('customer', 'admin')),
            message TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_support_chat_user_id
        ON support_chat_messages(user_id);

        CREATE INDEX IF NOT EXISTS idx_support_chat_created_at
        ON support_chat_messages(created_at);

        CREATE INDEX IF NOT EXISTS idx_support_chat_unread
        ON support_chat_messages(
            user_id,
            sender_type,
            is_read
        );
    `);

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

function getCustomerById(userId) {

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

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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

            const messages =
                db.prepare(`
                    SELECT
                        id,
                        user_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    FROM support_chat_messages
                    WHERE user_id = ?
                    ORDER BY id ASC
                `).all(userId);

            // Admin replies become read when
            // customer opens the chat.
            db.prepare(`
                UPDATE support_chat_messages
                SET is_read = 1
                WHERE
                    user_id = ?
                    AND sender_type = 'admin'
            `).run(userId);

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
                        sender_type,
                        message,
                        is_read
                    )
                    VALUES
                    (?, 'customer', ?, 0)
                `).run(
                    userId,
                    message
                );

            const savedMessage =
                db.prepare(`
                    SELECT
                        id,
                        user_id,
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
                `CHAT: Customer ${userId} sent message #${result.lastInsertRowid}`
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
    (req, res) => {

        try {

            const rows =
                db.prepare(`
                    SELECT
                        u.id AS user_id,
                        u.name,
                        u.email,

                        (
                            SELECT cm.message
                            FROM support_chat_messages cm
                            WHERE cm.user_id = u.id
                            ORDER BY cm.id DESC
                            LIMIT 1
                        ) AS last_message,

                        (
                            SELECT cm.created_at
                            FROM support_chat_messages cm
                            WHERE cm.user_id = u.id
                            ORDER BY cm.id DESC
                            LIMIT 1
                        ) AS last_message_at,

                        (
                            SELECT COUNT(*)
                            FROM support_chat_messages cm
                            WHERE
                                cm.user_id = u.id
                                AND cm.sender_type = 'customer'
                                AND cm.is_read = 0
                        ) AS unread_count

                    FROM users u

                    WHERE
                        u.role = 'customer'
                        AND EXISTS (
                            SELECT 1
                            FROM support_chat_messages cm2
                            WHERE cm2.user_id = u.id
                        )

                    ORDER BY
                        last_message_at DESC
                `).all();

            return res.json({
                success: true,
                conversations: rows
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

            const customer =
                getCustomerById(userId);

            if (
                !customer ||
                customer.role !== "customer"
            ) {

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
                        sender_type,
                        message,
                        is_read,
                        created_at
                    FROM support_chat_messages
                    WHERE user_id = ?
                    ORDER BY id ASC
                `).all(userId);

            // Customer messages become read
            // when admin opens the conversation.
            db.prepare(`
                UPDATE support_chat_messages
                SET is_read = 1
                WHERE
                    user_id = ?
                    AND sender_type = 'customer'
            `).run(userId);

            return res.json({

                success: true,

                customer: {
                    id: customer.id,
                    name: customer.name,
                    email: customer.email
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
                getCustomerById(userId);

            if (
                !customer ||
                customer.role !== "customer"
            ) {

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
                        sender_type,
                        message,
                        is_read
                    )
                    VALUES
                    (?, 'admin', ?, 0)
                `).run(
                    userId,
                    message
                );

            const savedMessage =
                db.prepare(`
                    SELECT
                        id,
                        user_id,
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
                `CHAT: Admin replied to customer ${userId}`
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

                data: savedMessage

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

            db.prepare(`
                UPDATE support_chat_messages
                SET is_read = 1
                WHERE
                    user_id = ?
                    AND sender_type = 'customer'
            `).run(userId);

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
