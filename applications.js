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

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value).trim();
}


/* ---------------------------------------------------------
   GET VALUE FROM MULTIPLE POSSIBLE PATHS
--------------------------------------------------------- */

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


/* ---------------------------------------------------------
   PARSE APPLICATION DATA
--------------------------------------------------------- */

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


/* ---------------------------------------------------------
   NORMALIZE DATABASE ID
--------------------------------------------------------- */

function normalizeId(value) {

    const id = Number(value);

    if (
        !Number.isSafeInteger(id) ||
        id <= 0
    ) {
        return null;
    }

    return id;
}


/* =========================================================
   POST /api/applications
   CUSTOMER - SUBMIT APPLICATION
========================================================= */

router.post(
    "/",
    requireAuth,
    async (req, res) => {

        try {

            /* -------------------------------------------------
               CUSTOMER ONLY
            ------------------------------------------------- */

            if (
                !req.user ||
                req.user.role !== "customer"
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Only customer accounts can submit applications."
                });
            }


            /* -------------------------------------------------
               ACCEPT MULTIPLE FRONTEND DATA FORMATS
               
               Supported:
               1. req.body
               2. req.body.application
               3. req.body.applicationData
            ------------------------------------------------- */

            let body = req.body || {};


            if (
                body.application &&
                typeof body.application === "object" &&
                !Array.isArray(body.application)
            ) {

                body = body.application;

            } else if (
                body.applicationData &&
                typeof body.applicationData === "object" &&
                !Array.isArray(body.applicationData)
            ) {

                body = body.applicationData;
            }


            /* -------------------------------------------------
               REQUIRED FIELDS
            ------------------------------------------------- */

            const passportNumber = cleanString(
                getValue(
                    body,

                    "passportNumber",
                    "passport_number",

                    "passport.number"
                )
            );


            const passportIssuingCountry = cleanString(
                getValue(
                    body,

                    "passportIssuingCountry",
                    "passport_issuing_country",

                    "passport.issuingCountry",
                    "passport.issuing_country"
                )
            );


            const passportIssueDate = cleanString(
                getValue(
                    body,

                    "passportIssueDate",
                    "passport_issue_date",

                    "passport.issueDate",
                    "passport.issue_date"
                )
            );


            const passportExpiryDate = cleanString(
                getValue(
                    body,

                    "passportExpiryDate",
                    "passport_expiry_date",

                    "passport.expiryDate",
                    "passport.expiry_date"
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


            const birthCity = cleanString(
                getValue(
                    body,

                    "birthCity",
                    "birth_city"
                )
            );


            const birthCountry = cleanString(
                getValue(
                    body,

                    "birthCountry",
                    "birth_country"
                )
            );


            const nationality = cleanString(
                getValue(
                    body,

                    "nationality"
                )
            );


            const homeAddress = cleanString(
                getValue(
                    body,

                    "homeAddress",
                    "home_address"
                )
            );


            const homeCity = cleanString(
                getValue(
                    body,

                    "homeCity",
                    "home_city"
                )
            );


            const homeCountry = cleanString(
                getValue(
                    body,

                    "homeCountry",
                    "home_country"
                )
            );


            const mobilePhone = cleanString(
                getValue(
                    body,

                    "mobilePhone",
                    "mobile_phone",
                    "phone"
                )
            );


            const employerSchool = cleanString(
                getValue(
                    body,

                    "employerSchool",
                    "employer_school"
                )
            );


            const presentOccupation = cleanString(
                getValue(
                    body,

                    "presentOccupation",
                    "present_occupation",
                    "occupation"
                )
            );


            const usArrivalDate = cleanString(
                getValue(
                    body,

                    "usArrivalDate",
                    "us_arrival_date"
                )
            );


            const visaEmail = cleanString(
                getValue(
                    body,

                    "visaEmail",
                    "visa_email",
                    "email"
                )
            );


            const usStayAddress = cleanString(
                getValue(
                    body,

                    "usStayAddress",
                    "us_stay_address"
                )
            );


            const usContactName = cleanString(
                getValue(
                    body,

                    "usContactName",
                    "us_contact_name"
                )
            );


            const stayDuration = cleanString(
                getValue(
                    body,

                    "stayDuration",
                    "stay_duration"
                )
            );


            const tripPurpose = cleanString(
                getValue(
                    body,

                    "tripPurpose",
                    "trip_purpose"
                )
            );


            const tripPaidBy = cleanString(
                getValue(
                    body,

                    "tripPaidBy",
                    "trip_paid_by"
                )
            );


            const previousUsVisit = cleanString(
                getValue(
                    body,

                    "previousUsVisit",
                    "previous_us_visit"
                )
            );


            /* =================================================
               REQUIRED FIELD VALIDATION
            ================================================= */

            const missingFields = [];


            if (!passportNumber) {
                missingFields.push("passportNumber");
            }


            if (!passportIssuingCountry) {
                missingFields.push(
                    "passportIssuingCountry"
                );
            }


            if (!passportIssueDate) {
                missingFields.push(
                    "passportIssueDate"
                );
            }


            if (!passportExpiryDate) {
                missingFields.push(
                    "passportExpiryDate"
                );
            }


            if (!surname) {
                missingFields.push("surname");
            }


            if (!firstMiddleName) {
                missingFields.push(
                    "firstMiddleName"
                );
            }


            if (!dateOfBirth) {
                missingFields.push(
                    "dateOfBirth"
                );
            }


            if (!birthCity) {
                missingFields.push(
                    "birthCity"
                );
            }


            if (!birthCountry) {
                missingFields.push(
                    "birthCountry"
                );
            }


            if (!nationality) {
                missingFields.push(
                    "nationality"
                );
            }


            if (!homeAddress) {
                missingFields.push(
                    "homeAddress"
                );
            }


            if (!homeCity) {
                missingFields.push(
                    "homeCity"
                );
            }


            if (!homeCountry) {
                missingFields.push(
                    "homeCountry"
                );
            }


            if (!mobilePhone) {
                missingFields.push(
                    "mobilePhone"
                );
            }


            if (!employerSchool) {
                missingFields.push(
                    "employerSchool"
                );
            }


            if (!presentOccupation) {
                missingFields.push(
                    "presentOccupation"
                );
            }


            if (!usArrivalDate) {
                missingFields.push(
                    "usArrivalDate"
                );
            }


            if (!visaEmail) {
                missingFields.push(
                    "visaEmail"
                );
            }


            if (!usStayAddress) {
                missingFields.push(
                    "usStayAddress"
                );
            }


            if (!usContactName) {
                missingFields.push(
                    "usContactName"
                );
            }


            if (!stayDuration) {
                missingFields.push(
                    "stayDuration"
                );
            }


            if (!tripPurpose) {
                missingFields.push(
                    "tripPurpose"
                );
            }


            if (!tripPaidBy) {
                missingFields.push(
                    "tripPaidBy"
                );
            }


            if (!previousUsVisit) {
                missingFields.push(
                    "previousUsVisit"
                );
            }


            /* -------------------------------------------------
               VALIDATION RESPONSE
            ------------------------------------------------- */

            if (missingFields.length > 0) {

                console.log(
                    "APPLICATION MISSING FIELDS:",
                    missingFields
                );

                return res.status(400).json({

                    success: false,

                    message:
                        "Please complete all required application fields.",

                    missingFields
                });
            }


            /* =================================================
               PAYLOAD SIZE PROTECTION
            ================================================= */

            let applicationData;

            try {

                const serialized =
                    JSON.stringify(body);


                if (
                    Buffer.byteLength(
                        serialized,
                        "utf8"
                    ) >
                    1024 * 1024
                ) {

                    return res.status(413).json({

                        success: false,

                        message:
                            "Application data is too large."
                    });
                }


                applicationData =
                    serialized;

            } catch (error) {

                console.error(
                    "APPLICATION JSON ERROR:",
                    error
                );

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application data."
                });
            }


            /* =================================================
               SAVE APPLICATION
            ================================================= */

            const userId =
                normalizeId(req.user.id);


            if (!userId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid customer account."
                });
            }


            const result =
                await pool.query(
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
                    RETURNING
                        id,
                        status,
                        created_at,
                        updated_at
                    `,
                    [
                        userId,
                        applicationData
                    ]
                );


            if (
                !result.rows ||
                result.rows.length === 0
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to create application."
                });
            }


            const application =
                result.rows[0];


            /* =================================================
               SUCCESS
            ================================================= */

            console.log(
                "APPLICATION CREATED:",
                Number(application.id)
            );


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
   CUSTOMER / ADMIN - VIEW SINGLE APPLICATION
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


            const row =
                result.rows[0];


            /* -------------------------------------------------
               CUSTOMER OWNERSHIP
            ------------------------------------------------- */

            if (
                req.user.role !== "admin" &&
                Number(row.user_id) !==
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
   ADMIN - VIEW ALL APPLICATIONS
========================================================= */

router.get(
    "/",
    requireAdmin,
    async (req, res) => {

        try {

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
   ADMIN - UPDATE APPLICATION STATUS
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

                    message:
                        "Invalid Application ID."
                });
            }


            const status =
                cleanString(
                    req.body?.status
                ).toLowerCase();


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
                        "Invalid application status.",

                    allowedStatuses
                });
            }


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


            if (
                existing.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."
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

        let client = null;

        try {

            const applicationId =
                normalizeId(req.params.id);


            if (!applicationId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid Application ID."
                });
            }


            client =
                await pool.connect();


            await client.query(
                "BEGIN"
            );


            /* -------------------------------------------------
               DELETE PAYMENTS
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


            if (
                result.rows.length === 0
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


            await client.query(
                "COMMIT"
            );


            return res.json({

                success: true,

                message:
                    "Application deleted successfully.",

                applicationId:
                    Number(
                        result.rows[0].id
                    )
            });

        } catch (error) {

            if (client) {

                try {

                    await client.query(
                        "ROLLBACK"
                    );

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
