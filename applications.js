const express = require("express");
const router = express.Router();

const { db } = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");


// =========================================================
// U.S TRAVEL & TOURS
// APPLICATIONS BACKEND
//
// CUSTOMER:
// 1. Create application
// 2. View own application
//
// ADMIN:
// 1. View all applications
// 2. View any application
// 3. Update application status
// 4. Delete application
//
// Application flow:
//
// application submitted
//        ↓
// payment_pending
//        ↓
// payment_submitted
//        ↓
// under_review
//        ↓
// approved / rejected / completed
// =========================================================


// =========================================================
// DATABASE COMPATIBILITY
// =========================================================
//
// Older database versions may not have user_id in
// applications table.
//
// This automatically adds user_id if missing.
//
// This allows existing database.db to continue working.
// =========================================================

try {

    const columns = db.prepare(
        `PRAGMA table_info(applications)`
    ).all();

    const hasUserId = columns.some(
        column => column.name === "user_id"
    );

    if (!hasUserId) {

        db.prepare(`
            ALTER TABLE applications
            ADD COLUMN user_id INTEGER
        `).run();

        console.log(
            "Applications table updated: user_id column added."
        );
    }

} catch (error) {

    console.error(
        "Applications database migration error:",
        error
    );

}


// =========================================================
// HELPER FUNCTIONS
// =========================================================

function getValue(data, paths = []) {

    for (const path of paths) {

        const parts = path.split(".");

        let value = data;

        for (const part of parts) {

            if (
                value === undefined ||
                value === null ||
                typeof value !== "object"
            ) {

                value = undefined;

                break;
            }

            value = value[part];
        }

        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {

            return value;
        }
    }

    return null;
}


// =========================================================
// CLEAN STRING
// =========================================================

function cleanString(value) {

    if (
        value === undefined ||
        value === null
    ) {

        return "";
    }

    return String(value).trim();
}


// =========================================================
// CREATE APPLICATION
// POST /api/applications
//
// CUSTOMER ONLY
// =========================================================

router.post(
    "/",
    requireAuth,
    (req, res) => {

        try {

            // -------------------------------------------------
            // CUSTOMER ROLE CHECK
            // -------------------------------------------------

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


            // -------------------------------------------------
            // REQUEST DATA
            // -------------------------------------------------

            const applicationData = req.body;


            // -------------------------------------------------
            // BASIC REQUEST VALIDATION
            // -------------------------------------------------

            if (
                !applicationData ||
                typeof applicationData !== "object" ||
                Array.isArray(applicationData)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Application data is required."

                });

            }


            // -------------------------------------------------
            // SUPPORT BOTH FORMATS
            // -------------------------------------------------

            const passportNumber = cleanString(

                getValue(
                    applicationData,
                    [
                        "passportNumber",
                        "passportInformation.passportNumber"
                    ]
                )

            );


            const surname = cleanString(

                getValue(
                    applicationData,
                    [
                        "surname",
                        "nameInformation.surname"
                    ]
                )

            );


            const firstMiddleName = cleanString(

                getValue(
                    applicationData,
                    [
                        "firstMiddleName",
                        "nameInformation.firstMiddleName"
                    ]
                )

            );


            const dateOfBirth = cleanString(

                getValue(
                    applicationData,
                    [
                        "dateOfBirth",
                        "personalInformation.dateOfBirth"
                    ]
                )

            );


            const nationality = cleanString(

                getValue(
                    applicationData,
                    [
                        "nationality",
                        "personalInformation.nationality"
                    ]
                )

            );


            // -------------------------------------------------
            // REQUIRED FIELD VALIDATION
            // -------------------------------------------------

            const requiredFields = [

                {
                    name: "passportNumber",
                    value: passportNumber
                },

                {
                    name: "surname",
                    value: surname
                },

                {
                    name: "firstMiddleName",
                    value: firstMiddleName
                },

                {
                    name: "dateOfBirth",
                    value: dateOfBirth
                },

                {
                    name: "nationality",
                    value: nationality
                }

            ];


            for (
                const field of requiredFields
            ) {

                if (!field.value) {

                    return res.status(400).json({

                        success: false,

                        message:
                            `Please provide ${field.name}.`

                    });

                }
            }


            // -------------------------------------------------
            // REQUEST SIZE PROTECTION
            // -------------------------------------------------

            const applicationJSON =
                JSON.stringify(
                    applicationData
                );


            if (
                Buffer.byteLength(
                    applicationJSON,
                    "utf8"
                ) > 1024 * 1024
            ) {

                return res.status(413).json({

                    success: false,

                    message:
                        "Application data is too large."

                });

            }


            // -------------------------------------------------
            // LOGGED-IN CUSTOMER ID
            // -------------------------------------------------

            const userId =
                Number(req.user.id);


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid customer authentication."

                });

            }


            // -------------------------------------------------
            // SAVE APPLICATION
            //
            // Application starts as payment_pending.
            //
            // It is linked to the logged-in customer.
            // -------------------------------------------------

            const insert = db.prepare(`

                INSERT INTO applications (
                    user_id,
                    application_data,
                    status
                )

                VALUES (?, ?, ?)

            `);


            const result = insert.run(

                userId,

                applicationJSON,

                "payment_pending"

            );


            const applicationId =
                Number(
                    result.lastInsertRowid
                );


            console.log(

                `New application received. ` +
                `Application ID: ${applicationId}. ` +
                `Customer ID: ${userId}`

            );


            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.status(201).json({

                success: true,

                message:
                    "Application submitted successfully. Please proceed with payment.",

                applicationId:
                    applicationId,

                status:
                    "payment_pending"

            });


        } catch (error) {

            console.error(
                "Application submission error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to save application. Please try again."

            });

        }

    }
);


