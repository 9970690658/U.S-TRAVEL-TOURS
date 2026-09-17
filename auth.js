// =========================================================
// U.S TRAVEL & TOURS
// CUSTOMER + ADMIN AUTHENTICATION SYSTEM
// =========================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const { db } = require("./database");

const router = express.Router();
// =========================================================
// SUPABASE / POSTGRESQL CONNECTION
// =========================================================

let supabasePool = null;

if (process.env.DATABASE_URL) {

    supabasePool = new Pool({

        connectionString:
            process.env.DATABASE_URL,

        ssl: {
            rejectUnauthorized: false
        },

        max: 5,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000

    });

    supabasePool.on(
        "error",
        (error) => {

            console.error(
                "Supabase PostgreSQL pool error:",
                error
            );

        }
    );

    console.log(
        "SUPABASE DATABASE: PostgreSQL connection configured."
    );

} else {

    console.warn(
        "SUPABASE DATABASE: DATABASE_URL is not configured."
    );

}

// =========================================================
// CONFIGURATION
// =========================================================

const SESSION_DURATION_MS =
    1000 * 60 * 60 * 24 * 7;

const RESET_TOKEN_DURATION_MS =
    1000 * 60 * 30; // 30 minutes

const sessions = new Map();

// =========================================================
// PASSWORD RESET TABLE
// =========================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_password_resets_token
    ON password_resets(token_hash);

    CREATE INDEX IF NOT EXISTS idx_password_resets_user
    ON password_resets(user_id);
`);

// =========================================================
// HELPERS
// =========================================================

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function cleanText(value) {
    return String(value || "").trim();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password) {
    return (
        password.length >= 8 &&
        /[A-Za-z]/.test(password) &&
        /\d/.test(password)
    );
}

// =========================================================
// EMAIL CONFIGURATION - BREVO SMTP
// =========================================================

let mailTransporter = null;

function getMailTransporter() {

    if (mailTransporter) {
        return mailTransporter;
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {

        console.error(
            "SMTP CONFIG ERROR: SMTP_HOST / SMTP_USER / SMTP_PASS missing."
        );

        return null;
    }

    console.log("Creating SMTP transporter...");
    console.log("SMTP Host:", smtpHost);
    console.log("SMTP Port:", smtpPort);
    console.log("SMTP User:", smtpUser);

    mailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure:
            String(
                process.env.SMTP_SECURE || "false"
            ).toLowerCase() === "true",

        auth: {
            user: smtpUser,
            pass: smtpPass
        }
    });

    return mailTransporter;
}

// =========================================================
// SEND PASSWORD RESET EMAIL
// =========================================================

async function sendPasswordResetEmail(
    user,
    rawToken
) {

    const transporter =
        getMailTransporter();

    if (!transporter) {
        throw new Error(
            "Email service is not configured."
        );
    }

    await transporter.verify();

console.log("SMTP connection verified successfully.");

    const baseUrl =
        String(
            process.env.APP_BASE_URL ||
            "http://localhost:3000"
        ).replace(/\/+$/, "");

    const resetUrl =
        `${baseUrl}/reset-password.html?token=${encodeURIComponent(rawToken)}`;

    const mailFrom =
        process.env.MAIL_FROM ||
        process.env.SMTP_USER;

    const mailResult = await transporter.sendMail({

        from: mailFrom,

        to: user.email,

        subject:
            "Reset your U.S TRAVEL & TOURS password",

        text:
`Hello ${user.name || "Customer"},

We received a request to reset your U.S TRAVEL & TOURS account password.

Use the link below to create a new password:

${resetUrl}

This link will expire in 30 minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email.

U.S TRAVEL & TOURS`,

        html:
`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Password Reset</title>
</head>

<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">

<div style="max-width:600px;margin:40px auto;background:#ffffff;padding:40px;border-radius:10px;">

    <h2 style="margin-top:0;">
        U.S TRAVEL & TOURS
    </h2>

    <p>
        Hello ${escapeHtml(user.name || "Customer")},
    </p>

    <p>
        We received a request to reset your account password.
    </p>

    <p>
        Click the button below to create a new password.
    </p>

    <p style="margin:30px 0;">
        <a
            href="${resetUrl}"
            style="
                display:inline-block;
                padding:14px 24px;
                background:#111111;
                color:#ffffff;
                text-decoration:none;
                border-radius:6px;
                font-weight:bold;
            "
        >
            Reset Password
        </a>
    </p>

    <p style="font-size:14px;color:#666;">
        This link expires in 30 minutes and can only be used once.
    </p>

    <p style="font-size:14px;color:#666;">
        If you did not request this password reset, you can safely ignore this email.
    </p>

