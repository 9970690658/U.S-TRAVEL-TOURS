/* =========================================================
   U.S TRAVEL & TOURS
   SUPPORT LIVE CHAT
   PostgreSQL / Supabase Version

   CUSTOMER:
   - View own chat
   - Send message

   ADMIN:
   - View conversations
   - View individual conversation
   - Reply to customer
   - Mark messages as read

   IMPORTANT:
   - No SQLite
   - No in-memory chat storage
   - Messages permanently stored in PostgreSQL
========================================================= */

const express = require("express");
const nodemailer = require("nodemailer");

const {
    pool
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


/* =========================================================
   SMTP CONFIGURATION
========================================================= */

const OWNER_EMAIL =
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(
        process.env.SMTP_PORT || 587
    );

const SMTP_USER =
    process.env.SMTP_USER ||
    "";

const SMTP_PASS =
    process.env.SMTP_PASS ||
    "";


/* =========================================================
   MAIL TRANSPORTER
========================================================= */

const transporter =
    nodemailer.createTransport({

        host: SMTP_HOST,

        port: SMTP_PORT,

        secure:
            SMTP_PORT === 465,

        auth: {

            user: SMTP_USER,

            pass: SMTP_PASS
        }
    });


/* =========================================================
   HELPERS
========================================================= */

function cleanString(value) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value).trim();
}


function normalizeId(value) {

    const id =
        Number(value);

    if (
        !Number.isSafeInteger(id) ||
        id <= 0
    ) {
        return null;
    }

    return id;
}


/* =========================================================
   GET /api/chat/messages
   CUSTOMER - OWN CHAT HISTORY
========================================================= */

