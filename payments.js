const PAYMENT_ENDPOINT =
    "https://u-s-travel-tours-1.onrender.com/api/application-payment";
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { db } = require("./database");
const {
    requireAuth,
    requireAdmin
} = require("./auth");

// =========================================================
// U.S TRAVEL & TOURS
// PAYMENT BACKEND
// Bitcoin + PayPal
// =========================================================

// ---------------------------------------------------------
// PAYMENT PROOF UPLOAD DIRECTORY
// ---------------------------------------------------------

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "payment-proofs");

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------------------------------------------------------
// MULTER STORAGE
// ---------------------------------------------------------

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },

    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname).toLowerCase();

        const uniqueName =
            `payment-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

        cb(null, uniqueName);
    }
});

// ---------------------------------------------------------
// FILE VALIDATION
// ---------------------------------------------------------

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        const allowedExtensions = [
            ".jpg",
            ".jpeg",
            ".png",
            ".pdf"
        ];

        const extension =
            path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            return cb(
                new Error(
                    "Only JPG, JPEG, PNG and PDF files are allowed."
                )
            );
        }

        cb(null, true);
    }
});

// =========================================================
// SAVE PAYMENT
// POST /api/application-payment
// =========================================================

router.post(
    "/",
    requireAuth,
    upload.single("paymentProof"),
    (req, res) => {

        try {

            const {
                application,
                paymentMethod,
                paymentReference,
                message
            } = req.body;

            // -------------------------------------------------
            // APPLICATION VALIDATION
            // -------------------------------------------------

            if (!application) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(400).json({
                    success: false,
                    message:
                        "Application information is required."
                });
            }

            let applicationData;

            try {

                applicationData =
                    typeof application === "string"
                        ? JSON.parse(application)
                        : application;

            } catch (error) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid application information."
                });
            }

            // -------------------------------------------------
            // PAYMENT METHOD
            // -------------------------------------------------

            const allowedMethods = [
                "bitcoin",
                "paypal"
            ];

            if (!allowedMethods.includes(paymentMethod)) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid payment method. Use Bitcoin or PayPal."
                });
            }

            // -------------------------------------------------
            // PAYMENT REFERENCE
            // -------------------------------------------------

            if (
                !paymentReference ||
                String(paymentReference).trim() === ""
            ) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment reference is required."
                });
            }

            const cleanReference =
                String(paymentReference).trim();

            // -------------------------------------------------
            // FIND APPLICATION
            // -------------------------------------------------

            let applicationId = null;

            // Frontend may send applicationId
            if (applicationData.applicationId) {

                const possibleId =
                    Number(applicationData.applicationId);

                if (
                    Number.isInteger(possibleId) &&
                    possibleId > 0
                ) {
                    applicationId = possibleId;
                }
            }

            // -------------------------------------------------
            // IF NO ID, MATCH USING PASSPORT NUMBER
            // -------------------------------------------------

            if (!applicationId) {

                const submittedPassport =
                    String(
                        applicationData.passportNumber || ""
                    )
                    .trim()
                    .toLowerCase();

                if (submittedPassport) {

                    const applications = db.prepare(`
                        SELECT
                            id,
                            application_data
                        FROM applications
                        ORDER BY id DESC
                    `).all();

                    for (const item of applications) {

                        try {

                            const savedData =
                                JSON.parse(
                                    item.application_data
                                );

                            const savedPassport =
                                String(
                                    savedData.passportNumber || ""
                                )
                                .trim()
                                .toLowerCase();

                            if (
                                savedPassport &&
                                savedPassport ===
                                submittedPassport
                            ) {

                                applicationId = item.id;
                                break;
                            }

                        } catch (error) {
                            // Ignore invalid application JSON
                        }
                    }
                }
            }

            // -------------------------------------------------
            // APPLICATION MUST EXIST
            // -------------------------------------------------

            if (!applicationId) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(404).json({
                    success: false,
                    message:
                        "Application was not found. Please submit the application again."
                });
            }

            const existingApplication = db.prepare(`
    SELECT
        id,
        user_id
    FROM applications
    WHERE id = ?
