const express = require("express");

const {
    pool,
    initializeDatabase
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


// =========================================================
// DATABASE READY
// =========================================================

const databaseReady =
    initializeDatabase();


// =========================================================
// HELPERS
// =========================================================

function cleanText(
    value,
    maxLength = 500
) {

    return String(value || "")
        .trim()
        .slice(0, maxLength);

}


function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);

}


function parseApplicationData(
    value
) {

    if (
        value &&
        typeof value === "object"
    ) {

        return value;

    }

    try {

        return JSON.parse(
            String(value || "{}")
        );

    } catch (error) {

        return {};

    }

}


// =========================================================
// CREATE APPLICATION
// POST /
// =========================================================

router.post(
    "/",
    requireAuth,
    async (req, res) => {

        try {

            await databaseReady;

            // -------------------------------------------------
            // ONLY CUSTOMERS CAN SUBMIT APPLICATIONS
            // -------------------------------------------------

            if (
                req.user.role !== "customer"
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Only customer accounts can submit applications."

                });

            }


            // -------------------------------------------------
            // REQUEST DATA
            // -------------------------------------------------

            const body =
                req.body || {};


            const passportNumber =
                cleanText(
                    body.passportNumber,
                    50
                );


            const surname =
                cleanText(
                    body.surname,
                    100
                );


            const firstMiddleName =
                cleanText(
                    body.firstMiddleName,
                    150
                );


            const dateOfBirth =
                cleanText(
                    body.dateOfBirth,
                    30
                );


            const nationality =
                cleanText(
                    body.nationality,
                    100
                );


            // -------------------------------------------------
            // BASIC VALIDATION
            // -------------------------------------------------

            if (!passportNumber) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Passport number is required."

                });

            }


            if (!surname) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Surname is required."

                });

            }


            if (!firstMiddleName) {

                return res.status(400).json({

                    success: false,

                    message:
                        "First and middle name is required."

                });

            }


            if (!dateOfBirth) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Date of birth is required."

                });

            }


            if (!nationality) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Nationality is required."

                });

            }


            // -------------------------------------------------
            // REQUEST SIZE SAFETY
            // -------------------------------------------------

            let applicationData;

            try {

                applicationData = {
                    ...body,

                    passportNumber,

                    surname,

                    firstMiddleName,

                    dateOfBirth,

                    nationality,

                    userId:
                        Number(req.user.id),

                    userEmail:
                        req.user.email
                };

                const serialized =
                    JSON.stringify(
                        applicationData
                    );


                if (
                    Buffer.byteLength(
                        serialized,
                        "utf8"
                    ) > 1024 * 1024
                ) {

                    return res.status(413).json({

                        success: false,

                        message:
                            "Application data is too large."

                    });

                }

            } catch (error) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application data."

                });

            }


            // -------------------------------------------------
            // SAVE APPLICATION
            // -------------------------------------------------

            const result =
                await pool.query(
                    `
                    INSERT INTO applications (
                        user_id,
                        application_data,
                        status,
                        created_at,
                        updated_at
                    )

                    VALUES (
                        $1,
                        $2,
                        'payment_pending',
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )

                    RETURNING
                        id,
                        status,
                        created_at,
                        updated_at
                    `,
                    [
                        Number(req.user.id),

                        JSON.stringify(
                            applicationData
                        )
                    ]
                );


            const savedApplication =
                result.rows[0];


            // -------------------------------------------------
            // APPLICATION ID
            // -------------------------------------------------

            const applicationId =
                Number(
                    savedApplication.id
                );


            console.log(
                `Application created: ${applicationId} by user ${req.user.id}`
            );


            return res.status(201).json({

                success: true,

                message:
                    "Application submitted successfully.",

                applicationId,

                status:
                    savedApplication.status,

                application: {

                    id:
                        applicationId,

                    status:
                        savedApplication.status,

                    createdAt:
                        savedApplication.created_at,

                    updatedAt:
                        savedApplication.updated_at

                }

            });

        } catch (error) {

            console.error(
                "Create application error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to submit application."

            });

        }

    }
);


// =========================================================
// GET SINGLE APPLICATION
// GET /:id
// =========================================================

router.get(
    "/:id",
    requireAuth,
    async (req, res) => {

        try {

            await databaseReady;


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
                        "Invalid Application ID."

                });

            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        application_data,
                        status,
                        created_at,
                        updated_at

                    FROM applications

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
                        "Application not found."

                });

            }


            const application =
                result.rows[0];


            // -------------------------------------------------
            // CUSTOMER OWNERSHIP
            // -------------------------------------------------

            if (
                req.user.role !== "admin" &&
                Number(application.user_id) !==
                    Number(req.user.id)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to view this application."

                });

            }


            const data =
                parseApplicationData(
                    application.application_data
                );


            return res.json({

                success: true,

                application: {

                    id:
                        Number(
                            application.id
                        ),

                    userId:
                        application.user_id
                            ? Number(
                                application.user_id
                            )
                            : null,

                    data,

                    status:
                        application.status,

                    createdAt:
                        application.created_at,

                    updatedAt:
                        application.updated_at

                }

            });

        } catch (error) {

            console.error(
                "Get application error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load application."

            });

        }

    }
);


