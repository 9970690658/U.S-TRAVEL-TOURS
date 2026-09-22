// =========================================================
// U.S TRAVEL & TOURS
// PAYMENT BACKEND ROUTES
// PostgreSQL / Supabase
//
// IMPORTANT:
// This file is a BACKEND Express router.
// Do NOT put frontend payment JavaScript here.
//
// Mounted by server.js at:
//   /api/payments
//   /api/application-payment
//
// Payment proof is stored in the existing payments.proof_file
// PostgreSQL TEXT column as a data URL.
// =========================================================

const express = require("express");

const {
    pool
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");


const router =
    express.Router();


// =========================================================
// CONSTANTS
// =========================================================

const ALLOWED_PAYMENT_METHODS = [
    "bitcoin",
    "paypal"
];

const ALLOWED_PAYMENT_STATUSES = [
    "pending",
    "verified",
    "rejected"
];

const ALLOWED_APPLICATION_STATUSES = [
    "payment_pending",
    "payment_submitted",
    "under_review",
    "approved",
    "rejected",
    "completed"
];


// Maximum payment-proof size.
//
// Frontend currently allows 5 MB.
// We allow a little extra server-side space for multipart
// overhead and base64 conversion.
//
const MAX_PROOF_SIZE =
    5 * 1024 * 1024;


// Allowed proof MIME types.
const ALLOWED_PROOF_TYPES = [
    "image/jpeg",
    "image/png",
    "application/pdf"
];


// =========================================================
// HELPER FUNCTIONS
// =========================================================

function cleanString(
    value
) {

    if (
        value === undefined ||
        value === null
    ) {

        return "";

    }

    return String(
        value
    ).trim();

}


function normalizePaymentMethod(
    value
) {

    return cleanString(
        value
    ).toLowerCase();

}


function normalizeId(
    value
) {

    const text =
        cleanString(
            value
        );

    if (
        !/^\d+$/.test(
            text
        )
    ) {

        return null;

    }

    const number =
        Number(
            text
        );

    if (
        !Number.isSafeInteger(
            number
        ) ||
        number <= 0
    ) {

        return null;

    }

    return number;

}


// =========================================================
// AUTH USER ID HELPER
// =========================================================
//
// Supports common shapes used by auth middleware:
// req.user.id
// req.user.user_id
// req.user.userId
//
// =========================================================

function getAuthenticatedUserId(
    req
) {

    if (
        !req ||
        !req.user
    ) {

        return null;

    }

    return normalizeId(
        req.user.id ??
        req.user.user_id ??
        req.user.userId
    );

}


// =========================================================
// ADMIN CHECK HELPER
// =========================================================

function isAdminUser(
    req
) {

    if (
        !req ||
        !req.user
    ) {

        return false;

    }

    const role =
        cleanString(
            req.user.role
        ).toLowerCase();

    return role === "admin";

}


// =========================================================
// MULTIPART FORM-DATA PARSER
// =========================================================
//
// No multer dependency is required.
//
// The frontend payment page sends:
// multipart/form-data
//
// Fields include:
// applicationId
// application
// paymentMethod
// paymentReference
// message
// paymentProof
//
// This parser extracts normal fields and the payment proof,
// then stores the proof as a data URL.
//
// =========================================================

function parseMultipartFormData(
    req,
    res,
    next
) {

    const contentType =
        cleanString(
            req.headers[
                "content-type"
            ]
        );

    if (
        !contentType
            .toLowerCase()
            .startsWith(
                "multipart/form-data"
            )
    ) {

        return next();

    }


    const boundaryMatch =
        contentType.match(
            /boundary=(?:"([^"]+)"|([^;]+))/i
        );


    if (
        !boundaryMatch
    ) {

        return res.status(
            400
        ).json({

            success:
                false,

            message:
                "Invalid multipart form data."

        });

    }


    const boundary =
        boundaryMatch[1] ||
        boundaryMatch[2];


    if (
        !boundary
    ) {

        return res.status(
            400
        ).json({

            success:
                false,

            message:
                "Multipart boundary is missing."

        });

    }


    const chunks = [];

    let totalSize =
        0;


    req.on(
        "data",
        function (
            chunk
        ) {

            totalSize +=
                chunk.length;


            // Allow a small amount of multipart overhead
            // above the 5 MB proof limit.
            if (
                totalSize >
                (
                    MAX_PROOF_SIZE +
                    512 * 1024
                )
            ) {

                try {

                    req.destroy();

                } catch (
                    error
                ) {

                    // Ignore destroy errors.

                }

            }


            chunks.push(
                chunk
            );

        }
    );


    req.on(
        "error",
        function (
            error
        ) {

            console.error(
                "Multipart request error:",
                error
            );


            if (
                !res.headersSent
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Unable to read payment form."

                });

            }

        }
    );


    req.on(
        "end",
        function () {

            try {

                if (
                    totalSize >
                    (
                        MAX_PROOF_SIZE +
                        512 * 1024
                    )
                ) {

                    return res.status(
                        413
                    ).json({

                        success:
                            false,

                        message:
                            "Payment proof file is too large. Maximum allowed size is 5 MB."

                    });

                }


                const body =
                    Buffer.concat(
                        chunks
                    );


                const delimiter =
                    Buffer.from(
                        "--" +
                        boundary
                    );


                const parts = [];

                let searchStart =
                    0;


                while (
                    true
                ) {

                    const boundaryIndex =
                        body.indexOf(
                            delimiter,
                            searchStart
                        );


                    if (
                        boundaryIndex ===
                        -1
                    ) {

                        break;

                    }


                    if (
                        boundaryIndex >
                        searchStart
                    ) {

                        const part =
                            body.slice(
                                searchStart,
                                boundaryIndex
                            );

                        parts.push(
                            part
                        );

                    }


                    searchStart =
                        boundaryIndex +
                        delimiter.length;

                }


                const fields = {};

                let paymentProof =
                    null;


                for (
                    const rawPart of parts
                ) {

                    let part =
                        rawPart;


                    // Remove leading CRLF.
                    if (
                        part
                            .subarray(
                                0,
                                2
                            )
                            .toString() ===
                        "\r\n"
                    ) {

                        part =
                            part.subarray(
                                2
                            );

                    }


                    // Remove trailing CRLF.
                    if (
                        part.length >=
                        2 &&
                        part
                            .subarray(
                                part.length - 2
                            )
                            .toString() ===
                        "\r\n"
                    ) {

                        part =
                            part.subarray(
                                0,
                                part.length - 2
                            );

                    }


                    const headerEnd =
                        part.indexOf(
                            Buffer.from(
                                "\r\n\r\n"
                            )
                        );


                    if (
                        headerEnd ===
                        -1
                    ) {

                        continue;

                    }


                    const headerBuffer =
                        part.slice(
                            0,
                            headerEnd
                        );


                    const contentBuffer =
                        part.slice(
                            headerEnd + 4
                        );


                    const headers =
                        headerBuffer.toString(
                            "utf8"
                        );


                    const nameMatch =
                        headers.match(
                            /name="([^"]+)"/i
                        );


                    if (
                        !nameMatch
                    ) {

                        continue;

                    }


                    const fieldName =
                        nameMatch[1];


                    const fileNameMatch =
                        headers.match(
                            /filename="([^"]*)"/i
                        );


                    // -------------------------------------------------
                    // FILE FIELD
                    // -------------------------------------------------

                    if (
                        fileNameMatch
                    ) {

                        const fileName =
                            fileNameMatch[1];


                        if (
                            !fileName
                        ) {

                            continue;

                        }


                        const typeMatch =
                            headers.match(
                                /Content-Type:\s*([^\r\n]+)/i
                            );


                        const mimeType =
                            cleanString(
                                typeMatch
                                    ? typeMatch[1]
                                    : ""
                            ).toLowerCase();


                        if (
                            !ALLOWED_PROOF_TYPES.includes(
                                mimeType
                            )
                        ) {

                            return res.status(
                                400
                            ).json({

                                success:
                                    false,

                                message:
                                    "Invalid payment proof format. Please upload JPG, PNG, or PDF."

                            });

                        }


                        if (
                            contentBuffer.length >
                            MAX_PROOF_SIZE
                        ) {

                            return res.status(
                                413
                            ).json({

                                success:
                                    false,

                                message:
                                    "Payment proof file is too large. Maximum allowed size is 5 MB."

                            });

                        }


                        const base64 =
                            contentBuffer.toString(
                                "base64"
                            );


                        paymentProof = {

                            fileName,

                            mimeType,

                            size:
                                contentBuffer.length,

                            data:
                                `data:${mimeType};base64,${base64}`

                        };


                    } else {

                        // -------------------------------------------------
                        // NORMAL TEXT FIELD
                        // -------------------------------------------------

                        fields[
                            fieldName
                        ] =
                            contentBuffer.toString(
                                "utf8"
                            );

                    }

                }


                req.body =
                    fields;


                req.paymentProof =
                    paymentProof;


                next();

            } catch (
                error
            ) {

                console.error(
                    "Multipart parsing error:",
                    error
                );


                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Unable to process payment form."

                });

            }

        }
    );

}


