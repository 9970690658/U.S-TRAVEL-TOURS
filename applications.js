/* =========================================================
   U.S TRAVEL & TOURS
   APPLICATION ROUTES
   PostgreSQL / Supabase Version

   CUSTOMER:
   - Submit application
   - View own application

   ADMIN:
   - View all applications
   - Update application status
   - Delete application
========================================================= */

const express = require("express");

const {
    pool
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


/* =========================================================
   HELPERS
========================================================= */

function cleanString(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}


function getValue(source, ...paths) {

    for (const path of paths) {

        let current = source;

        for (const key of path.split(".")) {

            if (
                current === undefined ||
                current === null
            ) {
                current = undefined;
                break;
            }

            current = current[key];
        }

        if (
            current !== undefined &&
            current !== null &&
            String(current).trim() !== ""
        ) {
            return current;
        }
    }

    return "";
}


function parseApplicationData(value) {

    if (!value) {
        return {};
    }

    if (typeof value === "object") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return {};
    }
}


function normalizeId(value) {

    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return null;
    }

    return id;
}


/* =========================================================
   POST /api/applications
   CUSTOMER APPLICATION SUBMISSION
========================================================= */

router.post(
    "/",
    requireAuth,
    async (req, res) => {

        try {

            /* -------------------------------------------------
               CUSTOMER ONLY
            ------------------------------------------------- */

            if (req.user.role !== "customer") {

                return res.status(403).json({
                    success: false,
                    message: "Only customer accounts can submit applications."
                });
            }


            /* -------------------------------------------------
               REQUEST BODY
            ------------------------------------------------- */

            const body =
                req.body?.application &&
                typeof req.body.application === "object"
                    ? req.body.application
                    : req.body;


            /* -------------------------------------------------
               REQUIRED APPLICATION FIELDS
            ------------------------------------------------- */

            const passportNumber = cleanString(
                getValue(
                    body,
                    "passportNumber",
                    "passport_number",
                    "passport.number"
                )
            );

            const surname = cleanString(
                getValue(
                    body,
                    "surname",
                    "lastName",
                    "last_name"
                )
            );

            const firstMiddleName = cleanString(
                getValue(
                    body,
                    "firstMiddleName",
                    "first_middle_name",
                    "firstName",
                    "first_name"
                )
            );

            const dateOfBirth = cleanString(
                getValue(
                    body,
                    "dateOfBirth",
                    "date_of_birth",
                    "dob"
                )
            );

            const nationality = cleanString(
                getValue(
                    body,
                    "nationality"
                )
            );


            /* -------------------------------------------------
               VALIDATION
            ------------------------------------------------- */

            const missingFields = [];

            if (!passportNumber) {
                missingFields.push("passportNumber");
            }

            if (!surname) {
                missingFields.push("surname");
            }

            if (!firstMiddleName) {
                missingFields.push("firstMiddleName");
            }

            if (!dateOfBirth) {
                missingFields.push("dateOfBirth");
            }

            if (!nationality) {
                missingFields.push("nationality");
            }


            if (missingFields.length > 0) {

                return res.status(400).json({
                    success: false,
                    message: "Please complete all required application fields.",
                    missingFields
                });
            }


            /* -------------------------------------------------
               PROTECT DATABASE FROM EXTREMELY LARGE PAYLOADS
            ------------------------------------------------- */

            let applicationData;

            try {

                const serialized =
                    JSON.stringify(body);

                if (
                    Buffer.byteLength(
                        serialized,
                        "utf8"
                    ) > 1024 * 1024
                ) {

                    return res.status(413).json({
                        success: false,
                        message: "Application data is too large."
                    });
                }

                applicationData = serialized;

            } catch (error) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid application data."
                });
            }


            /* -------------------------------------------------
               SAVE APPLICATION
            -------------------------------------------------

               IMPORTANT:
               PostgreSQL BIGSERIAL generates the ID.

               RETURNING id gives us the actual
               Application ID immediately.
            ------------------------------------------------- */

            const result = await pool.query(
                `
                INSERT INTO applications
                (
                    user_id,
                    application_data,
                    status,
                    created_at,
                    updated_at
                )
                VALUES
                (
                    $1,
                    $2,
                    'payment_pending',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                RETURNING id, status, created_at, updated_at
                `,
                [
                    Number(req.user.id),
                    applicationData
                ]
            );


            const application =
                result.rows[0];


            /* -------------------------------------------------
               SUCCESS
            ------------------------------------------------- */

            return res.status(201).json({

                success: true,

                message:
                    "Application submitted successfully.",

                applicationId:
                    Number(application.id),

                status:
                    application.status,

                createdAt:
                    application.created_at,

                updatedAt:
                    application.updated_at
            });

        } catch (error) {

            console.error(
                "APPLICATION SUBMISSION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to submit application at this time."
            });
        }
    }
);


/* =========================================================
   GET /api/applications/:id
   VIEW SINGLE APPLICATION
========================================================= */

