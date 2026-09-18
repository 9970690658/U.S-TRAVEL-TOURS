/* =========================================================
   U.S TRAVEL & TOURS
   JOB APPLICATION MODULE
   PostgreSQL Version
   ========================================================= */

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
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
    process.env.JOBS_OWNER_EMAIL ||
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";

const MAX_RESUME_SIZE =
    5 * 1024 * 1024;

const ROOT_DIR =
    path.join(__dirname, "..");

const RESUME_DIR =
    path.join(
        ROOT_DIR,
        "data",
        "job-resumes"
    );

const JOBS_BASE_URL =
    process.env.APP_BASE_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000";


/* =========================================================
   JOB DIRECTORY
========================================================= */

const JOBS = {

    "restaurant-food-service-worker": {
        title: "Restaurant / Food-Service Worker"
    },

    "construction-worker": {
        title: "Construction Worker"
    },

    "cleaner": {
        title: "Cleaner"
    },

    "factory-warehouse-worker": {
        title: "Factory / Warehouse Worker"
    },

    "driver-delivery-worker": {
        title: "Driver / Delivery Worker"
    },

    "security-guard": {
        title: "Security Guard"
    },

    "hotel-worker": {
        title: "Hotel Worker"
    },

    "caregiver": {
        title: "Caregiver"
    },

    "retail-worker": {
        title: "Retail Worker"
    }

};


/* =========================================================
   STATUS LABELS
========================================================= */

const STATUS_LABELS = {

    new: "Submitted",

    reviewing: "Under Review",

    shortlisted: "Shortlisted",

    hired: "Accepted",

    rejected: "Rejected"

};


/* =========================================================
   CREATE RESUME DIRECTORY
========================================================= */

if (!fs.existsSync(RESUME_DIR)) {

    fs.mkdirSync(
        RESUME_DIR,
        {
            recursive: true
        }
    );

}


/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

let databaseReady = null;

async function ensureDatabase() {

    if (!databaseReady) {
        databaseReady =
            initializeDatabase();
    }

    return databaseReady;
}


/* =========================================================
   SMTP CONFIGURATION
========================================================= */

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(
        process.env.SMTP_PORT || 587
    );

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


    transporter.verify()
        .then(() => {

            console.log(
                "JOBS SMTP READY"
            );

        })
        .catch((error) => {

            console.error(
                "JOBS SMTP VERIFY ERROR:",
                error.message
            );

        });

} else {

    console.warn(
        "JOBS SMTP NOT CONFIGURED - job emails will be skipped."
    );

}


/* =========================================================
   MULTER
========================================================= */

const storage =
    multer.diskStorage({

        destination: function (
            req,
            file,
            cb
        ) {

            cb(
                null,
                RESUME_DIR
            );

        },

        filename: function (
            req,
            file,
            cb
        ) {

            const extension =
                path.extname(
                    file.originalname
                ).toLowerCase();

            const randomName =
                crypto
                    .randomBytes(16)
                    .toString("hex");

            cb(
                null,
                `${Date.now()}-${randomName}${extension}`
            );

        }

    });


const upload =
    multer({

        storage,

        limits: {
            fileSize:
                MAX_RESUME_SIZE
        },

        fileFilter:
            function (
                req,
                file,
                cb
            ) {

                const extension =
                    path.extname(
                        file.originalname
                    ).toLowerCase();

                const allowed = [
                    ".pdf",
                    ".doc",
                    ".docx"
                ];


                if (
                    !allowed.includes(
                        extension
                    )
                ) {

                    return cb(
                        new Error(
                            "Only PDF, DOC and DOCX resume files are allowed."
                        )
                    );

                }


                cb(
                    null,
                    true
                );

            }

    });


/* =========================================================
   HELPERS
========================================================= */

function cleanText(
    value,
    maxLength = 1000
) {

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


function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        String(email || "").trim()
    );

}


