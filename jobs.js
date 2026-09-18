/* =========================================================
   U.S TRAVEL & TOURS
   JOB APPLICATION MODULE
   MongoDB Version
========================================================= */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");

const {
    getDatabase,
    getNextSequence
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


/* =========================================================
   JOB LIST
========================================================= */

const JOBS = [

    {
        slug:
            "restaurant-food-service-worker",

        title:
            "Restaurant / Food Service Worker"
    },

    {
        slug:
            "construction-worker",

        title:
            "Construction Worker"
    },

    {
        slug:
            "cleaner",

        title:
            "Cleaner"
    },

    {
        slug:
            "factory-warehouse-worker",

        title:
            "Factory / Warehouse Worker"
    },

    {
        slug:
            "driver-delivery-worker",

        title:
            "Driver / Delivery Worker"
    },

    {
        slug:
            "security-guard",

        title:
            "Security Guard"
    },

    {
        slug:
            "hotel-worker",

        title:
            "Hotel Worker"
    },

    {
        slug:
            "caregiver",

        title:
            "Caregiver"
    },

    {
        slug:
            "retail-worker",

        title:
            "Retail Worker"
    }

];


/* =========================================================
   STATUS
========================================================= */

const STATUS_LABELS = {

    new:
        "Submitted",

    reviewing:
        "Under Review",

    shortlisted:
        "Shortlisted",

    hired:
        "Accepted",

    rejected:
        "Rejected"

};


const ALLOWED_STATUSES = [

    "new",

    "reviewing",

    "shortlisted",

    "hired",

    "rejected"

];


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

const storage =
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


                const uniqueName =
                    "resume-" +
                    Date.now() +
                    "-" +
                    Math.round(
                        Math.random() *
                        1000000
                    ) +
                    extension;


                cb(
                    null,
                    uniqueName
                );

            }

    });


/* =========================================================
   RESUME FILE FILTER
========================================================= */

const allowedResumeExtensions = [

    ".pdf",

    ".doc",

    ".docx"

];


const upload =
    multer({

        storage:
            storage,

        limits: {

            fileSize:
                5 * 1024 * 1024

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


                if (
                    !allowedResumeExtensions
                        .includes(
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
   EMAIL CONFIGURATION
========================================================= */

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";


const SMTP_PORT =
    Number(
        process.env.SMTP_PORT ||
        587
    );


const SMTP_USER =
    process.env.SMTP_USER ||
    "";


const SMTP_PASS =
    process.env.SMTP_PASS ||
    "";


const OWNER_EMAIL =
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";


const MAIL_FROM =
    process.env.MAIL_FROM ||
    SMTP_USER ||
    OWNER_EMAIL;


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
                SMTP_PORT === 465,

            auth: {

                user:
                    SMTP_USER,

                pass:
                    SMTP_PASS

            }

        });

}


/* =========================================================
   HELPERS
========================================================= */

function cleanString(
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
        .slice(
            0,
            maxLength
        );

}


function cleanHeader(
    value,
    maxLength = 200
) {

    return cleanString(
        value,
        maxLength
    )
        .replace(
            /[\r\n]/g,
            " "
        );

}


function cleanEmail(
    value
) {

    return cleanString(
        value,
        320
    ).toLowerCase();

}


function isValidEmail(
    email
) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);

}


function getJobBySlug(
    slug
) {

    const normalized =
        cleanString(
            slug,
            200
        ).toLowerCase();


    return JOBS.find(
        function (
            job
        ) {

            return (
                job.slug ===
                normalized
            );

        }
    );

}


function formatJobApplication(
    application
) {

    return {

        id:
            application.id,

        jobTitle:
            application.job_title,

        name:
            application.name,

        email:
            application.email,

        phone:
            application.phone,

        dateOfBirth:
            application.date_of_birth ||
            "",

        country:
            application.country ||
            "",

        city:
            application.city ||
            "",

        experience:
            application.experience ||
            "",

        education:
            application.education ||
            "",

        resumeFile:
            application.resume_file ||
            null,

        resumeOriginalName:
            application.resume_original_name ||
            null,

        coverLetter:
            application.cover_letter ||
            "",

        status:
            application.status,

        statusLabel:
            STATUS_LABELS[
                application.status
            ] ||
            application.status,

        userId:
            application.user_id,

        createdAt:
            application.created_at,

        updatedAt:
            application.updated_at

    };

}


/* =========================================================
   GET AVAILABLE JOBS
========================================================= */

router.get(
    "/",
    function (
        req,
        res
    ) {

        return res.json({

            success:
                true,

            jobs:
                JOBS

        });

    }
);


/* =========================================================
   CUSTOMER - APPLY FOR JOB
========================================================= */

