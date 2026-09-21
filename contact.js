/* =========================================================
   U.S TRAVEL & TOURS
   CONTACT MESSAGE ROUTES
   PostgreSQL / Supabase Version

   PUBLIC:
   - Submit contact message

   ADMIN:
   - View all contact messages
   - View single message
   - Change message status
   - Reply to customer
   - Delete message

   IMPORTANT:
   - No SQLite
   - Contact messages permanently stored in PostgreSQL
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
   CONFIGURATION
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

    const FROM_EMAIL =
    process.env.FROM_EMAIL ||
    OWNER_EMAIL;


/* =========================================================
   SMTP TRANSPORTER
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
   POST /api/contact
   PUBLIC CONTACT FORM
========================================================= */

router.post(
    "/",
    async (req, res) => {

        try {

            /* -------------------------------------------------
               READ FORM DATA
            ------------------------------------------------- */

            const name =
                cleanString(
                    req.body?.name
                );

            const email =
                cleanString(
                    req.body?.email
                );

            const phone =
                cleanString(
                    req.body?.phone
                );

            const service =
                cleanString(
                    req.body?.service
                );

            const subject =
                cleanString(
                    req.body?.subject
                );

            const message =
                cleanString(
                    req.body?.message
                );

            const consent =
                req.body?.consent === true ||
                req.body?.consent === "true" ||
                req.body?.consent === "1" ||
                req.body?.consent === 1;


            /* -------------------------------------------------
               REQUIRED FIELD VALIDATION
            ------------------------------------------------- */

            const missingFields = [];


            if (!name) {
                missingFields.push("name");
            }

            if (!email) {
                missingFields.push("email");
            }

            if (!phone) {
                missingFields.push("phone");
            }

            if (!service) {
                missingFields.push("service");
            }

            if (!message) {
                missingFields.push("message");
            }


            if (missingFields.length > 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please complete all required fields.",

                    missingFields
                });
            }


            /* -------------------------------------------------
               EMAIL VALIDATION
            ------------------------------------------------- */

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (
                !emailPattern.test(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."
                });
            }


            /* -------------------------------------------------
               CONSENT VALIDATION
            ------------------------------------------------- */

            if (!consent) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please provide your consent before submitting the form."
                });
            }


            /* -------------------------------------------------
               LENGTH VALIDATION
            ------------------------------------------------- */

            if (name.length > 200) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Name is too long."
                });
            }


            if (email.length > 320) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email address is too long."
                });
            }


            if (phone.length > 50) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Phone number is too long."
                });
            }


            if (service.length > 200) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Service value is too long."
                });
            }


            if (subject.length > 300) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Subject is too long."
                });
            }


            if (message.length > 10000) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Message is too long. Maximum 10000 characters."
                });
            }


            /* -------------------------------------------------
               SAVE CONTACT MESSAGE
            -------------------------------------------------

               IMPORTANT:
               Database save happens BEFORE email notification.

               Therefore even if SMTP/Brevo fails,
               the customer's message remains saved.
            ------------------------------------------------- */

            const result =
                await pool.query(
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
                    RETURNING
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
                    `,
                    [
                        name,
                        email,
                        phone,
                        service,
                        subject,
                        message,
                        consent ? 1 : 0
                    ]
                );


            const contact =
                result.rows[0];


            /* -------------------------------------------------
               SEND OWNER EMAIL
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

                        replyTo:
                            email,

                        subject:
                            `New Contact Message${subject ? " - " + subject : ""}`,

                        text:
                            `A new contact message has been received.\n\n` +

                            `Name: ${name}\n` +

                            `Email: ${email}\n` +

                            `Phone: ${phone}\n` +

                            `Service: ${service}\n` +

                            `Subject: ${subject || "N/A"}\n\n` +

                            `Message:\n${message}\n\n` +

                            `Contact Message ID: ${contact.id}`
                    });
                }

            } catch (mailError) {

                /* -------------------------------------------------
                   IMPORTANT:
                   DO NOT FAIL THE CONTACT SUBMISSION.

                   The message is already permanently stored.
                ------------------------------------------------- */

                console.error(
                    "CONTACT OWNER EMAIL ERROR:",
                    mailError
                );
            }


            /* -------------------------------------------------
               SUCCESS
            ------------------------------------------------- */

            return res.status(201).json({

                success: true,

                message:
                    "Your message has been sent successfully.",

                contactMessage: {

                    id:
                        Number(contact.id),

                    name:
                        contact.name,

                    email:
                        contact.email,

                    phone:
                        contact.phone,

                    service:
                        contact.service,

                    subject:
                        contact.subject,

                    message:
                        contact.message,

                    consent:
                        Boolean(
                            Number(
                                contact.consent
                            )
                        ),

                    status:
                        contact.status,

                    createdAt:
                        contact.created_at,

                    updatedAt:
                        contact.updated_at
                }
            });

        } catch (error) {

            console.error(
                "CONTACT SUBMISSION ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send your message at this time."
            });
        }
    }
);


/* =========================================================
   GET /api/contact/messages
   ADMIN - ALL CONTACT MESSAGES
========================================================= */

router.get(
    "/messages",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
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
                        CASE
                            WHEN status = 'new'
                                THEN 0

                            WHEN status = 'read'
                                THEN 1

                            WHEN status = 'replied'
                                THEN 2

                            ELSE 3
                        END,

                        created_at DESC
                    `
                );


            const messages =
                result.rows.map(
                    row => ({

                        id:
                            Number(row.id),

                        name:
                            row.name,

                        email:
                            row.email,

                        phone:
                            row.phone,

                        service:
                            row.service,

                        subject:
                            row.subject,

                        message:
                            row.message,

                        consent:
                            Boolean(
                                Number(
                                    row.consent
                                )
                            ),

                        status:
                            row.status,

                        createdAt:
                            row.created_at,

                        updatedAt:
                            row.updated_at
                    })
                );


            return res.json({

                success: true,

                messages
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
   GET /api/contact/messages/:id
   ADMIN - SINGLE CONTACT MESSAGE
========================================================= */

router.get(
    "/messages/:id",
    requireAdmin,
    async (req, res) => {

        try {

            const messageId =
                normalizeId(
                    req.params.id
                );


            if (!messageId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."
                });
            }


            const result =
                await pool.query(
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
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [messageId]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."
                });
            }


            const row =
                result.rows[0];


            return res.json({

                success: true,

                contactMessage: {

                    id:
                        Number(row.id),

                    name:
                        row.name,

                    email:
                        row.email,

                    phone:
                        row.phone,

                    service:
                        row.service,

                    subject:
                        row.subject,

                    message:
                        row.message,

                    consent:
                        Boolean(
                            Number(
                                row.consent
                            )
                        ),

                    status:
                        row.status,

                    createdAt:
                        row.created_at,

                    updatedAt:
                        row.updated_at
                }
            });

        } catch (error) {

            console.error(
                "GET SINGLE CONTACT MESSAGE ERROR:",
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
   PATCH /api/contact/messages/:id/status
   ADMIN - UPDATE STATUS
========================================================= */

router.patch(
    "/messages/:id/status",
    requireAdmin,
    async (req, res) => {

        try {

            const messageId =
                normalizeId(
                    req.params.id
                );


            if (!messageId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."
                });
            }


            const status =
                cleanString(
                    req.body?.status
                ).toLowerCase();


            const allowedStatuses = [
                "new",
                "read",
                "replied",
                "closed"
            ];


            if (
                !allowedStatuses.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message status.",

                    allowedStatuses
                });
            }


            const result =
                await pool.query(
                    `
                    UPDATE contact_messages

                    SET
                        status = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $2

                    RETURNING
                        id,
                        status,
                        updated_at
                    `,
                    [
                        status,
                        messageId
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."
                });
            }


            const updated =
                result.rows[0];


            return res.json({

                success: true,

                message:
                    "Contact message status updated successfully.",

                contactMessageId:
                    Number(updated.id),

                status:
                    updated.status,

                updatedAt:
                    updated.updated_at
            });

        } catch (error) {

            console.error(
                "UPDATE CONTACT STATUS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to update contact message status."
            });
        }
    }
);


