/* =========================================================
   U.S TRAVEL & TOURS
   MAIN SERVER
   MongoDB + Express
========================================================= */

require("dotenv").config({
    path: __dirname + "/.env"
});


/* =========================================================
   IMPORTS
========================================================= */

const express =
    require("express");

const cors =
    require("cors");

const path =
    require("path");

const bcrypt =
    require("bcryptjs");


const {
    initDatabase,
    getDatabase,
    isDatabaseConnected
} = require("./server/database");


/* =========================================================
   APP
========================================================= */

const app =
    express();


/* =========================================================
   PORT
========================================================= */

const PORT =
    Number(
        process.env.PORT ||
        10000
    );


/* =========================================================
   FRONTEND URLS
========================================================= */

const allowedOrigins = [

    "https://us-travel-tours.netlify.app",

    "http://localhost:3000",

    "http://127.0.0.1:3000"

];


/* =========================================================
   CORS
========================================================= */

app.use(

    cors({

        origin:
            function (
                origin,
                callback
            ) {

                /*
                   Allow requests without
                   an Origin header.

                   Useful for server-to-server
                   and local testing.
                */

                if (!origin) {

                    return callback(
                        null,
                        true
                    );

                }


                if (
                    allowedOrigins
                        .includes(
                            origin
                        )
                ) {

                    return callback(
                        null,
                        true
                    );

                }


                return callback(
                    new Error(
                        "CORS: Origin not allowed."
                    )
                );

            },

        credentials:
            true

    })

);


/* =========================================================
   BODY PARSERS
========================================================= */

app.use(

    express.json({

        limit:
            "10mb"

    })

);


app.use(

    express.urlencoded({

        extended:
            true,

        limit:
            "10mb"

    })

);


/* =========================================================
   REQUEST LOG
========================================================= */

app.use(

    function (
        req,
        res,
        next
    ) {

        console.log(
            `${req.method} ${req.originalUrl}`
        );

        next();

    }

);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/api/health",
    async function (
        req,
        res
    ) {

        try {

            const connected =
                isDatabaseConnected();


            return res.json({

                success:
                    true,

                message:
                    "U.S TRAVEL & TOURS backend is running.",

                database:
                    connected
                        ? "MongoDB connected"
                        : "MongoDB not connected",

                backend:
                    "https://us-travel.onrender.com",

                timestamp:
                    new Date().toISOString()

            });

        } catch (error) {

            return res.status(500).json({

                success:
                    false,

                message:
                    "Health check failed.",

                database:
                    "MongoDB error"

            });

        }

    }
);


/* =========================================================
   ROOT
========================================================= */

app.get(
    "/",
    function (
        req,
        res
    ) {

        return res.json({

            success:
                true,

            message:
                "U.S TRAVEL & TOURS API is running.",

            backend:
                "https://us-travel.onrender.com",

            health:
                "/api/health"

        });

    }
);


/* =========================================================
   STATIC UPLOAD DIRECTORIES
========================================================= */

/*
   Existing frontend/admin functionality can
   still access locally stored uploads.

   IMPORTANT:
   Render's local filesystem is NOT permanent.
   Database records are permanent in MongoDB.
*/

const paymentProofDirectory =
    path.join(
        __dirname,
        "server",
        "data",
        "payment-proofs"
    );


const jobResumeDirectory =
    path.join(
        __dirname,
        "server",
        "data",
        "job-resumes"
    );


app.use(

    "/payment-proofs",

    express.static(
        paymentProofDirectory
    )

);


app.use(

    "/job-resumes",

    express.static(
        jobResumeDirectory
    )

);


/* =========================================================
   AUTH ROUTES
========================================================= */

const authRoutes =
    require(
        "./server/auth"
    );


app.use(
    "/api/auth",
    authRoutes
);


/* =========================================================
   APPLICATION ROUTES
========================================================= */

const applicationRoutes =
    require(
        "./server/applications"
    );


app.use(
    "/api/applications",
    applicationRoutes
);


/* =========================================================
   PAYMENT ROUTES
========================================================= */

const paymentRoutes =
    require(
        "./server/payments"
    );


app.use(
    "/api/payments",
    paymentRoutes
);


/* =========================================================
   APPLICATION PAYMENT ROUTES
========================================================= */

/*
   Existing frontend may use:

   POST /api/application-payment

   Therefore keep this endpoint.

   It uses the same payment router.
*/

app.use(
    "/api/application-payment",
    paymentRoutes
);


/* =========================================================
   CHAT ROUTES
========================================================= */

const chatRoutes =
    require(
        "./server/chat"
    );


app.use(
    "/api/chat",
    chatRoutes
);


/* =========================================================
   CONTACT ROUTES
========================================================= */

