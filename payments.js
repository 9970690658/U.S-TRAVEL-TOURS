/* =========================================================
   U.S TRAVEL & TOURS
   PAYMENT ROUTES
   PostgreSQL / Supabase Storage Version

   CUSTOMER:
   - Submit payment details
   - Upload payment proof
   - View own payment
   - View own payment proof

   ADMIN:
   - View all payments
   - View payment by application
   - Update payment status
   - View payment proof

   STORAGE:
   - Supabase Storage
   - Private bucket: payment-proofs
========================================================= */

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const {
    pool
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


/* =========================================================
   SUPABASE STORAGE CONFIGURATION
========================================================= */

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAYMENT_PROOF_BUCKET =
    "payment-proofs";


/* =========================================================
   SUPABASE STORAGE CONFIG CHECK
========================================================= */

function storageConfigured() {

    return Boolean(
        SUPABASE_URL &&
        SUPABASE_SERVICE_ROLE_KEY
    );
}


/* =========================================================
   MULTER MEMORY STORAGE
========================================================= */

/*
   IMPORTANT:

   We do NOT use diskStorage anymore.

   The uploaded file stays temporarily in memory and is
   immediately uploaded to Supabase Storage.

   This prevents payment proofs from being lost when
   Render restarts or redeploys.
*/

const storage =
    multer.memoryStorage();


/* =========================================================
   FILE FILTER
========================================================= */

function fileFilter(
    req,
    file,
    cb
) {

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "application/pdf"
    ];


    if (
        !allowedTypes.includes(
            file.mimetype
        )
    ) {

        return cb(
            new Error(
                "Only JPG, JPEG, PNG and PDF files are allowed."
            )
        );
    }


    cb(null, true);
}


const upload =
    multer({

        storage,

        fileFilter,

        limits: {
            fileSize:
                5 * 1024 * 1024
        }
    });


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
   STORAGE FILE NAME
========================================================= */

function createStorageFileName(
    originalName
) {

    const original =
        cleanString(
            originalName
        );

    const extensionMatch =
        original.match(
            /\.[a-zA-Z0-9]+$/
        );

    const extension =
        extensionMatch
            ? extensionMatch[0].toLowerCase()
            : "";


    const randomPart =
        crypto
            .randomBytes(16)
            .toString("hex");


    return (
        "payment-" +
        Date.now() +
        "-" +
        randomPart +
        extension
    );
}


/* =========================================================
   SUPABASE STORAGE UPLOAD
========================================================= */

async function uploadToSupabaseStorage(
    file
) {

    if (!storageConfigured()) {

        throw new Error(
            "Supabase Storage is not configured."
        );
    }


    const fileName =
        createStorageFileName(
            file.originalname
        );


    const storagePath =
        "payments/" +
        fileName;


    const uploadUrl =
        SUPABASE_URL.replace(
            /\/$/,
            ""
        ) +
        "/storage/v1/object/" +
        encodeURIComponent(
            PAYMENT_PROOF_BUCKET
        ) +
        "/" +
        storagePath
            .split("/")
            .map(
                encodeURIComponent
            )
            .join("/");


    const response =
        await fetch(
            uploadUrl,
            {
                method: "POST",

                headers: {

                    "Authorization":
                        "Bearer " +
                        SUPABASE_SERVICE_ROLE_KEY,

                    "apikey":
                        SUPABASE_SERVICE_ROLE_KEY,

                    "Content-Type":
                        file.mimetype,

                    "x-upsert":
                        "false"
                },

                body:
                    file.buffer
            }
        );


    if (!response.ok) {

        let errorText = "";

        try {

            errorText =
                await response.text();

        } catch (error) {

            errorText =
                "Unknown Supabase Storage error.";
        }


        throw new Error(
            "Supabase Storage upload failed: " +
            errorText
        );
    }


    return {
        storagePath,
        fileName
    };
}


/* =========================================================
   SUPABASE STORAGE DELETE
========================================================= */

