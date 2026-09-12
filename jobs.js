// =========================================================
// U.S TRAVEL & TOURS
// JOB APPLICATION BACKEND
// =========================================================

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const nodemailer = require("nodemailer");

const { db } = require("./database");
const { requireAuth, requireAdmin } = require("./auth");

const router = express.Router();

// =========================================================
// CONFIG
// =========================================================

const OWNER_EMAIL =
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

if (!fs.existsSync(RESUME_DIR)) {
    fs.mkdirSync(
        RESUME_DIR,
        {
            recursive: true
        }
    );
}

// =========================================================
// JOB LIST
// =========================================================

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

// =========================================================
// STATUS LABELS
// =========================================================

const JOB_STATUS_LABELS = {

    new: "Submitted",

    reviewing: "Under Review",

    shortlisted: "Shortlisted",

    hired: "Accepted",

    rejected: "Rejected"

};

function getJobStatusLabel(status) {

    return (
        JOB_STATUS_LABELS[status] ||
        "Submitted"
    );

}

// =========================================================
// DATABASE MIGRATION
// =========================================================
//
// Adds the fields required for customer-specific
// job application history without destroying existing data.
//

try {

    const columns =
        db.prepare(
            "PRAGMA table_info(job_applications)"
        ).all();

    const columnNames =
        columns.map(
            column => column.name
        );

    if (!columnNames.includes("user_id")) {

        db.exec(
            `
            ALTER TABLE job_applications
            ADD COLUMN user_id INTEGER
            `
        );

        console.log(
            "Job applications: user_id column added."
        );

    }

    if (!columnNames.includes("date_of_birth")) {

        db.exec(
            `
            ALTER TABLE job_applications
            ADD COLUMN date_of_birth TEXT
            `
        );

    }

    if (!columnNames.includes("country")) {

        db.exec(
            `
            ALTER TABLE job_applications
            ADD COLUMN country TEXT
            `
        );

    }

    if (!columnNames.includes("city")) {

        db.exec(
            `
            ALTER TABLE job_applications
            ADD COLUMN city TEXT
            `
        );

    }

    if (!columnNames.includes("experience")) {

        db.exec(
            `
            ALTER TABLE job_applications
            ADD COLUMN experience TEXT
            `
        );

    }

    if (!columnNames.includes("education")) {

        db.exec(
            `
            ALTER TABLE job_applications
            ADD COLUMN education TEXT
            `
        );

    }

    db.exec(
        `
        CREATE INDEX IF NOT EXISTS
        idx_job_applications_user_id
        ON job_applications(user_id)
        `
    );

    console.log(
        "Job application database migration completed."
    );

} catch (migrationError) {

    console.error(
        "Job application database migration error:",
        migrationError
    );

}

// =========================================================
// EMAIL TRANSPORTER
// =========================================================

let transporter = null;

try {

    transporter =
        nodemailer.createTransport({

            host:
                process.env.SMTP_HOST ||
                "smtp-relay.brevo.com",

            port:
                Number(
                    process.env.SMTP_PORT ||
                    587
                ),

            secure:
                String(
                    process.env.SMTP_SECURE ||
                    "false"
                ).toLowerCase() === "true",

            auth: {

                user:
                    process.env.SMTP_USER,

                pass:
                    process.env.SMTP_PASS

            }

        });

} catch (error) {

    console.error(
        "Job email transporter error:",
        error
    );

}

// =========================================================
// MULTER STORAGE
// =========================================================

const storage =
    multer.diskStorage({

        destination:
            function (
                req,
                file,
                callback
            ) {

                callback(
                    null,
                    RESUME_DIR
                );

            },

        filename:
            function (
                req,
                file,
                callback
            ) {

                const randomName =
                    crypto
                        .randomBytes(16)
                        .toString("hex");

                const extension =
                    path.extname(
                        file.originalname
                    ).toLowerCase();

                callback(
                    null,
                    `${Date.now()}-${randomName}${extension}`
                );

            }

    });