router.post(
    "/",
    requireAuth,
    upload.single("resume"),
    async function (
        req,
        res
    ) {

        let uploadedResumePath =
            null;


        try {

            if (
                req.file &&
                req.file.path
            ) {

                uploadedResumePath =
                    req.file.path;

            }


            /* -------------------------------------------------
               CUSTOMER ONLY
            ------------------------------------------------- */

            if (
                req.user.role ===
                "admin"
            ) {

                if (
                    uploadedResumePath &&
                    fs.existsSync(
                        uploadedResumePath
                    )
                ) {

                    fs.unlinkSync(
                        uploadedResumePath
                    );

                }


                return res.status(403).json({

                    success:
                        false,

                    message:
                        "Admin accounts cannot submit job applications."

                });

            }


            /* -------------------------------------------------
               INPUT
            ------------------------------------------------- */

            const jobSlug =
                cleanString(
                    req.body?.jobSlug ??
                    req.body?.job_slug,
                    200
                );


            const job =
                getJobBySlug(
                    jobSlug
                );


            if (!job) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please select a valid job."

                });

            }


            const name =
                cleanHeader(
                    req.body?.name,
                    150
                );


            const email =
                cleanEmail(
                    req.body?.email
                );


            const phone =
                cleanHeader(
                    req.body?.phone,
                    50
                );


            const dateOfBirth =
                cleanString(
                    req.body?.dateOfBirth ??
                    req.body?.date_of_birth,
                    50
                );


            const country =
                cleanHeader(
                    req.body?.country,
                    100
                );


            const city =
                cleanHeader(
                    req.body?.city,
                    100
                );


            const experience =
                cleanString(
                    req.body?.experience,
                    2000
                );


            const education =
                cleanString(
                    req.body?.education,
                    2000
                );


            const coverLetter =
                cleanString(
                    req.body?.coverLetter ??
                    req.body?.cover_letter,
                    5000
                );


            /* -------------------------------------------------
               VALIDATION
            ------------------------------------------------- */

            if (!name) {

                throw new Error(
                    "Full name is required."
                );

            }


            if (
                !email ||
                !isValidEmail(
                    email
                )
            ) {

                throw new Error(
                    "Please enter a valid email address."
                );

            }


            if (!phone) {

                throw new Error(
                    "Phone number is required."
                );

            }


            if (!dateOfBirth) {

                throw new Error(
                    "Date of birth is required."
                );

            }


            if (!country) {

                throw new Error(
                    "Country is required."
                );

            }


            if (!city) {

                throw new Error(
                    "City is required."
                );

            }


            if (!experience) {

                throw new Error(
                    "Experience information is required."
                );

            }


            if (!education) {

                throw new Error(
                    "Education information is required."
                );

            }


            if (!req.file) {

                throw new Error(
                    "Resume is required."
                );

            }


            /* -------------------------------------------------
               DATABASE
            ------------------------------------------------- */

            const db =
                getDatabase();


            const users =
                db.collection(
                    "users"
                );


            const applications =
                db.collection(
                    "job_applications"
                );


            const userId =
                Number(
                    req.user.id
                );


            const user =
                await users.findOne({

                    id:
                        userId

                });


            if (!user) {

                throw new Error(
                    "User account not found."
                );

            }


            /* -------------------------------------------------
               APPLICATION ID
            ------------------------------------------------- */

            const applicationId =
                await getNextSequence(
                    "job_applications"
                );


            const now =
                new Date();


            const applicationDocument = {

                id:
                    applicationId,

                user_id:
                    userId,

                job_title:
                    job.title,

                job_slug:
                    job.slug,

                name:
                    name,

                email:
                    email,

                phone:
                    phone,

                date_of_birth:
                    dateOfBirth,

                country:
                    country,

                city:
                    city,

                experience:
                    experience,

                education:
                    education,

                resume_file:
                    req.file.filename,

                resume_original_name:
                    cleanString(
                        req.file.originalname,
                        255
                    ),

                resume_mime_type:
                    cleanString(
                        req.file.mimetype,
                        100
                    ),

                resume_size:
                    Number(
                        req.file.size
                    ),

                cover_letter:
                    coverLetter,

                status:
                    "new",

                created_at:
                    now,

                updated_at:
                    now

            };


            /* -------------------------------------------------
               SAVE APPLICATION
            ------------------------------------------------- */

            await applications.insertOne(
                applicationDocument
            );


            /* -------------------------------------------------
               EMAIL ADMIN
            ------------------------------------------------- */

            if (
                transporter
            ) {

                try {

                    await transporter.sendMail({

                        from:
                            MAIL_FROM,

                        to:
                            OWNER_EMAIL,

                        replyTo:
                            email,

                        subject:
                            "New Job Application - " +
                            job.title,

                        text:
                            `
New job application received.

Application ID:
${applicationId}

Job:
${job.title}

Name:
${name}

Email:
${email}

Phone:
${phone}

Date of Birth:
${dateOfBirth}

Country:
${country}

City:
${city}

Experience:
${experience}

Education:
${education}

Cover Letter:
${coverLetter}
                            `.trim()

                    });

                } catch (
                    emailError
                ) {

                    console.error(
                        "JOB ADMIN EMAIL ERROR:",
                        emailError
                    );

                }

            }


            /* -------------------------------------------------
               EMAIL APPLICANT
            ------------------------------------------------- */

            if (
                transporter &&
                email
            ) {

                try {

                    await transporter.sendMail({

                        from:
                            MAIL_FROM,

                        to:
                            email,

                        subject:
                            "Job Application Submitted - U.S TRAVEL & TOURS",

                        text:
                            `
Hello ${name},

Your job application has been successfully submitted.

Application ID:
${applicationId}

Position:
${job.title}

Status:
Submitted

Our team will review your application and update the status when there is progress.

Regards,
U.S TRAVEL & TOURS
                            `.trim()

                    });

                } catch (
                    emailError
                ) {

                    console.error(
                        "JOB APPLICANT EMAIL ERROR:",
                        emailError
                    );

                }

            }


            /* -------------------------------------------------
               SUCCESS
            ------------------------------------------------- */

            return res.status(201).json({

                success:
                    true,

                message:
                    "Job application submitted successfully.",

                application:
                    formatJobApplication(
                        applicationDocument
                    )

            });

        } catch (error) {

            console.error(
                "JOB APPLICATION ERROR:",
                error
            );


            if (
                uploadedResumePath &&
                fs.existsSync(
                    uploadedResumePath
                )
            ) {

                try {

                    fs.unlinkSync(
                        uploadedResumePath
                    );

                } catch (
                    deleteError
                ) {

                    console.error(
                        "RESUME CLEANUP ERROR:",
                        deleteError
                    );

                }

            }


            const statusCode =
                error.message &&
                (
                    error.message.includes(
                        "required"
                    ) ||
                    error.message.includes(
                        "valid"
                    )
                )
                    ? 400
                    : 500;


            return res.status(
                statusCode
            ).json({

                success:
                    false,

                message:
                    error.message ||
                    "Unable to submit job application."

            });

        }

    }
);