</div>

</body>
</html>
`
    });
     console.log("PASSWORD RESET EMAIL SENT");
    console.log("Message ID:", mailResult.messageId);
    console.log("Accepted:", mailResult.accepted);
    console.log("Rejected:", mailResult.rejected);
}

// =========================================================
// HTML ESCAPE
// =========================================================

function escapeHtml(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// =========================================================
// SESSION
// =========================================================

function createSession(user) {

    const token =
        crypto.randomBytes(32).toString("hex");

    const expiresAt =
        Date.now() + SESSION_DURATION_MS;

    sessions.set(token, {
        userId: user.id,
        role: user.role,
        expiresAt
    });

    return {
        token,
        expiresAt
    };
}

// =========================================================
// GET SESSION
// =========================================================

function getSession(token) {

    if (!token) {
        return null;
    }

    const session =
        sessions.get(token);

    if (!session) {
        return null;
    }

    if (
        Date.now() >
        session.expiresAt
    ) {
        sessions.delete(token);
        return null;
    }

    return session;
}

// =========================================================
// GET TOKEN
// =========================================================

function getTokenFromRequest(req) {

    const authHeader =
        req.headers.authorization || "";

    if (
        !authHeader.startsWith("Bearer ")
    ) {
        return null;
    }

    return authHeader
        .substring(7)
        .trim();
}

// =========================================================
// GET AUTHENTICATED USER
// =========================================================

function getAuthenticatedUser(req) {

    const token =
        getTokenFromRequest(req);

    if (!token) {
        return null;
    }

    const session =
        getSession(token);

    if (!session) {
        return null;
    }

    const user =
        db.prepare(`
            SELECT
                id,
                name,
                email,
                phone,
                role,
                created_at,
                updated_at
            FROM users
            WHERE id = ?
            LIMIT 1
        `).get(session.userId);

    if (!user) {

        sessions.delete(token);

        return null;
    }

    return {
        token,
        session,
        user
    };
}

// =========================================================
// REQUIRE LOGIN
// =========================================================

function requireAuth(
    req,
    res,
    next
) {

    const authenticated =
        getAuthenticatedUser(req);

    if (!authenticated) {

        return res.status(401).json({

            success: false,

            message:
                "Authentication required."

        });
    }

    req.user =
        authenticated.user;

    req.authToken =
        authenticated.token;

    req.session =
        authenticated.session;

    next();
}

// =========================================================
// REQUIRE ADMIN
// =========================================================

function requireAdmin(
    req,
    res,
    next
) {

    const authenticated =
        getAuthenticatedUser(req);

    if (!authenticated) {

        return res.status(401).json({

            success: false,

            message:
                "Authentication required."

        });
    }

    if (
        authenticated.user.role !==
        "admin"
    ) {

        return res.status(403).json({

            success: false,

            message:
                "Admin access required."

        });
    }

    req.user =
        authenticated.user;

    req.authToken =
        authenticated.token;

    req.session =
        authenticated.session;

    next();
}

// =========================================================
// CUSTOMER REGISTER
// POST /api/auth/register
// =========================================================

router.post(
    "/register",
    async (req, res) => {

        try {

            const name =
                cleanText(
                    req.body.name
                );

            const email =
                normalizeEmail(
                    req.body.email
                );

            const phone =
                cleanText(
                    req.body.phone
                );

            const country =
                cleanText(
                    req.body.country
                );

            const city =
                cleanText(
                    req.body.city
                );

            const password =
                cleanText(
                    req.body.password
                );

            const consent =
                Boolean(
                    req.body.consent
                );

            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (
                !name ||
                !email ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Full name, email and password are required."

                });
            }

            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });
            }

            if (!isStrongPassword(password)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must contain at least 8 characters and include letters and numbers."

                });
            }

            if (!consent) {

                return res.status(400).json({

                    success: false,

                    message:
                        "You must agree to the Terms & Conditions and Privacy Policy."

                });
            }

            // -------------------------------------------------
            // DUPLICATE EMAIL
            // -------------------------------------------------

            const existingUser =
                db.prepare(`
                    SELECT id
                    FROM users
                    WHERE email = ?
                    LIMIT 1
                `).get(email);

            if (existingUser) {

                return res.status(409).json({

                    success: false,

                    message:
                        "An account with this email already exists. Please login instead."

                });
            }

            // -------------------------------------------------
            // HASH PASSWORD
            // -------------------------------------------------

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            // -------------------------------------------------
            // CREATE CUSTOMER
            // -------------------------------------------------

            const result =
                db.prepare(`
                    INSERT INTO users (
                        name,
                        email,
                        phone,
                        password_hash,
                        role
                    )
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    name,
                    email,
                    phone || null,
                    passwordHash,
                    "customer"
                );

            return res.status(201).json({

                success: true,

                message:
                    "Account created successfully. Please login.",

                userId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Customer registration error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to create your account right now."

            });
        }
    }
);

