/* =========================================================
   U.S TRAVEL & TOURS
   CONTACT MESSAGE MODULE

   FLOW:

   CUSTOMER
      ↓
   POST /api/contact
      ↓
   contact_messages DATABASE
      ↓
   ADMIN DASHBOARD
      ↓
   GET /api/contact/messages
      ↓
   ADMIN REPLY
      ↓
   POST /api/contact/messages/:id/reply
      ↓
   BREVO SMTP
      ↓
   CUSTOMER EMAIL
========================================================= */

const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

const { db } = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");


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
    String(
        process.env.SMTP_SECURE || ""
    ).toLowerCase() === "true";

const SMTP_USER =
    process.env.SMTP_USER;

const SMTP_PASS =
    process.env.SMTP_PASS;

const MAIL_FROM =
    process.env.MAIL_FROM ||
    SMTP_USER ||
    OWNER_EMAIL;


// =========================================================
// SMTP LOGGING
// =========================================================

console.log(
    "========================================================="
);

console.log(
    "CONTACT MODULE SMTP CONFIG"
);

console.log(
    "SMTP_HOST:",
    SMTP_HOST
);

console.log(
    "SMTP_PORT:",
    SMTP_PORT
);

console.log(
    "SMTP_SECURE:",
    SMTP_SECURE
);

console.log(
    "SMTP_USER:",
    SMTP_USER
        ? "Configured"
        : "MISSING"
);

console.log(
    "SMTP_PASS:",
    SMTP_PASS
        ? "Configured"
        : "MISSING"
);

console.log(
    "MAIL_FROM:",
    MAIL_FROM
);

console.log(
    "OWNER_EMAIL:",
    OWNER_EMAIL
);

console.log(
    "========================================================="
);


// =========================================================
// DATABASE HELPERS
// =========================================================

function runQuery(
    sql,
    params = []
) {

    const statement =
        db.prepare(sql);

    return statement.run(
        ...params
    );
}


function getQuery(
    sql,
    params = []
) {

    const statement =
        db.prepare(sql);

    return statement.get(
        ...params
    );
}


function allQuery(
    sql,
    params = []
) {

    const statement =
        db.prepare(sql);

    return statement.all(
        ...params
    );
}


// =========================================================
// CREATE CONTACT MESSAGES TABLE
// =========================================================

try {

    db.prepare(`
        CREATE TABLE IF NOT EXISTS contact_messages (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            email TEXT NOT NULL,

            phone TEXT NOT NULL,

            service TEXT NOT NULL,

            subject TEXT,

            message TEXT NOT NULL,

            consent INTEGER DEFAULT 0,

            status TEXT DEFAULT 'new',

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP

        )
    `).run();


    // -----------------------------------------------------
    // INDEXES
    // -----------------------------------------------------

    db.prepare(`
        CREATE INDEX IF NOT EXISTS
        idx_contact_messages_status
        ON contact_messages(status)
    `).run();


    db.prepare(`
        CREATE INDEX IF NOT EXISTS
        idx_contact_messages_created_at
        ON contact_messages(created_at)
    `).run();


    console.log(
        "Contact messages table ready."
    );

} catch (error) {

    console.error(
        "Contact table initialization error:",
        error
    );
}


// =========================================================
// SMTP TRANSPORTER
// =========================================================

let transporter = null;


if (
    SMTP_USER &&
    SMTP_PASS
) {

    transporter =
        nodemailer.createTransport({

            host:
                SMTP_HOST,

            port:
                SMTP_PORT,

            secure:
                SMTP_SECURE,

            auth: {

                user:
                    SMTP_USER,

                pass:
                    SMTP_PASS

            },

            connectionTimeout:
                15000,

            greetingTimeout:
                15000,

            socketTimeout:
                30000

        });


    transporter.verify(
        function (
            error,
            success
        ) {

            if (error) {

                console.error(
                    "========================================================="
                );

                console.error(
                    "SMTP VERIFICATION FAILED"
                );

                console.error(
                    error
                );

                console.error(
                    "========================================================="
                );

            } else {

                console.log(
                    "Brevo SMTP connection verified successfully."
                );

            }

        }
    );

} else {

    console.error(
        "========================================================="
    );

    console.error(
        "SMTP NOT CONFIGURED"
    );

    console.error(
        "SMTP_USER or SMTP_PASS is missing."
    );

    console.error(
        "Contact replies cannot be sent until SMTP is configured."
    );

    console.error(
        "========================================================="
    );
}