// =========================================================
// APPLY MULTIPART PARSER
// =========================================================

router.use(
    parseMultipartFormData
);


// =========================================================
// SUBMIT PAYMENT
// =========================================================
//
// Available through:
//
// POST /api/payments/
// POST /api/application-payment/
//
// Customer authentication required.
//
// =========================================================

router.post(
    "/",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const userId =
                getAuthenticatedUserId(
                    req
                );


            if (
                !userId
            ) {

                return res.status(
                    401
                ).json({

                    success:
                        false,

                    message:
                        "Authenticated user could not be identified."

                });

            }


            // -------------------------------------------------
            // READ FORM VALUES
            // -------------------------------------------------

            const applicationId =
                normalizeId(
                    req.body?.applicationId ??
                    req.body?.application_id
                );


            const paymentMethod =
                normalizePaymentMethod(
                    req.body?.paymentMethod ??
                    req.body?.payment_method
                );


            const paymentReference =
                cleanString(
                    req.body?.paymentReference ??
                    req.body?.payment_reference
                );


            const message =
                cleanString(
                    req.body?.message
                );


            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (
                !applicationId
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Valid Application ID is required."

                });

            }


            if (
                !ALLOWED_PAYMENT_METHODS.includes(
                    paymentMethod
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid payment method. Please select Bitcoin or PayPal."

                });

            }


            if (
                !paymentReference
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Payment reference is required."

                });

            }


            if (
                paymentReference.length >
                500
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Payment reference is too long."

                });

            }


            if (
                message.length >
                5000
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Payment message is too long."

                });

            }


            // -------------------------------------------------
            // APPLICATION CHECK
            // -------------------------------------------------

            const applicationResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        status,
                        application_data,
                        created_at,
                        updated_at
                    FROM applications
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        applicationId
                    ]
                );


            if (
                applicationResult.rows.length ===
                0
            ) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "Application not found."

                });

            }


            const application =
                applicationResult.rows[0];


            // -------------------------------------------------
            // CUSTOMER OWNERSHIP CHECK
            // -------------------------------------------------

            if (
                !isAdminUser(req)
            ) {

                const applicationUserId =
                    normalizeId(
                        application.user_id
                    );


                if (
                    !applicationUserId ||
                    applicationUserId !==
                    userId
                ) {

                    return res.status(
                        403
                    ).json({

                        success:
                            false,

                        message:
                            "You are not authorized to submit payment for this application."

                    });

                }

            }


            // -------------------------------------------------
            // APPLICATION STATUS CHECK
            // -------------------------------------------------

            if (
                !ALLOWED_APPLICATION_STATUSES.includes(
                    cleanString(
                        application.status
                    )
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "This application is not available for payment."

                });

            }


            if (
                application.status ===
                "approved" ||
                application.status ===
                "completed"
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Payment cannot be submitted for this application at its current status."

                });

            }


            // -------------------------------------------------
            // PAYMENT PROOF
            // -------------------------------------------------

            let proofFile =
                null;


            if (
                req.paymentProof
            ) {

                proofFile =
                    req.paymentProof.data;

            }


            // -------------------------------------------------
            // OPTIONAL APPLICATION JSON
            // -------------------------------------------------
            //
            // Frontend sends the application object too.
            // We intentionally do not overwrite the original
            // application_data here because the application
            // itself is already permanently stored.
            //
            // This keeps existing application data intact.
            // -------------------------------------------------


            // -------------------------------------------------
            // PREVENT DUPLICATE ACTIVE PAYMENT
            // -------------------------------------------------

            const existingPaymentResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        status,
                        payment_method,
                        payment_reference,
                        created_at
                    FROM payments
                    WHERE application_id = $1
                    AND status = 'pending'
                    ORDER BY created_at DESC
                    LIMIT 1
                    `,
                    [
                        applicationId
                    ]
                );


            if (
                existingPaymentResult.rows.length >
                0
            ) {

                const existingPayment =
                    existingPaymentResult.rows[0];


                return res.status(
                    409
                ).json({

                    success:
                        false,

                    message:
                        "A payment submission for this application is already pending review.",

                    paymentId:
                        Number(
                            existingPayment.id
                        ),

                    status:
                        existingPayment.status

                });

            }


            // -------------------------------------------------
            // DATABASE TRANSACTION
            // -------------------------------------------------

            const client =
                await pool.connect();


            try {

                await client.query(
                    "BEGIN"
                );


                // -------------------------------------------------
                // INSERT PAYMENT
                // -------------------------------------------------

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
                            message ||
                                null,
                            proofFile,
                        ]
                    );


                const payment =
                    paymentResult.rows[0];


                // -------------------------------------------------
                // UPDATE APPLICATION STATUS
                // -------------------------------------------------

                await client.query(
                    `
                    UPDATE applications
                    SET
                        status = 'payment_submitted',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    `,
                    [
                        applicationId
                    ]
                );


                await client.query(
                    "COMMIT"
                );


                console.log(
                    "Payment submitted successfully:",
                    {
                        paymentId:
                            payment.id,

                        applicationId:
                            applicationId,

                        paymentMethod:
                            paymentMethod,

                        userId:
                            userId
                    }
                );


                return res.status(
                    201
                ).json({

                    success:
                        true,

                    message:
                        "Payment submitted successfully.",

                    paymentId:
                        Number(
                            payment.id
                        ),

                    applicationId:
                        Number(
                            payment.application_id
                        ),

                    status:
                        payment.status,

                    paymentMethod:
                        payment.payment_method,

                    paymentReference:
                        payment.payment_reference,

                    applicationStatus:
                        "payment_submitted",

                    createdAt:
                        payment.created_at

                });


            } catch (
                error
            ) {

                try {

                    await client.query(
                        "ROLLBACK"
                    );

                } catch (
                    rollbackError
                ) {

                    console.error(
                        "Payment transaction rollback error:",
                        rollbackError
                    );

                }

                throw error;

            } finally {

                client.release();

            }


        } catch (
            error
        ) {

            console.error(
                "PAYMENT SUBMISSION ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to submit payment.",

                error:
                    process.env.NODE_ENV ===
                    "development"
                        ? error.message
                        : undefined

            });

        }

    }
);


// =========================================================
// GET CUSTOMER PAYMENTS
// =========================================================
//
// GET /api/payments
//
// Customer:
//   receives only their own payments.
//
// Admin:
//   receives all payments.
//
// =========================================================

router.get(
    "/",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const userId =
                getAuthenticatedUserId(
                    req
                );


            if (
                !userId
            ) {

                return res.status(
                    401
                ).json({

                    success:
                        false,

                    message:
                        "Authenticated user could not be identified."

                });

            }


            if (
                isAdminUser(req)
            ) {

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

                            a.user_id,
                            a.application_data,
                            a.status AS application_status,

                            u.name AS user_name,
                            u.email AS user_email,
                            u.phone AS user_phone

                        FROM payments p

                        LEFT JOIN applications a
                            ON a.id = p.application_id

                        LEFT JOIN users u
                            ON u.id = a.user_id

                        ORDER BY
                            p.created_at DESC
                        `
                    );


                return res.json({

                    success:
                        true,

                    payments:
                        result.rows.map(
                            function (
                                payment
                            ) {

                                return {

                                    id:
                                        Number(
                                            payment.id
                                        ),

                                    applicationId:
                                        Number(
                                            payment.application_id
                                        ),

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
                                        payment.updated_at,

                                    userId:
                                        payment.user_id
                                            ? Number(
                                                payment.user_id
                                            )
                                            : null,

                                    userName:
                                        payment.user_name,

                                    userEmail:
                                        payment.user_email,

                                    userPhone:
                                        payment.user_phone,

                                    applicationStatus:
                                        payment.application_status,

                                    applicationData:
                                        payment.application_data

                                };

                            }
                        )

                });

            }


            // -------------------------------------------------
            // CUSTOMER
            // -------------------------------------------------

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

                        a.status AS application_status

                    FROM payments p

                    INNER JOIN applications a
                        ON a.id = p.application_id

                    WHERE a.user_id = $1

                    ORDER BY
                        p.created_at DESC
                    `,
                    [
                        userId
                    ]
                );


            return res.json({

                success:
                    true,

                payments:
                    result.rows.map(
                        function (
                            payment
                        ) {

                            return {

                                id:
                                    Number(
                                        payment.id
                                    ),

                                applicationId:
                                    Number(
                                        payment.application_id
                                    ),

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
                                    payment.updated_at,

                                applicationStatus:
                                    payment.application_status

                            };

                        }
                    )

            });


        } catch (
            error
        ) {

            console.error(
                "GET PAYMENTS ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to load payments."

            });

        }

    }
);


// =========================================================
// GET SINGLE PAYMENT
// =========================================================
//
// GET /api/payments/:id
//
// Admin can view any payment.
// Customer can view only their own payment.
//
// =========================================================

router.get(
    "/:id",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const paymentId =
                normalizeId(
                    req.params.id
                );


            if (
                !paymentId
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid payment ID."

                });

            }


            const userId =
                getAuthenticatedUserId(
                    req
                );


            if (
                !userId
            ) {

                return res.status(
                    401
                ).json({

                    success:
                        false,

                    message:
                        "Authenticated user could not be identified."

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

                        a.user_id,
                        a.status AS application_status,

                        u.name AS user_name,
                        u.email AS user_email,
                        u.phone AS user_phone

                    FROM payments p

                    INNER JOIN applications a
                        ON a.id = p.application_id

                    LEFT JOIN users u
                        ON u.id = a.user_id

                    WHERE p.id = $1

                    LIMIT 1
                    `,
                    [
                        paymentId
                    ]
                );


            if (
                result.rows.length ===
                0
            ) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "Payment not found."

                });

            }


            const payment =
                result.rows[0];


            if (
                !isAdminUser(req)
            ) {

                if (
                    normalizeId(
                        payment.user_id
                    ) !==
                    userId
                ) {

                    return res.status(
                        403
                    ).json({

                        success:
                            false,

                        message:
                            "You are not authorized to view this payment."

                    });

                }

            }


            return res.json({

                success:
                    true,

                payment: {

                    id:
                        Number(
                            payment.id
                        ),

                    applicationId:
                        Number(
                            payment.application_id
                        ),

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
                        payment.updated_at,

                    applicationStatus:
                        payment.application_status,

                    userId:
                        payment.user_id
                            ? Number(
                                payment.user_id
                            )
                            : null,

                    userName:
                        payment.user_name,

                    userEmail:
                        payment.user_email,

                    userPhone:
                        payment.user_phone

                }

            });


        } catch (
            error
        ) {

            console.error(
                "GET SINGLE PAYMENT ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to load payment."

            });

        }

    }
);


