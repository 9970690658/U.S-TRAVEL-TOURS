/* =========================================================
   U.S TRAVEL & TOURS
   LIVE SUPPORT CHAT MODULE
   PostgreSQL Version
   ========================================================= */

const express = require("express");
const nodemailer = require("nodemailer");

const {
    pool,
    initializeDatabase
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


/* =========================================================
   CONFIGURATION
========================================================= */

const OWNER_EMAIL =
    process.env.CONTACT_OWNER_EMAIL ||
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(process.env.SMTP_PORT || 587);

const SMTP_SECURE =
    String(
        process.env.SMTP_SECURE || "false"
    ).toLowerCase() === "true";

const SMTP_USER =
    process.env.SMTP_USER ||
    "";

const SMTP_PASS =
    process.env.SMTP_PASS ||
    "";

const MAIL_FROM =
    process.env.MAIL_FROM ||
    SMTP_USER ||
    "noreply@us-travel-tours.com";


/* =========================================================
   DATABASE READY
========================================================= */

let databaseReady = null;

async function ensureDatabase() {

    if (!databaseReady) {
        databaseReady = initializeDatabase();
    }

    return databaseReady;
}


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
                "CHAT SMTP READY"
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
        "CHAT SMTP NOT CONFIGURED - chat email notifications will be skipped."
    );

}


/* =========================================================
   HELPERS
========================================================= */

function cleanMessage(value) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value)
        .trim()
        .slice(0, 5000);

}


function cleanText(value, maxLength = 500) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value)
        .trim()
        .slice(0, maxLength);

}


function getUserId(req) {

    if (
        req.user &&
        req.user.id
    ) {
        return Number(req.user.id);
    }

    if (
        req.user &&
        req.user.userId
    ) {
        return Number(req.user.userId);
    }

    if (
        req.user &&
        req.user.user_id
    ) {
        return Number(req.user.user_id);
    }

    return null;

}