// =========================================================
// MULTER UPLOAD
// =========================================================

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
                callback
            ) {

                const extension =
                    path.extname(
                        file.originalname
                    ).toLowerCase();

                const allowedExtensions = [

                    ".pdf",
                    ".doc",
                    ".docx"

                ];

                if (
                    !allowedExtensions.includes(
                        extension
                    )
                ) {

                    return callback(
                        new Error(
                            "Only PDF, DOC and DOCX resume files are allowed."
                        )
                    );

                }

                callback(
                    null,
                    true
                );

            }

    });

// =========================================================
// HELPERS
// =========================================================

function cleanText(
    value,
    maxLength = 500
) {

    return String(
        value ?? ""
    )
        .trim()
        .slice(
            0,
            maxLength
        );

}

function isValidEmail(email) {

   return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

}

function cleanHeader(value) {

    return String(
        value ?? ""
    )
        .replace(
            /[\r\n]/g,
            ""
        )
        .trim();

}

function getUserId(req) {

    return Number(
        req.user?.id
    );

}

function safeResumePath(filename) {

    if (!filename) {
        return null;
    }

    const resumeRoot =
        path.resolve(
            RESUME_DIR
        );

    const safeFilename =
        path.basename(
            filename
        );

    const resumePath =
        path.resolve(
            RESUME_DIR,
            safeFilename
        );

    if (
        !resumePath.startsWith(
            resumeRoot +
            path.sep
        )
    ) {

        return null;

    }

    return resumePath;

}

// =========================================================
// EMAIL HELPER
// =========================================================

async function sendEmail(options) {

    if (
        !transporter ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
    ) {

        console.warn(
            "Email skipped: SMTP configuration is missing."
        );

        return false;

    }

    try {

        await transporter.sendMail({

            from:
                process.env.MAIL_FROM ||
                process.env.SMTP_USER,

            ...options

        });

        return true;

    } catch (error) {

        console.error(
            "Job email sending error:",
            error
        );

        return false;

    }

}

// =========================================================
// CREATE JOB APPLICATION
//
// POST /api/job-applications
// POST /api/jobs/
// =========================================================

router.post(
    "/",
    requireAuth,
    upload.single("resume"),
    async function (
        req,
        res
    ) {

        let savedResumePath = null;

        try {

            // -------------------------------------------------
            // CUSTOMER ONLY
            // -------------------------------------------------

            if (
                !req.user ||
                req.user.role !== "customer"
            ) {

                if (req.file) {

                    try {

                        fs.unlinkSync(
                            req.file.path
                        );

                    } catch {}

                }

                return res.status(403).json({

                    success: false,

                    message:
                        "Only customer accounts can submit job applications."

                });

            }

            const userId =
                getUserId(req);

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                if (req.file) {

                    try {

                        fs.unlinkSync(
                            req.file.path
                        );

                    } catch {}

                }

                return res.status(401).json({

                    success: false,

                    message:
                        "Authentication is invalid."

                });

            }

            // -------------------------------------------------
            // JOB
            // -------------------------------------------------

            const jobSlug =
                cleanText(
                    req.body.jobPosition,
                    100
                );

            const job =
                JOBS[jobSlug];

            if (!job) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select a valid job position."

                });

            }

            // -------------------------------------------------
            // FORM DATA
            // -------------------------------------------------

            const fullName =
                cleanText(
                    req.body.fullName,
                    150
                );

            const email =
                cleanHeader(
                    req.body.email
                );

            const phone =
                cleanText(
                    req.body.phone,
                    50
                );

            const dateOfBirth =
                cleanText(
                    req.body.dateOfBirth,
                    30
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
                    100
                );

            const education =
                cleanText(
                    req.body.education,
                    100
                );

            const coverLetter =
                cleanText(
                    req.body.message,
                    3000
                );

            // -------------------------------------------------
            // REQUIRED VALIDATION
            // -------------------------------------------------

            if (!fullName) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Full name is required."

                });

            }

            if (
                !email ||
                !isValidEmail(email)
            ) {

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
                        "Phone number is required."

                });

            }

            if (!country) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Country is required."

                });

            }

            if (!city) {

                return res.status(400).json({

                    success: false,

                    message:
                        "City is required."

                });

            }

            if (
                req.body.applicationConsent !==
                "on"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please confirm the application consent."

                });

            }

            // -------------------------------------------------
            // RESUME
            // -------------------------------------------------

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please upload your resume."

                });

            }

            savedResumePath =
                req.file.path;

            // -------------------------------------------------
            // USER
            // -------------------------------------------------

            const user =
                db.prepare(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        phone
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `
                ).get(userId);

            if (!user) {

                if (
                    savedResumePath &&
                    fs.existsSync(
                        savedResumePath
                    )
                ) {

                    fs.unlinkSync(
                        savedResumePath
                    );

                }

                return res.status(401).json({

                    success: false,

                    message:
                        "Customer account not found."

                });

            }

            // -------------------------------------------------
            // SAVE APPLICATION
            // -------------------------------------------------

            const insert =
                db.prepare(
                    `
                    INSERT INTO job_applications (
                        user_id,
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        status,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education
                    )
                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        'new',
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )
                    `
                );

            const result =
                insert.run(

                    userId,

                    job.title,

                    fullName,

                    email,

                    phone,

                    path.basename(
                        savedResumePath
                    ),

                    coverLetter,

                    dateOfBirth,

                    country,

                    city,

                    experience,

                    education

                );

            const applicationId =
                Number(
                    result.lastInsertRowid
                );

            // -------------------------------------------------
            // OWNER EMAIL
            // -------------------------------------------------

            const ownerEmailBody = `

