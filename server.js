// =========================================================
// U.S TRAVEL & TOURS
// MAIN BACKEND SERVER
// =========================================================
const path = require("path");
require("dotenv").config({
    path: path.join(__dirname, "..", ".env")
});

const express = require("express");
const fs = require("fs");

// ---------------------------------------------------------
// DATABASE
// ---------------------------------------------------------

const { db } = require("./database");

// ---------------------------------------------------------
// EXPRESS
// ---------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------
// DIRECTORIES
// ---------------------------------------------------------

const ROOT_DIR = path.join(__dirname, "..");

const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const CSS_DIR = path.join(ROOT_DIR, "css");
const JS_DIR = path.join(ROOT_DIR, "js");
const DATA_DIR = path.join(ROOT_DIR, "data");

// ---------------------------------------------------------
// CREATE DATA DIRECTORY
// ---------------------------------------------------------

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
        recursive: true
    });
}

// =========================================================
// BODY PARSERS
// =========================================================

app.use(express.json({
    limit: "10mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "10mb"
}));

// =========================================================
// STATIC FILES
// IMPORTANT
// =========================================================

app.use(express.static(PUBLIC_DIR));

app.use("/assets", express.static(ASSETS_DIR));
app.use("/css", express.static(CSS_DIR));
app.use("/js", express.static(JS_DIR));

// =========================================================
// AUTHENTICATION
// IMPORTANT: LOAD ONCE ONLY
// =========================================================

const authRoutes = require("./auth");

app.use("/api/auth", authRoutes);

console.log("Authentication routes loaded.");

// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        message: "U.S TRAVEL & TOURS backend is running.",
        database: db.open ? "connected" : "disconnected",
        time: new Date().toISOString()
    });

});

// =========================================================
// APPLICATIONS
// =========================================================

const applicationsRoutes = require("./applications");

app.use(
    "/api/applications",
    applicationsRoutes
);

// =========================================================
// PAYMENTS
// =========================================================

const paymentsRoutes = require("./payments");

app.use(
    "/api/payments",
    paymentsRoutes
);

app.use(
    "/api/application-payment",
    paymentsRoutes
);

// =========================================================
// CHAT
// =========================================================

const chatPath = path.join(__dirname, "chat.js");

if (fs.existsSync(chatPath)) {

    try {

        const chatRoutes = require(chatPath);

        if (typeof chatRoutes === "function") {

            app.use(
                "/api/chat",
                chatRoutes
            );

            console.log("Chat routes loaded.");

        }

    } catch (error) {

        console.error(
            "Unable to load chat.js:",
            error
        );

    }

}

// =========================================================
// CONTACT
// =========================================================

const contactPath = path.join(__dirname, "contact.js");

if (fs.existsSync(contactPath)) {

    try {

        const contactRoutes = require(contactPath);

        if (typeof contactRoutes === "function") {

            app.use(
                "/api/contact",
                contactRoutes
            );

            console.log("Contact routes loaded.");

        }

    } catch (error) {

        console.error(
            "Unable to load contact.js:",
            error
        );

    }

}

// =========================================================
// JOB APPLICATIONS
// =========================================================

const jobsPath = path.join(__dirname, "jobs.js");

if (fs.existsSync(jobsPath)) {

    try {

        const jobsRoutes = require(jobsPath);

        if (typeof jobsRoutes === "function") {

            // Main jobs API
            app.use("/api/jobs", jobsRoutes);

            // Compatibility API used by existing frontend
            app.use("/api/job-applications", jobsRoutes);
        }

        console.log("Job routes loaded.");

    } catch (error) {

        console.error(
            "Job routes error:",
            error
        );
    }
}

// =========================================================
// PAYMENT PAGE COMPATIBILITY
// =========================================================

app.get("/payment.html", (req, res) => {

    const paymentFile = path.join(
        PUBLIC_DIR,
        "payments.html"
    );

    if (!fs.existsSync(paymentFile)) {

        return res.status(404).send(
            "Payment page not found."
        );

    }

    res.sendFile(paymentFile);

});

// =========================================================
// APPLICATION PAGE
// =========================================================

app.get("/application.html", (req, res) => {

    const applicationFile = path.join(
        PUBLIC_DIR,
        "application.html"
    );

    if (!fs.existsSync(applicationFile)) {

        return res.status(404).send(
            "Application page not found."
        );

    }

    res.sendFile(applicationFile);

});

// =========================================================
// API 404
// =========================================================

app.use("/api", (req, res) => {

    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });

});



// =========================================================
// HTML FALLBACK
//
// IMPORTANT:
// This MUST be AFTER express.static()
// =========================================================

app.get("/{*splat}", (req, res) => {

    const requestedPath = path.join(
        PUBLIC_DIR,
        req.path
    );

    // Prevent path traversal
    const normalizedPublic =
        path.resolve(PUBLIC_DIR);

    const normalizedRequested =
        path.resolve(requestedPath);

    if (
        normalizedRequested.startsWith(
            normalizedPublic
        ) &&
        req.path !== "/" &&
        fs.existsSync(normalizedRequested) &&
        fs.statSync(normalizedRequested).isFile()
    ) {

        return res.sendFile(
            normalizedRequested
        );

    }

    // Only unknown website routes go to home.
    res.sendFile(
        path.join(
            PUBLIC_DIR,
            "index.html"
        )
    );

});

// =========================================================
// GLOBAL ERROR HANDLER
// =========================================================

app.use((error, req, res, next) => {

    console.error(
        "GLOBAL SERVER ERROR:",
        error
    );

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        message:
            "An internal server error occurred."
    });

});

// =========================================================
// START SERVER
// =========================================================

app.listen(PORT, () => {

    console.log("");
    console.log(
        "=============================================="
    );

    console.log(
        "       U.S TRAVEL & TOURS SERVER"
    );

    console.log(
        "=============================================="
    );

    console.log(
        `Server running on http://localhost:${PORT}`
    );

    console.log(
        `Health: http://localhost:${PORT}/api/health`
    );

    console.log(
        `Admin Login: http://localhost:${PORT}/admin-login.html`
    );

    console.log(
        `Admin Dashboard: http://localhost:${PORT}/admin-dashboard.html`
    );

    console.log(
        "=============================================="
    );

});