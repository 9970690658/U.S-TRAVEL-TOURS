/* =========================================================
   U.S TRAVEL & TOURS
   CONTACT MODULE
   PostgreSQL Version
   ========================================================= */

const express = require("express");
const nodemailer = require("nodemailer");

const {
    pool,
    initializeDatabase
} = require("./database");

const {
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
    String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

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
            console.log("CONTACT SMTP READY");
        })
        .catch((error) => {
            console.error(
                "CONTACT SMTP VERIFY ERROR:",
                error.message
            );
        });

} else {

    console.warn(
        "CONTACT SMTP NOT CONFIGURED - emails will be skipped."
    );

}


/* =========================================================
   HELPERS
========================================================= */

function cleanText(value, maxLength = 5000) {

    if (value === undefined || value === null) {
        return "";
    }

    return String(value)
        .trim()
        .slice(0, maxLength);
}


function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        String(email || "").trim()
    );

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
   DATABASE INITIALIZATION
========================================================= */

let databaseReady = null;

async function ensureDatabase() {

    if (!databaseReady) {
        databaseReady = initializeDatabase();
    }

    return databaseReady;
}


/* =========================================================
   SEND OWNER EMAIL
========================================================= */

async function sendOwnerEmail(contact) {

    if (!transporter) {
        return false;
    }

    try {

        await transporter.sendMail({

            from: MAIL_FROM,

            to: OWNER_EMAIL,

            replyTo: contact.email,

            subject:
                `New Contact Message - ${contact.subject || "U.S TRAVEL & TOURS"}`,

            html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">

                    <h2 style="margin-bottom:20px;">
                        New Contact Message
                    </h2>

                    <p>
                        <strong>Name:</strong>
                        ${escapeHtml(contact.name)}
                    </p>

                    <p>
                        <strong>Email:</strong>
                        ${escapeHtml(contact.email)}
                    </p>

                    <p>
                        <strong>Phone:</strong>
                        ${escapeHtml(contact.phone)}
                    </p>

                    <p>
                        <strong>Service:</strong>
                        ${escapeHtml(contact.service)}
                    </p>

                    <p>
                        <strong>Subject:</strong>
                        ${escapeHtml(contact.subject || "N/A")}
                    </p>

                    <p>
                        <strong>Consent:</strong>
                        ${contact.consent ? "Yes" : "No"}
                    </p>

                    <hr>

                    <p>
                        <strong>Message:</strong>
                    </p>

                    <div style="
                        background:#f5f5f5;
                        padding:15px;
                        border-radius:8px;
                        white-space:pre-wrap;
                    ">
                        ${escapeHtml(contact.message)}
                    </div>

                    <hr>

                    <p style="font-size:13px;color:#777;">
                        Contact ID: ${contact.id}
                    </p>

                </div>
            `

        });

        return true;

    } catch (error) {

        console.error(
            "CONTACT OWNER EMAIL ERROR:",
            error.message
        );

        return false;
    }

}


/* =========================================================
   SEND CUSTOMER REPLY
========================================================= */

async function sendCustomerReplyEmail(
    contact,
    replyMessage
) {

    if (!transporter) {
        throw new Error(
            "Email service is not configured."
        );
    }

    await transporter.sendMail({

        from: MAIL_FROM,

        to: contact.email,

        replyTo: OWNER_EMAIL,

        subject:
            `Reply from U.S TRAVEL & TOURS - ${contact.subject || "Your enquiry"}`,

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
                    Dear ${escapeHtml(contact.name)},
                </p>

                <p>
                    Thank you for contacting U.S TRAVEL & TOURS.
                </p>

                <div style="
                    background:#f5f5f5;
                    padding:18px;
                    margin:20px 0;
                    border-radius:8px;
                    white-space:pre-wrap;
                ">
                    ${escapeHtml(replyMessage)}
                </div>

                <p>
                    Regards,<br>
                    <strong>U.S TRAVEL & TOURS</strong>
                </p>

            </div>
        `

    });

}


/* =========================================================
   CREATE CONTACT MESSAGE
========================================================= */

router.post(
    "/",
    async (req, res) => {

        try {

            await ensureDatabase();

            const name =
                cleanText(req.body.name, 150);

            const email =
                cleanText(req.body.email, 255)
                    .toLowerCase();

            const phone =
                cleanText(req.body.phone, 50);

            const service =
                cleanText(req.body.service, 150);

            const subject =
                cleanText(req.body.subject, 250);

            const message =
                cleanText(req.body.message, 5000);

            const consent =
                req.body.consent === true ||
                req.body.consent === "true" ||
                req.body.consent === 1 ||
                req.body.consent === "1" ||
                req.body.consent === "on";


            /* -------------------------------------------------
               VALIDATION
            ------------------------------------------------- */

            if (!name) {

                return res.status(400).json({
                    success: false,
                    message: "Please enter your full name."
                });

            }


            if (!email || !isValidEmail(email)) {

                return res.status(400).json({
                    success: false,
                    message: "Please enter a valid email address."
                });

            }


            if (!phone) {

                return res.status(400).json({
                    success: false,
                    message: "Please enter your phone number."
                });

            }


            if (!service) {

                return res.status(400).json({
                    success: false,
                    message: "Please select a service."
                });

            }


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message: "Please enter your message."
                });

            }


            if (!consent) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please accept the consent before submitting."
                });

            }


            /* -------------------------------------------------
               SAVE TO POSTGRESQL
            ------------------------------------------------- */

            const result = await pool.query(
                `
                INSERT INTO contact_messages
                (
                    name,
                    email,
                    phone,
                    service,
                    subject,
                    message,
                    consent,
                    status,
                    created_at,
                    updated_at
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    'new',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                RETURNING *
                `,
                [
                    name,
                    email,
                    phone,
                    service,
                    subject || null,
                    message,
                    consent
                ]
            );


            const savedContact =
                result.rows[0];


            /* -------------------------------------------------
               SEND OWNER EMAIL
            ------------------------------------------------- */

            const ownerEmailSent =
                await sendOwnerEmail(
                    savedContact
                );


            /* -------------------------------------------------
               RESPONSE
            ------------------------------------------------- */

            return res.status(201).json({

                success: true,

                message:
                    "Your message has been submitted successfully.",

                contactId:
                    savedContact.id,

                ownerEmailSent

            });

        } catch (error) {

            console.error(
                "CONTACT POST ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to submit your message right now."

            });

        }

    }
);