New Job Application

Application ID: #${applicationId}

Job Position:
${job.title}

Applicant Name:
${fullName}

Email:
${email}

Phone:
${phone}

Date of Birth:
${dateOfBirth || "Not provided"}

Country:
${country}

City:
${city}

Work Experience:
${experience || "Not provided"}

Education:
${education || "Not provided"}

Additional Message:
${coverLetter || "No additional message"}

Application Status:
Submitted

Submitted:
${new Date().toLocaleString("en-US")}

`;

            const ownerEmailSent =
                await sendEmail({

                    to:
                        OWNER_EMAIL,

                    replyTo:
                        email,

                    subject:
                        `New Job Application #${applicationId} - ${job.title}`,

                    text:
                        ownerEmailBody,

                    attachments: [

                        {

                            filename:
                                cleanHeader(
                                    req.file.originalname
                                ),

                            path:
                                savedResumePath

                        }

                    ]

                });

            // -------------------------------------------------
            // APPLICANT CONFIRMATION EMAIL
            // -------------------------------------------------

            await sendEmail({

                to:
                    email,

                subject:
                    `Job Application Received #${applicationId} - U.S TRAVEL & TOURS`,

                text: `

Hello ${fullName},

Your job application has been successfully submitted.

Application ID: #${applicationId}

Job Position:
${job.title}

Current Status:
Submitted

Our team will review your application.

You can check your application status from the "My Job Applications" section of your account.

U.S TRAVEL & TOURS

`

            });

            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.status(201).json({

                success: true,

                message:
                    "Job application submitted successfully.",

                application: {

                    id:
                        applicationId,

                    jobSlug:
                        jobSlug,

                    jobTitle:
                        job.title,

                    status:
                        "new",

                    statusLabel:
                        "Submitted",

                    emailSent:
                        ownerEmailSent

                }

            });

        } catch (error) {

            console.error(
                "Job application submission error:",
                error
            );

            if (
                savedResumePath &&
                fs.existsSync(
                    savedResumePath
                )
            ) {

                try {

                    fs.unlinkSync(
                        savedResumePath
                    );

                } catch {}

            }

            if (
                error instanceof
                multer.MulterError
            ) {

                if (
                    error.code ===
                    "LIMIT_FILE_SIZE"
                ) {

                    return res.status(400).json({

                        success: false,

                        message:
                            "Resume file must be 5 MB or smaller."

                    });

                }

            }

            return res.status(500).json({

                success: false,

                message:
                    error?.message ||
                    "Unable to submit job application."

            });

        }

    }
);