router.get(
    "/:id",
    requireAuth,
    async (req, res) => {

        try {

            const applicationId =
                normalizeId(req.params.id);


            if (!applicationId) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid Application ID."
                });
            }


            const result = await pool.query(
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


            if (result.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Application not found."
                });
            }


            const row =
                result.rows[0];


            /* -------------------------------------------------
               CUSTOMER CAN ONLY SEE OWN APPLICATION
            ------------------------------------------------- */

            if (
                req.user.role !== "admin" &&
                Number(row.user_id) !== Number(req.user.id)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You are not authorized to view this application."
                });
            }


            const data =
                parseApplicationData(
                    row.application_data
                );


            return res.json({

                success: true,

                application: {

                    id:
                        Number(row.id),

                    userId:
                        row.user_id !== null
                            ? Number(row.user_id)
                            : null,

                    data,

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
                "GET APPLICATION ERROR:",
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


/* =========================================================
   GET /api/applications
   ADMIN - ALL APPLICATIONS
========================================================= */

router.get(
    "/",
    requireAdmin,
    async (req, res) => {

        try {

            const result = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    application_data,
                    status,
                    created_at,
                    updated_at
                FROM applications
                ORDER BY created_at DESC
                `
            );


            const applications =
                result.rows.map(row => ({

                    id:
                        Number(row.id),

                    userId:
                        row.user_id !== null
                            ? Number(row.user_id)
                            : null,

                    data:
                        parseApplicationData(
                            row.application_data
                        ),

                    status:
                        row.status,

                    createdAt:
                        row.created_at,

                    updatedAt:
                        row.updated_at
                }));


            return res.json({

                success: true,

                applications
            });

        } catch (error) {

            console.error(
                "GET ALL APPLICATIONS ERROR:",
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


/* =========================================================
   PATCH /api/applications/:id/status
   ADMIN - UPDATE STATUS
========================================================= */

router.patch(
    "/:id/status",
    requireAdmin,
    async (req, res) => {

        try {

            const applicationId =
                normalizeId(req.params.id);


            if (!applicationId) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid Application ID."
                });
            }


            const status =
                cleanString(
                    req.body?.status
                ).toLowerCase();


            /* -------------------------------------------------
               ALLOWED STATUSES
            ------------------------------------------------- */

            const allowedStatuses = [
                "pending",
                "payment_pending",
                "payment_submitted",
                "under_review",
                "approved",
                "rejected",
                "completed"
            ];


            if (!allowedStatuses.includes(status)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid application status.",
                    allowedStatuses
                });
            }


            /* -------------------------------------------------
               CHECK APPLICATION EXISTS
            ------------------------------------------------- */

            const existing =
                await pool.query(
                    `
                    SELECT id
                    FROM applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [applicationId]
                );


            if (existing.rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Application not found."
                });
            }


            /* -------------------------------------------------
               UPDATE STATUS
            ------------------------------------------------- */

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
                        status,
                        updated_at
                    `,
                    [
                        status,
                        applicationId
                    ]
                );


            const updated =
                result.rows[0];


            return res.json({

                success: true,

                message:
                    "Application status updated successfully.",

                applicationId:
                    Number(updated.id),

                status:
                    updated.status,

                updatedAt:
                    updated.updated_at
            });

        } catch (error) {

            console.error(
                "UPDATE APPLICATION STATUS ERROR:",
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


/* =========================================================
   DELETE /api/applications/:id
   ADMIN - DELETE APPLICATION
========================================================= */

router.delete(
    "/:id",
    requireAdmin,
    async (req, res) => {

        let client;

        try {

            const applicationId =
                normalizeId(req.params.id);


            if (!applicationId) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid Application ID."
                });
            }


            /* -------------------------------------------------
               USE ONE CLIENT FOR TRANSACTION
            -------------------------------------------------

               PostgreSQL transactions must use the
               same client for BEGIN / queries / COMMIT.
            ------------------------------------------------- */

            client =
                await pool.connect();


            await client.query("BEGIN");


            /* -------------------------------------------------
               DELETE RELATED PAYMENTS FIRST
            ------------------------------------------------- */

            await client.query(
                `
                DELETE FROM payments
                WHERE application_id = $1
                `,
                [applicationId]
            );


            /* -------------------------------------------------
               DELETE APPLICATION
            ------------------------------------------------- */

            const result =
                await client.query(
                    `
                    DELETE FROM applications
                    WHERE id = $1
                    RETURNING id
                    `,
                    [applicationId]
                );


            if (result.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message: "Application not found."
                });
            }


            await client.query("COMMIT");


            return res.json({

                success: true,

                message:
                    "Application deleted successfully.",

                applicationId:
                    Number(result.rows[0].id)
            });

        } catch (error) {

            if (client) {

                try {
                    await client.query("ROLLBACK");
                } catch (rollbackError) {
                    console.error(
                        "APPLICATION ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }


            console.error(
                "DELETE APPLICATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to delete application."
            });

        } finally {

            if (client) {
                client.release();
            }
        }
    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
