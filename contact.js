// =========================================================
// U.S TRAVEL & TOURS
// CONTACT BACKEND
// =========================================================

const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

const { db } = require("./database");
const { requireAuth, requireAdmin } = require("./auth");

// =========================================================
// CONFIGURATION
// =========================================================

const OWNER_EMAIL =
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(process.env.SMTP_PORT) ||
    587;

const SMTP_SECURE =
    String(process.env.SMTP_SECURE).toLowerCase() === "true";

const SMTP_USER =
    process.env.SMTP_USER;

const SMTP_PASS =
    process.env.SMTP_PASS;

const MAIL_FROM =
    process.env.MAIL_FROM ||
    SMTP_USER ||
    OWNER_EMAIL;

console.log("CONTACT SMTP CHECK:", {
    host: SMTP_HOST,
    port: SMTP_PORT,
    userLoaded: !!SMTP_USER,
    passLoaded: !!SMTP_PASS,
    mailFrom: MAIL_FROM
});


// =========================================================
// DATABASE TABLE + MIGRATION
// =========================================================

try {

    // -----------------------------------------------------
    // CREATE TABLE IF IT DOES NOT EXIST
    // -----------------------------------------------------

    db.exec(`
        CREATE TABLE IF NOT EXISTS contact_messages (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            email TEXT NOT NULL,

            phone TEXT NOT NULL,

            service TEXT NOT NULL DEFAULT '',

            subject TEXT DEFAULT '',

            message TEXT NOT NULL,

            consent INTEGER NOT NULL DEFAULT 1,

            status TEXT NOT NULL DEFAULT 'new',

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

        )
    `);


    // -----------------------------------------------------
    // GET EXISTING COLUMNS
    // -----------------------------------------------------

    const columns =
        db.prepare(`
            PRAGMA table_info(contact_messages)
        `).all();


    const columnNames =
        columns.map(function (column) {
            return column.name;
        });


    // -----------------------------------------------------
    // ADD MISSING COLUMNS
    // -----------------------------------------------------

    if (!columnNames.includes("service")) {

        db.exec(`
            ALTER TABLE contact_messages
            ADD COLUMN service TEXT NOT NULL DEFAULT ''
        `);

        console.log(
            "Contact database migration: service column added."
        );
    }


    if (!columnNames.includes("subject")) {

        db.exec(`
            ALTER TABLE contact_messages
            ADD COLUMN subject TEXT DEFAULT ''
        `);

        console.log(
            "Contact database migration: subject column added."
        );
    }


    if (!columnNames.includes("consent")) {

        db.exec(`
            ALTER TABLE contact_messages
            ADD COLUMN consent INTEGER NOT NULL DEFAULT 1
        `);

        console.log(
            "Contact database migration: consent column added."
        );
    }


    if (!columnNames.includes("status")) {

        db.exec(`
            ALTER TABLE contact_messages
            ADD COLUMN status TEXT NOT NULL DEFAULT 'new'
        `);

        console.log(
            "Contact database migration: status column added."
        );
    }


    if (!columnNames.includes("created_at")) {

        db.exec(`
            ALTER TABLE contact_messages
            ADD COLUMN created_at TEXT NOT NULL
            DEFAULT CURRENT_TIMESTAMP
        `);

        console.log(
            "Contact database migration: created_at column added."
        );
    }


    if (!columnNames.includes("updated_at")) {

        db.exec(`
            ALTER TABLE contact_messages
            ADD COLUMN updated_at TEXT NOT NULL
            DEFAULT CURRENT_TIMESTAMP
        `);

        console.log(
            "Contact database migration: updated_at column added."
        );
    }


    // -----------------------------------------------------
    // INDEXES
    // -----------------------------------------------------

    db.exec(`
        CREATE INDEX IF NOT EXISTS
        idx_contact_messages_status
        ON contact_messages(status)
    `);


    db.exec(`
        CREATE INDEX IF NOT EXISTS
        idx_contact_messages_created_at
        ON contact_messages(created_at)
    `);


    console.log(
        "Contact messages database table ready."
    );


} catch (error) {

    console.error(
        "Unable to initialize contact_messages table:",
        error
    );

}

// =========================================================
// BREVO SMTP TRANSPORTER
// =========================================================

let transporter = null;

if (SMTP_USER && SMTP_PASS) {

    transporter = nodemailer.createTransport({

        host: SMTP_HOST,

        port: SMTP_PORT,

        secure: SMTP_SECURE,

        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        },

        connectionTimeout: 15000,

        greetingTimeout: 15000,

        socketTimeout: 20000

    });

} else {

    console.warn(
        "Brevo SMTP credentials are missing. Contact emails will not be sent."
    );

}