async function deleteFromSupabaseStorage(
    storagePath
) {

    if (
        !storageConfigured() ||
        !storagePath
    ) {
        return;
    }


    try {

        const deleteUrl =
            SUPABASE_URL.replace(
                /\/$/,
                ""
            ) +
            "/storage/v1/object/remove";


        const response =
            await fetch(
                deleteUrl,
                {
                    method: "POST",

                    headers: {

                        "Authorization":
                            "Bearer " +
                            SUPABASE_SERVICE_ROLE_KEY,

                        "apikey":
                            SUPABASE_SERVICE_ROLE_KEY,

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            prefixes: [
                                PAYMENT_PROOF_BUCKET +
                                "/" +
                                storagePath
                            ]
                        })
                }
            );


        if (!response.ok) {

            console.error(
                "SUPABASE STORAGE DELETE FAILED:",
                await response.text()
            );
        }

    } catch (error) {

        console.error(
            "SUPABASE STORAGE DELETE ERROR:",
            error
        );
    }
}


/* =========================================================
   SUPABASE STORAGE SIGNED URL
========================================================= */

async function createSignedUrl(
    storagePath,
    expiresIn = 300
) {

    if (
        !storageConfigured() ||
        !storagePath
    ) {

        throw new Error(
            "Supabase Storage is not configured."
        );
    }


    const signUrl =
        SUPABASE_URL.replace(
            /\/$/,
            ""
        ) +
        "/storage/v1/object/sign/" +
        encodeURIComponent(
            PAYMENT_PROOF_BUCKET
        ) +
        "/" +
        storagePath
            .split("/")
            .map(
                encodeURIComponent
            )
            .join("/");


    const response =
        await fetch(
            signUrl,
            {
                method: "POST",

                headers: {

                    "Authorization":
                        "Bearer " +
                        SUPABASE_SERVICE_ROLE_KEY,

                    "apikey":
                        SUPABASE_SERVICE_ROLE_KEY,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        expiresIn:
                            expiresIn
                    })
            }
        );


    if (!response.ok) {

        throw new Error(
            "Unable to create payment proof URL: " +
            await response.text()
        );
    }


    const data =
        await response.json();


    if (!data.signedURL) {

        throw new Error(
            "Supabase did not return a signed URL."
        );
    }


    return (
        SUPABASE_URL.replace(
            /\/$/,
            ""
        ) +
        "/storage/v1" +
        data.signedURL
    );
}


/* =========================================================
   GET /api/application-payment/proof/:id
   CUSTOMER / ADMIN
   OPEN PAYMENT PROOF
========================================================= */

router.get(
    "/proof/:id",
    requireAuth,
    async (req, res) => {

        try {

            const paymentId =
                normalizeId(
                    req.params.id
                );


            if (!paymentId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment ID."
                });
            }


            /* -------------------------------------------------
               PAYMENT + OWNER
            ------------------------------------------------- */

            const result =
                await pool.query(
                    `
                    SELECT
                        p.id,
                        p.proof_file,
                        a.user_id
                    FROM payments p
                    INNER JOIN applications a
                        ON a.id = p.application_id
                    WHERE p.id = $1
                    LIMIT 1
                    `,
                    [paymentId]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment not found."
                });
            }


            const row =
                result.rows[0];


            /* -------------------------------------------------
               OWNERSHIP
            ------------------------------------------------- */

            if (
                req.user.role !== "admin" &&
                Number(row.user_id) !==
                    Number(req.user.id)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to view this payment proof."
                });
            }


            if (!row.proof_file) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment proof not found."
                });
            }


            /* -------------------------------------------------
               CREATE TEMPORARY SIGNED URL
            ------------------------------------------------- */

            const signedUrl =
                await createSignedUrl(
                    row.proof_file,
                    300
                );


            /*
               Redirecting keeps this endpoint easy to use
               from an existing frontend/admin link.
            */

            return res.redirect(
                signedUrl
            );

        } catch (error) {

            console.error(
                "PAYMENT PROOF ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to open payment proof."
            });
        }
    }
);


