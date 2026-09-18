/* =========================================================
   U.S TRAVEL & TOURS
   MAIN SERVER
   PostgreSQL Version
   ========================================================= */

const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const {
    pool,
    initializeDatabase,
    checkDatabaseConnection,
    closeDatabase
} = require("./database");


/* =========================================================
   APP
========================================================= */

const app = express();

const PORT =
    Number(process.env.PORT || 10000);

const ROOT_DIR =
    path.join(__dirname, "..");


/* =========================================================
   BASIC CONFIG
========================================================= */

app.disable("x-powered-by");

app.set(
    "trust proxy",
    1
);


/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [

    "https://us-travel-tours.netlify.app",

    "http://localhost:3000",

    "http://127.0.0.1:3000",

    process.env.FRONTEND_URL

].filter(Boolean);


app.use(
    function (
        req,
        res,
        next
    ) {

        const origin =
            req.headers.origin;


        if (
            origin &&
            allowedOrigins.includes(origin)
        ) {

            res.header(
                "Access-Control-Allow-Origin",
                origin
            );

        } else if (!origin) {

            res.header(
                "Access-Control-Allow-Origin",
                "*"
            );

        }


        res.header(
            "Vary",
            "Origin"
        );


        res.header(
            "Access-Control-Allow-Credentials",
            "true"
        );


        res.header(
            "Access-Control-Allow-Headers",
            "Origin, X-Requested-With, Content-Type, Accept, Authorization"
        );


        res.header(
            "Access-Control-Allow-Methods",
            "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        );


        if (
            req.method === "OPTIONS"
        ) {

            return res.sendStatus(204);

        }


        next();

    }
);


/* =========================================================
   BODY PARSERS
========================================================= */

app.use(
    express.json({
        limit: "10mb"
    })
);


app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);


/* =========================================================
   STATIC FILES
========================================================= */

const DATA_DIR =
    path.join(
        __dirname,
        "data"
    );


if (
    !fs.existsSync(DATA_DIR)
) {

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );

}


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/",
    async function (
        req,
        res
    ) {

        let databaseStatus =
            "disconnected";


        try {

            const connected =
                await checkDatabaseConnection();

            databaseStatus =
                connected
                    ? "connected"
                    : "disconnected";

        } catch (error) {

            databaseStatus =
                "disconnected";

        }


        return res.json({

            success: true,

            message:
                "U.S TRAVEL & TOURS API is running.",

            database:
                databaseStatus,

            timestamp:
                new Date().toISOString()

        });

    }
);


/* =========================================================
   API HEALTH CHECK
========================================================= */

app.get(
    "/api/health",
    async function (
        req,
        res
    ) {

        try {

            const connected =
                await checkDatabaseConnection();


            if (!connected) {

                return res.status(503).json({

                    success: false,

                    database:
                        "disconnected",

                    message:
                        "Database connection is unavailable."

                });

            }


            return res.json({

                success: true,

                database:
                    "connected",

                message:
                    "API and PostgreSQL database are working."

            });

        } catch (error) {

            console.error(
                "HEALTH CHECK ERROR:",
                error
            );


            return res.status(503).json({

                success: false,

                database:
                    "disconnected",

                message:
                    "Database connection failed."

            });

        }

    }
);


/* =========================================================
   DATABASE STARTUP
========================================================= */

let databaseInitialized = false;

async function startDatabase() {

    if (databaseInitialized) {
        return;
    }


    await initializeDatabase();


    const result =
        await pool.query(
            `
            SELECT COUNT(*)::INTEGER AS count
            FROM users
            `
        );


    console.log(
        "DATABASE USERS:",
        result.rows[0].count
    );


    databaseInitialized = true;

}


/* =========================================================
   ADMIN BOOTSTRAP
========================================================= */