function escapeHtml(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =========================================================
   GET CUSTOMER
========================================================= */

async function getCustomerById(userId) {

    const result = await pool.query(
        `
        SELECT
            id,
            name,
            email,
            phone,
            role
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [userId]
    );

    return result.rows[0] || null;

}


/* =========================================================
   SEND CHAT EMAIL TO CUSTOMER
========================================================= */

async function sendChatEmailToCustomer(
    customer,
    message
) {

    if (!transporter) {
        return false;
    }

    if (
        !customer ||
        !customer.email
    ) {
        return false;
    }

    try {

        await transporter.sendMail({

            from: MAIL_FROM,

            to: customer.email,

            replyTo: OWNER_EMAIL,

            subject:
                "New Message from U.S TRAVEL & TOURS",

            html: `
                <div style="
                    font-family:Arial,sans-serif;
                    line-height:1.6;
                    color:#222;
                ">

                    <h2>
                        U.S TRAVEL & TOURS
                    </h2>

                    <p>
                        Dear ${escapeHtml(customer.name || "Customer")},
                    </p>

                    <p>
                        You have received a new message from our support team:
                    </p>

                    <div style="
                        background:#f5f5f5;
                        padding:18px;
                        border-radius:8px;
                        margin:20px 0;
                        white-space:pre-wrap;
                    ">
                        ${escapeHtml(message)}
                    </div>

                    <p>
                        Please log in to your U.S TRAVEL & TOURS account
                        to continue the conversation.
                    </p>

                    <p>
                        Regards,<br>
                        <strong>U.S TRAVEL & TOURS Support</strong>
                    </p>

                </div>
            `

        });

        return true;

    } catch (error) {

        console.error(
            "CHAT CUSTOMER EMAIL ERROR:",
            error.message
        );

        return false;

    }

}


/* =========================================================
   CUSTOMER
   GET OWN CHAT MESSAGES
========================================================= */

router.get(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            await ensureDatabase();

            const userId =
                getUserId(req);

            if (
                !userId ||
                !Number.isInteger(userId)
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Authentication required."

                });

            }


            const result = await pool.query(
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


            /* -------------------------------------------------
               Mark admin messages as read
            ------------------------------------------------- */

            await pool.query(
                `
                UPDATE support_chat_messages
                SET is_read = 1
                WHERE
                    user_id = $1
                    AND sender_type = 'admin'
                    AND is_read = 0
                `,
                [userId]
            );


            return res.json({

                success: true,

                messages:
                    result.rows

            });

        } catch (error) {

            console.error(
                "CUSTOMER CHAT GET ERROR:",
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
   SEND CHAT MESSAGE
========================================================= */

router.post(
    "/messages",
    requireAuth,
    async (req, res) => {

        try {

            await ensureDatabase();

            const userId =
                getUserId(req);

            if (
                !userId ||
                !Number.isInteger(userId)
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Authentication required."

                });

            }


            const message =
                cleanMessage(
                    req.body.message
                );


            if (!message) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a message."

                });

            }


            const customer =
                await getCustomerById(
                    userId
                );


            if (!customer) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Customer account not found."

                });

            }


            const result = await pool.query(
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


            return res.status(201).json({

                success: true,

                message:
                    "Message sent successfully.",

                chatMessage:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "CUSTOMER CHAT POST ERROR:",
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
   GET ALL CONVERSATIONS
========================================================= */

router.get(
    "/conversations",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const result = await pool.query(
                `
                SELECT
                    u.id AS user_id,
                    u.name,
                    u.email,
                    u.phone,

                    latest.message AS last_message,

                    latest.created_at AS last_message_at,

                    COALESCE(unread.unread_count, 0)
                        AS unread_count

                FROM users u

                INNER JOIN LATERAL
                (
                    SELECT
                        scm.message,
                        scm.created_at
                    FROM support_chat_messages scm
                    WHERE scm.user_id = u.id
                    ORDER BY
                        scm.created_at DESC,
                        scm.id DESC
                    LIMIT 1
                ) latest
                    ON TRUE

                LEFT JOIN LATERAL
                (
                    SELECT
                        COUNT(*)::INTEGER
                            AS unread_count
                    FROM support_chat_messages scm2
                    WHERE
                        scm2.user_id = u.id
                        AND scm2.sender_type = 'customer'
                        AND scm2.is_read = 0
                ) unread
                    ON TRUE

                WHERE
                    u.role = 'customer'

                ORDER BY
                    latest.created_at DESC,
                    u.id DESC
                `
            );


            return res.json({

                success: true,

                conversations:
                    result.rows

            });

        } catch (error) {

            console.error(
                "ADMIN CHAT CONVERSATIONS ERROR:",
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
   GET ONE CUSTOMER CONVERSATION
========================================================= */

router.get(
    "/conversations/:userId",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const userId =
                Number(req.params.userId);


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid customer ID."

                });

            }


            const customer =
                await getCustomerById(
                    userId
                );


            if (!customer) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Customer not found."

                });

            }


            if (
                customer.role &&
                customer.role !== "customer"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This user is not a customer."

                });

            }


            const messagesResult =
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


            /* -------------------------------------------------
               Customer messages are now read by admin
            ------------------------------------------------- */

            await pool.query(
                `
                UPDATE support_chat_messages

                SET is_read = 1

                WHERE
                    user_id = $1
                    AND sender_type = 'customer'
                    AND is_read = 0
                `,
                [userId]
            );


            return res.json({

                success: true,

                customer,

                messages:
                    messagesResult.rows

            });

        } catch (error) {

            console.error(
                "ADMIN CHAT SINGLE CONVERSATION ERROR:",
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
   REPLY TO CUSTOMER
========================================================= */

router.post(
    "/conversations/:userId/reply",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const userId =
                Number(req.params.userId);


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid customer ID."

                });

            }


            const message =
                cleanMessage(
                    req.body.message ||
                    req.body.reply
                );


            if (!message) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a reply message."

                });

            }


            const customer =
                await getCustomerById(
                    userId
                );


            if (!customer) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Customer not found."

                });

            }


            if (
                customer.role &&
                customer.role !== "customer"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This user is not a customer."

                });

            }


            /* -------------------------------------------------
               SAVE ADMIN MESSAGE
            ------------------------------------------------- */

            const result = await pool.query(
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


            const savedMessage =
                result.rows[0];


            /* -------------------------------------------------
               EMAIL CUSTOMER
            ------------------------------------------------- */

            const emailSent =
                await sendChatEmailToCustomer(
                    customer,
                    message
                );


            return res.status(201).json({

                success: true,

                message:
                    "Reply sent successfully.",

                chatMessage:
                    savedMessage,

                emailSent

            });

        } catch (error) {

            console.error(
                "ADMIN CHAT REPLY ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send chat reply."

            });

        }

    }
);


/* =========================================================
   ADMIN
   MARK CUSTOMER CONVERSATION AS READ
========================================================= */

router.patch(
    "/conversations/:userId/read",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const userId =
                Number(req.params.userId);


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid customer ID."

                });

            }


            const result = await pool.query(
                `
                UPDATE support_chat_messages

                SET is_read = 1

                WHERE
                    user_id = $1
                    AND sender_type = 'customer'
                    AND is_read = 0

                RETURNING id
                `,
                [userId]
            );


            return res.json({

                success: true,

                message:
                    "Conversation marked as read.",

                updatedCount:
                    result.rowCount

            });

        } catch (error) {

            console.error(
                "ADMIN CHAT READ ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to mark conversation as read."

            });

        }

    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