/* =========================================================
   CUSTOMER - MY JOB APPLICATIONS
========================================================= */

router.get(
    "/my",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const db =
                getDatabase();

            const applications =
                db.collection(
                    "job_applications"
                );


            const userId =
                Number(
                    req.user.id
                );


            const myApplications =
                await applications
                    .find({

                        user_id:
                            userId

                    })
                    .sort({

                        id:
                            -1

                    })
                    .toArray();


            return res.json({

                success:
                    true,

                applications:
                    myApplications.map(
                        formatJobApplication
                    )

            });

        } catch (error) {

            console.error(
                "MY JOB APPLICATIONS ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to load your job applications."

            });

        }

    }
);


/* =========================================================
   ADMIN - ALL JOB APPLICATIONS
========================================================= */

router.get(
    "/applications",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const db =
                getDatabase();

            const applications =
                db.collection(
                    "job_applications"
                );


            const allApplications =
                await applications
                    .find({})
                    .sort({

                        id:
                            -1

                    })
                    .toArray();


            return res.json({

                success:
                    true,

                applications:
                    allApplications.map(
                        formatJobApplication
                    )

            });

        } catch (error) {

            console.error(
                "ADMIN JOB APPLICATIONS ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to load job applications."

            });

        }

    }
);


/* =========================================================
   GET SINGLE JOB APPLICATION
========================================================= */

router.get(
    "/applications/:id",
    requireAuth,
    async function (
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
                        "Invalid application ID."

                });

            }


            const db =
                getDatabase();

            const applications =
                db.collection(
                    "job_applications"
                );


            const application =
                await applications.findOne({

                    id:
                        id

                });


            if (
                !application
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Job application not found."

                });

            }


            const isAdmin =
                req.user.role ===
                "admin";


            const isOwner =
                Number(
                    application.user_id
                ) ===
                Number(
                    req.user.id
                );


            if (
                !isAdmin &&
                !isOwner
            ) {

                return res.status(403).json({

                    success:
                        false,

                    message:
                        "You are not authorized to view this application."

                });

            }


            return res.json({

                success:
                    true,

                application:
                    formatJobApplication(
                        application
                    )

            });

        } catch (error) {

            console.error(
                "GET JOB APPLICATION ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

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
    async function (
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

                return res.status(400).send(
                    "Invalid application ID."
                );

            }


            const db =
                getDatabase();

            const applications =
                db.collection(
                    "job_applications"
                );


            const application =
                await applications.findOne({

                    id:
                        id

                });


            if (
                !application
            ) {

                return res.status(404).send(
                    "Job application not found."
                );

            }


            const isAdmin =
                req.user.role ===
                "admin";


            const isOwner =
                Number(
                    application.user_id
                ) ===
                Number(
                    req.user.id
                );


            if (
                !isAdmin &&
                !isOwner
            ) {

                return res.status(403).send(
                    "You are not authorized to access this resume."
                );

            }


            const filename =
                path.basename(
                    String(
                        application.resume_file ||
                        ""
                    )
                );


            if (!filename) {

                return res.status(404).send(
                    "Resume not found."
                );

            }


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

                return res.status(404).send(
                    "Resume file not found."
                );

            }


            return res.download(

                filePath,

                application.resume_original_name ||
                filename

            );

        } catch (error) {

            console.error(
                "RESUME DOWNLOAD ERROR:",
                error
            );

            return res.status(500).send(
                "Unable to download resume."
            );

        }

    }
);


