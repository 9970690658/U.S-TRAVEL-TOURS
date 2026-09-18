// =========================================================
// U.S TRAVEL & TOURS
// APPLICATION BACKEND
// MongoDB Version
// =========================================================

const express = require("express");

const {
    getDatabase,
    getNextSequence
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();

// =========================================================
// HELPERS
// =========================================================

function getValue(
    object,
    paths
) {

    if (!object) {

        return "";

    }

    for (
        const path of paths
    ) {

        const parts =
            String(path)
                .split(".");

        let value =
            object;

        for (
            const part of parts
        ) {

            if (
                value === null ||
                value === undefined
            ) {

                value =
                    undefined;

                break;

            }

            value =
                value[part];

        }

        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {

            return value;

        }

    }

    return "";

}

function cleanString(
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

function parseApplicationData(
    application
) {

    if (!application) {

        return null;

    }

    let data =
        application.application_data;

    if (
        typeof data ===
        "string"
    ) {

        try {

            data =
                JSON.parse(
                    data
                );

        } catch {

            data = {};

        }

    }

    if (
        !data ||
        typeof data !==
            "object"
    ) {

        data = {};

    }

    return data;

}

function formatApplication(
    application
) {

    const data =
        parseApplicationData(
            application
        );

    return {

        id:
            Number(
                application.id
            ),

        data:
            data,

        status:
            application.status,

        createdAt:
            application.created_at,

        updatedAt:
            application.updated_at

    };

}

// =========================================================
// CREATE APPLICATION
//
// POST /api/applications
// =========================================================

router.post(
    "/",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            // -------------------------------------------------
            // CUSTOMER ONLY
            // -------------------------------------------------

            if (
                req.user?.role !==
                "customer"
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Only customer accounts can submit applications."

                });

            }

            const userId =
                Number(
                    req.user.id
                );

            if (
                !Number.isInteger(
                    userId
                ) ||
                userId <= 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Authentication is invalid."

                });

            }

            // -------------------------------------------------
            // APPLICATION DATA
            // -------------------------------------------------

            let applicationData =
                req.body;

            if (
                applicationData &&
                typeof applicationData ===
                    "object" &&
                !Array.isArray(
                    applicationData
                )
            ) {

                applicationData =
                    {
                        ...applicationData
                    };

            } else {

                applicationData =
                    {};

            }

            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            const passportNumber =
                cleanString(
                    getValue(
                        applicationData,
                        [
                            "passportNumber",
                            "passport_number",
                            "passport.number",
                            "passportNo"
                        ]
                    ),
                    100
                );

            const surname =
                cleanString(
                    getValue(
                        applicationData,
                        [
                            "surname",
                            "lastName",
                            "last_name",
                            "familyName"
                        ]
                    ),
                    150
                );

            const firstMiddleName =
                cleanString(
                    getValue(
                        applicationData,
                        [
                            "firstMiddleName",
                            "firstMiddle",
                            "firstName",
                            "first_name",
                            "givenName"
                        ]
                    ),
                    200
                );

            const dateOfBirth =
                cleanString(
                    getValue(
                        applicationData,
                        [
                            "dateOfBirth",
                            "date_of_birth",
                            "dob"
                        ]
                    ),
                    50
                );

            const nationality =
                cleanString(
                    getValue(
                        applicationData,
                        [
                            "nationality",
                            "country",
                            "citizenship"
                        ]
                    ),
                    100
                );

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
            // SIZE PROTECTION
            // -------------------------------------------------

            let serializedData;

            try {

                serializedData =
                    JSON.stringify(
                        applicationData
                    );

            } catch {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application data."

                });

            }

            if (
                Buffer.byteLength(
                    serializedData,
                    "utf8"
                ) >
                1024 *
                1024
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Application data is too large."

                });

            }

            // -------------------------------------------------
            // VERIFY USER EXISTS
            // -------------------------------------------------

            const db =
                getDatabase();

            const user =
                await db
                    .collection("users")
                    .findOne({

                        id:
                            userId

                    });

            if (!user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Customer account not found."

                });

            }

            // -------------------------------------------------
            // CREATE NUMERIC APPLICATION ID
            // -------------------------------------------------

            const applicationId =
                await getNextSequence(
                    "applications"
                );

            const now =
                new Date();

            // -------------------------------------------------
            // SAVE APPLICATION
            // -------------------------------------------------

            await db
                .collection("applications")
                .insertOne({

                    id:
                        applicationId,

                    user_id:
                        userId,

                    application_data:
                        serializedData,

                    status:
                        "payment_pending",

                    created_at:
                        now,

                    updated_at:
                        now

                });

            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.status(201).json({

                success: true,

                message:
                    "Application submitted successfully.",

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
                    "Unable to submit application."

            });

        }

    }
);

// =========================================================
// GET SINGLE APPLICATION
//
// GET /api/applications/:id
// =========================================================

router.get(
    "/:id",
    requireAuth,
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

            const db =
                getDatabase();

            const application =
                await db
                    .collection("applications")
                    .findOne({

                        id:
                            applicationId

                    });

            if (!application) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }

            // -------------------------------------------------
            // CUSTOMER OWNERSHIP
            // -------------------------------------------------

            if (
                req.user.role !==
                "admin"
            ) {

                const userId =
                    Number(
                        req.user.id
                    );

                if (
                    Number(
                        application.user_id
                    ) !==
                    userId
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            "You are not authorized to view this application."

                    });

                }

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
//
// GET /api/applications
// ADMIN ONLY
// =========================================================

router.get(
    "/",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const db =
                getDatabase();

            const applications =
                await db
                    .collection("applications")
                    .find({})
                    .sort({
                        id: -1
                    })
                    .toArray();

            return res.json({

                success: true,

                applications:
                    applications.map(
                        formatApplication
                    )

            });

        } catch (error) {

            console.error(
                "Admin applications error:",
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
//
// PATCH /api/applications/:id/status
// ADMIN ONLY
// =========================================================

router.patch(
    "/:id/status",
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
                cleanString(
                    req.body.status,
                    50
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
                    newStatus
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid application status."

                });

            }

            const db =
                getDatabase();

            const existing =
                await db
                    .collection("applications")
                    .findOne({

                        id:
                            applicationId

                    });

            if (!existing) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }

            const updatedAt =
                new Date();

            await db
                .collection("applications")
                .updateOne(

                    {
                        id:
                            applicationId
                    },

                    {
                        $set: {

                            status:
                                newStatus,

                            updated_at:
                                updatedAt

                        }

                    }

                );

            return res.json({

                success: true,

                message:
                    `Application status updated to ${newStatus}.`,

                applicationId:
                    applicationId,

                status:
                    newStatus

            });

        } catch (error) {

            console.error(
                "Application status error:",
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
//
// DELETE /api/applications/:id
// ADMIN ONLY
// =========================================================

router.delete(
    "/:id",
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

            const db =
                getDatabase();

            const existing =
                await db
                    .collection("applications")
                    .findOne({

                        id:
                            applicationId

                    });

            if (!existing) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }

            // -------------------------------------------------
            // DELETE RELATED PAYMENTS FIRST
            // -------------------------------------------------

            await db
                .collection("payments")
                .deleteMany({

                    application_id:
                        applicationId

                });

            // -------------------------------------------------
            // DELETE APPLICATION
            // -------------------------------------------------

            await db
                .collection("applications")
                .deleteOne({

                    id:
                        applicationId

                });

            return res.json({

                success: true,

                message:
                    "Application deleted successfully."

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
// EXPORT
// =========================================================

module.exports = router;