`).get(applicationId);

if (!existingApplication) {

    if (req.file) {
        fs.unlinkSync(req.file.path);
    }

    return res.status(404).json({
        success: false,
        message: "Application not found."
    });
}

if (
    req.user.role !== "admin" &&
    Number(existingApplication.user_id) !== Number(req.user.id)
) {

    if (req.file) {
        fs.unlinkSync(req.file.path);
    }

    return res.status(403).json({
        success: false,
        message:
            "You are not authorized to submit payment for this application."
    });
}

            if (!existingApplication) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(404).json({
                    success: false,
                    message:
                        "Application not found."
                });
            }

            // -------------------------------------------------
            // DUPLICATE PAYMENT REFERENCE CHECK
            // -------------------------------------------------

            const duplicatePayment = db.prepare(`
                SELECT
                    id
                FROM payments
                WHERE payment_reference = ?
            `).get(cleanReference);

            if (duplicatePayment) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(409).json({
                    success: false,
                    message:
                        "This payment reference has already been submitted."
                });
            }

            // -------------------------------------------------
            // PAYMENT PROOF FILE
            // -------------------------------------------------

            let proofFile = null;

            if (req.file) {
                proofFile = req.file.filename;
            }

            // -------------------------------------------------
            // DATABASE TRANSACTION
            // -------------------------------------------------

            const savePayment = db.transaction(() => {

                const insertPayment = db.prepare(`
                    INSERT INTO payments (
                        application_id,
                        payment_method,
                        payment_reference,
                        message,
                        proof_file,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                const paymentResult =
                    insertPayment.run(
                        applicationId,
                        paymentMethod,
                        cleanReference,
                        message
                            ? String(message).trim()
                            : null,
                        proofFile,
                        "pending"
                    );

                const paymentId =
                    paymentResult.lastInsertRowid;

                db.prepare(`
                    UPDATE applications
                    SET
                        status = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    "payment_submitted",
                    applicationId
                );

                return paymentId;
            });

            const paymentId = savePayment();

            // -------------------------------------------------
            // SUCCESS LOG
            // -------------------------------------------------

            console.log(
                "----------------------------------------------"
            );

            console.log(
                `Payment submitted successfully.`
            );

            console.log(
                `Payment ID: ${paymentId}`
            );

            console.log(
                `Application ID: ${applicationId}`
            );

            console.log(
                `Payment Method: ${paymentMethod}`
            );

            console.log(
                "----------------------------------------------"
            );

            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            return res.status(201).json({

                success: true,

                message:
    "Payment details submitted successfully. Your payment is pending verification.",

                paymentId: paymentId,

                applicationId: applicationId,

                paymentMethod: paymentMethod,

                status: "pending"
            });

        } catch (error) {

            console.error(
                "Payment submission error:",
                error
            );

            // Remove uploaded file if database operation fails
            if (req.file) {

                try {
                    if (fs.existsSync(req.file.path)) {
                        fs.unlinkSync(req.file.path);
                    }
                } catch (fileError) {
                    console.error(
                        "Unable to remove uploaded payment proof:",
                        fileError
                    );
                }
            }

            return res.status(500).json({
                success: false,
                message:
                    "Unable to submit payment details. Please try again."
            });
        }
    }
);

// =========================================================
// GET PAYMENT BY ID
// GET /api/payments/:id
// =========================================================

router.get("/:id", requireAuth, (req, res) => {

    try {

        const paymentId =
            Number(req.params.id);

        if (
            !Number.isInteger(paymentId) ||
            paymentId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid payment ID."
            });
        }

        const payment = db.prepare(`
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
            WHERE id = ?
        `).get(paymentId);

        if (!payment) {

            return res.status(404).json({
                success: false,
                message:
                    "Payment not found."
            });
        }

        return res.json({
            success: true,
            payment: payment
        });

    } catch (error) {

        console.error(
            "Get payment error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve payment."
        });
    }
});

// =========================================================
// GET PAYMENTS FOR APPLICATION
// GET /api/payments/application/:applicationId
// =========================================================

router.get(
    "/application/:applicationId",
    requireAuth,
    (req, res) => {

        try {

            const applicationId =
                Number(req.params.applicationId);

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

            const payments = db.prepare(`
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
                WHERE application_id = ?
                ORDER BY created_at DESC
            `).all(applicationId);

            return res.json({
                success: true,
                count: payments.length,
                payments: payments
            });

        } catch (error) {

            console.error(
                "Get application payments error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve application payments."
            });
        }
    }
);

// =========================================================
// UPDATE PAYMENT STATUS
// PATCH /api/payments/:id/status
// =========================================================

router.patch(
    "/:id/status",
    requireAdmin,
    (req, res) => {

        try {

            const paymentId =
                Number(req.params.id);

            const { status } = req.body;

            const allowedStatuses = [
                "pending",
                "verified",
                "rejected"
            ];

            if (
                !Number.isInteger(paymentId) ||
                paymentId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid payment ID."
                });
            }

            if (!allowedStatuses.includes(status)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid payment status."
                });
            }

            const payment = db.prepare(`
                SELECT
                    application_id
                FROM payments
                WHERE id = ?
            `).get(paymentId);

            if (!payment) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Payment not found."
                });
            }

            let applicationStatus =
                "payment_submitted";

            if (status === "verified") {
                applicationStatus =
                    "under_review";
            }

            if (status === "rejected") {
                applicationStatus =
                    "payment_pending";
            }

            const updatePayment =
                db.transaction(() => {

                    db.prepare(`
                        UPDATE payments
                        SET
                            status = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(
                        status,
                        paymentId
                    );

                    db.prepare(`
                        UPDATE applications
                        SET
                            status = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(
                        applicationStatus,
                        payment.application_id
                    );
                });

            updatePayment();

            return res.json({
                success: true,
                message:
                    "Payment status updated successfully.",
                paymentId: paymentId,
                status: status,
                applicationStatus:
                    applicationStatus
            });

        } catch (error) {

            console.error(
                "Update payment status error:",
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

// =========================================================
// GET ALL PAYMENTS
// GET /api/payments
// =========================================================

router.get("/", requireAdmin, (req, res) => {

    try {

        const payments = db.prepare(`
            SELECT
                p.id,
                p.application_id,
                p.payment_method,
                p.payment_reference,
                p.message,
                p.proof_file,
                p.status,
                p.created_at,
                p.updated_at
            FROM payments p
            ORDER BY p.created_at DESC
        `).all();

        return res.json({
            success: true,
            count: payments.length,
            payments: payments
        });

    } catch (error) {

        console.error(
            "Get payments error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve payments."
        });
    }
});

// =========================================================
// MULTER ERROR HANDLER
// =========================================================

router.use((error, req, res, next) => {

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {

            return res.status(400).json({
                success: false,
                message:
                    "Payment proof must be 5MB or smaller."
            });
        }

        return res.status(400).json({
            success: false,
            message:
                "Payment proof upload failed."
        });
    }

    if (error) {

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                "Payment request failed."
        });
    }

    next();
});

// =========================================================
// EXPORT
// =========================================================

module.exports = router;