/* =========================================================
   POST /api/application-payment
   CUSTOMER PAYMENT SUBMISSION
========================================================= */

router.post(
    "/",
    requireAuth,
    upload.single("paymentProof"),
    async (req, res) => {

        let client = null;
        let uploadedStoragePath = null;


        try {

            /* -------------------------------------------------
               STORAGE CONFIG
            ------------------------------------------------- */

            if (!storageConfigured()) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Payment storage is not configured on the server."
                });
            }


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
                        "Only customer accounts can submit payments."
                });
            }


            /* -------------------------------------------------
               APPLICATION ID
            ------------------------------------------------- */

            const applicationId =
                normalizeId(
                    req.body?.applicationId ||
                    req.body?.application_id
                );


            if (!applicationId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Valid Application ID is required."
                });
            }


            /* -------------------------------------------------
               PAYMENT METHOD
            ------------------------------------------------- */

            const paymentMethod =
                cleanString(
                    req.body?.paymentMethod ||
                    req.body?.payment_method
                ).toLowerCase();


            const allowedMethods = [
                "bitcoin",
                "paypal"
            ];


            if (
                !allowedMethods.includes(
                    paymentMethod
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment method."
                });
            }


            /* -------------------------------------------------
               PAYMENT REFERENCE
            ------------------------------------------------- */

            const paymentReference =
                cleanString(
                    req.body?.paymentReference ||
                    req.body?.payment_reference ||
                    req.body?.transactionId ||
                    req.body?.transaction_id
                );


            if (!paymentReference) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment reference is required."
                });
            }


            /* -------------------------------------------------
               OPTIONAL MESSAGE
            ------------------------------------------------- */

            const message =
                cleanString(
                    req.body?.message
                );


            /* -------------------------------------------------
               PAYMENT PROOF
            ------------------------------------------------- */

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment proof is required."
                });
            }


            /* -------------------------------------------------
               CHECK APPLICATION OWNERSHIP
            ------------------------------------------------- */

            const applicationResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        status
                    FROM applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [applicationId]
                );


            if (
                applicationResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."
                });
            }


            const application =
                applicationResult.rows[0];


            if (
                Number(application.user_id) !==
                Number(req.user.id)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to make payment for this application."
                });
            }


            /* -------------------------------------------------
               PREVENT PAYMENT FOR REJECTED APPLICATION
            ------------------------------------------------- */

            if (
                application.status ===
                "rejected"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment cannot be submitted for a rejected application."
                });
            }


            /* -------------------------------------------------
               CHECK DUPLICATE PAYMENT REFERENCE
            ------------------------------------------------- */

            const duplicateResult =
                await pool.query(
                    `
                    SELECT id
                    FROM payments
                    WHERE payment_reference = $1
                    LIMIT 1
                    `,
                    [paymentReference]
                );


            if (
                duplicateResult.rows.length > 0
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "This payment reference has already been submitted."
                });
            }


            /* -------------------------------------------------
               UPLOAD TO SUPABASE STORAGE
            ------------------------------------------------- */

            const uploaded =
                await uploadToSupabaseStorage(
                    req.file
                );


            uploadedStoragePath =
                uploaded.storagePath;


            /* -------------------------------------------------
               TRANSACTION
            ------------------------------------------------- */

            client =
                await pool.connect();


            await client.query(
                "BEGIN"
            );


            /* -------------------------------------------------
               INSERT PAYMENT
            ------------------------------------------------- */

            const paymentResult =
                await client.query(
                    `
                    INSERT INTO payments
                    (
                        application_id,
                        payment_method,
                        payment_reference,
                        message,
                        proof_file,
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
                        'pending',
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    RETURNING
                        id,
                        application_id,
                        payment_method,
                        payment_reference,
                        message,
                        proof_file,
                        status,
                        created_at,
                        updated_at
                    `,
                    [
                        applicationId,
                        paymentMethod,
                        paymentReference,
                        message,
                        uploadedStoragePath
                    ]
                );


            const payment =
                paymentResult.rows[0];


            /* -------------------------------------------------
               UPDATE APPLICATION STATUS
            ------------------------------------------------- */

            await client.query(
                `
                UPDATE applications
                SET
                    status = 'payment_submitted',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [applicationId]
            );


            await client.query(
                "COMMIT"
            );


            /* -------------------------------------------------
               SUCCESS
            ------------------------------------------------- */

            return res.status(201).json({

                success: true,

                message:
                    "Payment details submitted successfully.",

                payment: {

                    id:
                        Number(payment.id),

                    applicationId:
                        Number(payment.application_id),

                    paymentMethod:
                        payment.payment_method,

                    paymentReference:
                        payment.payment_reference,

                    message:
                        payment.message,

                    /*
                       This is now a backend proof endpoint,
                       not a Render local file path.
                    */

                    proofFile:
                        "/api/application-payment/proof/" +
                        Number(payment.id),

                    status:
                        payment.status,

                    createdAt:
                        payment.created_at,

                    updatedAt:
                        payment.updated_at
                }
            });

        } catch (error) {

            /* -------------------------------------------------
               ROLLBACK
            ------------------------------------------------- */

            if (client) {

                try {

                    await client.query(
                        "ROLLBACK"
                    );

                } catch (rollbackError) {

                    console.error(
                        "PAYMENT ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }


            /* -------------------------------------------------
               DELETE SUPABASE FILE IF DB FAILED
            ------------------------------------------------- */

            if (uploadedStoragePath) {

                await deleteFromSupabaseStorage(
                    uploadedStoragePath
                );
            }


            console.error(
                "PAYMENT SUBMISSION ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to submit payment details."
            });

        } finally {

            if (client) {

                client.release();
            }
        }
    }
);


/* =========================================================
   GET /api/application-payment/:id
   CUSTOMER / ADMIN - SINGLE PAYMENT
========================================================= */

router.get(
    "/:id",
    requireAuth,
    async (req, res) => {

        try {

            const paymentId =
                normalizeId(
                    req.params.id
                );


            if (!paymentId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment ID."
                });
            }


            const result =
                await pool.query(
                    `
                    SELECT
                        p.id,
                        p.application_id,
                        p.payment_method,
                        p.payment_reference,
                        p.message,
                        p.proof_file,
                        p.status,
                        p.created_at,
                        p.updated_at,
                        a.user_id
                    FROM payments p
                    INNER JOIN applications a
                        ON a.id = p.application_id
                    WHERE p.id = $1
                    LIMIT 1
                    `,
                    [paymentId]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment not found."
                });
            }


            const row =
                result.rows[0];


            /* -------------------------------------------------
               OWNERSHIP
            ------------------------------------------------- */

            if (
                req.user.role !== "admin" &&
                Number(row.user_id) !==
                    Number(req.user.id)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to view this payment."
                });
            }


            return res.json({

                success: true,

                payment: {

                    id:
                        Number(row.id),

                    applicationId:
                        Number(row.application_id),

                    paymentMethod:
                        row.payment_method,

                    paymentReference:
                        row.payment_reference,

                    message:
                        row.message,

                    proofFile:
                        "/api/application-payment/proof/" +
                        Number(row.id),

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
                "GET PAYMENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load payment."
            });
        }
    }
);


/* =========================================================
   GET /api/application-payment/application/:id
   CUSTOMER / ADMIN - PAYMENTS FOR APPLICATION
========================================================= */

router.get(
    "/application/:id",
    requireAuth,
    async (req, res) => {

        try {

            const applicationId =
                normalizeId(
                    req.params.id
                );


            if (!applicationId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid Application ID."
                });
            }


            /* -------------------------------------------------
               APPLICATION
            ------------------------------------------------- */

            const applicationResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id
                    FROM applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [applicationId]
                );


            if (
                applicationResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."
                });
            }


            const application =
                applicationResult.rows[0];


            if (
                req.user.role !== "admin" &&
                Number(application.user_id) !==
                    Number(req.user.id)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to view these payments."
                });
            }


            /* -------------------------------------------------
               PAYMENTS
            ------------------------------------------------- */

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        application_id,
                        payment_method,
                        payment_reference,
                        message,
                        proof_file,
                        status,
                        created_at,
                        updated_at
                    FROM payments
                    WHERE application_id = $1
                    ORDER BY created_at DESC
                    `,
                    [applicationId]
                );


            const payments =
                result.rows.map(
                    row => ({

                        id:
                            Number(row.id),

                        applicationId:
                            Number(row.application_id),

                        paymentMethod:
                            row.payment_method,

                        paymentReference:
                            row.payment_reference,

                        message:
                            row.message,

                        proofFile:
                            "/api/application-payment/proof/" +
                            Number(row.id),

                        status:
                            row.status,

                        createdAt:
                            row.created_at,

                        updatedAt:
                            row.updated_at
                    })
                );


            return res.json({

                success: true,

                payments
            });

        } catch (error) {

            console.error(
                "GET APPLICATION PAYMENTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load application payments."
            });
        }
    }
);