// =========================================================
// ADMIN UPDATE PAYMENT STATUS
// =========================================================
//
// PATCH /api/payments/:id/status
//
// Body:
// {
//     "status": "verified"
// }
//
// or
//
// {
//     "status": "rejected"
// }
//
// =========================================================

router.patch(
    "/:id/status",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const paymentId =
                normalizeId(
                    req.params.id
                );


            if (
                !paymentId
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid payment ID."

                });

            }


            const status =
                cleanString(
                    req.body?.status
                ).toLowerCase();


            if (
                !ALLOWED_PAYMENT_STATUSES.includes(
                    status
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid payment status."

                });

            }


            const client =
                await pool.connect();


            try {

                await client.query(
                    "BEGIN"
                );


                // -------------------------------------------------
                // GET PAYMENT + APPLICATION
                // -------------------------------------------------

                const paymentResult =
                    await client.query(
                        `
                        SELECT
                            p.id,
                            p.application_id,
                            p.status AS payment_status,

                            a.status AS application_status

                        FROM payments p

                        INNER JOIN applications a
                            ON a.id = p.application_id

                        WHERE p.id = $1

                        FOR UPDATE
                        `,
                        [
                            paymentId
                        ]
                    );


                if (
                    paymentResult.rows.length ===
                    0
                ) {

                    await client.query(
                        "ROLLBACK"
                    );


                    return res.status(
                        404
                    ).json({

                        success:
                            false,

                        message:
                            "Payment not found."

                    });

                }


                const payment =
                    paymentResult.rows[0];


                // -------------------------------------------------
                // UPDATE PAYMENT
                // -------------------------------------------------

                const updatedPaymentResult =
                    await client.query(
                        `
                        UPDATE payments

                        SET
                            status = $1,
                            updated_at = CURRENT_TIMESTAMP

                        WHERE id = $2

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
                            status,
                            paymentId
                        ]
                    );


                const updatedPayment =
                    updatedPaymentResult.rows[0];


                // -------------------------------------------------
                // UPDATE APPLICATION STATUS
                // -------------------------------------------------
                //
                // verified payment:
                //     payment_submitted -> under_review
                //
                // rejected payment:
                //     -> payment_pending
                //
                // pending payment:
                //     -> payment_submitted
                //
                // Do not overwrite an already approved/
                // completed application.
                // -------------------------------------------------

                let newApplicationStatus =
                    payment.application_status;


                if (
                    status ===
                    "verified"
                ) {

                    if (
                        payment.application_status ===
                            "payment_submitted" ||
                        payment.application_status ===
                            "payment_pending" ||
                        payment.application_status ===
                            "under_review"
                    ) {

                        newApplicationStatus =
                            "under_review";

                    }

                } else if (
                    status ===
                    "rejected"
                ) {

                    if (
                        payment.application_status !==
                            "approved" &&
                        payment.application_status !==
                            "completed"
                    ) {

                        newApplicationStatus =
                            "payment_pending";

                    }

                } else if (
                    status ===
                    "pending"
                ) {

                    if (
                        payment.application_status !==
                            "approved" &&
                        payment.application_status !==
                            "completed"
                    ) {

                        newApplicationStatus =
                            "payment_submitted";

                    }

                }


                if (
                    ALLOWED_APPLICATION_STATUSES.includes(
                        newApplicationStatus
                    )
                ) {

                    await client.query(
                        `
                        UPDATE applications

                        SET
                            status = $1,
                            updated_at = CURRENT_TIMESTAMP

                        WHERE id = $2
                        `,
                        [
                            newApplicationStatus,
                            payment.application_id
                        ]
                    );

                }


                await client.query(
                    "COMMIT"
                );


                console.log(
                    "Payment status updated:",
                    {
                        paymentId,
                        status,
                        applicationId:
                            payment.application_id,
                        applicationStatus:
                            newApplicationStatus
                    }
                );


                return res.json({

                    success:
                        true,

                    message:
                        "Payment status updated successfully.",

                    payment: {

                        id:
                            Number(
                                updatedPayment.id
                            ),

                        applicationId:
                            Number(
                                updatedPayment.application_id
                            ),

                        paymentMethod:
                            updatedPayment.payment_method,

                        paymentReference:
                            updatedPayment.payment_reference,

                        message:
                            updatedPayment.message,

                        proofFile:
                            updatedPayment.proof_file,

                        status:
                            updatedPayment.status,

                        createdAt:
                            updatedPayment.created_at,

                        updatedAt:
                            updatedPayment.updated_at

                    },

                    applicationStatus:
                        newApplicationStatus

                });


            } catch (
                error
            ) {

                try {

                    await client.query(
                        "ROLLBACK"
                    );

                } catch (
                    rollbackError
                ) {

                    console.error(
                        "Payment status rollback error:",
                        rollbackError
                    );

                }

                throw error;

            } finally {

                client.release();

            }


        } catch (
            error
        ) {

            console.error(
                "UPDATE PAYMENT STATUS ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to update payment status."

            });

        }

    }
);


// =========================================================
// ADMIN DELETE PAYMENT
// =========================================================
//
// DELETE /api/payments/:id
//
// Deletes the payment record only.
// Application itself is preserved.
//
// =========================================================

router.delete(
    "/:id",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const paymentId =
                normalizeId(
                    req.params.id
                );


            if (
                !paymentId
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid payment ID."

                });

            }


            const result =
                await pool.query(
                    `
                    DELETE FROM payments

                    WHERE id = $1

                    RETURNING
                        id,
                        application_id,
                        status
                    `,
                    [
                        paymentId
                    ]
                );


            if (
                result.rows.length ===
                0
            ) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "Payment not found."

                });

            }


            const deletedPayment =
                result.rows[0];


            // -------------------------------------------------
            // If payment was deleted while application was
            // waiting for/submitting payment, restore it to
            // payment_pending.
            // -------------------------------------------------

            await pool.query(
                `
                UPDATE applications

                SET
                    status = 'payment_pending',
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $1
                AND status = 'payment_submitted'
                `,
                [
                    deletedPayment.application_id
                ]
            );


            return res.json({

                success:
                    true,

                message:
                    "Payment deleted successfully.",

                paymentId:
                    Number(
                        deletedPayment.id
                    ),

                applicationId:
                    Number(
                        deletedPayment.application_id
                    )

            });


        } catch (
            error
        ) {

            console.error(
                "DELETE PAYMENT ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to delete payment."

            });

        }

    }
);


// =========================================================
// EXPORT ROUTER
// =========================================================

module.exports =
    router;
