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

// ---------------------------------------------------------
// DATABASE
// ---------------------------------------------------------

const { db } = require("./database");

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