// =========================================================
// LOGIN
// POST /api/auth/login
// CUSTOMER + ADMIN
// =========================================================

router.post(
    "/login",
    async (req, res) => {

        try {

            // -------------------------------------------------
            // NORMALIZE EMAIL
            // -------------------------------------------------

            const email =
                String(
                    req.body?.email || ""
                )
                    .trim()
                    .toLowerCase();

            // IMPORTANT:
            // Do NOT trim password.
            // Password must be checked exactly as entered.

            const password =
                String(
                    req.body?.password || ""
                );

            const remember =
                Boolean(
                    req.body?.remember
                );

            // -------------------------------------------------
            // BASIC VALIDATION
            // -------------------------------------------------

            if (
                !email ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Email and password are required."
                });

            }

            if (!isValidEmail(email)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a valid email address."
                });

            }

            // -------------------------------------------------
            // FIND USER
            // CASE + SPACE SAFE EMAIL MATCH
            // -------------------------------------------------

            const user =
                db.prepare(`
                    SELECT
                        id,
                        name,
                        email,
                        phone,
                        password_hash,
                        role
                    FROM users
                    WHERE LOWER(TRIM(email)) = ?
                    LIMIT 1
                `).get(email);

            // -------------------------------------------------
            // USER NOT FOUND
            // -------------------------------------------------

            if (!user) {

                console.log(
                    "LOGIN FAILED - USER NOT FOUND:",
                    email
                );

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });

            }

            // -------------------------------------------------
            // PASSWORD CHECK
            // -------------------------------------------------

            if (
                !user.password_hash
            ) {

                console.error(
                    "LOGIN ERROR - PASSWORD HASH MISSING:",
                    {
                        userId: user.id,
                        email: user.email
                    }
                );

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });

            }

            const passwordMatches =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );

            // -------------------------------------------------
            // WRONG PASSWORD
            // -------------------------------------------------

            if (!passwordMatches) {

                console.log(
                    "LOGIN FAILED - PASSWORD MISMATCH:",
                    email
                );

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });

            }

            // -------------------------------------------------
            // NORMALIZE ROLE
            // -------------------------------------------------

            const normalizedRole =
                String(
                    user.role || "customer"
                )
                    .trim()
                    .toLowerCase();

            // -------------------------------------------------
            // CREATE SESSION
            // -------------------------------------------------

            const session =
                createSession({
                    ...user,
                    role: normalizedRole
                });

            // -------------------------------------------------
            // RESPONSE USER
            // -------------------------------------------------

            const responseUser = {

                id: user.id,

                name: user.name,

                email:
                    String(
                        user.email || ""
                    )
                        .trim()
                        .toLowerCase(),

                phone: user.phone,

                role: normalizedRole

            };

            // -------------------------------------------------
            // SUCCESS
            // -------------------------------------------------

            console.log(
                "LOGIN SUCCESS:",
                {
                    userId: user.id,
                    email: responseUser.email,
                    role: normalizedRole
                }
            );

            return res.status(200).json({

                success: true,

                message:
                    "Login successful.",

                token:
                    session.token,

                expiresAt:
                    session.expiresAt,

                remember,

                user:
                    responseUser

            });

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to process login right now."

            });

        }

    }
);

// =========================================================
// LOGOUT
// =========================================================

router.post(
    "/logout",
    requireAuth,
    (req, res) => {

        sessions.delete(
            req.authToken
        );

        return res.status(200).json({

            success: true,

            message:
                "Logout successful."

        });
    }
);

console.log("AUTH DEBUG requireAuth:", typeof requireAuth);
console.log("AUTH DEBUG requireAdmin:", typeof requireAdmin);

// =========================================================
// CURRENT USER
// GET /api/auth/me
// =========================================================

router.get(
    "/me",
    requireAuth,
    (req, res) => {

        return res.status(200).json({

            success: true,

            user:
                req.user

        });
    }
);

