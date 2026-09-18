/* =========================================================
   U.S TRAVEL & TOURS
   PAYMENT MODULE
   MongoDB Version
========================================================= */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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
   PAYMENT CONFIG
========================================================= */

const PAYMENT_ENDPOINT =
    "https://us-travel.onrender.com/api/application-payment";


/* =========================================================
   PAYMENT PROOF DIRECTORY
========================================================= */

const proofDirectory = path.join(
    __dirname,
    "data",
    "payment-proofs"
);

if (!fs.existsSync(proofDirectory)) {
    fs.mkdirSync(proofDirectory, {
        recursive: true
    });
}


/* =========================================================
   MULTER STORAGE
========================================================= */

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(
            null,
            proofDirectory
        );

    },

    filename: function (req, file, cb) {

        const extension =
            path.extname(file.originalname)
                .toLowerCase();

        const uniqueName =
            "payment-" +
            Date.now() +
            "-" +
            Math.round(
                Math.random() * 1000000
            ) +
            extension;

        cb(
            null,
            uniqueName
        );

    }

});


/* =========================================================
   FILE FILTER
========================================================= */

const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf"
];

const upload = multer({

    storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (
        req,
        file,
        cb
    ) {

        const extension =
            path.extname(
                file.originalname
            ).toLowerCase();

        if (
            !allowedExtensions.includes(
                extension
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

});


/* =========================================================
   HELPERS
========================================================= */

function cleanString(
    value,
    maxLength = 500
) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value)
        .trim()
        .slice(0, maxLength);

}


function parseApplication(
    application
) {

    if (
        !application ||
        typeof application !== "object"
    ) {
        return null;
    }

    return application;

}


function getApplicationIdFromBody(
    body
) {

    const raw =
        body.applicationId ??
        body.application_id ??
        body.application ??
        "";

    const id =
        Number(raw);

    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {
        return null;
    }

    return id;

}


function getPaymentMethod(
    body
) {

    return cleanString(
        body.paymentMethod ??
        body.payment_method,
        50
    ).toLowerCase();

}


function getPaymentReference(
    body
) {

    return cleanString(
        body.paymentReference ??
        body.payment_reference ??
        body.reference,
        200
    );

}


function getMessage(
    body
) {

    return cleanString(
        body.message,
        2000
    );

}


function safeFileName(
    value
) {

    if (!value) {
        return "";
    }

    return path.basename(
        String(value)
    );

}


/* =========================================================
   FIND APPLICATION
========================================================= */

async function findApplication(
    applicationId,
    applicationData
) {

    const db =
        getDatabase();

    const applications =
        db.collection(
            "applications"
        );


    /* -----------------------------------------------------
       FIRST: FIND BY APPLICATION ID
    ----------------------------------------------------- */

    if (applicationId) {

        const application =
            await applications.findOne({
                id: applicationId
            });

        if (application) {
            return application;
        }

    }


    /* -----------------------------------------------------
       FALLBACK: FIND USING PASSPORT NUMBER
    ----------------------------------------------------- */

    const parsed =
        parseApplication(
            applicationData
        );

    if (!parsed) {
        return null;
    }

    const passportNumber =
        cleanString(
            parsed.passportNumber ??
            parsed.passport_number,
            100
        );

    if (!passportNumber) {
        return null;
    }


    const allApplications =
        await applications
            .find({})
            .sort({
                id: -1
            })
            .toArray();


    for (
        const application
        of allApplications
    ) {

        let data = {};

        try {

            data =
                typeof application.application_data === "string"
                    ? JSON.parse(
                        application.application_data
                    )
                    : (
                        application.application_data ||
                        {}
                    );

        } catch (error) {

            data = {};

        }


        const storedPassport =
            cleanString(
                data.passportNumber ??
                data.passport_number,
                100
            );


        if (
            storedPassport &&
            storedPassport.toLowerCase() ===
            passportNumber.toLowerCase()
        ) {

            return application;

        }

    }


    return null;

}


/* =========================================================
   SUBMIT PAYMENT
========================================================= */

router.post(
    "/",
    requireAuth,
    upload.single("paymentProof"),
    async function (
        req,
        res
    ) {

        let uploadedFilePath = null;

        try {

            const db =
                getDatabase();

            const applications =
                db.collection(
                    "applications"
                );

            const payments =
                db.collection(
                    "payments"
                );


            /* -------------------------------------------------
               FILE PATH
            ------------------------------------------------- */

            if (
                req.file &&
                req.file.path
            ) {

                uploadedFilePath =
                    req.file.path;

            }


            /* -------------------------------------------------
               PAYMENT INPUT
            ------------------------------------------------- */

            const applicationId =
                getApplicationIdFromBody(
                    req.body || {}
                );

            const paymentMethod =
                getPaymentMethod(
                    req.body || {}
                );

            const paymentReference =
                getPaymentReference(
                    req.body || {}
                );

            const message =
                getMessage(
                    req.body || {}
                );


            let applicationData =
                req.body.applicationData ||
                req.body.application_data ||
                null;


            if (
                typeof applicationData ===
                "string"
            ) {

                try {

                    applicationData =
                        JSON.parse(
                            applicationData
                        );

                } catch (error) {

                    applicationData = null;

                }

            }


            /* -------------------------------------------------
               VALIDATION
            ------------------------------------------------- */

            if (
                !paymentMethod
            ) {

                if (
                    uploadedFilePath &&
                    fs.existsSync(
                        uploadedFilePath
                    )
                ) {

                    fs.unlinkSync(
                        uploadedFilePath
                    );

                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment method is required."

                });

            }


            const normalizedMethod =
                paymentMethod
                    .replace(/\s+/g, "")
                    .toLowerCase();


            const allowedMethods = [
                "bitcoin",
                "paypal"
            ];


            if (
                !allowedMethods.includes(
                    normalizedMethod
                )
            ) {

                if (
                    uploadedFilePath &&
                    fs.existsSync(
                        uploadedFilePath
                    )
                ) {

                    fs.unlinkSync(
                        uploadedFilePath
                    );

                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment method."

                });

            }


            if (
                !paymentReference
            ) {

                if (
                    uploadedFilePath &&
                    fs.existsSync(
                        uploadedFilePath
                    )
                ) {

                    fs.unlinkSync(
                        uploadedFilePath
                    );

                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment reference is required."

                });

            }


            if (
                !req.file
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment proof is required."

                });

            }


            /* -------------------------------------------------
               FIND APPLICATION
            ------------------------------------------------- */

            const application =
                await findApplication(
                    applicationId,
                    applicationData
                );


            if (
                !application
            ) {

                if (
                    uploadedFilePath &&
                    fs.existsSync(
                        uploadedFilePath
                    )
                ) {

                    fs.unlinkSync(
                        uploadedFilePath
                    );

                }

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


            /* -------------------------------------------------
               OWNERSHIP CHECK
            ------------------------------------------------- */

            if (
                req.user.role !== "admin" &&
                Number(application.user_id) !==
                    Number(req.user.id)
            ) {

                if (
                    uploadedFilePath &&
                    fs.existsSync(
                        uploadedFilePath
                    )
                ) {

                    fs.unlinkSync(
                        uploadedFilePath
                    );

                }

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not authorized to submit payment for this application."

                });

            }


            /* -------------------------------------------------
               DUPLICATE PAYMENT REFERENCE
            ------------------------------------------------- */

            const duplicate =
                await payments.findOne({

                    payment_reference:
                        paymentReference

                });


            if (
                duplicate
            ) {

                if (
                    uploadedFilePath &&
                    fs.existsSync(
                        uploadedFilePath
                    )
                ) {

                    fs.unlinkSync(
                        uploadedFilePath
                    );

                }

                return res.status(409).json({

                    success: false,

                    message:
                        "This payment reference has already been submitted."

                });

            }


            /* -------------------------------------------------
               PAYMENT ID
            ------------------------------------------------- */

            const paymentId =
                await getNextSequence(
                    "payments"
                );


            /* -------------------------------------------------
               PAYMENT DOCUMENT
            ------------------------------------------------- */

            const now =
                new Date();


            const paymentDocument = {

                id:
                    paymentId,

                application_id:
                    Number(application.id),

                user_id:
                    Number(application.user_id),

                payment_method:
                    normalizedMethod,

                payment_reference:
                    paymentReference,

                message:
                    message,

                proof_file:
                    req.file
                        ? req.file.filename
                        : null,

                proof_original_name:
                    req.file
                        ? cleanString(
                            req.file.originalname,
                            255
                        )
                        : null,

                proof_mime_type:
                    req.file
                        ? cleanString(
                            req.file.mimetype,
                            100
                        )
                        : null,

                proof_size:
                    req.file
                        ? Number(
                            req.file.size
                        )
                        : 0,

                status:
                    "pending",

                created_at:
                    now,

                updated_at:
                    now

            };


            /* -------------------------------------------------
               INSERT PAYMENT
            ------------------------------------------------- */

            await payments.insertOne(
                paymentDocument
            );


            /* -------------------------------------------------
               UPDATE APPLICATION STATUS
            ------------------------------------------------- */

            await applications.updateOne(

                {
                    id:
                        Number(
                            application.id
                        )
                },

                {
                    $set: {

                        status:
                            "payment_submitted",

                        updated_at:
                            now

                    }

                }

            );


            /* -------------------------------------------------
               RESPONSE
            ------------------------------------------------- */

            return res.status(201).json({

                success: true,

                message:
                    "Payment details submitted successfully.",

                paymentId:
                    paymentId,

                applicationId:
                    Number(
                        application.id
                    ),

                paymentMethod:
                    normalizedMethod,

                status:
                    "pending"

            });

        } catch (error) {

            console.error(
                "PAYMENT SUBMISSION ERROR:",
                error
            );


            if (
                uploadedFilePath &&
                fs.existsSync(
                    uploadedFilePath
                )
            ) {

                try {

                    fs.unlinkSync(
                        uploadedFilePath
                    );

                } catch (
                    deleteError
                ) {

                    console.error(
                        "Unable to remove uploaded payment proof:",
                        deleteError
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


/* =========================================================
   GET PAYMENT BY ID
========================================================= */

router.get(
    "/:id",
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

                    success: false,

                    message:
                        "Invalid payment ID."

                });

            }


            const db =
                getDatabase();

            const payments =
                db.collection(
                    "payments"
                );


            const payment =
                await payments.findOne({
                    id: id
                });


            if (
                !payment
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment not found."

                });

            }


            if (
                req.user.role !== "admin" &&
                Number(payment.user_id) !==
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
                        payment.id,

                    applicationId:
                        payment.application_id,

                    userId:
                        payment.user_id,

                    paymentMethod:
                        payment.payment_method,

                    paymentReference:
                        payment.payment_reference,

                    message:
                        payment.message || "",

                    proofFile:
                        payment.proof_file || null,

                    proofOriginalName:
                        payment.proof_original_name ||
                        null,

                    status:
                        payment.status,

                    createdAt:
                        payment.created_at,

                    updatedAt:
                        payment.updated_at

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
   GET PAYMENTS FOR APPLICATION
========================================================= */

router.get(
    "/application/:applicationId",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const applicationId =
                Number(
                    req.params.applicationId
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

            const applications =
                db.collection(
                    "applications"
                );

            const payments =
                db.collection(
                    "payments"
                );


            const application =
                await applications.findOne({

                    id:
                        applicationId

                });


            if (
                !application
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Application not found."

                });

            }


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


            const paymentList =
                await payments
                    .find({
                        application_id:
                            applicationId
                    })
                    .sort({
                        id: -1
                    })
                    .toArray();


            return res.json({

                success: true,

                payments:
                    paymentList.map(
                        function (
                            payment
                        ) {

                            return {

                                id:
                                    payment.id,

                                applicationId:
                                    payment.application_id,

                                paymentMethod:
                                    payment.payment_method,

                                paymentReference:
                                    payment.payment_reference,

                                message:
                                    payment.message ||
                                    "",

                                proofFile:
                                    payment.proof_file ||
                                    null,

                                proofOriginalName:
                                    payment.proof_original_name ||
                                    null,

                                status:
                                    payment.status,

                                createdAt:
                                    payment.created_at,

                                updatedAt:
                                    payment.updated_at

                            };

                        }
                    )

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
   ADMIN - UPDATE PAYMENT STATUS
========================================================= */

router.patch(
    "/:id/status",
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

            const status =
                cleanString(
                    req.body?.status,
                    50
                ).toLowerCase();


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment ID."

                });

            }


            const allowedStatuses = [
                "pending",
                "verified",
                "rejected"
            ];


            if (
                !allowedStatuses.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment status."

                });

            }


            const db =
                getDatabase();

            const payments =
                db.collection(
                    "payments"
                );

            const applications =
                db.collection(
                    "applications"
                );


            const payment =
                await payments.findOne({
                    id: id
                });


            if (
                !payment
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment not found."

                });

            }


            const now =
                new Date();


            await payments.updateOne(

                {
                    id: id
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


            /* -------------------------------------------------
               UPDATE APPLICATION STATUS
            ------------------------------------------------- */

            let applicationStatus =
                null;


            if (
                status === "verified"
            ) {

                applicationStatus =
                    "under_review";

            } else if (
                status === "rejected"
            ) {

                applicationStatus =
                    "payment_pending";

            } else if (
                status === "pending"
            ) {

                applicationStatus =
                    "payment_submitted";

            }


            if (
                applicationStatus
            ) {

                await applications.updateOne(

                    {
                        id:
                            Number(
                                payment.application_id
                            )
                    },

                    {
                        $set: {

                            status:
                                applicationStatus,

                            updated_at:
                                now

                        }

                    }

                );

            }


            const updatedPayment =
                await payments.findOne({
                    id: id
                });


            return res.json({

                success: true,

                message:
                    "Payment status updated successfully.",

                payment: {

                    id:
                        updatedPayment.id,

                    applicationId:
                        updatedPayment.application_id,

                    paymentMethod:
                        updatedPayment.payment_method,

                    paymentReference:
                        updatedPayment.payment_reference,

                    status:
                        updatedPayment.status,

                    updatedAt:
                        updatedPayment.updated_at

                }

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
   ADMIN - GET ALL PAYMENTS
========================================================= */

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

            const payments =
                db.collection(
                    "payments"
                );


            const paymentList =
                await payments
                    .find({})
                    .sort({
                        id: -1
                    })
                    .toArray();


            return res.json({

                success: true,

                payments:
                    paymentList.map(
                        function (
                            payment
                        ) {

                            return {

                                id:
                                    payment.id,

                                applicationId:
                                    payment.application_id,

                                userId:
                                    payment.user_id,

                                paymentMethod:
                                    payment.payment_method,

                                paymentReference:
                                    payment.payment_reference,

                                message:
                                    payment.message ||
                                    "",

                                proofFile:
                                    payment.proof_file ||
                                    null,

                                proofOriginalName:
                                    payment.proof_original_name ||
                                    null,

                                proofMimeType:
                                    payment.proof_mime_type ||
                                    null,

                                proofSize:
                                    payment.proof_size ||
                                    0,

                                status:
                                    payment.status,

                                createdAt:
                                    payment.created_at,

                                updatedAt:
                                    payment.updated_at

                            };

                        }
                    )

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
   MULTER / UPLOAD ERROR HANDLER
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

                    success: false,

                    message:
                        "Payment proof must be 5MB or smaller."

                });

            }


            return res.status(400).json({

                success: false,

                message:
                    error.message ||
                    "Payment proof upload failed."

            });

        }


        if (
            error &&
            error.message &&
            error.message.includes(
                "Only JPG, JPEG, PNG and PDF"
            )
        ) {

            return res.status(400).json({

                success: false,

                message:
                    error.message

            });

        }


        console.error(
            "PAYMENT ROUTER ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to process payment request."

        });

    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
    router;