function cleanHeader(value) {

    return String(value || "")
        .replace(/[\r\n]+/g, " ")
        .trim()
        .slice(0, 200);

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


function safeResumePath(
    resumePath
) {

    if (!resumePath) {
        return null;
    }

    const resolved =
        path.resolve(
            resumePath
        );

    const base =
        path.resolve(
            RESUME_DIR
        );

    if (
        resolved !== base &&
        !resolved.startsWith(
            base + path.sep
        )
    ) {
        return null;
    }

    return resolved;

}


/* =========================================================
   SEND EMAIL
========================================================= */

async function sendEmail(
    options
) {

    if (!transporter) {
        return false;
    }

    try {

        await transporter.sendMail(
            options
        );

        return true;

    } catch (error) {

        console.error(
            "JOB EMAIL ERROR:",
            error.message
        );

        return false;

    }

}


/* =========================================================
   CUSTOMER JOB CONFIRMATION EMAIL
========================================================= */

async function sendApplicantConfirmation(
    application
) {

    if (!transporter) {
        return false;
    }

    return sendEmail({

        from: MAIL_FROM,

        to: application.email,

        subject:
            "Job Application Received - U.S TRAVEL & TOURS",

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
                    Dear ${escapeHtml(application.full_name)},
                </p>

                <p>
                    Your job application has been successfully received.
                </p>

                <div style="
                    background:#f5f5f5;
                    padding:18px;
                    border-radius:8px;
                    margin:20px 0;
                ">

                    <p>
                        <strong>Application ID:</strong>
                        ${application.id}
                    </p>

                    <p>
                        <strong>Position:</strong>
                        ${escapeHtml(application.job_title)}
                    </p>

                    <p>
                        <strong>Status:</strong>
                        Submitted
                    </p>

                </div>

                <p>
                    Our team will review your application.
                </p>

                <p>
                    Regards,<br>
                    <strong>U.S TRAVEL & TOURS</strong>
                </p>

            </div>
        `

    });

}


/* =========================================================
   OWNER JOB EMAIL
========================================================= */

async function sendOwnerApplicationEmail(
    application,
    resumePath
) {

    if (!transporter) {
        return false;
    }


    const mailOptions = {

        from: MAIL_FROM,

        to: OWNER_EMAIL,

        replyTo: application.email,

        subject:
            `New Job Application - ${application.job_title}`,

        html: `
            <div style="
                font-family:Arial,sans-serif;
                line-height:1.6;
                color:#222;
            ">

                <h2>
                    New Job Application
                </h2>

                <p>
                    <strong>Application ID:</strong>
                    ${application.id}
                </p>

                <p>
                    <strong>Position:</strong>
                    ${escapeHtml(application.job_title)}
                </p>

                <p>
                    <strong>Name:</strong>
                    ${escapeHtml(application.full_name)}
                </p>

                <p>
                    <strong>Email:</strong>
                    ${escapeHtml(application.email)}
                </p>

                <p>
                    <strong>Phone:</strong>
                    ${escapeHtml(application.phone)}
                </p>

                <p>
                    <strong>Country:</strong>
                    ${escapeHtml(application.country)}
                </p>

                <p>
                    <strong>City:</strong>
                    ${escapeHtml(application.city)}
                </p>

                <p>
                    <strong>Experience:</strong>
                    ${escapeHtml(application.experience || "Not provided")}
                </p>

                <p>
                    <strong>Education:</strong>
                    ${escapeHtml(application.education || "Not provided")}
                </p>

                <p>
                    <strong>Date of Birth:</strong>
                    ${escapeHtml(application.date_of_birth || "Not provided")}
                </p>

                <p>
                    <strong>Status:</strong>
                    Submitted
                </p>

            </div>
        `

    };


    const safePath =
        safeResumePath(
            resumePath
        );


    if (safePath && fs.existsSync(safePath)) {

        mailOptions.attachments = [
            {
                filename:
                    path.basename(
                        safePath
                    ),

                path:
                    safePath
            }
        ];

    }


    return sendEmail(
        mailOptions
    );

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =========================================================
   CUSTOMER
   SUBMIT JOB APPLICATION
========================================================= */

router.post(
    "/",
    requireAuth,
    upload.single("resume"),
    async (req, res) => {

        try {

            await ensureDatabase();


            const userId =
                getUserId(req);


            if (
                !userId ||
                !Number.isInteger(userId)
            ) {

                if (req.file) {

                    try {
                        fs.unlinkSync(
                            req.file.path
                        );
                    } catch (_) {}

                }

                return res.status(401).json({

                    success: false,

                    message:
                        "Authentication required."

                });

            }


            const jobPosition =
                cleanText(
                    req.body.jobPosition ||
                    req.body.job_position ||
                    req.body.jobSlug,
                    100
                );


            const fullName =
                cleanText(
                    req.body.fullName ||
                    req.body.full_name,
                    150
                );


            const email =
                cleanText(
                    req.body.email,
                    255
                ).toLowerCase();


            const phone =
                cleanText(
                    req.body.phone,
                    50
                );


            const dateOfBirth =
                cleanText(
                    req.body.dateOfBirth ||
                    req.body.date_of_birth,
                    50
                );


            const country =
                cleanText(
                    req.body.country,
                    100
                );


            const city =
                cleanText(
                    req.body.city,
                    100
                );


            const experience =
                cleanText(
                    req.body.experience,
                    1000
                );


            const education =
                cleanText(
                    req.body.education,
                    1000
                );


            const consent =
                req.body.consent === true ||
                req.body.consent === "true" ||
                req.body.consent === 1 ||
                req.body.consent === "1" ||
                req.body.consent === "on";


            /* -------------------------------------------------
               VALIDATION
            ------------------------------------------------- */

            if (
                !jobPosition ||
                !JOBS[jobPosition]
            ) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please select a valid job position."
                    }
                );

            }


            if (!fullName) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please enter your full name."
                    }
                );

            }


            if (
                !email ||
                !isValidEmail(email)
            ) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please enter a valid email address."
                    }
                );

            }


            if (!phone) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please enter your phone number."
                    }
                );

            }


            if (!country) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please enter your country."
                    }
                );

            }


            if (!city) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please enter your city."
                    }
                );

            }


            if (!consent) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please accept the consent before submitting."
                    }
                );

            }


            if (!req.file) {

                return cleanupAndRespond(
                    req,
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Please upload your resume."
                    }
                );

            }


            /* -------------------------------------------------
               CHECK USER
            ------------------------------------------------- */

            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return cleanupAndRespond(
                    req,
                    res,
                    404,
                    {
                        success: false,
                        message:
                            "Your account could not be found."
                    }
                );

            }


            /* -------------------------------------------------
               SAVE APPLICATION
            ------------------------------------------------- */

            const jobTitle =
                JOBS[jobPosition].title;


            const result =
                await pool.query(
                    `
                    INSERT INTO job_applications
                    (
                        user_id,
                        job_slug,
                        job_title,
                        full_name,
                        email,
                        phone,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education,
                        resume_path,
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
                        $8,
                        $9,
                        $10,
                        $11,
                        $12,
                        $13,
                        'new',
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    RETURNING *
                    `,
                    [
                        userId,
                        jobPosition,
                        jobTitle,
                        fullName,
                        email,
                        phone,
                        dateOfBirth || null,
                        country,
                        city,
                        experience || null,
                        education || null,
                        req.file.path,
                        consent
                    ]
                );


            const application =
                result.rows[0];


            /* -------------------------------------------------
               OWNER EMAIL
            ------------------------------------------------- */

            const ownerEmailSent =
                await sendOwnerApplicationEmail(
                    application,
                    req.file.path
                );


            /* -------------------------------------------------
               APPLICANT EMAIL
            ------------------------------------------------- */

            const applicantEmailSent =
                await sendApplicantConfirmation(
                    application
                );


            return res.status(201).json({

                success: true,

                message:
                    "Your job application has been submitted successfully.",

                application: {

                    id:
                        application.id,

                    jobSlug:
                        application.job_slug,

                    jobTitle:
                        application.job_title,

                    status:
                        application.status,

                    statusLabel:
                        STATUS_LABELS[
                            application.status
                        ] ||
                        application.status,

                    emailSent:
                        applicantEmailSent,

                    ownerEmailSent

                }

            });

        } catch (error) {

            console.error(
                "JOB APPLICATION ERROR:",
                error
            );


            if (req.file) {

                try {

                    if (
                        fs.existsSync(
                            req.file.path
                        )
                    ) {

                        fs.unlinkSync(
                            req.file.path
                        );

                    }

                } catch (_) {}

            }


            return res.status(500).json({

                success: false,

                message:
                    "Unable to submit your job application right now."

            });

        }

    }
);


/* =========================================================
   CLEANUP FILE + RESPONSE
========================================================= */

function cleanupAndRespond(
    req,
    res,
    statusCode,
    payload
) {

    if (req.file) {

        try {

            if (
                fs.existsSync(
                    req.file.path
                )
            ) {

                fs.unlinkSync(
                    req.file.path
                );

            }

        } catch (_) {}

    }


    return res
        .status(statusCode)
        .json(payload);

}


/* =========================================================
   CUSTOMER
   MY JOB APPLICATIONS
========================================================= */

router.get(
    "/my",
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


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        job_slug,
                        job_title,
                        full_name,
                        email,
                        phone,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education,
                        status,
                        created_at,
                        updated_at
                    FROM job_applications
                    WHERE user_id = $1
                    ORDER BY
                        created_at DESC,
                        id DESC
                    `,
                    [userId]
                );


            const applications =
                result.rows.map(
                    (application) => ({

                        ...application,

                        statusLabel:
                            STATUS_LABELS[
                                application.status
                            ] ||
                            application.status

                    })
                );


            return res.json({

                success: true,

                applications

            });

        } catch (error) {

            console.error(
                "MY JOB APPLICATIONS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load your job applications."

            });

        }

    }
);


