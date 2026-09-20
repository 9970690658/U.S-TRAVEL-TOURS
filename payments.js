/* =========================================================
   U.S TRAVEL & TOURS
   PAYMENT ROUTES
   PostgreSQL / Supabase Version

   CUSTOMER:
   - Submit payment details
   - Upload payment proof
   - View own payment

   ADMIN:
   - View all payments
   - View payment by application
   - Update payment status
========================================================= */

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const {
    pool
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


/* =========================================================
   PAYMENT PROOF STORAGE
========================================================= */

const paymentProofDir = path.join(
    __dirname,
    "data",
    "payment-proofs"
);

if (!fs.existsSync(paymentProofDir)) {
    fs.mkdirSync(paymentProofDir, {
        recursive: true
    });
}


/* =========================================================
   MULTER STORAGE
========================================================= */

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, paymentProofDir);
    },

    filename: function (req, file, cb) {

        const extension =
            path.extname(file.originalname)
                .toLowerCase();

        const uniqueName =
            "payment-" +
            Date.now() +
            "-" +
            Math.random()
                .toString(36)
                .substring(2, 10) +
            extension;

        cb(null, uniqueName);
    }
});


/* =========================================================
   FILE FILTER
========================================================= */

function fileFilter(req, file, cb) {

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "application/pdf"
    ];

    if (!allowedTypes.includes(file.mimetype)) {

        return cb(
            new Error(
                "Only JPG, JPEG, PNG and PDF files are allowed."
            )
        );
    }

    cb(null, true);
}


const upload = multer({

    storage,

    fileFilter,

    limits: {
        fileSize: 5 * 1024 * 1024
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
   POST /api/application-payment
   CUSTOMER PAYMENT SUBMISSION
========================================================= */

router.post(
    "/",
    requireAuth,
    upload.single("paymentProof"),
    async (req, res) => {

        let client = null;
        let uploadedFile = null;

        try {

            /* -------------------------------------------------
               CUSTOMER ONLY
            ------------------------------------------------- */

            if (req.user.role !== "customer") {

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


            uploadedFile =
                req.file;


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
               PAYMENT PROOF PATH
            ------------------------------------------------- */

            const proofFile =
                path.join(
                    "data",
                    "payment-proofs",
                    req.file.filename
                );


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
                        proofFile
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

                    proofFile:
                        payment.proof_file,

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
               DELETE UPLOADED FILE IF DB FAILED
            ------------------------------------------------- */

            if (uploadedFile) {

                try {

                    if (
                        fs.existsSync(
                            uploadedFile.path
                        )
                    ) {

                        fs.unlinkSync(
                            uploadedFile.path
                        );
                    }

                } catch (fileError) {

                    console.error(
                        "PAYMENT FILE CLEANUP ERROR:",
                        fileError
                    );
                }
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


            if (result.rows.length === 0) {

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
                        row.proof_file,

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
                result.rows.map(row => ({

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
                        row.proof_file,

                    status:
                        row.status,

                    createdAt:
                        row.created_at,

                    updatedAt:
                        row.updated_at
                }));


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
                result.rows.map(row => ({

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
                        row.proof_file,

                    status:
                        row.status,

                    createdAt:
                        row.created_at,

                    updatedAt:
                        row.updated_at
                }));


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


            if (result.rows.length === 0) {

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
            error instanceof multer.MulterError
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

module.exports = router;