/* =========================================================
   GET /api/application-payment
   ADMIN - ALL PAYMENTS
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
                        p.id,
                        p.application_id,
                        p.payment_method,
                        p.payment_reference,
                        p.message,
                        p.proof_file,
                        p.status,
                        p.created_at,
                        p.updated_at,
                        a.user_id
                    FROM payments p
                    LEFT JOIN applications a
                        ON a.id = p.application_id
                    ORDER BY p.created_at DESC
                    `
                );


            const payments =
                result.rows.map(
                    row => ({

                        id:
                            Number(row.id),

                        applicationId:
                            Number(row.application_id),

                        userId:
                            row.user_id !== null
                                ? Number(row.user_id)
                                : null,

                        paymentMethod:
                            row.payment_method,

                        paymentReference:
                            row.payment_reference,

                        message:
                            row.message,

                        proofFile:
                            "/api/application-payment/proof/" +
                            Number(row.id),

                        status:
                            row.status,

                        createdAt:
                            row.created_at,

                        updatedAt:
                            row.updated_at
                    })
                );


            return res.json({

                success: true,

                payments
            });

        } catch (error) {

            console.error(
                "GET ALL PAYMENTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load payments."
            });
        }
    }
);


/* =========================================================
   PATCH /api/application-payment/:id/status
   ADMIN - UPDATE PAYMENT STATUS
========================================================= */