// =========================================================
// HELPERS
// =========================================================

function cleanText(value, maxLength) {

    if (typeof value !== "string") {
        return "";
    }

    return value
        .replace(/\0/g, "")
        .trim()
        .slice(0, maxLength);
}


function cleanHeader(value, maxLength) {

    return cleanText(value, maxLength)
        .replace(/[\r\n]/g, " ");
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}   


function isValidPhone(phone) {

    const numbers =
        phone.replace(/\D/g, "");

    return (
        numbers.length >= 7 &&
        numbers.length <= 15
    );
}


function escapeHTML(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatDate(value) {

    if (!value) {
        return "";
    }

    try {

        return new Date(value)
            .toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short"
            });

    } catch (error) {

        return String(value);
    }
}


// =========================================================
// SMTP CHECK
// =========================================================

if (transporter) {

    transporter.verify()
        .then(() => {

            console.log(
                "Contact Brevo SMTP connection verified successfully."
            );

        })
        .catch((error) => {

            console.error(
                "Contact Brevo SMTP verification failed:",
                error.message
            );

        });
}


// =========================================================
// SEND OWNER EMAIL
// =========================================================

async function sendOwnerEmail(contact) {

    if (!transporter) {

        throw new Error(
            "Brevo SMTP is not configured."
        );
    }


    const safeName =
        escapeHTML(contact.name);

    const safeEmail =
        escapeHTML(contact.email);

    const safePhone =
        escapeHTML(contact.phone);

    const safeService =
        escapeHTML(contact.service);

    const safeSubject =
        escapeHTML(
            contact.subject || "Website Contact Enquiry"
        );

    const safeMessage =
        escapeHTML(contact.message)
            .replace(/\n/g, "<br>");


    const mailSubject =
        contact.subject
            ? `New Contact Enquiry: ${cleanHeader(contact.subject, 150)}`
            : `New Contact Enquiry from ${cleanHeader(contact.name, 100)}`;


    const html = `
<!DOCTYPE html>

<html>

<head>

    <meta charset="UTF-8">

</head>

<body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">

    <h2>New Contact Enquiry</h2>

    <p>
        A new message has been submitted through
        the U.S TRAVEL & TOURS website.
    </p>

    <hr>

    <p>
        <strong>Name:</strong><br>
        ${safeName}
    </p>

    <p>
        <strong>Email:</strong><br>
        ${safeEmail}
    </p>

    <p>
        <strong>Phone:</strong><br>
        ${safePhone}
    </p>

    <p>
        <strong>Service:</strong><br>
        ${safeService}
    </p>

    <p>
        <strong>Subject:</strong><br>
        ${safeSubject}
    </p>

    <p>
        <strong>Message:</strong><br>
        ${safeMessage}
    </p>

    <hr>

    <p>
        <strong>Submitted:</strong><br>
        ${escapeHTML(formatDate(contact.created_at))}
    </p>

    <p>
        You can reply directly to this email from Gmail.
        The applicant's email address is set as Reply-To.
    </p>

</body>

</html>
`;


    const text =
`NEW CONTACT ENQUIRY

Name: ${contact.name}

Email: ${contact.email}

Phone: ${contact.phone}

Service: ${contact.service}

Subject: ${contact.subject || "Website Contact Enquiry"}

Message:
${contact.message}

Submitted:
${formatDate(contact.created_at)}

Reply directly to this email to respond to the user.
`;


    await transporter.sendMail({

        from: MAIL_FROM,

        to: OWNER_EMAIL,

        replyTo: cleanHeader(
            contact.email,
            254
        ),

        subject: mailSubject,

        text: text,

        html: html

    });
}


// =========================================================
// POST CONTACT MESSAGE
// =========================================================

