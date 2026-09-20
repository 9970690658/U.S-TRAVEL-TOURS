/* =========================================================
   U.S TRAVEL & TOURS
   JOB APPLICATION ROUTES
   PostgreSQL / Supabase Version

   CUSTOMER:
   - Submit job application
   - View own job applications

   ADMIN:
   - View all job applications
   - View application details
   - Download/open resume
   - Update status
   - Delete application

   IMPORTANT:
   - SQLite removed
   - PostgreSQL / Supabase database
   - Existing API endpoints preserved
========================================================= */

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
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


/* =========================================================
   SMTP
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
   JOB LIST
========================================================= */

const JOBS = {

    "restaurant-food-service-worker":
        "Restaurant / Food-Service Worker",

    "construction-worker":
        "Construction Worker",

    "cleaner":
        "Cleaner",

    "factory-warehouse-worker":
        "Factory / Warehouse Worker",

    "driver-delivery-worker":
        "Driver / Delivery Worker",

    "security-guard":
        "Security Guard",

    "hotel-worker":
        "Hotel Worker",

    "caregiver":
        "Caregiver",

    "retail-worker":
        "Retail Worker"
};


/* =========================================================
   STATUS LIST
========================================================= */

const JOB_STATUSES = [
    "new",
    "reviewing",
    "shortlisted",
    "hired",
    "rejected"
];


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
   RESUME DIRECTORY
========================================================= */

const resumeDirectory =
    path.join(
        __dirname,
        "data",
        "job-resumes"
    );


if (
    !fs.existsSync(
        resumeDirectory
    )
) {

    fs.mkdirSync(
        resumeDirectory,
        {
            recursive: true
        }
    );
}


/* =========================================================
   MULTER STORAGE
========================================================= */

const resumeStorage =
    multer.diskStorage({

        destination:
            function (
                req,
                file,
                cb
            ) {

                cb(
                    null,
                    resumeDirectory
                );
            },

        filename:
            function (
                req,
                file,
                cb
            ) {

                const extension =
                    path.extname(
                        file.originalname
                    ).toLowerCase();

                const filename =
                    "resume-" +
                    Date.now() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 10) +
                    extension;

                cb(
                    null,
                    filename
                );
            }
    });


/* =========================================================
   RESUME FILE FILTER
========================================================= */

function resumeFileFilter(
    req,
    file,
    cb
) {

    const allowedMimeTypes = [

        "application/pdf",

        "application/msword",

        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        "image/jpeg",

        "image/png"
    ];


    if (
        !allowedMimeTypes.includes(
            file.mimetype
        )
    ) {

        return cb(
            new Error(
                "Only PDF, DOC, DOCX, JPG, JPEG and PNG resume files are allowed."
            )
        );
    }


    cb(
        null,
        true
    );
}


const uploadResume =
    multer({

        storage:
            resumeStorage,

        fileFilter:
            resumeFileFilter,

        limits: {

            fileSize:
                5 * 1024 * 1024
        }
    });


/* =========================================================
   POST /api/jobs/applications
   CUSTOMER - SUBMIT JOB APPLICATION
========================================================= */