// =========================================================
// GET SINGLE APPLICATION
// GET /api/applications/:id
//
// CUSTOMER:
// Own application only
//
// ADMIN:
// Any application
// =========================================================

router.get(
    "/:id",
    requireAuth,
    (req, res) => {

        try {

            const applicationId =
                Number(
                    req.params.id
                );


            // -------------------------------------------------
            // VALIDATE ID
            // -------------------------------------------------

            if (
                !Number.isInteger(applicationId) ||
                applicationId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application ID."

                });

            }


            // -------------------------------------------------
            // GET APPLICATION
            // -------------------------------------------------

            const application =
                db.prepare(`

                    SELECT
                        id,
                        user_id,
                        application_data,
                        status,
                        created_at,
                        updated_at

                    FROM applications

                    WHERE id = ?

                `).get(
                    applicationId
                );


            // -------------------------------------------------
            // NOT FOUND
            // -------------------------------------------------

            if (!application) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


            // -------------------------------------------------
            // CUSTOMER OWNERSHIP CHECK
            // -------------------------------------------------

            if (
                req.user.role !== "admin"
            ) {

                const loggedInUserId =
                    Number(req.user.id);

                const applicationUserId =
                    Number(application.user_id);


                if (
                    !Number.isInteger(
                        loggedInUserId
                    ) ||
                    loggedInUserId !==
                        applicationUserId
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            "You are not authorized to view this application."

                    });

                }

            }


            // -------------------------------------------------
            // PARSE APPLICATION DATA
            // -------------------------------------------------

            let parsedData = {};


            try {

                parsedData =
                    JSON.parse(
                        application.application_data
                    );

            } catch (error) {

                console.error(

                    `Application JSON parse error ` +
                    `for application ${application.id}:`,

                    error

                );

                parsedData = {};

            }


            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.json({

                success: true,

                application: {

                    id:
                        application.id,

                    data:
                        parsedData,

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
                    "Unable to retrieve application."

            });

        }

    }
);


// =========================================================
// GET ALL APPLICATIONS
// GET /api/applications
//
// ADMIN ONLY
// =========================================================