const contactRoutes =
    require(
        "./server/contact"
    );


app.use(
    "/api/contact",
    contactRoutes
);


/* =========================================================
   JOB ROUTES
========================================================= */

const jobRoutes =
    require(
        "./server/jobs"
    );


/*
   Existing frontend compatibility:
*/

app.use(
    "/api/jobs",
    jobRoutes
);


app.use(
    "/api/job-applications",
    jobRoutes
);


/* =========================================================
   404 HANDLER
========================================================= */

app.use(

    function (
        req,
        res
    ) {

        return res.status(404).json({

            success:
                false,

            message:
                "API endpoint not found.",

            path:
                req.originalUrl

        });

    }

);


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(

    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            "GLOBAL SERVER ERROR:",
            error
        );


        if (
            error &&
            error.message &&
            error.message.startsWith(
                "CORS:"
            )
        ) {

            return res.status(403).json({

                success:
                    false,

                message:
                    "CORS origin not allowed."

            });

        }


        return res.status(500).json({

            success:
                false,

            message:
                "Internal server error."

        });

    }

);


/* =========================================================
   BOOTSTRAP ADMIN
========================================================= */

async function bootstrapAdmin() {

    const adminName =
        String(
            process.env.BOOTSTRAP_ADMIN_NAME ||
            "U.S TRAVEL & TOURS Admin"
        ).trim();


    const adminEmail =
        String(
            process.env.BOOTSTRAP_ADMIN_EMAIL ||
            ""
        )
            .trim()
            .toLowerCase();


    const adminPassword =
        String(
            process.env.BOOTSTRAP_ADMIN_PASSWORD ||
            ""
        );


    /*
       If bootstrap credentials are not
       configured, don't create an admin.
    */

    if (
        !adminEmail ||
        !adminPassword
    ) {

        console.log(
            "BOOTSTRAP ADMIN: credentials not configured. Skipping."
        );

        return;

    }


    if (
        adminPassword.length < 8
    ) {

        console.error(
            "BOOTSTRAP ADMIN: password must contain at least 8 characters."
        );

        return;

    }


    const db =
        getDatabase();


    const users =
        db.collection(
            "users"
        );


    const existing =
        await users.findOne({

            email:
                adminEmail

        });


    if (
        existing
    ) {

        /*
           Keep existing admin account.
           Do NOT overwrite password on
           every Render restart.
        */

        if (
            existing.role !==
            "admin"
        ) {

            await users.updateOne(

                {
                    id:
                        existing.id
                },

                {
                    $set: {

                        role:
                            "admin",

                        updated_at:
                            new Date()

                    }

                }

            );

            console.log(
                "BOOTSTRAP ADMIN: existing user promoted to admin."
            );

        } else {

            console.log(
                "BOOTSTRAP ADMIN: existing admin found."
            );

        }

        return;

    }


    const passwordHash =
        await bcrypt.hash(
            adminPassword,
            12
        );


    const {
        getNextSequence
    } =
        require(
            "./server/database"
        );


    const adminId =
        await getNextSequence(
            "users"
        );


    const now =
        new Date();


    await users.insertOne({

        id:
            adminId,

        name:
            adminName,

        email:
            adminEmail,

        phone:
            "",

        password_hash:
            passwordHash,

        role:
            "admin",

        created_at:
            now,

        updated_at:
            now

    });


    console.log(
        "BOOTSTRAP ADMIN: admin account created."
    );

}


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

    try {

        console.log(
            "=========================================="
        );

        console.log(
            "U.S TRAVEL & TOURS SERVER STARTING..."
        );

        console.log(
            "=========================================="
        );


        /* -------------------------------------------------
           CONNECT MONGODB FIRST
        ------------------------------------------------- */

        await initDatabase();


        console.log(
            "MongoDB connection established."
        );


        /* -------------------------------------------------
           BOOTSTRAP ADMIN
        ------------------------------------------------- */

        await bootstrapAdmin();


        /* -------------------------------------------------
           START EXPRESS
        ------------------------------------------------- */

        app.listen(

            PORT,

            "0.0.0.0",

            function () {

                console.log(
                    "=========================================="
                );

                console.log(
                    `Server running on port ${PORT}`
                );

                console.log(
                    "Backend: https://us-travel.onrender.com"
                );

                console.log(
                    "Database: MongoDB"
                );

                console.log(
                    "=========================================="
                );

            }

        );

    } catch (error) {

        console.error(
            "=========================================="
        );

        console.error(
            "SERVER STARTUP FAILED"
        );

        console.error(
            "=========================================="
        );

        console.error(
            error
        );


        process.exit(
            1
        );

    }

}


/* =========================================================
   START
========================================================= */

startServer();