/* =========================================================
   ADMIN
   GET ALL JOB APPLICATIONS
========================================================= */

router.get(
    "/applications",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const result =
                await pool.query(
                    `
                    SELECT
                        ja.*,
                        u.email AS account_email,
                        u.name AS account_name

                    FROM job_applications ja

                    LEFT JOIN users u
                        ON u.id = ja.user_id

                    ORDER BY
                        ja.created_at DESC,
                        ja.id DESC
                    `
                );


            const applications =
                result.rows.map(
                    (application) => ({

                        ...application,

                        statusLabel:
                            STATUS_LABELS[
                                application.status
                            ] ||
                            application.status

                    })
                );


            return res.json({

                success: true,

                applications

            });

        } catch (error) {

            console.error(
                "ADMIN JOB APPLICATIONS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load job applications."

            });

        }

    }
);


/* =========================================================
   AUTH USER / ADMIN
   GET SINGLE APPLICATION
========================================================= */

router.get(
    "/applications/:id",
    requireAuth,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }


            const result =
                await pool.query(
                    `
                    SELECT
                        ja.*,
                        u.email AS account_email,
                        u.name AS account_name

                    FROM job_applications ja

                    LEFT JOIN users u
                        ON u.id = ja.user_id

                    WHERE ja.id = $1

                    LIMIT 1
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }


            const application =
                result.rows[0];


            const userId =
                getUserId(req);


            const isAdmin =
                req.user &&
                req.user.role === "admin";


            if (
                !isAdmin &&
                Number(application.user_id) !==
                    Number(userId)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not allowed to view this application."

                });

            }


            return res.json({

                success: true,

                application: {

                    ...application,

                    statusLabel:
                        STATUS_LABELS[
                            application.status
                        ] ||
                        application.status

                }

            });

        } catch (error) {

            console.error(
                "GET JOB APPLICATION ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load job application."

            });

        }

    }
);


/* =========================================================
   RESUME DOWNLOAD
========================================================= */

router.get(
    "/applications/:id/resume",
    requireAuth,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        full_name,
                        resume_path
                    FROM job_applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }


            const application =
                result.rows[0];


            const userId =
                getUserId(req);


            const isAdmin =
                req.user &&
                req.user.role === "admin";


            if (
                !isAdmin &&
                Number(application.user_id) !==
                    Number(userId)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not allowed to access this resume."

                });

            }


            const safePath =
                safeResumePath(
                    application.resume_path
                );


            if (
                !safePath ||
                !fs.existsSync(safePath)
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Resume file not found."

                });

            }


            return res.download(
                safePath,
                path.basename(
                    safePath
                )
            );

        } catch (error) {

            console.error(
                "RESUME DOWNLOAD ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to download resume."

            });

        }

    }
);


/* =========================================================
   ADMIN
   UPDATE APPLICATION STATUS
========================================================= */

router.patch(
    "/applications/:id/status",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);

            const status =
                cleanText(
                    req.body.status,
                    50
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }


            const allowedStatuses = [
                "new",
                "reviewing",
                "shortlisted",
                "hired",
                "rejected"
            ];


            if (
                !allowedStatuses.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job application status."

                });

            }


            const existingResult =
                await pool.query(
                    `
                    SELECT
                        *
                    FROM job_applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [id]
                );


            if (
                existingResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }


            const existing =
                existingResult.rows[0];


            const updateResult =
                await pool.query(
                    `
                    UPDATE job_applications

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


            const application =
                updateResult.rows[0];


            /* -------------------------------------------------
               SEND STATUS EMAIL
            ------------------------------------------------- */

            let emailSent = false;


            if (
                existing.status !== status &&
                existing.email &&
                transporter
            ) {

                emailSent =
                    await sendEmail({

                        from: MAIL_FROM,

                        to: existing.email,

                        subject:
                            `Job Application Status Update - ${existing.job_title}`,

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
                                    Dear ${escapeHtml(existing.full_name)},
                                </p>

                                <p>
                                    Your job application status has been updated.
                                </p>

                                <div style="
                                    background:#f5f5f5;
                                    padding:18px;
                                    border-radius:8px;
                                    margin:20px 0;
                                ">

                                    <p>
                                        <strong>Application ID:</strong>
                                        ${existing.id}
                                    </p>

                                    <p>
                                        <strong>Position:</strong>
                                        ${escapeHtml(existing.job_title)}
                                    </p>

                                    <p>
                                        <strong>New Status:</strong>
                                        ${escapeHtml(
                                            STATUS_LABELS[status] ||
                                            status
                                        )}
                                    </p>

                                </div>

                                <p>
                                    Thank you for your interest in U.S TRAVEL & TOURS.
                                </p>

                                <p>
                                    Regards,<br>
                                    <strong>U.S TRAVEL & TOURS</strong>
                                </p>

                            </div>
                        `

                    });

            }


            return res.json({

                success: true,

                message:
                    "Job application status updated successfully.",

                application: {

                    ...application,

                    statusLabel:
                        STATUS_LABELS[
                            application.status
                        ] ||
                        application.status,

                    emailSent

                }

            });

        } catch (error) {

            console.error(
                "UPDATE JOB STATUS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to update job application status."

            });

        }

    }
);