// =========================================================
// HELPERS
// =========================================================

function cleanText(
    value,
    maxLength
) {

    return String(
        value ?? ""
    )
        .replace(/\0/g, "")
        .trim()
        .slice(
            0,
            maxLength
        );
}


function isValidEmail(
    email
) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
    );
}


function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


function formatDate(
    value
) {

    if (!value) {
        return "";
    }

    try {

        return new Date(
            value
        ).toLocaleString(
            "en-IN",
            {
                dateStyle:
                    "medium",
                timeStyle:
                    "short"
            }
        );

    } catch {

        return String(
            value
        );
    }
}


// =========================================================
// SEND NEW CONTACT MESSAGE TO OWNER
// =========================================================

async function sendOwnerEmail(
    contact
) {

    if (!transporter) {

        throw new Error(
            "SMTP transporter is not configured."
        );
    }


    const subject =
        contact.subject
            ? `New Contact Enquiry: ${contact.subject}`
            : "New Contact Enquiry - U.S TRAVEL & TOURS";


    const text = `
New Contact Enquiry

Name: ${contact.name}

Email: ${contact.email}

Phone: ${contact.phone}

Service: ${contact.service}

Subject: ${contact.subject || "—"}

Message:
${contact.message}

Received:
${formatDate(contact.created_at)}
`;


    const html = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>New Contact Enquiry</title>

</head>

<body
    style="
        margin:0;
        padding:30px;
        background:#f5f6f8;
        font-family:Arial,sans-serif;
        color:#182235;
    "
>

<div
    style="
        max-width:700px;
        margin:0 auto;
        background:#ffffff;
        border-radius:12px;
        padding:30px;
        border:1px solid #e5e7eb;
    "
>

<h2
    style="
        margin-top:0;
        color:#182235;
    "
>
New Contact Enquiry
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
${escapeHtml(contact.subject || "—")}
</p>

<div
    style="
        margin-top:20px;
        padding:18px;
        background:#f7f8fa;
        border-radius:8px;
        line-height:1.7;
    "
>

<strong>Message</strong>

<p>
${escapeHtml(
    contact.message
).replace(
    /\n/g,
    "<br>"
)}
</p>

</div>

<p
    style="
        margin-top:25px;
        color:#777;
        font-size:13px;
    "
>
Received:
${escapeHtml(
    formatDate(contact.created_at)
)}
</p>

</div>

</body>

</html>
`;


    return transporter.sendMail({

        from:
            MAIL_FROM,

        to:
            OWNER_EMAIL,

        replyTo:
            contact.email,

        subject:
            subject,

        text:
            text,

        html:
            html

    });
}


// =========================================================
// CUSTOMER CONTACT FORM
// POST /api/contact
// =========================================================

router.post(
    "/",
    async function (
        req,
        res
    ) {

        try {

            const name =
                cleanText(
                    req.body?.name,
                    120
                );

            const email =
                cleanText(
                    req.body?.email,
                    180
                ).toLowerCase();

            const phone =
                cleanText(
                    req.body?.phone,
                    30
                );

            const service =
                cleanText(
                    req.body?.service,
                    150
                );

            const subject =
                cleanText(
                    req.body?.subject,
                    250
                );

            const message =
                cleanText(
                    req.body?.message,
                    5000
                );

            const consent =
                Boolean(
                    req.body?.consent
                );


            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (!name) {

                return res.status(400).json({
                    success:
                        false,
                    message:
                        "Please enter your name."
                });

            }


            if (
                !email ||
                !isValidEmail(email)
            ) {

                return res.status(400).json({
                    success:
                        false,
                    message:
                        "Please enter a valid email address."
                });

            }


            const phoneDigits =
                phone.replace(
                    /\D/g,
                    ""
                );


            if (
                phoneDigits.length < 7 ||
                phoneDigits.length > 15
            ) {

                return res.status(400).json({
                    success:
                        false,
                    message:
                        "Please enter a valid phone number."
                });

            }


            if (!service) {

                return res.status(400).json({
                    success:
                        false,
                    message:
                        "Please select a service."
                });

            }


            if (!message) {

                return res.status(400).json({
                    success:
                        false,
                    message:
                        "Please enter your message."
                });

            }


            if (!consent) {

                return res.status(400).json({
                    success:
                        false,
                    message:
                        "Please accept the consent checkbox."
                });

            }


            // -------------------------------------------------
            // SAVE TO DATABASE
            // -------------------------------------------------

            const result =
                runQuery(
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
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        'new',
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
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


            const contactId =
                result.lastInsertRowid;


            // -------------------------------------------------
            // SEND OWNER EMAIL
            //
            // DB success must not be cancelled if owner
            // notification email fails.
            // -------------------------------------------------

            let ownerEmailSent =
                false;


            try {

                const savedContact =
                    getQuery(
                        `
                        SELECT *
                        FROM contact_messages
                        WHERE id = ?
                        `,
                        [
                            contactId
                        ]
                    );


                await sendOwnerEmail(
                    savedContact
                );

                ownerEmailSent =
                    true;

                console.log(
                    `Contact owner email sent successfully for message #${contactId}`
                );

            } catch (emailError) {

                console.error(
                    `Owner email failed for contact message #${contactId}:`,
                    emailError
                );

            }


            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.status(201).json({

                success:
                    true,

                message:
                    "Your message has been submitted successfully.",

                contactId:
                    contactId,

                ownerEmailSent:
                    ownerEmailSent

            });

        } catch (error) {

            console.error(
                "Contact form error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to submit your message right now. Please try again later."

            });

        }

    }
);


