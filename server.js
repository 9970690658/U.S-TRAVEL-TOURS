// =========================================================
// U.S TRAVEL & TOURS
// MAIN BACKEND SERVER
// PRODUCTION API SERVER
// =========================================================

const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------
// ENVIRONMENT
// Backend files are in the project ROOT
// ---------------------------------------------------------

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

// ---------------------------------------------------------
// PACKAGES
// ---------------------------------------------------------

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

// ---------------------------------------------------------
// DATABASE
// ---------------------------------------------------------

const { db } = require("./database");
// =========================================================
// ADMIN BOOTSTRAP
// CREATE / RESET PRODUCTION ADMIN
// =========================================================

function bootstrapAdmin() {

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
            adminEmail.trim().toLowerCase();

        const existingAdmin =
            db.prepare(`
                SELECT id, role
                FROM users
                WHERE email = ?
            `).get(normalizedEmail);

        const passwordHash =
            bcrypt.hashSync(
                adminPassword,
                12
            );

        if (!existingAdmin) {

            db.prepare(`
                INSERT INTO users
                (
                    name,
                    email,
                    password_hash,
                    role
                )
                VALUES
                (?, ?, ?, 'admin')
            `).run(
                adminName.trim(),
                normalizedEmail,
                passwordHash
            );

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
                "Admin Email:",
                normalizedEmail
            );
            console.log(
                "Admin Role: admin"
            );
            console.log(
                "=============================================="
            );
            console.log("");

        } else if (
            existingAdmin.role === "admin"
        ) {

            db.prepare(`
                UPDATE users
                SET
                    name = ?,
                    password = ?,
                    role = 'admin'
                WHERE id = ?
            `).run(
                adminName.trim(),
                passwordHash,
                existingAdmin.id
            );

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
                "Existing admin password reset successfully."
            );
            console.log(
                "Admin Email:",
                normalizedEmail
            );
            console.log(
                "Admin Role: admin"
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

    } catch (error) {

        console.error(
            "ADMIN BOOTSTRAP ERROR:",
            error
        );

    }

}

// ---------------------------------------------------------
// EXPRESS
// ---------------------------------------------------------

const app = express();

const PORT =
    process.env.PORT || 3000;

// ---------------------------------------------------------
// DATA DIRECTORY
// ---------------------------------------------------------

const DATA_DIR =
    path.join(__dirname, "data");

// ---------------------------------------------------------
// CREATE DATA DIRECTORY
// ---------------------------------------------------------

if (!fs.existsSync(DATA_DIR)) {

    fs.mkdirSync(DATA_DIR, {
        recursive: true
    });

}

// =========================================================
// CORS
// FRONTEND = NETLIFY
// BACKEND = RENDER
// =========================================================

const allowedOrigins = [

    "https://us-travel-tours.netlify.app",

    "http://localhost:3000",

    "http://127.0.0.1:3000"

];

app.use(
    cors({

        origin: function (
            origin,
            callback
        ) {

            // Allow requests without Origin
            // such as server-to-server requests

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

        credentials: true

    })
);

// =========================================================
// BODY PARSERS
// =========================================================

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

// =========================================================
// AUTHENTICATION
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
// HEALTH CHECK
// =========================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            message:
                "U.S TRAVEL & TOURS backend is running.",

            database:
                db.open
                    ? "connected"
                    : "disconnected",

            frontend:
                "https://us-travel-tours.netlify.app",

            backend:
    "https://u-s-travel-tours-1.onrender.com",

            time:
                new Date().toISOString()

        });

    }
);

// =========================================================
// APPLICATIONS
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
// PAYMENTS
// =========================================================

const paymentsRoutes =
    require("./payments");

app.use(
    "/api/payments",
    paymentsRoutes
);

app.use(
    "/api/application-payment",
    paymentsRoutes
);

console.log(
    "Payment routes loaded."
);

// =========================================================
// CHAT
// =========================================================

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
// CONTACT
// =========================================================

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

        if (
            typeof contactRoutes ===
            "function"
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
// JOB APPLICATIONS
// =========================================================

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

        if (
            typeof jobsRoutes ===
            "function"
        ) {

            // Main jobs API

            app.use(
                "/api/jobs",
                jobsRoutes
            );

            // Existing frontend compatibility API

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
// API 404
// =========================================================

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            message:
                "API endpoint not found."

        });

    }
);

// =========================================================
// GLOBAL ERROR HANDLER
// =========================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "GLOBAL SERVER ERROR:",
            error
        );

        if (
            res.headersSent
        ) {

            return next(error);

        }

        res.status(500).json({

            success: false,

            message:
                "An internal server error occurred."

        });

    }
);

// =========================================================
// DATABASE USER CHECK
// =========================================================

try {

    const userCount = db.prepare(
        "SELECT COUNT(*) AS count FROM users"
    ).get();

    console.log("");
    console.log(
        "DATABASE USER CHECK"
    );
    console.log(
        "Database path:",
        require("./database").DB_PATH
    );
    console.log(
        "Total users:",
        userCount.count
    );
    console.log("");

} catch (error) {

    console.error(
        "DATABASE USER CHECK ERROR:",
        error
    );

}

bootstrapAdmin();

// =========================================================
// START SERVER
// RENDER
// =========================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

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
            "Health: /api/health"
        );

        console.log(
            "Frontend: https://us-travel-tours.netlify.app"
        );

        console.log(
    "Backend: https://u-s-travel-tours-1.onrender.com"
);

        console.log(
            "=============================================="
        );

    }
);
