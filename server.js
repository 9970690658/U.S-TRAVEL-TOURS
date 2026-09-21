// =========================================================
// U.S TRAVEL & TOURS
// MAIN BACKEND SERVER
// PRODUCTION API SERVER
//
// DATABASE:
// PostgreSQL / Supabase
//
// IMPORTANT:
// Database initialization MUST complete before routes
// are loaded because authentication and all API modules
// depend on the PostgreSQL database.
// =========================================================

const path = require("path");
const fs = require("fs");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const {
    pool,
    initializeDatabase,
    testDatabaseConnection
} = require("./database");


// =========================================================
// EXPRESS APP
// =========================================================

const app = express();

const PORT =
    process.env.PORT || 3000;


// =========================================================
// FRONTEND / BACKEND URLS
// =========================================================

const FRONTEND_URL =
    "https://us-travel-tours.netlify.app";

const BACKEND_URL =
    "https://u-s-travel-tours-1.onrender.com";


// =========================================================
// DATA DIRECTORY
// =========================================================

const DATA_DIR =
    path.join(
        __dirname,
        "data"
    );


if (
    !fs.existsSync(
        DATA_DIR
    )
) {

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );

}


// =========================================================
// CORS
// =========================================================

const allowedOrigins = [

    FRONTEND_URL,

    "http://localhost:3000",

    "http://127.0.0.1:3000"

];