// =========================================================
// GET ALL CONTACT MESSAGES
// ADMIN ONLY
//
// GET /api/contact/messages
// =========================================================

router.get(
    "/messages",
    requireAuth,
    requireAdmin,
    function (
        req,
        res
    ) {

        try {

            const messages =
                allQuery(
                    `
                    SELECT *
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

                        datetime(
                            created_at
                        ) DESC,

                        id DESC
                    `
                );


            return res.json({
                success:
                    true,
                messages:
                    messages
            });

        } catch (error) {

            console.error(
                "Load contact messages error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to load contact messages."

            });

        }

    }
);


// =========================================================
// GET SINGLE CONTACT MESSAGE
// ADMIN ONLY
//
// GET /api/contact/messages/:id
// =========================================================

router.get(
    "/messages/:id",
    requireAuth,
    requireAdmin,
    function (
        req,
        res
    ) {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid contact message ID."

                });

            }


            const message =
                getQuery(
                    `
                    SELECT *
                    FROM contact_messages
                    WHERE id = ?
                    `,
                    [
                        id
                    ]
                );


            if (!message) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Contact message not found."

                });

            }


            return res.json({

                success:
                    true,

                message:
                    message

            });

        } catch (error) {

            console.error(
                "Get contact message error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to load contact message."

            });

        }

    }
);


// =========================================================
// UPDATE CONTACT MESSAGE STATUS
// ADMIN ONLY
//
// PATCH /api/contact/messages/:id/status
// =========================================================

router.patch(
    "/messages/:id/status",
    requireAuth,
    requireAdmin,
    function (
        req,
        res
    ) {

        try {

            const id =
                Number(
                    req.params.id
                );

            const status =
                String(
                    req.body?.status || ""
                )
                    .trim()
                    .toLowerCase();


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success:
                        false,

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
                !allowedStatuses.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid contact message status."

                });

            }


            const existing =
                getQuery(
                    `
                    SELECT id
                    FROM contact_messages
                    WHERE id = ?
                    `,
                    [
                        id
                    ]
                );


            if (!existing) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Contact message not found."

                });

            }


            runQuery(
                `
                UPDATE contact_messages

                SET
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = ?
                `,
                [
                    status,
                    id
                ]
            );


            return res.json({

                success:
                    true,

                message:
                    "Contact message status updated successfully.",

                status:
                    status

            });

        } catch (error) {

            console.error(
                "Contact message status update error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to update contact message."

            });

        }

    }
);


// =========================================================
// ADMIN REPLY TO CUSTOMER
//
// POST /api/contact/messages/:id/reply
//
// THIS IS THE IMPORTANT ROUTE.
//
// Admin Dashboard
//       ↓
// this route
//       ↓
// Brevo SMTP
//       ↓
// contact.email
// =========================================================