router.get(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            const userId =
                normalizeId(
                    req.user.id
                );


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid user account."
                });
            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    FROM support_chat_messages
                    WHERE user_id = $1
                    ORDER BY created_at ASC, id ASC
                    `,
                    [userId]
                );


            const messages =
                result.rows.map(row => ({

                    id:
                        Number(row.id),

                    userId:
                        Number(row.user_id),

                    senderType:
                        row.sender_type,

                    message:
                        row.message,

                    isRead:
                        Boolean(
                            Number(row.is_read)
                        ),

                    createdAt:
                        row.created_at
                }));


            return res.json({

                success: true,

                messages
            });

        } catch (error) {

            console.error(
                "CHAT GET MESSAGES ERROR:",
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
   POST /api/chat/messages
   CUSTOMER - SEND MESSAGE
========================================================= */

router.post(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            if (
                req.user.role !==
                "customer"
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Only customers can send support messages."
                });
            }


            const userId =
                normalizeId(
                    req.user.id
                );


            const message =
                cleanString(
                    req.body?.message
                );


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid user account."
                });
            }


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message cannot be empty."
                });
            }


            if (message.length > 5000) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message is too long. Maximum 5000 characters."
                });
            }


            /* -------------------------------------------------
               SAVE CUSTOMER MESSAGE
            ------------------------------------------------- */

            const result =
                await pool.query(
                    `
                    INSERT INTO support_chat_messages
                    (
                        user_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    )
                    VALUES
                    (
                        $1,
                        'customer',
                        $2,
                        0,
                        CURRENT_TIMESTAMP
                    )
                    RETURNING
                        id,
                        user_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    `,
                    [
                        userId,
                        message
                    ]
                );


            const row =
                result.rows[0];


            /* -------------------------------------------------
               OPTIONAL EMAIL NOTIFICATION
               Email failure MUST NOT cancel DB save.
            ------------------------------------------------- */

            try {

                if (
                    SMTP_USER &&
                    SMTP_PASS
                ) {

                    await transporter.sendMail({

                        from:
                            `"U.S TRAVEL & TOURS" <${SMTP_USER}>`,

                        to:
                            OWNER_EMAIL,

                        subject:
                            "New Live Chat Message - U.S TRAVEL & TOURS",

                        text:
                            `A customer has sent a new live chat message.\n\n` +
                            `Customer ID: ${userId}\n\n` +
                            `Message:\n${message}`
                    });
                }

            } catch (mailError) {

                console.error(
                    "CHAT OWNER EMAIL ERROR:",
                    mailError
                );
            }


            return res.status(201).json({

                success: true,

                message:
                    "Message sent successfully.",

                chatMessage: {

                    id:
                        Number(row.id),

                    userId:
                        Number(row.user_id),

                    senderType:
                        row.sender_type,

                    message:
                        row.message,

                    isRead:
                        Boolean(
                            Number(row.is_read)
                        ),

                    createdAt:
                        row.created_at
                }
            });

        } catch (error) {

            console.error(
                "CHAT SEND MESSAGE ERROR:",
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
   GET /api/chat/conversations
   ADMIN - ALL CUSTOMER CONVERSATIONS
========================================================= */

router.get(
    "/conversations",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        m.user_id,

                        COUNT(*) AS message_count,

                        MAX(m.created_at)
                            AS last_message_at,

                        COUNT(
                            CASE
                                WHEN
                                    m.sender_type = 'customer'
                                    AND
                                    COALESCE(m.is_read, 0) = 0
                                THEN 1
                            END
                        ) AS unread_count,

                        u.name,
                        u.email,
                        u.phone

                    FROM support_chat_messages m

                    LEFT JOIN users u
                        ON u.id = m.user_id

                    GROUP BY
                        m.user_id,
                        u.name,
                        u.email,
                        u.phone

                    ORDER BY
                        last_message_at DESC
                    `
                );


            const conversations =
                result.rows.map(row => ({

                    userId:
                        Number(row.user_id),

                    name:
                        row.name || "",

                    email:
                        row.email || "",

                    phone:
                        row.phone || "",

                    messageCount:
                        Number(
                            row.message_count
                        ),

                    unreadCount:
                        Number(
                            row.unread_count
                        ),

                    lastMessageAt:
                        row.last_message_at
                }));


            return res.json({

                success: true,

                conversations
            });

        } catch (error) {

            console.error(
                "CHAT GET CONVERSATIONS ERROR:",
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
   GET /api/chat/conversation/:userId
   ADMIN - SINGLE CUSTOMER CHAT
========================================================= */

router.get(
    "/conversation/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                normalizeId(
                    req.params.userId
                );


            if (!userId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid customer ID."
                });
            }


            /* -------------------------------------------------
               CUSTOMER
            ------------------------------------------------- */

            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        phone,
                        role,
                        created_at
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Customer not found."
                });
            }


            const user =
                userResult.rows[0];


            /* -------------------------------------------------
               CHAT MESSAGES
            ------------------------------------------------- */

            const messageResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    FROM support_chat_messages
                    WHERE user_id = $1
                    ORDER BY
                        created_at ASC,
                        id ASC
                    `,
                    [userId]
                );


            const messages =
                messageResult.rows.map(
                    row => ({

                        id:
                            Number(row.id),

                        userId:
                            Number(row.user_id),

                        senderType:
                            row.sender_type,

                        message:
                            row.message,

                        isRead:
                            Boolean(
                                Number(
                                    row.is_read
                                )
                            ),

                        createdAt:
                            row.created_at
                    })
                );


            return res.json({

                success: true,

                customer: {

                    id:
                        Number(user.id),

                    name:
                        user.name,

                    email:
                        user.email,

                    phone:
                        user.phone,

                    role:
                        user.role,

                    createdAt:
                        user.created_at
                },

                messages
            });

        } catch (error) {

            console.error(
                "CHAT GET CONVERSATION ERROR:",
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
   POST /api/chat/reply
   ADMIN - REPLY TO CUSTOMER
========================================================= */

router.post(
    "/reply",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                normalizeId(
                    req.body?.userId
                );


            const message =
                cleanString(
                    req.body?.message
                );


            if (!userId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Valid customer ID is required."
                });
            }


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message cannot be empty."
                });
            }


            if (message.length > 5000) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message is too long. Maximum 5000 characters."
                });
            }


            /* -------------------------------------------------
               CHECK CUSTOMER
            ------------------------------------------------- */

            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Customer not found."
                });
            }


            const customer =
                userResult.rows[0];


            /* -------------------------------------------------
               SAVE ADMIN MESSAGE
            ------------------------------------------------- */

            const result =
                await pool.query(
                    `
                    INSERT INTO support_chat_messages
                    (
                        user_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    )
                    VALUES
                    (
                        $1,
                        'admin',
                        $2,
                        1,
                        CURRENT_TIMESTAMP
                    )
                    RETURNING
                        id,
                        user_id,
                        sender_type,
                        message,
                        is_read,
                        created_at
                    `,
                    [
                        userId,
                        message
                    ]
                );


            const row =
                result.rows[0];


            /* -------------------------------------------------
               OPTIONAL EMAIL NOTIFICATION
            ------------------------------------------------- */

            try {

                if (
                    customer.email &&
                    SMTP_USER &&
                    SMTP_PASS
                ) {

                    await transporter.sendMail({

                        from:
                            `"U.S TRAVEL & TOURS" <${SMTP_USER}>`,

                        to:
                            customer.email,

                        subject:
                            "New Support Chat Reply - U.S TRAVEL & TOURS",

                        text:
                            `Hello ${customer.name || "Customer"},\n\n` +
                            `You have received a new reply from U.S TRAVEL & TOURS support.\n\n` +
                            `${message}\n\n` +
                            `Please log in to your account to continue the conversation.`
                    });
                }

            } catch (mailError) {

                console.error(
                    "CHAT CUSTOMER EMAIL ERROR:",
                    mailError
                );
            }


            return res.status(201).json({

                success: true,

                message:
                    "Reply sent successfully.",

                chatMessage: {

                    id:
                        Number(row.id),

                    userId:
                        Number(row.user_id),

                    senderType:
                        row.sender_type,

                    message:
                        row.message,

                    isRead:
                        Boolean(
                            Number(row.is_read)
                        ),

                    createdAt:
                        row.created_at
                }
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


/* =========================================================
   PATCH /api/chat/read/:userId
   ADMIN - MARK CUSTOMER MESSAGES AS READ
========================================================= */

router.patch(
    "/read/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            const userId =
                normalizeId(
                    req.params.userId
                );


            if (!userId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid customer ID."
                });
            }


            const result =
                await pool.query(
                    `
                    UPDATE support_chat_messages
                    SET
                        is_read = 1
                    WHERE
                        user_id = $1
                        AND sender_type = 'customer'
                        AND COALESCE(is_read, 0) = 0
                    `,
                    [userId]
                );


            return res.json({

                success: true,

                message:
                    "Messages marked as read.",

                updatedCount:
                    result.rowCount
            });

        } catch (error) {

            console.error(
                "CHAT MARK READ ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to mark messages as read."
            });
        }
    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