router.get(
    "/",
    requireAdmin,
    (req, res) => {

        try {

            const applications =
                db.prepare(`

                    SELECT
                        id,
                        user_id,
                        application_data,
                        status,
                        created_at,
                        updated_at

                    FROM applications

                    ORDER BY created_at DESC

                `).all();


            const formattedApplications =
                applications.map(
                    (application) => {

                        let parsedData = {};


                        try {

                            parsedData =
                                JSON.parse(
                                    application.application_data
                                );

                        } catch (error) {

                            console.error(

                                `Unable to parse application ` +
                                `${application.id}:`,

                                error

                            );

                            parsedData = {};

                        }


                        return {

                            id:
                                application.id,

                            userId:
                                application.user_id,

                            data:
                                parsedData,

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

                count:
                    formattedApplications.length,

                applications:
                    formattedApplications

            });


        } catch (error) {

            console.error(
                "Get applications error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve applications."

            });

        }

    }
);


// =========================================================
// UPDATE APPLICATION STATUS
// PATCH /api/applications/:id/status
//
// ADMIN ONLY
// =========================================================

router.patch(
    "/:id/status",
    requireAdmin,
    (req, res) => {

        try {

            const applicationId =
                Number(
                    req.params.id
                );


            const status =
                cleanString(
                    req.body?.status
                );


            // -------------------------------------------------
            // ALLOWED STATUSES
            // -------------------------------------------------

            const allowedStatuses = [

                "pending",

                "payment_pending",

                "payment_submitted",

                "under_review",

                "approved",

                "rejected",

                "completed"

            ];


            // -------------------------------------------------
            // VALIDATE ID
            // -------------------------------------------------

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


            // -------------------------------------------------
            // VALIDATE STATUS
            // -------------------------------------------------

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


            // -------------------------------------------------
            // CHECK APPLICATION
            // -------------------------------------------------

            const existingApplication =
                db.prepare(`

                    SELECT
                        id,
                        status

                    FROM applications

                    WHERE id = ?

                `).get(
                    applicationId
                );


            if (!existingApplication) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


            // -------------------------------------------------
            // UPDATE
            // -------------------------------------------------

            const result =
                db.prepare(`

                    UPDATE applications

                    SET
                        status = ?,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = ?

                `).run(

                    status,

                    applicationId

                );


            if (
                result.changes === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


            console.log(

                `Application ${applicationId} ` +
                `status changed from ` +
                `${existingApplication.status} ` +
                `to ${status}`

            );


            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.json({

                success: true,

                message:
                    "Application status updated.",

                applicationId:
                    applicationId,

                status:
                    status

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
// DELETE /api/applications/:id
//
// ADMIN ONLY
// =========================================================

router.delete(
    "/:id",
    requireAdmin,
    (req, res) => {

        try {

            const applicationId =
                Number(
                    req.params.id
                );


            // -------------------------------------------------
            // VALIDATE ID
            // -------------------------------------------------

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


            // -------------------------------------------------
            // CHECK APPLICATION
            // -------------------------------------------------

            const existingApplication =
                db.prepare(`

                    SELECT
                        id

                    FROM applications

                    WHERE id = ?

                `).get(
                    applicationId
                );


            if (!existingApplication) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


            // -------------------------------------------------
            // DELETE RELATED PAYMENTS FIRST
            // -------------------------------------------------

            const deletePayments =
                db.prepare(`

                    DELETE FROM payments

                    WHERE application_id = ?

                `);


            // -------------------------------------------------
            // DELETE APPLICATION
            // -------------------------------------------------

            const deleteApplication =
                db.prepare(`

                    DELETE FROM applications

                    WHERE id = ?

                `);


            // -------------------------------------------------
            // TRANSACTION
            // -------------------------------------------------

            const deleteTransaction =
                db.transaction(() => {

                    deletePayments.run(
                        applicationId
                    );

                    return deleteApplication.run(
                        applicationId
                    );

                });


            const result =
                deleteTransaction();


            // -------------------------------------------------
            // DELETE FAILED
            // -------------------------------------------------

            if (
                result.changes === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


            console.log(

                `Application ${applicationId} deleted.`

            );


            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.json({

                success: true,

                message:
                    "Application deleted successfully.",

                applicationId:
                    applicationId

            });


        } catch (error) {

            console.error(
                "Delete application error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete application."

            });

        }

    }
);


// =========================================================
// EXPORT ROUTER
// =========================================================

module.exports = router;