router.post(
    "/messages/:id/reply",
    requireAuth,
    requireAdmin,
    async function (
        req,
        res
    ) {

        const id =
            Number(
                req.params.id
            );


        const reply =
            cleanText(
                req.body?.reply,
                5000
            );


        console.log(
            "========================================================="
        );

        console.log(
            "ADMIN CONTACT REPLY REQUEST"
        );

        console.log(
            "Message ID:",
            id
        );

        console.log(
            "Reply length:",
            reply.length
        );

        console.log(
            "SMTP configured:",
            Boolean(
                transporter
            )
        );

        console.log(
            "========================================================="
        );


        try {

            // -------------------------------------------------
            // VALIDATE ID
            // -------------------------------------------------

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid contact message ID."

                });

            }


            // -------------------------------------------------
            // VALIDATE REPLY
            // -------------------------------------------------

            if (!reply) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter a reply message."

                });

            }


            // -------------------------------------------------
            // CHECK SMTP
            // -------------------------------------------------

            if (!transporter) {

                console.error(
                    "Contact reply blocked: SMTP transporter is not configured."
                );

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Email service is not configured on the server. Please check SMTP_USER and SMTP_PASS in Render environment variables."

                });

            }


            // -------------------------------------------------
            // GET ORIGINAL CUSTOMER MESSAGE
            // -------------------------------------------------

            const contact =
                getQuery(
                    `
                    SELECT *
                    FROM contact_messages
                    WHERE id = ?
                    `,
                    [
                        id
                    ]
                );


            if (!contact) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Contact message not found."

                });

            }


            // -------------------------------------------------
            // VALIDATE CUSTOMER EMAIL
            // -------------------------------------------------

            const customerEmail =
                String(
                    contact.email || ""
                )
                    .trim()
                    .toLowerCase();


            if (
                !customerEmail ||
                !isValidEmail(
                    customerEmail
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "The customer email address stored with this message is invalid."

                });

            }


            console.log(
                "Sending contact reply to:",
                customerEmail
            );


            // -------------------------------------------------
            // SUBJECT
            // -------------------------------------------------

            const originalSubject =
                String(
                    contact.subject || ""
                ).trim();


            let replySubject =
                "Re: Your enquiry - U.S TRAVEL & TOURS";


            if (originalSubject) {

                replySubject =
                    originalSubject
                        .toLowerCase()
                        .startsWith("re:")
                        ? originalSubject
                        : `Re: ${originalSubject}`;

            }


            // -------------------------------------------------
            // PLAIN TEXT EMAIL
            // -------------------------------------------------

            const text = `
Dear ${contact.name || "Customer"},

${reply}

--------------------------------------------------

This is a reply from U.S TRAVEL & TOURS.

Original enquiry:
${contact.message || ""}

U.S TRAVEL & TOURS
${OWNER_EMAIL}
`;


            // -------------------------------------------------
            // HTML EMAIL
            // -------------------------------------------------

            const html = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>
${escapeHtml(
    replySubject
)}
</title>

</head>

<body
    style="
        margin:0;
        padding:0;
        background:#f4f5f7;
        font-family:Arial,Helvetica,sans-serif;
        color:#182235;
    "
>

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
        background:#f4f5f7;
        padding:30px 15px;
    "
>

<tr>

<td align="center">

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
        max-width:700px;
        background:#ffffff;
        border:1px solid #e5e7eb;
        border-radius:14px;
        overflow:hidden;
    "
>

<tr>

<td
    style="
        padding:28px 30px;
        border-bottom:1px solid #e8e8e8;
    "
>

<div
    style="
        font-size:11px;
        font-weight:bold;
        letter-spacing:1.5px;
        color:#9a7b35;
        margin-bottom:7px;
    "
>
U.S TRAVEL & TOURS
</div>

<h1
    style="
        margin:0;
        font-size:24px;
        color:#162033;
    "
>
${escapeHtml(
    replySubject
)}
</h1>

</td>

</tr>


<tr>

<td
    style="
        padding:30px;
    "
>

<p
    style="
        margin:0 0 18px;
        font-size:15px;
        line-height:1.7;
    "
>
Dear ${escapeHtml(
    contact.name || "Customer"
)},
</p>