router.post("/", async (req, res) => {

    try {

        // -------------------------------------------------
        // GET DATA
        // -------------------------------------------------

        const name =
            cleanText(req.body.name, 100);

        const email =
            cleanHeader(req.body.email, 254);

        const phone =
            cleanHeader(req.body.phone, 30);

        const service =
            cleanText(req.body.service, 100);

        const subject =
            cleanHeader(
                req.body.subject,
                150
            );

        const message =
            cleanText(
                req.body.message,
                5000
            );

        const consent =
            req.body.consent === true ||
            req.body.consent === "true" ||
            req.body.consent === 1 ||
            req.body.consent === "1";


        // -------------------------------------------------
        // VALIDATION
        // -------------------------------------------------

        if (!name) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter your full name."

            });
        }


        if (!email) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter your email address."

            });
        }


        if (!isValidEmail(email)) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid email address."

            });
        }


        if (!phone) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter your phone number."

            });
        }


        if (!isValidPhone(phone)) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid phone number."

            });
        }


        if (!service) {

            return res.status(400).json({

                success: false,

                message:
                    "Please select a service."

            });
        }


        if (!message) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter your message."

            });
        }


        if (!consent) {

            return res.status(400).json({

                success: false,

                message:
                    "Please agree to be contacted regarding your enquiry."

            });
        }


        // -------------------------------------------------
        // INSERT INTO DATABASE
        // -------------------------------------------------

        const result =
            db.prepare(`
                INSERT INTO contact_messages (
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
                VALUES (?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
                name,
                email,
                phone,
                service,
                subject,
                message,
                1
            );


        const contactId =
            Number(result.lastInsertRowid);


        // -------------------------------------------------
        // GET SAVED MESSAGE
        // -------------------------------------------------

        const contact =
            db.prepare(`
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
                WHERE id = ?
                LIMIT 1
            `).get(contactId);


        // -------------------------------------------------
        // SEND EMAIL TO OWNER
        // -------------------------------------------------

        try {

            await sendOwnerEmail(contact);

            console.log(
                `Contact email sent to owner for message #${contactId}.`
            );

        } catch (emailError) {

            console.error(
                `Contact message #${contactId} saved, but owner email failed:`,
                emailError.message
            );

            // IMPORTANT:
            // Database save succeeded.
            // We still return success to the user
            // because the message is safely stored
            // in the admin dashboard.
        }


        // -------------------------------------------------
        // RESPONSE
        // -------------------------------------------------

        return res.status(201).json({

            success: true,

            message:
                "Your message has been sent successfully. Our team will contact you soon.",

            contactId: contactId

        });

    } catch (error) {

        console.error(
            "CONTACT POST ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to send your message right now. Please try again later."

        });
    }

});


// =========================================================
// ADMIN — GET ALL CONTACT MESSAGES
// =========================================================