router.patch(
    "/:id/status",
    requireAdmin,
    async (req, res) => {

        try {

            const paymentId =
                normalizeId(
                    req.params.id
                );


            if (!paymentId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment ID."
                });
            }


            const status =
                cleanString(
                    req.body?.status
                ).toLowerCase();


            const allowedStatuses = [
                "pending",
                "submitted",
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
                        "Invalid payment status.",

                    allowedStatuses
                });
            }


            const result =
                await pool.query(
                    `
                    UPDATE payments
                    SET
                        status = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    RETURNING
                        id,
                        application_id,
                        status,
                        updated_at
                    `,
                    [
                        status,
                        paymentId
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment not found."
                });
            }


            const payment =
                result.rows[0];


            return res.json({

                success: true,

                message:
                    "Payment status updated successfully.",

                paymentId:
                    Number(payment.id),

                applicationId:
                    Number(payment.application_id),

                status:
                    payment.status,

                updatedAt:
                    payment.updated_at
            });

        } catch (error) {

            console.error(
                "UPDATE PAYMENT STATUS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to update payment status."
            });
        }
    }
);


/* =========================================================
   ERROR HANDLER FOR MULTER
========================================================= */

router.use(
    (error, req, res, next) => {

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
                        "Payment proof must be 5MB or smaller."
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
                "Only JPG"
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
   EXPORT
========================================================= */

module.exports =
    router;