// =========================================================
// ADMIN CHECK
// =========================================================

router.get(
    "/admin-check",
    requireAdmin,
    (req, res) => {

        return res.status(200).json({

            success: true,

            message:
                "Admin authentication verified.",

            user:
                req.user

        });
    }
);

// =========================================================
// ADMIN CREATE USER
// =========================================================

router.post(
    "/create-user",
    requireAdmin,
    async (req, res) => {

        try {

            const name =
                cleanText(
                    req.body.name
                );

            const email =
                normalizeEmail(
                    req.body.email
                );

            const phone =
                cleanText(
                    req.body.phone
                );

            const password =
                cleanText(
                    req.body.password
                );

            const role =
                cleanText(
                    req.body.role ||
                    "customer"
                );

            if (
                !name ||
                !email ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Name, email and password are required."

                });
            }

            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });
            }

            if (!isStrongPassword(password)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must contain at least 8 characters and include letters and numbers."

                });
            }

            if (
                !["customer", "admin"]
                    .includes(role)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid account role."

                });
            }

            const existingUser =
                db.prepare(`
                    SELECT id
                    FROM users
                    WHERE email = ?
                    LIMIT 1
                `).get(email);

            if (existingUser) {

                return res.status(409).json({

                    success: false,

                    message:
                        "An account with this email already exists."

                });
            }

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            const result =
                db.prepare(`
                    INSERT INTO users (
                        name,
                        email,
                        phone,
                        password_hash,
                        role
                    )
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    name,
                    email,
                    phone || null,
                    passwordHash,
                    role
                );

            return res.status(201).json({

                success: true,

                message:
                    "User account created successfully.",

                userId:
                    result.lastInsertRowid

            });

        } catch (error) {

            console.error(
                "Create user error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to create user account."

            });
        }
    }
);

// =========================================================
// FORGOT PASSWORD
// POST /api/auth/forgot-password
// =========================================================

router.post(
    "/forgot-password",
    async (req, res) => {

        try {

            const email =
                normalizeEmail(
                    req.body.email
                );

            // Always return the same message.
            // This prevents account enumeration.

            const genericMessage =
                "If an account exists for this email, a password reset link has been sent.";

            if (
                !email ||
                !isValidEmail(email)
            ) {

                return res.status(200).json({

                    success: true,

                    message:
                        genericMessage

                });
            }

            const user =
                db.prepare(`
                    SELECT
                        id,
                        name,
                        email
                    FROM users
                    WHERE email = ?
                    LIMIT 1
                `).get(email);

            if (!user) {

                return res.status(200).json({

                    success: true,

                    message:
                        genericMessage

                });
            }

            // -------------------------------------------------
            // REMOVE OLD RESET TOKENS
            // -------------------------------------------------

            db.prepare(`
                DELETE FROM password_resets
                WHERE user_id = ?
            `).run(user.id);

            // -------------------------------------------------
            // GENERATE SECURE TOKEN
            // -------------------------------------------------

            const rawToken =
                crypto
                    .randomBytes(32)
                    .toString("hex");

            const tokenHash =
                crypto
                    .createHash("sha256")
                    .update(rawToken)
                    .digest("hex");

            const expiresAt =
                Date.now() +
                RESET_TOKEN_DURATION_MS;

            db.prepare(`
                INSERT INTO password_resets (
                    user_id,
                    token_hash,
                    expires_at
                )
                VALUES (?, ?, ?)
            `).run(
                user.id,
                tokenHash,
                expiresAt
            );

            // -------------------------------------------------
            // SEND EMAIL
            // -------------------------------------------------

            try {

                await sendPasswordResetEmail(
                    user,
                    rawToken
                );

            } catch (mailError) {

                console.error(
                    "Password reset email error:",
                    mailError
                );

                // Delete unusable token
                db.prepare(`
                    DELETE FROM password_resets
                    WHERE token_hash = ?
                `).run(tokenHash);

                return res.status(200).json({

                    success: true,

                    message:
                        genericMessage

                });
            }

            return res.status(200).json({

                success: true,

                message:
                    genericMessage

            });

        } catch (error) {

            console.error(
                "Forgot password error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to process your password reset request right now."

            });
        }
    }
);

// =========================================================
// RESET PASSWORD
// POST /api/auth/reset-password
// =========================================================

router.post(
    "/reset-password",
    async (req, res) => {

        try {

            const token =
                cleanText(
                    req.body.token
                );

            const newPassword =
                cleanText(
                    req.body.newPassword
                );

            const confirmPassword =
                cleanText(
                    req.body.confirmPassword
                );

            if (
                !token ||
                !newPassword ||
                !confirmPassword
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Reset token and password are required."

                });
            }

            if (
                newPassword !==
                confirmPassword
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Passwords do not match."

                });
            }

            if (
                !isStrongPassword(
                    newPassword
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must contain at least 8 characters and include letters and numbers."

                });
            }

            const tokenHash =
                crypto
                    .createHash("sha256")
                    .update(token)
                    .digest("hex");

            const resetRecord =
                db.prepare(`
                    SELECT
                        id,
                        user_id,
                        expires_at,
                        used_at
                    FROM password_resets
                    WHERE token_hash = ?
                    LIMIT 1
                `).get(tokenHash);

            if (!resetRecord) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This password reset link is invalid or has expired."

                });
            }

            if (resetRecord.used_at) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This password reset link has already been used."

                });
            }

            if (
                Date.now() >
                Number(
                    resetRecord.expires_at
                )
            ) {

                db.prepare(`
                    DELETE FROM password_resets
                    WHERE id = ?
                `).run(resetRecord.id);

                return res.status(400).json({

                    success: false,

                    message:
                        "This password reset link has expired. Please request a new one."

                });
            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            // -------------------------------------------------
            // UPDATE PASSWORD
            // -------------------------------------------------

            const transaction =
                db.transaction(() => {

                    db.prepare(`
                        UPDATE users
                        SET
                            password_hash = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(
                        passwordHash,
                        resetRecord.user_id
                    );

                    db.prepare(`
                        UPDATE password_resets
                        SET used_at = ?
                        WHERE id = ?
                    `).run(
                        Date.now(),
                        resetRecord.id
                    );
                });

            transaction();

            // -------------------------------------------------
            // INVALIDATE ALL EXISTING SESSIONS
            // -------------------------------------------------

            for (
                const [
                    sessionToken,
                    session
                ] of sessions.entries()
            ) {

                if (
                    session.userId ===
                    resetRecord.user_id
                ) {

                    sessions.delete(
                        sessionToken
                    );
                }
            }

            return res.status(200).json({

                success: true,

                message:
                    "Your password has been reset successfully. Please login with your new password."

            });

        } catch (error) {

            console.error(
                "Reset password error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to reset your password right now."

            });
        }
    }
);