<div
    style="
        font-size:15px;
        line-height:1.8;
        color:#303846;
        white-space:normal;
        word-break:break-word;
    "
>

${escapeHtml(
    reply
).replace(
    /\n/g,
    "<br>"
)}

</div>


<div
    style="
        margin-top:28px;
        padding:18px;
        background:#f7f8fa;
        border:1px solid #e7e8eb;
        border-radius:10px;
    "
>

<div
    style="
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.7px;
        color:#777;
        margin-bottom:8px;
    "
>
Your Original Message
</div>

<div
    style="
        font-size:13px;
        line-height:1.7;
        color:#555;
        word-break:break-word;
    "
>

${escapeHtml(
    contact.message || ""
).replace(
    /\n/g,
    "<br>"
)}

</div>

</div>


<p
    style="
        margin:28px 0 0;
        font-size:14px;
        line-height:1.7;
        color:#303846;
    "
>
Best regards,<br>

<strong>
U.S TRAVEL & TOURS
</strong>

<br>

${escapeHtml(
    OWNER_EMAIL
)}

</p>

</td>

</tr>


<tr>

<td
    style="
        padding:18px 30px;
        background:#f8f9fa;
        border-top:1px solid #e8e8e8;
        font-size:12px;
        color:#777;
    "
>

This email was sent in response to your enquiry submitted through the U.S TRAVEL & TOURS website.

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`;


            // -------------------------------------------------
            // SEND EMAIL DIRECTLY TO CUSTOMER
            // -------------------------------------------------

            const mailResult =
                await transporter.sendMail({

                    from:
                        MAIL_FROM,

                    to:
                        customerEmail,

                    replyTo:
                        MAIL_FROM,

                    subject:
                        replySubject,

                    text:
                        text,

                    html:
                        html

                });


            console.log(
                "========================================================="
            );

            console.log(
                "CONTACT REPLY EMAIL SENT"
            );

            console.log(
                "Message ID:",
                id
            );

            console.log(
                "Customer:",
                customerEmail
            );

            console.log(
                "Message ID from SMTP:",
                mailResult?.messageId ||
                "N/A"
            );

            console.log(
                "========================================================="
            );


            // -------------------------------------------------
            // UPDATE STATUS ONLY AFTER EMAIL SUCCESS
            // -------------------------------------------------

            runQuery(
                `
                UPDATE contact_messages

                SET
                    status = 'replied',
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = ?
                `,
                [
                    id
                ]
            );


            return res.json({

                success:
                    true,

                message:
                    "Reply sent successfully to the customer.",

                status:
                    "replied",

                email:
                    customerEmail

            });

        } catch (error) {

            console.error(
                "========================================================="
            );

            console.error(
                "CONTACT REPLY EMAIL FAILED"
            );

            console.error(
                "Message ID:",
                id
            );

            console.error(
                "Error name:",
                error?.name
            );

            console.error(
                "Error code:",
                error?.code
            );

            console.error(
                "Error command:",
                error?.command
            );

            console.error(
                "Error response:",
                error?.response
            );

            console.error(
                "Error responseCode:",
                error?.responseCode
            );

            console.error(
                "Error message:",
                error?.message
            );

            console.error(
                error
            );

            console.error(
                "========================================================="
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to send reply right now. Please check the email/SMTP configuration on the server and try again."

            });

        }

    }
);


// =========================================================
// DELETE CONTACT MESSAGE
// ADMIN ONLY
//
// DELETE /api/contact/messages/:id
// =========================================================

router.delete(
    "/messages/:id",
    requireAuth,
    requireAdmin,
    function (
        req,
        res
    ) {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid contact message ID."

                });

            }


            const existing =
                getQuery(
                    `
                    SELECT id
                    FROM contact_messages
                    WHERE id = ?
                    `,
                    [
                        id
                    ]
                );


            if (!existing) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Contact message not found."

                });

            }


            runQuery(
                `
                DELETE FROM contact_messages
                WHERE id = ?
                `,
                [
                    id
                ]
            );


            return res.json({

                success:
                    true,

                message:
                    "Contact message deleted successfully."

            });

        } catch (error) {

            console.error(
                "Delete contact message error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to delete contact message."

            });

        }

    }
);


// =========================================================
// EXPORT
// =========================================================

module.exports =
    router;