app.use(
    cors({

        origin:
            function (
                origin,
                callback
            ) {

                if (!origin) {

                    return callback(
                        null,
                        true
                    );

                }


                if (
                    allowedOrigins.includes(
                        origin
                    )
                ) {

                    return callback(
                        null,
                        true
                    );

                }


                console.warn(
                    "CORS blocked:",
                    origin
                );


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


// =========================================================
// BODY PARSERS
// =========================================================

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


// =========================================================
// BASIC REQUEST LOG
// =========================================================

app.use(
    function (
        req,
        res,
        next
    ) {

        const startedAt =
            Date.now();


        res.on(
            "finish",
            function () {

                const duration =
                    Date.now() -
                    startedAt;


                console.log(
                    `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
                );

            }
        );


        next();

    }
);


// =========================================================
// HEALTH CHECK
// =========================================================

app.get(
    "/api/health",
    async function (
        req,
        res
    ) {

        try {

            await pool.query(
                "SELECT 1"
            );


            return res.json({

                success:
                    true,

                message:
                    "U.S TRAVEL & TOURS backend is running.",

                database:
                    "connected",

                databaseType:
                    "PostgreSQL / Supabase",

                frontend:
                    FRONTEND_URL,

                backend:
                    BACKEND_URL,

                time:
                    new Date().toISOString()

            });

        } catch (error) {

            console.error(
                "Health database check error:",
                error
            );


            return res.status(503).json({

                success:
                    false,

                message:
                    "Backend is running but database connection is unavailable.",

                database:
                    "disconnected",

                databaseType:
                    "PostgreSQL / Supabase",

                frontend:
                    FRONTEND_URL,

                backend:
                    BACKEND_URL,

                time:
                    new Date().toISOString()

            });

        }

    }
);


// =========================================================
// ADMIN BOOTSTRAP
// CREATE / RESET PRODUCTION ADMIN
// =========================================================
//
// Environment variables:
//
// BOOTSTRAP_ADMIN_NAME
// BOOTSTRAP_ADMIN_EMAIL
// BOOTSTRAP_ADMIN_PASSWORD
//
// IMPORTANT:
// This runs AFTER PostgreSQL initialization.
//
// IMPORTANT ADMIN SESSION FIX:
// Existing auth_sessions are NOT deleted during startup.
// This allows an already authenticated admin session to
// survive Render restarts/redeploys until its normal
// expiration time.
// =========================================================

async function bootstrapAdmin() {

    const adminName =
        process.env.BOOTSTRAP_ADMIN_NAME;

    const adminEmail =
        process.env.BOOTSTRAP_ADMIN_EMAIL;

    const adminPassword =
        process.env.BOOTSTRAP_ADMIN_PASSWORD;


    if (
        !adminName ||
        !adminEmail ||
        !adminPassword
    ) {

        console.log(
            "Admin bootstrap skipped: environment variables not configured."
        );

        return;

    }


    try {

        const normalizedEmail =
            adminEmail
                .trim()
                .toLowerCase();


        const existingResult =
            await pool.query(
                `
                SELECT
                    id,
                    role
                FROM users
                WHERE LOWER(email) = $1
                LIMIT 1
                `,
                [
                    normalizedEmail
                ]
            );


        const passwordHash =
            await bcrypt.hash(
                adminPassword,
                12
            );


        if (
            existingResult.rows.length ===
            0
        ) {

            const insertResult =
                await pool.query(
                    `
                    INSERT INTO users
                    (
                        name,
                        email,
                        password_hash,
                        role,
                        created_at,
                        updated_at
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        'admin',
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    RETURNING
                        id,
                        name,
                        email,
                        role
                    `,
                    [
                        adminName.trim(),
                        normalizedEmail,
                        passwordHash
                    ]
                );


            const admin =
                insertResult.rows[0];


            console.log("");
            console.log(
                "=============================================="
            );
            console.log(
                "ADMIN BOOTSTRAP"
            );
            console.log(
                "=============================================="
            );
            console.log(
                "Admin account created successfully."
            );
            console.log(
                "Admin ID:",
                admin.id
            );
            console.log(
                "Admin Email:",
                admin.email
            );
            console.log(
                "Admin Role:",
                admin.role
            );
            console.log(
                "Admin sessions: PRESERVED"
            );
            console.log(
                "=============================================="
            );
            console.log("");

        } else {

            const existingAdmin =
                existingResult.rows[0];


            if (
                existingAdmin.role ===
                "admin"
            ) {

                await pool.query(
                    `
                    UPDATE users

                    SET
                        name = $1,
                        password_hash = $2,
                        role = 'admin',
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $3
                    `,
                    [
                        adminName.trim(),
                        passwordHash,
                        existingAdmin.id
                    ]
                );


                // =================================================
                // IMPORTANT:
                // DO NOT DELETE AUTH SESSIONS HERE.
                //
                // Previously this code deleted all admin sessions
                // every time Render restarted/redeployed the server.
                //
                // That caused the browser to still contain a token
                // while PostgreSQL no longer contained its session,
                // resulting in:
                //
                // 401 Unauthorized
                //
                // Admin sessions are now allowed to remain valid
                // until their normal expiration time.
                // =================================================


                console.log("");
                console.log(
                    "=============================================="
                );
                console.log(
                    "ADMIN BOOTSTRAP"
                );
                console.log(
                    "=============================================="
                );
                console.log(
                    "Existing admin account verified successfully."
                );
                console.log(
                    "Admin Email:",
                    normalizedEmail
                );
                console.log(
                    "Admin Role: admin"
                );
                console.log(
                    "Admin sessions: PRESERVED"
                );
                console.log(
                    "=============================================="
                );
                console.log("");

            } else {

                console.error(
                    "ADMIN BOOTSTRAP ERROR: Email already belongs to a non-admin user."
                );

            }

        }

    } catch (error) {

        console.error(
            "ADMIN BOOTSTRAP ERROR:",
            error
        );

    }

}


// =========================================================
// AUTHENTICATION ROUTES
// =========================================================

const authRoutes =
    require("./auth");


app.use(
    "/api/auth",
    authRoutes
);


console.log(
    "Authentication routes loaded."
);


// =========================================================
// APPLICATION ROUTES
// =========================================================

const applicationsRoutes =
    require("./applications");


app.use(
    "/api/applications",
    applicationsRoutes
);


console.log(
    "Application routes loaded."
);

// =========================================================
// PAYMENT ROUTES
// =========================================================

// IMPORTANT:
// The root ./payments.js file is the FRONTEND payment
// JavaScript file and must NOT be loaded by Node.js.
//
// The backend payment router must be loaded from the
// server-side payment route file.

const paymentRoutesCandidates = [
    path.join(__dirname, "server", "payments.js"),
    path.join(__dirname, "payment-routes.js"),
    path.join(__dirname, "server", "payment-routes.js")
];

let paymentsRoutes = null;
let paymentRouteFile = null;

for (const candidate of paymentRoutesCandidates) {

    if (fs.existsSync(candidate)) {

        try {

            const loadedRoutes =
                require(candidate);

            if (
                typeof loadedRoutes === "function" ||
                (
                    loadedRoutes &&
                    typeof loadedRoutes === "object"
                )
            ) {

                paymentsRoutes =
                    loadedRoutes;

                paymentRouteFile =
                    candidate;

                break;

            }

        } catch (error) {

            console.error(
                "Payment route load failed:",
                candidate
            );

        }

    }

}

if (paymentsRoutes) {

    app.use(
        "/api/payments",
        paymentsRoutes
    );

    app.use(
        "/api/application-payment",
        paymentsRoutes
    );

    console.log(
        "Payment routes loaded from:",
        paymentRouteFile
    );

} else {

    console.error(
        "PAYMENT ERROR: Backend payment router not found."
    );

    console.error(
        "IMPORTANT: ./payments.js was NOT loaded because it is a frontend browser file."
    );

}
// =========================================================
// CHAT ROUTES
// =========================================================

const chatPath =
    path.join(
        __dirname,
        "chat.js"
    );


if (
    fs.existsSync(
        chatPath
    )
) {

    try {

        const chatRoutes =
            require(
                chatPath
            );


        app.use(
            "/api/chat",
            chatRoutes
        );


        console.log(
            "Chat routes loaded successfully."
        );


        console.log(
            "Chat API: /api/chat"
        );

    } catch (error) {

        console.error(
            "CHAT ROUTES LOAD ERROR:",
            error
        );

    }

} else {

    console.error(
        "CHAT ERROR: chat.js not found."
    );

}


// =========================================================
// CONTACT ROUTES
// =========================================================

const contactPath =
    path.join(
        __dirname,
        "contact.js"
    );


if (
    fs.existsSync(
        contactPath
    )
) {

    try {

        const contactRoutes =
            require(
                contactPath
            );


        if (
            typeof contactRoutes ===
            "function" ||
            typeof contactRoutes ===
            "object"
        ) {

            app.use(
                "/api/contact",
                contactRoutes
            );


            console.log(
                "Contact routes loaded."
            );

        }

    } catch (error) {

        console.error(
            "Unable to load contact.js:",
            error
        );

    }

} else {

    console.warn(
        "CONTACT: contact.js not found."
    );

}


// =========================================================
// JOB ROUTES
// =========================================================

const jobsPath =
    path.join(
        __dirname,
        "jobs.js"
    );


if (
    fs.existsSync(
        jobsPath
    )
) {

    try {

        const jobsRoutes =
            require(
                jobsPath
            );


        if (
            typeof jobsRoutes ===
            "function" ||
            typeof jobsRoutes ===
            "object"
        ) {

            app.use(
                "/api/jobs",
                jobsRoutes
            );


            app.use(
                "/api/job-applications",
                jobsRoutes
            );

        }


        console.log(
            "Job routes loaded."
        );

    } catch (error) {

        console.error(
            "Job routes error:",
            error
        );

    }

} else {

    console.warn(
        "JOBS: jobs.js not found."
    );

}


// =========================================================
// UNKNOWN API ENDPOINT
// =========================================================

app.use(
    "/api",
    function (
        req,
        res
    ) {

        return res.status(404).json({

            success:
                false,

            message:
                "API endpoint not found."

        });

    }
);


// =========================================================
// GLOBAL ERROR HANDLER
// =========================================================

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
            res.headersSent
        ) {

            return next(
                error
            );

        }


        return res.status(500).json({

            success:
                false,

            message:
                "An internal server error occurred."

        });

    }
);


// =========================================================
// DATABASE USER CHECK
// =========================================================

async function databaseUserCheck() {

    try {

        const result =
            await pool.query(
                `
                SELECT
                    COUNT(*) AS count
                FROM users
                `
            );


        const count =
            Number(
                result.rows[0]?.count ||
                0
            );


        console.log("");
        console.log(
            "DATABASE USER CHECK"
        );
        console.log(
            "Database:",
            "PostgreSQL / Supabase"
        );
        console.log(
            "Total users:",
            count
        );
        console.log("");

    } catch (error) {

        console.error(
            "DATABASE USER CHECK ERROR:",
            error
        );

    }

}


// =========================================================
// START SERVER
// =========================================================

async function startServer() {

    try {

        console.log("");
        console.log(
            "=============================================="
        );
        console.log(
            "U.S TRAVEL & TOURS SERVER STARTING"
        );
        console.log(
            "=============================================="
        );


        // -------------------------------------------------
        // TEST CONNECTION
        // -------------------------------------------------

        console.log(
            "Testing PostgreSQL / Supabase connection..."
        );


        await testDatabaseConnection();


        // -------------------------------------------------
        // INITIALIZE DATABASE
        // -------------------------------------------------

        console.log(
            "Initializing PostgreSQL database..."
        );


        await initializeDatabase();


        console.log(
            "PostgreSQL database initialization completed."
        );


        // -------------------------------------------------
        // USER CHECK
        // -------------------------------------------------

        await databaseUserCheck();


        // -------------------------------------------------
        // ADMIN BOOTSTRAP
        // -------------------------------------------------

        await bootstrapAdmin();


        // -------------------------------------------------
        // START HTTP SERVER
        // -------------------------------------------------

        app.listen(
            PORT,
            "0.0.0.0",
            function () {

                console.log("");
                console.log(
                    "=============================================="
                );
                console.log(
                    "       U.S TRAVEL & TOURS API SERVER"
                );
                console.log(
                    "=============================================="
                );
                console.log(
                    `Server running on port ${PORT}`
                );
                console.log(
                    "Database: PostgreSQL / Supabase"
                );
                console.log(
                    "Health:",
                    `${BACKEND_URL}/api/health`
                );
                console.log(
                    "Frontend:",
                    FRONTEND_URL
                );
                console.log(
                    "Backend:",
                    BACKEND_URL
                );
                console.log(
                    "Persistent sessions: ENABLED"
                );
                console.log(
                    "Admin sessions survive restart: ENABLED"
                );
                console.log(
                    "=============================================="
                );
                console.log("");

            }
        );

    } catch (error) {

        console.error("");
        console.error(
            "=============================================="
        );
        console.error(
            "SERVER STARTUP FAILED"
        );
        console.error(
            "=============================================="
        );
        console.error(
            error
        );
        console.error(
            "=============================================="
        );
        console.error("");


        process.exit(
            1
        );

    }

}


// =========================================================
// GRACEFUL SHUTDOWN
// =========================================================

async function shutdown(
    signal
) {

    console.log(
        `${signal} received. Shutting down server...`
    );


    try {

        await pool.end();


        console.log(
            "PostgreSQL connection pool closed."
        );


        process.exit(
            0
        );

    } catch (error) {

        console.error(
            "Shutdown error:",
            error
        );


        process.exit(
            1
        );

    }

}


process.on(
    "SIGTERM",
    function () {

        shutdown(
            "SIGTERM"
        );

    }
);


process.on(
    "SIGINT",
    function () {

        shutdown(
            "SIGINT"
        );

    }
);


// =========================================================
// START
// =========================================================

startServer();