/* =========================================================
   ADMIN
   DELETE APPLICATION
========================================================= */

router.delete(
    "/applications/:id",
    requireAdmin,
    async (req, res) => {

        try {

            await ensureDatabase();

            const id =
                Number(req.params.id);


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }


            const result =
                await pool.query(
                    `
                    DELETE FROM job_applications
                    WHERE id = $1
                    RETURNING
                        id,
                        resume_path
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }


            const deleted =
                result.rows[0];


            const safePath =
                safeResumePath(
                    deleted.resume_path
                );


            if (
                safePath &&
                fs.existsSync(safePath)
            ) {

                try {

                    fs.unlinkSync(
                        safePath
                    );

                } catch (fileError) {

                    console.error(
                        "RESUME DELETE ERROR:",
                        fileError.message
                    );

                }

            }


            return res.json({

                success: true,

                message:
                    "Job application deleted successfully.",

                applicationId:
                    deleted.id

            });

        } catch (error) {

            console.error(
                "DELETE JOB APPLICATION ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete job application."

            });

        }

    }
);


/* =========================================================
   MULTER ERROR HANDLER
========================================================= */

router.use(
    function (
        error,
        req,
        res,
        next
    ) {

        if (
            error instanceof multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Resume file is too large. Maximum size is 5 MB."

                });

            }


            return res.status(400).json({

                success: false,

                message:
                    error.message

            });

        }


        if (
            error &&
            error.message
        ) {

            return res.status(400).json({

                success: false,

                message:
                    error.message

            });

        }


        next(error);

    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