/* =========================================================
   ADMIN - GET ALL CONTACT MESSAGES
========================================================= */

router.get(
    "/messages",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const result = await pool.query(
                `
                SELECT
                    id,
                    name,
                    email,
                    phone,
                    service,
                    subject,
                    message,
                    consent,
                    status,
                    created_at,
                    updated_at
                FROM contact_messages

                ORDER BY
                    CASE status
                        WHEN 'new' THEN 1
                        WHEN 'read' THEN 2
                        WHEN 'replied' THEN 3
                        ELSE 4
                    END,

                    created_at DESC
                `
            );


            return res.json({

                success: true,

                messages:
                    result.rows

            });

        } catch (error) {

            console.error(
                "GET CONTACT MESSAGES ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load contact messages."

            });

        }

    }
);


/* =========================================================
   ADMIN - GET SINGLE CONTACT MESSAGE
========================================================= */

router.get(
    "/messages/:id",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);


            if (!Number.isInteger(id) || id <= 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."

                });

            }


            const result = await pool.query(
                `
                SELECT
                    *
                FROM contact_messages
                WHERE id = $1
                LIMIT 1
                `,
                [id]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."

                });

            }


            return res.json({

                success: true,

                message:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "GET SINGLE CONTACT ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load contact message."

            });

        }

    }
);


/* =========================================================
   ADMIN - UPDATE CONTACT STATUS
========================================================= */

router.patch(
    "/messages/:id/status",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);

            const status =
                cleanText(req.body.status, 30);


            if (!Number.isInteger(id) || id <= 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."

                });

            }


            const allowedStatuses = [
                "new",
                "read",
                "replied"
            ];


            if (!allowedStatuses.includes(status)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message status."

                });

            }


            const result = await pool.query(
                `
                UPDATE contact_messages

                SET
                    status = $1,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $2

                RETURNING *
                `,
                [
                    status,
                    id
                ]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."

                });

            }


            return res.json({

                success: true,

                message:
                    "Contact message status updated successfully.",

                contact:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "UPDATE CONTACT STATUS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to update contact status."

            });

        }

    }
);


/* =========================================================
   ADMIN - REPLY TO CONTACT MESSAGE
========================================================= */

router.post(
    "/messages/:id/reply",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);

            const reply =
                cleanText(
                    req.body.reply ||
                    req.body.message,
                    5000
                );


            if (!Number.isInteger(id) || id <= 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."

                });

            }


            if (!reply) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a reply message."

                });

            }


            /* -------------------------------------------------
               GET ORIGINAL MESSAGE
            ------------------------------------------------- */

            const result = await pool.query(
                `
                SELECT
                    *
                FROM contact_messages
                WHERE id = $1
                LIMIT 1
                `,
                [id]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."

                });

            }


            const contact =
                result.rows[0];


            /* -------------------------------------------------
               SEND EMAIL FIRST
               Do not mark as replied if email fails.
            ------------------------------------------------- */

            try {

                await sendCustomerReplyEmail(
                    contact,
                    reply
                );

            } catch (emailError) {

                console.error(
                    "CONTACT CUSTOMER EMAIL ERROR:",
                    emailError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to send the reply email. Message status was not changed."

                });

            }


            /* -------------------------------------------------
               UPDATE STATUS
            ------------------------------------------------- */

            const updateResult =
                await pool.query(
                    `
                    UPDATE contact_messages

                    SET
                        status = 'replied',
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $1

                    RETURNING *
                    `,
                    [id]
                );


            return res.json({

                success: true,

                message:
                    "Reply sent successfully.",

                contact:
                    updateResult.rows[0]

            });

        } catch (error) {

            console.error(
                "CONTACT REPLY ERROR:",
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
   ADMIN - DELETE CONTACT MESSAGE
========================================================= */

router.delete(
    "/messages/:id",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);


            if (!Number.isInteger(id) || id <= 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."

                });

            }


            const result = await pool.query(
                `
                DELETE FROM contact_messages

                WHERE id = $1

                RETURNING id
                `,
                [id]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."

                });

            }


            return res.json({

                success: true,

                message:
                    "Contact message deleted successfully.",

                contactId:
                    result.rows[0].id

            });

        } catch (error) {

            console.error(
                "DELETE CONTACT ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete contact message."

            });

        }

    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