async function bootstrapAdmin() {

    const adminEmail =
        (
            process.env.ADMIN_EMAIL ||
            "ellisgeorge690@gmail.com"
        )
            .trim()
            .toLowerCase();


    const adminPassword =
        process.env.ADMIN_PASSWORD ||
        "";


    if (!adminPassword) {

        console.log(
            "ADMIN_PASSWORD not set. Existing admin account will be preserved."
        );

        return;

    }


    try {

        const existing =
            await pool.query(
                `
                SELECT
                    id,
                    email,
                    role
                FROM users
                WHERE LOWER(email) = LOWER($1)
                LIMIT 1
                `,
                [adminEmail]
            );


        const passwordHash =
            await bcrypt.hash(
                adminPassword,
                12
            );


        if (
            existing.rows.length === 0
        ) {

            const result =
                await pool.query(
                    `
                    INSERT INTO users
                    (
                        name,
                        email,
                        password_hash,
                        role,
                        created_at
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        'admin',
                        CURRENT_TIMESTAMP
                    )
                    RETURNING
                        id,
                        email,
                        role
                    `,
                    [
                        "Administrator",
                        adminEmail,
                        passwordHash
                    ]
                );


            console.log(
                "ADMIN ACCOUNT CREATED:",
                result.rows[0].email
            );


        } else {

            await pool.query(
                `
                UPDATE users

                SET
                    password_hash = $1,
                    role = 'admin'

                WHERE
                    LOWER(email) = LOWER($2)
                `,
                [
                    passwordHash,
                    adminEmail
                ]
            );


            console.log(
                "ADMIN ACCOUNT VERIFIED:",
                adminEmail
            );

        }

    } catch (error) {

        console.error(
            "ADMIN BOOTSTRAP ERROR:",
            error
        );

    }

}


/* =========================================================
   LOAD ROUTES
========================================================= */

async function loadRoutes() {

// =========================================================
// AUTHENTICATION ROUTES
// =========================================================

try {

    const authRoutes = require("./auth");

    console.log(
        "AUTH DEBUG TYPE:",
        typeof authRoutes
    );

    console.log(
        "AUTH DEBUG REQUIRE:",
        typeof authRoutes.requireAuth,
        typeof authRoutes.requireAdmin
    );

    if (
        typeof authRoutes !== "function"
    ) {

        throw new TypeError(
            "AUTH ROUTES ERROR: ./auth.js is not exporting an Express Router."
        );

    }

    app.use(
        "/api/auth",
        authRoutes
    );

    console.log(
        "AUTH ROUTES LOADED SUCCESSFULLY"
    );

} catch (error) {

    console.error(
        "AUTH ROUTES ERROR:",
        error
    );

    throw error;

}


    /* -----------------------------------------------------
       APPLICATIONS
    ----------------------------------------------------- */

    try {

        const applicationRoutes =
            require("./applications");

        app.use(
            "/api/applications",
            applicationRoutes
        );

        console.log(
            "APPLICATION ROUTES LOADED"
        );

    } catch (error) {

        console.error(
            "APPLICATION ROUTES ERROR:",
            error
        );

        throw error;

    }


    /* -----------------------------------------------------
       PAYMENTS
    ----------------------------------------------------- */

    try {

        const paymentRoutes =
            require("./payments");


        app.use(
            "/api/payments",
            paymentRoutes
        );


        app.use(
            "/api/application-payment",
            paymentRoutes
        );


        console.log(
            "PAYMENT ROUTES LOADED"
        );

    } catch (error) {

        console.error(
            "PAYMENT ROUTES ERROR:",
            error
        );

        throw error;

    }


    /* -----------------------------------------------------
       CONTACT
    ----------------------------------------------------- */

    const contactPath =
        path.join(
            __dirname,
            "contact.js"
        );


    if (
        fs.existsSync(contactPath)
    ) {

        try {

            const contactRoutes =
                require(contactPath);


            app.use(
                "/api/contact",
                contactRoutes
            );


            console.log(
                "CONTACT ROUTES LOADED"
            );

        } catch (error) {

            console.error(
                "CONTACT ROUTES ERROR:",
                error
            );

            throw error;

        }

    }


    /* -----------------------------------------------------
       LIVE CHAT
    ----------------------------------------------------- */

    const chatPath =
        path.join(
            __dirname,
            "chat.js"
        );


    if (
        fs.existsSync(chatPath)
    ) {

        try {

            const chatRoutes =
                require(chatPath);


            app.use(
                "/api/chat",
                chatRoutes
            );


            console.log(
                "CHAT ROUTES LOADED"
            );

        } catch (error) {

            console.error(
                "CHAT ROUTES ERROR:",
                error
            );

            throw error;

        }

    }


    /* -----------------------------------------------------
       JOBS
    ----------------------------------------------------- */

    const jobsPath =
        path.join(
            __dirname,
            "jobs.js"
        );


    if (
        fs.existsSync(jobsPath)
    ) {

        try {

            const jobsRoutes =
                require(jobsPath);


            app.use(
                "/api/jobs",
                jobsRoutes
            );


            console.log(
                "JOBS ROUTES LOADED"
            );

        } catch (error) {

            console.error(
                "JOBS ROUTES ERROR:",
                error
            );

            throw error;

        }

    }

}