// =========================================================
// CHANGE PASSWORD
// =========================================================

router.post(
    "/change-password",
    requireAuth,
    async (req, res) => {

        try {

            const currentPassword =
                cleanText(
                    req.body.currentPassword
                );

            const newPassword =
                cleanText(
                    req.body.newPassword
                );

            if (
                !currentPassword ||
                !newPassword
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Current password and new password are required."

                });
            }

            if (
                !isStrongPassword(
                    newPassword
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "New password must contain at least 8 characters and include letters and numbers."

                });
            }

            const user =
                db.prepare(`
                    SELECT
                        id,
                        password_hash
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                `).get(req.user.id);

            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });
            }

            const currentMatches =
                await bcrypt.compare(
                    currentPassword,
                    user.password_hash
                );

            if (!currentMatches) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Current password is incorrect."

                });
            }

            const newPasswordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            db.prepare(`
                UPDATE users
                SET
                    password_hash = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                newPasswordHash,
                req.user.id
            );

            for (
                const [
                    token,
                    session
                ] of sessions.entries()
            ) {

                if (
                    session.userId ===
                    req.user.id
                ) {

                    sessions.delete(token);
                }
            }

            return res.status(200).json({

                success: true,

                message:
                    "Password changed successfully. Please login again."

            });

        } catch (error) {

            console.error(
                "Change password error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to change password right now."

            });
        }
    }
);

// =========================================================
// CLEAN EXPIRED SESSIONS / RESET TOKENS
// =========================================================

setInterval(() => {

    const now =
        Date.now();

    for (
        const [
            token,
            session
        ] of sessions.entries()
    ) {

        if (
            now >
            session.expiresAt
        ) {

            sessions.delete(token);
        }
    }

    db.prepare(`
        DELETE FROM password_resets
        WHERE expires_at < ?
        OR used_at IS NOT NULL
    `).run(now);

}, 1000 * 60 * 30);

// =========================================================
// EXPORT
// =========================================================

module.exports = router;

module.exports.requireAuth =
    requireAuth;

module.exports.requireAdmin =
    requireAdmin;

console.log(
    "U.S TRAVEL & TOURS authentication system initialized."
);