/* =========================================================
   POST /api/contact/messages/:id/reply
   ADMIN - REPLY TO CUSTOMER
========================================================= */

router.post(
    "/messages/:id/reply",
    requireAdmin,
    async (req, res) => {

        try {

            const messageId =
                normalizeId(
                    req.params.id
                );


            if (!messageId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."
                });
            }


            const reply =
                cleanString(
                    req.body?.reply ||
                    req.body?.message
                );


            if (!reply) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Reply message cannot be empty."
                });
            }


            if (reply.length > 10000) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Reply is too long. Maximum 10000 characters."
                });
            }


            /* -------------------------------------------------
               GET CUSTOMER CONTACT MESSAGE
            ------------------------------------------------- */

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        subject,
                        status
                    FROM contact_messages
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [messageId]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."
                });
            }


            const contact =
                result.rows[0];


            /* -------------------------------------------------
               SEND EMAIL
            ------------------------------------------------- */

            if (
                !SMTP_USER ||
                !SMTP_PASS
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Email service is not configured."
                });
            }


            await transporter.sendMail({

    from:
    `"U.S TRAVEL & TOURS" <${OWNER_EMAIL}>`,

    to:
        contact.email,

    replyTo:
        OWNER_EMAIL,

    subject:
        contact.subject
            ? `Re: ${contact.subject}`
            : "Reply from U.S TRAVEL & TOURS",

    text:
        `Hello ${contact.name || "Customer"},\n\n` +

        `${reply}\n\n` +

        `Regards,\n` +

        `U.S TRAVEL & TOURS\n` +

        `${OWNER_EMAIL}`
});


            /* -------------------------------------------------
               MARK AS REPLIED
            ------------------------------------------------- */

            const updateResult =
                await pool.query(
                    `
                    UPDATE contact_messages

                    SET
                        status = 'replied',
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $1

                    RETURNING
                        id,
                        status,
                        updated_at
                    `,
                    [messageId]
                );


            const updated =
                updateResult.rows[0];


            return res.json({

                success: true,

                message:
                    "Reply sent successfully.",

                contactMessageId:
                    Number(updated.id),

                status:
                    updated.status,

                updatedAt:
                    updated.updated_at
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
   DELETE /api/contact/messages/:id
   ADMIN - DELETE CONTACT MESSAGE
========================================================= */

router.delete(
    "/messages/:id",
    requireAdmin,
    async (req, res) => {

        try {

            const messageId =
                normalizeId(
                    req.params.id
                );


            if (!messageId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."
                });
            }


            const result =
                await pool.query(
                    `
                    DELETE FROM contact_messages

                    WHERE id = $1

                    RETURNING id
                    `,
                    [messageId]
                );


            if (
                result.rows.length === 0
            ) {

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

                contactMessageId:
                    Number(
                        result.rows[0].id
                    )
            });

        } catch (error) {

            console.error(
                "DELETE CONTACT MESSAGE ERROR:",
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