/* =========================================================
   404 API HANDLER
========================================================= */

app.use(
    function (
        req,
        res,
        next
    ) {

        if (
            req.path.startsWith("/api/")
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "API endpoint not found.",

                path:
                    req.path

            });

        }


        next();

    }
);


/* =========================================================
   GENERAL ERROR HANDLER
========================================================= */

app.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            "SERVER ERROR:",
            error
        );


        if (res.headersSent) {

            return next(error);

        }


        const status =
            Number(error.statusCode) ||
            Number(error.status) ||
            500;


        return res.status(status).json({

            success: false,

            message:
                status === 500
                    ? "Internal server error."
                    : (
                        error.message ||
                        "Request failed."
                    )

        });

    }
);


/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

let server = null;

async function shutdown(
    signal
) {

    console.log(
        `${signal} received. Shutting down server...`
    );


    try {

        if (server) {

            await new Promise(
                (resolve) => {

                    server.close(
                        () => resolve()
                    );

                }
            );

        }

    } catch (error) {

        console.error(
            "SERVER CLOSE ERROR:",
            error
        );

    }


    try {

        await closeDatabase();

    } catch (error) {

        console.error(
            "DATABASE CLOSE ERROR:",
            error
        );

    }


    process.exit(0);

}


process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);


process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);


/* =========================================================
   UNHANDLED ERRORS
========================================================= */

process.on(
    "unhandledRejection",
    function (error) {

        console.error(
            "UNHANDLED REJECTION:",
            error
        );

    }
);


process.on(
    "uncaughtException",
    function (error) {

        console.error(
            "UNCAUGHT EXCEPTION:",
            error
        );

    }
);


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

    try {

        console.log(
            "=============================================="
        );

        console.log(
            "U.S TRAVEL & TOURS SERVER STARTING..."
        );

        console.log(
            "=============================================="
        );


        /* -------------------------------------------------
           DATABASE
        ------------------------------------------------- */

        await startDatabase();


        /* -------------------------------------------------
           ADMIN
        ------------------------------------------------- */

        await bootstrapAdmin();


        /* -------------------------------------------------
           ROUTES
        ------------------------------------------------- */

        await loadRoutes();


        /* -------------------------------------------------
           START HTTP SERVER
        ------------------------------------------------- */

        server =
            app.listen(
                PORT,
                "0.0.0.0",
                function () {

                    console.log(
                        "=============================================="
                    );

                    console.log(
                        `SERVER RUNNING ON PORT ${PORT}`
                    );

                    console.log(
                        "DATABASE: POSTGRESQL"
                    );

                    console.log(
                        "=============================================="
                    );

                }
            );


    } catch (error) {

        console.error(
            "SERVER STARTUP FAILED:",
            error
        );


        try {

            await closeDatabase();

        } catch (_) {}


        process.exit(1);

    }

}


/* =========================================================
   START
========================================================= */

startServer();


/* =========================================================
   EXPORT
========================================================= */

module.exports = app;