router.post(
    "/applications",
    requireAuth,
    uploadResume.single("resume"),
    async (
        req,
        res
    ) => {

        let uploadedFile =
            req.file || null;

        try {

            /* -------------------------------------------------
               CUSTOMER ONLY
            ------------------------------------------------- */

            if (
                req.user.role !==
                "customer"
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Only customer accounts can submit job applications."
                });
            }


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


            /* -------------------------------------------------
               FORM DATA
            ------------------------------------------------- */

            const jobTitle =
                cleanString(
                    req.body?.jobPosition ||
                    req.body?.jobTitle ||
                    req.body?.job
                );

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

            const dateOfBirth =
                cleanString(
                    req.body?.dateOfBirth ||
                    req.body?.date_of_birth
                );

            const country =
                cleanString(
                    req.body?.country
                );

            const city =
                cleanString(
                    req.body?.city
                );

            const experience =
                cleanString(
                    req.body?.experience
                );

            const education =
                cleanString(
                    req.body?.education
                );

            const coverLetter =
                cleanString(
                    req.body?.coverLetter ||
                    req.body?.cover_letter
                );


            /* -------------------------------------------------
               VALIDATE JOB
            ------------------------------------------------- */

            if (
                !jobTitle
            ) {

                if (uploadedFile) {
                    removeFile(
                        uploadedFile.path
                    );
                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select a job position."
                });
            }


            /* -------------------------------------------------
               SUPPORT BOTH JOB SLUG AND DISPLAY NAME
            ------------------------------------------------- */

            const jobKey =
                Object.prototype.hasOwnProperty.call(
                    JOBS,
                    jobTitle
                )
                    ? jobTitle
                    : Object.keys(JOBS)
                        .find(
                            key =>
                                JOBS[key]
                                    .toLowerCase() ===
                                jobTitle
                                    .toLowerCase()
                        );


            if (!jobKey) {

                if (uploadedFile) {
                    removeFile(
                        uploadedFile.path
                    );
                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job position selected."
                });
            }


            const normalizedJobTitle =
                JOBS[jobKey];


            /* -------------------------------------------------
               REQUIRED FIELDS
            ------------------------------------------------- */

            const missingFields = [];


            if (!name) {
                missingFields.push(
                    "name"
                );
            }

            if (!email) {
                missingFields.push(
                    "email"
                );
            }

            if (!phone) {
                missingFields.push(
                    "phone"
                );
            }

            if (!country) {
                missingFields.push(
                    "country"
                );
            }

            if (!city) {
                missingFields.push(
                    "city"
                );
            }


            if (
                missingFields.length > 0
            ) {

                if (uploadedFile) {
                    removeFile(
                        uploadedFile.path
                    );
                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Please complete all required job application fields.",

                    missingFields
                });
            }


            /* -------------------------------------------------
               EMAIL VALIDATION
            ------------------------------------------------- */

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (
                !emailPattern.test(
                    email
                )
            ) {

                if (uploadedFile) {
                    removeFile(
                        uploadedFile.path
                    );
                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."
                });
            }


            /* -------------------------------------------------
               LENGTH VALIDATION
            ------------------------------------------------- */

            if (
                name.length > 200 ||
                email.length > 320 ||
                phone.length > 50 ||
                country.length > 150 ||
                city.length > 150
            ) {

                if (uploadedFile) {
                    removeFile(
                        uploadedFile.path
                    );
                }

                return res.status(400).json({

                    success: false,

                    message:
                        "One or more fields are too long."
                });
            }


            if (
                experience.length > 5000 ||
                education.length > 5000 ||
                coverLetter.length > 10000
            ) {

                if (uploadedFile) {
                    removeFile(
                        uploadedFile.path
                    );
                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Application information is too long."
                });
            }


            /* -------------------------------------------------
               RESUME
            ------------------------------------------------- */

            if (!uploadedFile) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please upload your resume."
                });
            }


            const resumeFile =
                path.join(
                    "data",
                    "job-resumes",
                    uploadedFile.filename
                );


            /* -------------------------------------------------
               DATABASE INSERT
            ------------------------------------------------- */

            const result =
                await pool.query(
                    `
                    INSERT INTO job_applications
                    (
                        user_id,
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        status,
                        created_at,
                        updated_at,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education
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
                        CURRENT_TIMESTAMP,
                        $8,
                        $9,
                        $10,
                        $11,
                        $12
                    )
                    RETURNING
                        id,
                        user_id,
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        status,
                        created_at,
                        updated_at,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education
                    `,
                    [
                        userId,
                        normalizedJobTitle,
                        name,
                        email,
                        phone,
                        resumeFile,
                        coverLetter,
                        dateOfBirth,
                        country,
                        city,
                        experience,
                        education
                    ]
                );


            const application =
                result.rows[0];


            /* -------------------------------------------------
               OWNER EMAIL
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
                            `New Job Application - ${normalizedJobTitle}`,

                        text:
                            `A new job application has been submitted.\n\n` +

                            `Application ID: ${application.id}\n` +

                            `Position: ${normalizedJobTitle}\n` +

                            `Name: ${name}\n` +

                            `Email: ${email}\n` +

                            `Phone: ${phone}\n` +

                            `Date of Birth: ${dateOfBirth || "N/A"}\n` +

                            `Country: ${country}\n` +

                            `City: ${city}\n` +

                            `Experience: ${experience || "N/A"}\n` +

                            `Education: ${education || "N/A"}\n\n` +

                            `Cover Letter:\n${coverLetter || "N/A"}`
                    });
                }

            } catch (mailError) {

                console.error(
                    "JOB OWNER EMAIL ERROR:",
                    mailError
                );
            }


            /* -------------------------------------------------
               APPLICANT EMAIL
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
                            email,

                        subject:
                            "Job Application Received - U.S TRAVEL & TOURS",

                        text:
                            `Hello ${name},\n\n` +

                            `Your job application has been received successfully.\n\n` +

                            `Application ID: ${application.id}\n` +

                            `Position: ${normalizedJobTitle}\n` +

                            `Status: New\n\n` +

                            `Our team will review your application and contact you regarding the next steps.\n\n` +

                            `Regards,\n` +

                            `U.S TRAVEL & TOURS`
                    });
                }

            } catch (mailError) {

                console.error(
                    "JOB APPLICANT EMAIL ERROR:",
                    mailError
                );
            }


            /* -------------------------------------------------
               SUCCESS
            ------------------------------------------------- */

            return res.status(201).json({

                success: true,

                message:
                    "Job application submitted successfully.",

                application: {

                    id:
                        Number(
                            application.id
                        ),

                    user_id:
                        Number(
                            application.user_id
                        ),

                    job_title:
                        application.job_title,

                    name:
                        application.name,

                    email:
                        application.email,

                    phone:
                        application.phone,

                    resume_file:
                        application.resume_file,

                    cover_letter:
                        application.cover_letter,

                    status:
                        application.status,

                    created_at:
                        application.created_at,

                    updated_at:
                        application.updated_at,

                    date_of_birth:
                        application.date_of_birth,

                    country:
                        application.country,

                    city:
                        application.city,

                    experience:
                        application.experience,

                    education:
                        application.education
                }
            });

        } catch (error) {

            /* -------------------------------------------------
               DELETE FILE IF DATABASE INSERT FAILED
            ------------------------------------------------- */

            if (uploadedFile) {

                removeFile(
                    uploadedFile.path
                );
            }


            console.error(
                "JOB APPLICATION SUBMISSION ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to submit job application."
            });
        }
    }
);