// =========================================================
// MY JOB APPLICATIONS
//
// GET /api/job-applications/my
// GET /api/jobs/my
// =========================================================

router.get(
    "/my",
    requireAuth,
    function (
        req,
        res
    ) {

        try {

            if (
                req.user?.role !==
                "customer"
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Customer access required."

                });

            }

            const userId =
                getUserId(req);

            const applications =
                db.prepare(
                    `
                    SELECT
                        id,
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education,
                        status,
                        created_at,
                        updated_at
                    FROM job_applications
                    WHERE user_id = ?
                    ORDER BY id DESC
                    `
                ).all(userId);

            const formattedApplications =
                applications.map(
                    application => ({

                        ...application,

                        statusLabel:
                            getJobStatusLabel(
                                application.status
                            )

                    })
                );

            return res.json({

                success: true,

                applications:
                    formattedApplications

            });

        } catch (error) {

            console.error(
                "My job applications error:",
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

// =========================================================
// ADMIN — ALL JOB APPLICATIONS
//
// GET /api/jobs/applications
// =========================================================

router.get(
    "/applications",
    requireAdmin,
    function (
        req,
        res
    ) {

        try {

            const applications =
                db.prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education,
                        status,
                        created_at,
                        updated_at
                    FROM job_applications
                    ORDER BY id DESC
                    `
                ).all();

            const formattedApplications =
                applications.map(
                    application => ({

                        ...application,

                        statusLabel:
                            getJobStatusLabel(
                                application.status
                            )

                    })
                );

            return res.json({

                success: true,

                applications:
                    formattedApplications

            });

        } catch (error) {

            console.error(
                "Admin job applications error:",
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

// =========================================================
// GET SINGLE JOB APPLICATION
//
// GET /api/jobs/applications/:id
// =========================================================

router.get(
    "/applications/:id",
    requireAuth,
    function (
        req,
        res
    ) {

        try {

            const applicationId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    applicationId
                ) ||
                applicationId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }

            const application =
                db.prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education,
                        status,
                        created_at,
                        updated_at
                    FROM job_applications
                    WHERE id = ?
                    LIMIT 1
                    `
                ).get(applicationId);

            if (!application) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }

            const isAdmin =
                req.user?.role ===
                "admin";

            const isOwner =
                Number(
                    application.user_id
                ) ===
                Number(
                    req.user?.id
                );

            if (
                !isAdmin &&
                !isOwner
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to view this application."

                });

            }

            return res.json({

                success: true,

                application: {

                    ...application,

                    statusLabel:
                        getJobStatusLabel(
                            application.status
                        )

                }

            });

        } catch (error) {

            console.error(
                "Single job application error:",
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

// =========================================================
// SECURE RESUME
//
// GET /api/jobs/applications/:id/resume
//
// Admin can access any resume.
// Customer can access only their own resume.
// =========================================================

router.get(
    "/applications/:id/resume",
    requireAuth,
    function (
        req,
        res
    ) {

        try {

            const applicationId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    applicationId
                ) ||
                applicationId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }

            const application =
                db.prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        name,
                        resume_file
                    FROM job_applications
                    WHERE id = ?
                    LIMIT 1
                    `
                ).get(applicationId);

            if (!application) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }

            const isAdmin =
                req.user?.role ===
                "admin";

            const isOwner =
                Number(
                    application.user_id
                ) ===
                Number(
                    req.user?.id
                );

            if (
                !isAdmin &&
                !isOwner
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to access this resume."

                });

            }

            if (!application.resume_file) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Resume not available."

                });

            }

            const resumePath =
                safeResumePath(
                    application.resume_file
                );

            if (!resumePath) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid resume path."

                });

            }

            if (
                !fs.existsSync(
                    resumePath
                )
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Resume file not found."

                });

            }

            return res.download(

                resumePath,

                path.basename(
                    application.resume_file
                ),

                function (
                    downloadError
                ) {

                    if (
                        downloadError &&
                        !res.headersSent
                    ) {

                        console.error(
                            "Resume download callback error:",
                            downloadError
                        );

                        return res.status(500).json({

                            success: false,

                            message:
                                "Unable to download resume."

                        });

                    }

                }

            );

        } catch (error) {

            console.error(
                "Resume download error:",
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

// =========================================================
// ADMIN — UPDATE STATUS
//
// PATCH /api/jobs/applications/:id/status
// =========================================================

router.patch(
    "/applications/:id/status",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const applicationId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    applicationId
                ) ||
                applicationId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }

            const newStatus =
                cleanText(
                    req.body.status,
                    50
                ).toLowerCase();

            const allowedStatuses = [

                "new",
                "reviewing",
                "shortlisted",
                "hired",
                "rejected"

            ];

            if (
                !allowedStatuses.includes(
                    newStatus
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job application status."

                });

            }

            const existing =
                db.prepare(
                    `
                    SELECT
                        id,
                        user_id,
                        name,
                        email,
                        job_title,
                        status
                    FROM job_applications
                    WHERE id = ?
                    LIMIT 1
                    `
                ).get(applicationId);

            if (!existing) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }

            const oldStatus =
                existing.status;

            // -------------------------------------------------
            // UPDATE DATABASE
            // -------------------------------------------------

            db.prepare(
                `
                UPDATE job_applications
                SET
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `
            ).run(

                newStatus,

                applicationId

            );

            const statusLabel =
                getJobStatusLabel(
                    newStatus
                );

            // -------------------------------------------------
            // STATUS EMAIL TO APPLICANT
            // -------------------------------------------------

            if (
                existing.email &&
                newStatus !== oldStatus
            ) {

                await sendEmail({

                    to:
                        existing.email,

                    subject:
                        `Job Application Update #${applicationId} - ${statusLabel}`,

                    text: `

Hello ${existing.name},

There is an update to your job application.

Application ID:
#${applicationId}

Job Position:
${existing.job_title}

Previous Status:
${getJobStatusLabel(oldStatus)}

Current Status:
${statusLabel}

Please log in to your U.S TRAVEL & TOURS account to view your latest application status.

U.S TRAVEL & TOURS

`

                });

            }

            return res.json({

                success: true,

                message:
                    `Job application status updated to ${statusLabel}.`,

                status:
                    newStatus,

                statusLabel:
                    statusLabel

            });

        } catch (error) {

            console.error(
                "Job application status error:",
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

// =========================================================
// ADMIN — DELETE APPLICATION
//
// DELETE /api/jobs/applications/:id
// =========================================================

router.delete(
    "/applications/:id",
    requireAdmin,
    function (
        req,
        res
    ) {

        try {

            const applicationId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    applicationId
                ) ||
                applicationId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }

            const application =
                db.prepare(
                    `
                    SELECT
                        resume_file
                    FROM job_applications
                    WHERE id = ?
                    LIMIT 1
                    `
                ).get(applicationId);

            if (!application) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."

                });

            }

            db.prepare(
                `
                DELETE FROM job_applications
                WHERE id = ?
                `
            ).run(applicationId);

            if (
                application.resume_file
            ) {

                const resumePath =
                    safeResumePath(
                        application.resume_file
                    );

                if (
                    resumePath &&
                    fs.existsSync(
                        resumePath
                    )
                ) {

                    try {

                        fs.unlinkSync(
                            resumePath
                        );

                    } catch (
                        deleteError
                    ) {

                        console.error(
                            "Resume delete error:",
                            deleteError
                        );

                    }

                }

            }

            return res.json({

                success: true,

                message:
                    "Job application deleted successfully."

            });

        } catch (error) {

            console.error(
                "Delete job application error:",
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

// =========================================================
// MULTER ERROR HANDLER
// =========================================================

router.use(
    function (
        error,
        req,
        res,
        next
    ) {

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Resume file must be 5 MB or smaller."

                });

            }

        }

        if (error) {

            return res.status(400).json({

                success: false,

                message:
                    error.message ||
                    "Unable to process uploaded resume."

            });

        }

        next();

    }
);

module.exports = router;