/* =========================================================
   ADMIN - UPDATE JOB APPLICATION STATUS
========================================================= */

router.patch(
    "/applications/:id/status",
    requireAdmin,
    async function (
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
                        "Invalid application ID."

                });

            }


            const status =
                cleanString(
                    req.body?.status,
                    50
                ).toLowerCase();


            if (
                !ALLOWED_STATUSES
                    .includes(
                        status
                    )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid application status."

                });

            }


            const db =
                getDatabase();

            const applications =
                db.collection(
                    "job_applications"
                );


            const existing =
                await applications.findOne({

                    id:
                        id

                });


            if (
                !existing
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Job application not found."

                });

            }


            const now =
                new Date();


            await applications.updateOne(

                {
                    id:
                        id
                },

                {
                    $set: {

                        status:
                            status,

                        updated_at:
                            now

                    }

                }

            );


            const updated =
                await applications.findOne({

                    id:
                        id

                });


            /* -------------------------------------------------
               EMAIL APPLICANT
            ------------------------------------------------- */

            if (
                transporter &&
                updated.email
            ) {

                try {

                    await transporter.sendMail({

                        from:
                            MAIL_FROM,

                        to:
                            updated.email,

                        subject:
                            "Job Application Status Update - U.S TRAVEL & TOURS",

                        text:
                            `
Hello ${updated.name || "Applicant"},

Your job application status has been updated.

Application ID:
${updated.id}

Position:
${updated.job_title}

New Status:
${STATUS_LABELS[status] || status}

Regards,
U.S TRAVEL & TOURS
                            `.trim()

                    });

                } catch (
                    emailError
                ) {

                    console.error(
                        "JOB STATUS EMAIL ERROR:",
                        emailError
                    );

                }

            }


            return res.json({

                success:
                    true,

                message:
                    "Job application status updated successfully.",

                application:
                    formatJobApplication(
                        updated
                    )

            });

        } catch (error) {

            console.error(
                "UPDATE JOB STATUS ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to update job application status."

            });

        }

    }
);


/* =========================================================
   ADMIN - DELETE JOB APPLICATION
========================================================= */

router.delete(
    "/applications/:id",
    requireAdmin,
    async function (
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
                        "Invalid application ID."

                });

            }


            const db =
                getDatabase();

            const applications =
                db.collection(
                    "job_applications"
                );


            const application =
                await applications.findOne({

                    id:
                        id

                });


            if (
                !application
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Job application not found."

                });

            }


            await applications.deleteOne({

                id:
                    id

            });


            /* -------------------------------------------------
               DELETE LOCAL RESUME
            ------------------------------------------------- */

            if (
                application.resume_file
            ) {

                const filename =
                    path.basename(
                        String(
                            application.resume_file
                        )
                    );


                const resumePath =
                    path.join(
                        resumeDirectory,
                        filename
                    );


                if (
                    fs.existsSync(
                        resumePath
                    )
                ) {

                    try {

                        fs.unlinkSync(
                            resumePath
                        );

                    } catch (
                        fileError
                    ) {

                        console.error(
                            "RESUME DELETE ERROR:",
                            fileError
                        );

                    }

                }

            }


            return res.json({

                success:
                    true,

                message:
                    "Job application deleted successfully."

            });

        } catch (error) {

            console.error(
                "DELETE JOB APPLICATION ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

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

                    success:
                        false,

                    message:
                        "Resume must be 5MB or smaller."

                });

            }


            return res.status(400).json({

                success:
                    false,

                message:
                    error.message ||
                    "Resume upload failed."

            });

        }


        if (
            error &&
            error.message &&
            error.message.includes(
                "Only PDF, DOC and DOCX"
            )
        ) {

            return res.status(400).json({

                success:
                    false,

                message:
                    error.message

            });

        }


        console.error(
            "JOB ROUTER ERROR:",
            error
        );


        return res.status(400).json({

            success:
                false,

            message:
                error.message ||
                "Unable to process job application."

        });

    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
    router;