router.get(
    "/messages",
    requireAuth,
    requireAdmin,
    (req, res) => {

        try {

            const messages =
                db.prepare(`
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
                            WHEN status = 'new' THEN 0
                            WHEN status = 'read' THEN 1
                            WHEN status = 'replied' THEN 2
                            ELSE 3
                        END,
                        datetime(created_at) DESC
                `).all();


            return res.status(200).json({

                success: true,

                messages: messages

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


// =========================================================
// ADMIN — GET SINGLE CONTACT MESSAGE
// =========================================================

router.get(
    "/messages/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."

                });
            }


            const message =
                db.prepare(`
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
                    WHERE id = ?
                    LIMIT 1
                `).get(id);


            if (!message) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."

                });
            }


            return res.status(200).json({

                success: true,

                message: message

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

// =========================================================
// ADMIN — UPDATE MESSAGE STATUS
// =========================================================

router.patch(
    "/messages/:id/status",
    requireAuth,
    requireAdmin,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const status =
                cleanText(
                    req.body.status,
                    30
                ).toLowerCase();


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

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


            if (
                !allowedStatuses.includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message status."

                });
            }


            const existing =
                db.prepare(`
                    SELECT id
                    FROM contact_messages
                    WHERE id = ?
                    LIMIT 1
                `).get(id);


            if (!existing) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."

                });
            }


            db.prepare(`
                UPDATE contact_messages

                SET
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = ?
            `).run(
                status,
                id
            );


            return res.status(200).json({

                success: true,

                message:
                    "Contact message status updated successfully.",

                status: status

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
// =========================================================
// ADMIN — REPLY TO CONTACT MESSAGE
// =========================================================

router.post(
    "/messages/:id/reply",
    requireAuth,
    requireAdmin,
    async (req, res) => {

        try {

            const id = Number(req.params.id);

            const replyMessage = cleanText(
                req.body?.reply,
                5000
            );

            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (!Number.isInteger(id) || id <= 0) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid contact message ID."
                });

            }

            if (!replyMessage) {

                return res.status(400).json({
                    success: false,
                    message: "Please enter a reply message."
                });

            }

            // -------------------------------------------------
            // CHECK SMTP
            // -------------------------------------------------

            if (!transporter) {

                console.error(
                    "CONTACT REPLY ERROR: Brevo transporter is not available."
                );

                return res.status(500).json({
                    success: false,
                    message: "Email service is not configured."
                });

            }

            // -------------------------------------------------
            // GET ORIGINAL CONTACT MESSAGE
            // -------------------------------------------------

            const contact = db.prepare(`
                SELECT
                    id,
                    name,
                    email,
                    subject,
                    message,
                    created_at
                FROM contact_messages
                WHERE id = ?
                LIMIT 1
            `).get(id);

            if (!contact) {

                return res.status(404).json({
                    success: false,
                    message: "Contact message not found."
                });

            }

            // -------------------------------------------------
            // CREATE SAFE EMAIL CONTENT
            // -------------------------------------------------

            const safeName = escapeHTML(contact.name);

            const safeReply = escapeHTML(
                replyMessage
            ).replace(/\n/g, "<br>");

            const safeOriginalMessage = escapeHTML(
                contact.message
            ).replace(/\n/g, "<br>");

            const replySubject = contact.subject
                ? `Re: ${cleanHeader(contact.subject, 150)}`
                : "Re: Your enquiry to U.S TRAVEL & TOURS";

            // -------------------------------------------------
            // HTML EMAIL
            // -------------------------------------------------

            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>

<body style="
    margin:0;
    padding:30px;
    background:#f5f6f8;
    font-family:Arial,sans-serif;
    color:#222;
">

    <div style="
        max-width:650px;
        margin:0 auto;
        background:#ffffff;
        padding:30px;
        border-radius:10px;
    ">

        <h2 style="
            margin-top:0;
            color:#222;
        ">
            U.S TRAVEL & TOURS
        </h2>

        <p>
            Dear ${safeName},
        </p>

        <p>
            Thank you for contacting U.S TRAVEL & TOURS.
        </p>

        <div style="
            margin:25px 0;
            padding:18px;
            background:#f6f7f9;
            border-left:4px solid #9a7b35;
        ">

            <strong>Our reply:</strong>

            <p style="margin:10px 0 0;">
                ${safeReply}
            </p>

        </div>

        <hr style="
            border:0;
            border-top:1px solid #ddd;
            margin:25px 0;
        ">

        <p>
            <strong>Your original message:</strong>
        </p>

        <p>
            ${safeOriginalMessage}
        </p>

        <p>
            If you have any further questions,
            please feel free to contact us again.
        </p>

        <p>
            Best regards,<br>
            <strong>U.S TRAVEL & TOURS</strong><br>
            Miami, Florida
        </p>

    </div>

</body>
</html>
`;

            // -------------------------------------------------
            // PLAIN TEXT EMAIL
            // -------------------------------------------------

            const text = `
U.S TRAVEL & TOURS

Dear ${contact.name},

Thank you for contacting U.S TRAVEL & TOURS.

Our reply:

${replyMessage}

--------------------------------

Your original message:

${contact.message}

If you have any further questions, please feel free to contact us again.

Best regards,

U.S TRAVEL & TOURS
Miami, Florida
`;

            // -------------------------------------------------
            // SEND EMAIL TO CUSTOMER
            // -------------------------------------------------

            await transporter.sendMail({

                from: MAIL_FROM,

                to: contact.email,

                replyTo: MAIL_FROM,

                subject: replySubject,

                text: text,

                html: html

            });

            // -------------------------------------------------
            // MARK AS REPLIED
            // -------------------------------------------------

            db.prepare(`
                UPDATE contact_messages
                SET
                    status = 'replied',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(id);

            console.log(
                `Contact reply sent successfully to ${contact.email} for message #${id}.`
            );

            // -------------------------------------------------
            // SUCCESS
            // -------------------------------------------------

            return res.status(200).json({

                success: true,

                message:
                    "Reply sent successfully to the customer.",

                status: "replied"

            });

        } catch (error) {

            console.error(
                "CONTACT REPLY ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send reply right now. Please try again later."

            });

        }

    }
);
// =========================================================
// ADMIN — DELETE CONTACT MESSAGE
// =========================================================

router.delete(
    "/messages/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid contact message ID."

                });
            }


            const result =
                db.prepare(`
                    DELETE FROM contact_messages
                    WHERE id = ?
                `).run(id);


            if (result.changes === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact message not found."

                });
            }


            return res.status(200).json({

                success: true,

                message:
                    "Contact message deleted successfully."

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


// =========================================================
// EXPORT
// =========================================================

module.exports = router;