// =========================================================
// GET ALL APPLICATIONS
// ADMIN ONLY
// GET /
// =========================================================

router.get(
    "/",
    requireAdmin,
    async (req, res) => {

        try {

            await databaseReady;


            const result =
                await pool.query(
                    `
                    SELECT
                        a.id,
                        a.user_id,
                        a.application_data,
                        a.status,
                        a.created_at,
                        a.updated_at,

                        u.name AS user_name,
                        u.email AS user_email,
                        u.phone AS user_phone

                    FROM applications a

                    LEFT JOIN users u
                        ON u.id = a.user_id

                    ORDER BY
                        a.created_at DESC,
                        a.id DESC
                    `
                );


            const applications =
                result.rows.map(
                    (application) => {

                        const data =
                            parseApplicationData(
                                application.application_data
                            );


                        return {

                            id:
                                Number(
                                    application.id
                                ),

                            userId:
                                application.user_id
                                    ? Number(
                                        application.user_id
                                    )
                                    : null,

                            user: {

                                id:
                                    application.user_id
                                        ? Number(
                                            application.user_id
                                        )
                                        : null,

                                name:
                                    application.user_name ||
                                    "",

                                email:
                                    application.user_email ||
                                    "",

                                phone:
                                    application.user_phone ||
                                    ""

                            },

                            data,

                            status:
                                application.status,

                            createdAt:
                                application.created_at,

                            updatedAt:
                                application.updated_at

                        };

                    }
                );


            return res.json({

                success: true,

                applications,

                count:
                    applications.length

            });

        } catch (error) {

            console.error(
                "Get all applications error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load applications."

            });

        }

    }
);


// =========================================================
// UPDATE APPLICATION STATUS
// ADMIN ONLY
// PATCH /:id/status
// =========================================================

router.patch(
    "/:id/status",
    requireAdmin,
    async (req, res) => {

        try {

            await databaseReady;


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
                        "Invalid Application ID."

                });

            }


            const status =
                String(
                    req.body.status || ""
                )
                    .trim()
                    .toLowerCase();


            const allowedStatuses = [

                "pending",

                "payment_pending",

                "payment_submitted",

                "under_review",

                "approved",

                "rejected",

                "completed"

            ];


            if (
                !allowedStatuses.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application status."

                });

            }


            const result =
                await pool.query(
                    `
                    UPDATE applications

                    SET
                        status = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $2

                    RETURNING
                        id,
                        user_id,
                        status,
                        created_at,
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
                        "Application not found."

                });

            }


            const application =
                result.rows[0];


            console.log(
                `Application ${applicationId} status changed to ${status}`
            );


            return res.json({

                success: true,

                message:
                    "Application status updated successfully.",

                application: {

                    id:
                        Number(
                            application.id
                        ),

                    userId:
                        application.user_id
                            ? Number(
                                application.user_id
                            )
                            : null,

                    status:
                        application.status,

                    createdAt:
                        application.created_at,

                    updatedAt:
                        application.updated_at

                }

            });

        } catch (error) {

            console.error(
                "Update application status error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to update application status."

            });

        }

    }
);


// =========================================================
// DELETE APPLICATION
// ADMIN ONLY
// DELETE /:id
// =========================================================

router.delete(
    "/:id",
    requireAdmin,
    async (req, res) => {

        const client =
            await pool.connect();


        try {

            await databaseReady;


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
                        "Invalid Application ID."

                });

            }


            // -------------------------------------------------
            // SAME CLIENT FOR TRANSACTION
            // -------------------------------------------------

            await client.query(
                "BEGIN"
            );


            const existing =
                await client.query(
                    `
                    SELECT
                        id

                    FROM applications

                    WHERE id = $1

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [applicationId]
                );


            if (
                existing.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );


                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


            // -------------------------------------------------
            // DELETE PAYMENTS FIRST
            // -------------------------------------------------

            await client.query(
                `
                DELETE FROM payments

                WHERE application_id = $1
                `,
                [applicationId]
            );


            // -------------------------------------------------
            // DELETE APPLICATION
            // -------------------------------------------------

            const deleted =
                await client.query(
                    `
                    DELETE FROM applications

                    WHERE id = $1

                    RETURNING id
                    `,
                    [applicationId]
                );


            await client.query(
                "COMMIT"
            );


            console.log(
                `Application ${applicationId} deleted by admin.`
            );


            return res.json({

                success: true,

                message:
                    "Application deleted successfully.",

                applicationId:
                    Number(
                        deleted.rows[0].id
                    )

            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch (rollbackError) {

                console.error(
                    "Application rollback error:",
                    rollbackError
                );

            }


            console.error(
                "Delete application error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete application."

            });

        } finally {

            client.release();

        }

    }
);


// =========================================================
// EXPORT
// =========================================================

module.exports = router;