/* =========================================================
   GET /api/jobs/applications/my
   CUSTOMER - OWN APPLICATIONS
========================================================= */

router.get(
    "/applications/my",
    requireAuth,
    async (
        req,
        res
    ) => {

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
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        status,
                        created_at,
                        updated_at,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education
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
                    formatApplication
                );


            return res.json({

                success: true,

                applications
            });

        } catch (error) {

            console.error(
                "GET MY JOB APPLICATIONS ERROR:",
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
   GET /api/jobs/my
   FRONTEND COMPATIBILITY
========================================================= */

router.get(
    "/my",
    requireAuth,
    async (
        req,
        res
    ) => {

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
                        job_title,
                        name,
                        email,
                        phone,
                        resume_file,
                        cover_letter,
                        status,
                        created_at,
                        updated_at,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education
                    FROM job_applications
                    WHERE user_id = $1
                    ORDER BY
                        created_at DESC,
                        id DESC
                    `,
                    [userId]
                );


            return res.json({

                success: true,

                applications:
                    result.rows.map(
                        formatApplication
                    )
            });

        } catch (error) {

            console.error(
                "GET /MY JOB APPLICATIONS ERROR:",
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
   GET /api/jobs/applications
   ADMIN - ALL APPLICATIONS
========================================================= */

router.get(
    "/applications",
    requireAdmin,
    async (
        req,
        res
    ) => {

        try {

            const result =
                await pool.query(
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
                        status,
                        created_at,
                        updated_at,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education
                    FROM job_applications
                    ORDER BY
                        created_at DESC,
                        id DESC
                    `
                );


            return res.json({

                success: true,

                applications:
                    result.rows.map(
                        formatApplication
                    )
            });

        } catch (error) {

            console.error(
                "GET ALL JOB APPLICATIONS ERROR:",
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
   GET /api/jobs/applications/:id
   ADMIN - SINGLE APPLICATION
========================================================= */

router.get(
    "/applications/:id",
    requireAuth,
    async (
        req,
        res
    ) => {

        try {

            const applicationId =
                normalizeId(
                    req.params.id
                );


            if (!applicationId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job application ID."
                });
            }


            const result =
                await pool.query(
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
                        status,
                        created_at,
                        updated_at,
                        date_of_birth,
                        country,
                        city,
                        experience,
                        education
                    FROM job_applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [applicationId]
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


            /* -------------------------------------------------
               CUSTOMER CAN ONLY VIEW OWN APPLICATION
            ------------------------------------------------- */

            if (
                req.user.role !== "admin" &&
                Number(
                    application.user_id
                ) !==
                Number(
                    req.user.id
                )
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to view this application."
                });
            }


            return res.json({

                success: true,

                application:
                    formatApplication(
                        application
                    )
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
   PATCH /api/jobs/applications/:id/status
   ADMIN - UPDATE STATUS
========================================================= */

router.patch(
    "/applications/:id/status",
    requireAdmin,
    async (
        req,
        res
    ) => {

        try {

            const applicationId =
                normalizeId(
                    req.params.id
                );


            if (!applicationId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job application ID."
                });
            }


            const status =
                cleanString(
                    req.body?.status
                ).toLowerCase();


            if (
                !JOB_STATUSES.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job application status.",

                    allowedStatuses:
                        JOB_STATUSES
                });
            }


            const result =
                await pool.query(
                    `
                    UPDATE job_applications

                    SET
                        status = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $2

                    RETURNING
                        id,
                        user_id,
                        job_title,
                        status,
                        updated_at
                    `,
                    [
                        status,
                        applicationId
                    ]
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


            return res.json({

                success: true,

                message:
                    "Job application status updated successfully.",

                applicationId:
                    Number(
                        application.id
                    ),

                userId:
                    Number(
                        application.user_id
                    ),

                jobTitle:
                    application.job_title,

                status:
                    application.status,

                updatedAt:
                    application.updated_at
            });

        } catch (error) {

            console.error(
                "UPDATE JOB APPLICATION STATUS ERROR:",
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
   GET /api/jobs/applications/:id/resume
   ADMIN - OPEN RESUME
========================================================= */

router.get(
    "/applications/:id/resume",
    requireAdmin,
    async (
        req,
        res
    ) => {

        try {

            const applicationId =
                normalizeId(
                    req.params.id
                );


            if (!applicationId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job application ID."
                });
            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        resume_file,
                        name,
                        email
                    FROM job_applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [applicationId]
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


            if (
                !application.resume_file
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Resume file is not available."
                });
            }


            const filename =
                path.basename(
                    application.resume_file
                );


            const filePath =
                path.join(
                    resumeDirectory,
                    filename
                );


            if (
                !fs.existsSync(
                    filePath
                )
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Resume file is no longer available on the server."
                });
            }


            const extension =
                path.extname(
                    filename
                ).toLowerCase();


            const contentTypes = {

                ".pdf":
                    "application/pdf",

                ".doc":
                    "application/msword",

                ".docx":
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

                ".jpg":
                    "image/jpeg",

                ".jpeg":
                    "image/jpeg",

                ".png":
                    "image/png"
            };


            res.setHeader(
                "Content-Type",
                contentTypes[extension] ||
                    "application/octet-stream"
            );


            res.setHeader(
                "Content-Disposition",
                `inline; filename="${filename}"`
            );


            return res.sendFile(
                filePath
            );

        } catch (error) {

            console.error(
                "GET JOB RESUME ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to open resume."
            });
        }
    }
);


/* =========================================================
   DELETE /api/jobs/applications/:id
   ADMIN - DELETE APPLICATION
========================================================= */

router.delete(
    "/applications/:id",
    requireAdmin,
    async (
        req,
        res
    ) => {

        try {

            const applicationId =
                normalizeId(
                    req.params.id
                );


            if (!applicationId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid job application ID."
                });
            }


            /* -------------------------------------------------
               GET RESUME FIRST
            ------------------------------------------------- */

            const existing =
                await pool.query(
                    `
                    SELECT
                        id,
                        resume_file
                    FROM job_applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [applicationId]
                );


            if (
                existing.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Job application not found."
                });
            }


            const resumeFile =
                existing.rows[0]
                    .resume_file;


            /* -------------------------------------------------
               DELETE DATABASE RECORD
            ------------------------------------------------- */

            const result =
                await pool.query(
                    `
                    DELETE FROM job_applications
                    WHERE id = $1
                    RETURNING id
                    `,
                    [applicationId]
                );


            /* -------------------------------------------------
               DELETE LOCAL RESUME
            ------------------------------------------------- */

            if (resumeFile) {

                const filename =
                    path.basename(
                        resumeFile
                    );

                const filePath =
                    path.join(
                        resumeDirectory,
                        filename
                    );

                removeFile(
                    filePath
                );
            }


            return res.json({

                success: true,

                message:
                    "Job application deleted successfully.",

                applicationId:
                    Number(
                        result.rows[0].id
                    )
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
   FILE CLEANUP HELPER
========================================================= */

function removeFile(
    filePath
) {

    try {

        if (
            filePath &&
            fs.existsSync(
                filePath
            )
        ) {

            fs.unlinkSync(
                filePath
            );
        }

    } catch (error) {

        console.error(
            "FILE CLEANUP ERROR:",
            error
        );
    }
}


/* =========================================================
   FORMAT APPLICATION
========================================================= */

function formatApplication(
    row
) {

    return {

        id:
            Number(
                row.id
            ),

        user_id:
            row.user_id !== null
                ? Number(
                    row.user_id
                )
                : null,

        job_title:
            row.job_title,

        name:
            row.name,

        email:
            row.email,

        phone:
            row.phone,

        resume_file:
            row.resume_file,

        cover_letter:
            row.cover_letter,

        status:
            row.status,

        created_at:
            row.created_at,

        updated_at:
            row.updated_at,

        date_of_birth:
            row.date_of_birth,

        country:
            row.country,

        city:
            row.city,

        experience:
            row.experience,

        education:
            row.education
    };
}


/* =========================================================
   MULTER ERROR HANDLER
========================================================= */

router.use(
    (
        error,
        req,
        res,
        next
    ) => {

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
                        "Resume must be 5MB or smaller."
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
            error.message &&
            error.message.includes(
                "Only PDF"
            )
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
   FRONTEND COMPATIBILITY
========================================================= */

/*
   server.js mounts this same router at:

   /api/jobs
   /api/job-applications

   Therefore both existing API prefixes continue working.
*/


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
