/* =========================================================
   U.S TRAVEL & TOURS
   AUTHENTICATION SYSTEM
   PostgreSQL Version

   Features:
   - Customer registration
   - Customer login
   - Admin login
   - Persistent sessions
   - Remember Me
   - Logout
   - Current user
   - Admin check
   - Admin create user
   - Forgot password
   - Reset password
   - Change password
   ========================================================= */

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const {
    pool,
    initializeDatabase
} = require("./database");

const router = express.Router();


// =========================================================
// DATABASE READY
// =========================================================

const databaseReady = initializeDatabase();


// =========================================================
// SESSION SETTINGS
// =========================================================

const SESSION_DURATION_MS =
    7 * 24 * 60 * 60 * 1000;

const REMEMBER_SESSION_DURATION_MS =
    30 * 24 * 60 * 60 * 1000;

const RESET_TOKEN_DURATION_MS =
    30 * 60 * 1000;


// =========================================================
// EMAIL SETTINGS
// =========================================================

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(process.env.SMTP_PORT || 587);

const SMTP_USER =
    String(process.env.SMTP_USER || "").trim();

const SMTP_PASS =
    String(process.env.SMTP_PASS || "").trim();

const SMTP_SECURE =
    String(
        process.env.SMTP_SECURE || "false"
    ).toLowerCase() === "true";

const APP_BASE_URL =
    String(
        process.env.APP_BASE_URL ||
        "https://us-travel-tours.netlify.app"
    ).replace(/\/+$/, "");

const MAIL_FROM =
    String(
        process.env.MAIL_FROM ||
        SMTP_USER ||
        "ellisgeorge690@gmail.com"
    ).trim();


// =========================================================
// SMTP TRANSPORTER
// =========================================================

let transporter = null;

if (SMTP_USER && SMTP_PASS) {

    transporter = nodemailer.createTransport({
        host: SMTP_HOST,

        port: SMTP_PORT,

        secure: SMTP_SECURE,

        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    console.log(
        "Authentication email transporter configured."
    );

} else {

    console.warn(
        "SMTP credentials are not configured. Password reset emails will be unavailable."
    );

}


// =========================================================
// HELPERS
// =========================================================

function normalizeEmail(email) {

    return String(email || "")
        .trim()
        .toLowerCase();

}


function cleanText(value, maxLength = 500) {

    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, maxLength);

}


function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);

}


function isStrongPassword(password) {

    const value =
        String(password || "");

    return (
        value.length >= 8 &&
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value) &&
        /[0-9]/.test(value)
    );

}


function hashToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


function createRandomToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


function getTokenFromRequest(req) {

    const header =
        String(
            req.headers.authorization || ""
        ).trim();

    if (!header) {
        return null;
    }

    if (
        header
            .toLowerCase()
            .startsWith("bearer ")
    ) {

        return header
            .slice(7)
            .trim() || null;

    }

    return null;

}


function publicUser(user) {

    if (!user) {
        return null;
    }

    return {
        id: Number(user.id),

        name: user.name,

        email: user.email,

        phone: user.phone || "",

        role: user.role,

        createdAt: user.created_at,

        updatedAt: user.updated_at
    };

}


// =========================================================
// SEND PASSWORD RESET EMAIL
// =========================================================

async function sendPasswordResetEmail(
    user,
    resetToken
) {

    if (!transporter) {

        throw new Error(
            "Email service is not configured."
        );

    }

    const resetUrl =
        `${APP_BASE_URL}/reset-password.html?token=${encodeURIComponent(resetToken)}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<title>Password Reset</title>

</head>

<body style="
    margin:0;
    padding:0;
    background:#f4f6f8;
    font-family:Arial,Helvetica,sans-serif;
">

<div style="
    max-width:600px;
    margin:40px auto;
    background:#ffffff;
    padding:35px;
    border-radius:12px;
    box-shadow:0 5px 25px rgba(0,0,0,0.08);
">

<h2 style="
    margin-top:0;
    color:#061426;
">
U.S TRAVEL & TOURS
</h2>

<p>
Hello ${escapeHtml(user.name || "Customer")},
</p>

<p>
We received a request to reset the password for your account.
</p>

<p>
Click the button below to create a new password:
</p>

<p style="margin:30px 0;">

<a
    href="${resetUrl}"
    style="
        display:inline-block;
        background:#061426;
        color:#ffffff;
        text-decoration:none;
        padding:14px 24px;
        border-radius:6px;
        font-weight:bold;
    "
>
Reset Password
</a>

</p>

<p>
This password reset link is valid for 30 minutes.
</p>

<p>
If you did not request this password reset, you can safely ignore this email.
</p>

<hr style="
    border:none;
    border-top:1px solid #eeeeee;
    margin:30px 0;
">

<p style="
    color:#777777;
    font-size:13px;
">
U.S TRAVEL & TOURS
</p>

</div>

</body>
</html>
`;

    const text = `
U.S TRAVEL & TOURS

Hello ${user.name || "Customer"},

We received a request to reset your password.

Use the following link to reset your password:

${resetUrl}

This link is valid for 30 minutes.

If you did not request this password reset, you can ignore this email.
`;

    await transporter.verify();

    await transporter.sendMail({

        from: MAIL_FROM,

        to: user.email,

        subject:
            "U.S TRAVEL & TOURS - Password Reset",

        text,

        html

    });

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
// CREATE SESSION
// =========================================================

async function createSession(
    user,
    remember = false
) {

    await databaseReady;

    const token =
        createRandomToken();

    const tokenHash =
        hashToken(token);

    const duration =
        remember
            ? REMEMBER_SESSION_DURATION_MS
            : SESSION_DURATION_MS;

    const expiresAt =
        Date.now() + duration;

    await pool.query(
        `
        INSERT INTO sessions (
            token_hash,
            user_id,
            role,
            expires_at,
            created_at,
            last_used_at
        )

        VALUES (
            $1,
            $2,
            $3,
            $4,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        `,
        [
            tokenHash,
            user.id,
            user.role,
            expiresAt
        ]
    );

    return {
        token,
        expiresAt
    };

}


// =========================================================
// GET SESSION
// =========================================================

async function getSession(token) {

    if (!token) {
        return null;
    }

    await databaseReady;

    const tokenHash =
        hashToken(token);

    const result =
        await pool.query(
            `
            SELECT
                id,
                token_hash,
                user_id,
                role,
                expires_at,
                created_at,
                last_used_at

            FROM sessions

            WHERE token_hash = $1

            LIMIT 1
            `,
            [tokenHash]
        );

    if (result.rows.length === 0) {
        return null;
    }

    const session =
        result.rows[0];

    const expiresAt =
        Number(session.expires_at);

    if (
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
    ) {

        await pool.query(
            `
            DELETE FROM sessions
            WHERE id = $1
            `,
            [session.id]
        );

        return null;
    }

    await pool.query(
        `
        UPDATE sessions

        SET last_used_at =
            CURRENT_TIMESTAMP

        WHERE id = $1
        `,
        [session.id]
    );

    return {
        id: Number(session.id),

        userId: Number(session.user_id),

        role: session.role,

        expiresAt
    };

}


// =========================================================
// DELETE SESSION
// =========================================================

async function deleteSession(token) {

    if (!token) {
        return;
    }

    await databaseReady;

    const tokenHash =
        hashToken(token);

    await pool.query(
        `
        DELETE FROM sessions

        WHERE token_hash = $1
        `,
        [tokenHash]
    );

}


// =========================================================
// DELETE ALL USER SESSIONS
// =========================================================

async function deleteAllUserSessions(
    userId
) {

    await databaseReady;

    await pool.query(
        `
        DELETE FROM sessions

        WHERE user_id = $1
        `,
        [userId]
    );

}


// =========================================================
// GET AUTHENTICATED USER
// =========================================================

async function getAuthenticatedUser(
    req
) {

    const token =
        getTokenFromRequest(req);

    if (!token) {
        return null;
    }

    const session =
        await getSession(token);

    if (!session) {
        return null;
    }

    const result =
        await pool.query(
            `
            SELECT
                id,
                name,
                email,
                phone,
                password_hash,
                role,
                created_at,
                updated_at

            FROM users

            WHERE id = $1

            LIMIT 1
            `,
            [session.userId]
        );

    if (result.rows.length === 0) {

        await deleteSession(token);

        return null;

    }

    const user =
        result.rows[0];

    // Keep session role synchronized.
    if (user.role !== session.role) {

        await pool.query(
            `
            UPDATE sessions

            SET role = $1

            WHERE id = $2
            `,
            [
                user.role,
                session.id
            ]
        );

    }

    return user;

}


// =========================================================
// AUTH MIDDLEWARE
// =========================================================

async function requireAuth(
    req,
    res,
    next
) {

    try {

        await databaseReady;

        const user =
            await getAuthenticatedUser(req);

        if (!user) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });

        }

        req.user = user;

        next();

    } catch (error) {

        console.error(
            "Authentication middleware error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Authentication service error."
        });

    }

}


// =========================================================
// ADMIN MIDDLEWARE
// =========================================================

async function requireAdmin(
    req,
    res,
    next
) {

    try {

        await databaseReady;

        const user =
            await getAuthenticatedUser(req);

        if (!user) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });

        }

        if (user.role !== "admin") {

            return res.status(403).json({
                success: false,
                message:
                    "Administrator access required."
            });

        }

        req.user = user;

        next();

    } catch (error) {

        console.error(
            "Admin middleware error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Authentication service error."
        });

    }

}


// =========================================================
// REGISTER CUSTOMER
// =========================================================

router.post(
    "/register",
    async (req, res) => {

        try {

            await databaseReady;

            const name =
                cleanText(
                    req.body.name,
                    100
                );

            const email =
                normalizeEmail(
                    req.body.email
                );

            const phone =
                cleanText(
                    req.body.phone,
                    30
                );

            const password =
                String(
                    req.body.password || ""
                );

            const consent =
                req.body.consent === true ||
                req.body.consent === "true" ||
                req.body.consent === 1 ||
                req.body.consent === "1";

            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (!name) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name is required."
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
                        "Password must be at least 8 characters and contain uppercase, lowercase and a number."
                });

            }

            if (!consent) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please accept the terms and privacy policy."
                });

            }

            // -------------------------------------------------
            // CHECK DUPLICATE
            // -------------------------------------------------

            const existing =
                await pool.query(
                    `
                    SELECT id

                    FROM users

                    WHERE LOWER(email) = LOWER($1)

                    LIMIT 1
                    `,
                    [email]
                );

            if (existing.rows.length > 0) {

                return res.status(409).json({
                    success: false,
                    message:
                        "An account with this email already exists."
                });

            }

            // -------------------------------------------------
            // PASSWORD HASH
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
                await pool.query(
                    `
                    INSERT INTO users (
                        name,
                        email,
                        phone,
                        password_hash,
                        role,
                        created_at,
                        updated_at
                    )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        'customer',
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )

                    RETURNING
                        id,
                        name,
                        email,
                        phone,
                        role,
                        created_at,
                        updated_at
                    `,
                    [
                        name,
                        email,
                        phone || null,
                        passwordHash
                    ]
                );

            const user =
                result.rows[0];

            console.log(
                `New customer registered: ${email}`
            );

            return res.status(201).json({

                success: true,

                message:
                    "Account created successfully.",

                user: publicUser(user),

                userId: Number(user.id)

            });

        } catch (error) {

            console.error(
                "Registration error:",
                error
            );

            if (
                error &&
                error.code === "23505"
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        "An account with this email already exists."
                });

            }

            return res.status(500).json({
                success: false,
                message:
                    "Unable to create account."
            });

        }

    }
);


// =========================================================
// LOGIN
// =========================================================

router.post(
    "/login",
    async (req, res) => {

        try {

            await databaseReady;

            const email =
                normalizeEmail(
                    req.body.email
                );

            // DO NOT trim password.
            // Password spaces may be intentional.
            const password =
                String(
                    req.body.password || ""
                );

            const remember =
                req.body.remember === true ||
                req.body.remember === "true" ||
                req.body.remember === 1 ||
                req.body.remember === "1";

            if (!isValidEmail(email)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a valid email address."
                });

            }

            if (!password) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Password is required."
                });

            }

            // -------------------------------------------------
            // FIND USER
            // -------------------------------------------------

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        phone,
                        password_hash,
                        role,
                        created_at,
                        updated_at

                    FROM users

                    WHERE LOWER(email) = LOWER($1)

                    LIMIT 1
                    `,
                    [email]
                );

            if (result.rows.length === 0) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });

            }

            const user =
                result.rows[0];

            // -------------------------------------------------
            // PASSWORD CHECK
            // -------------------------------------------------

            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );

            if (!passwordMatch) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });

            }

            // -------------------------------------------------
            // CREATE PERSISTENT SESSION
            // -------------------------------------------------

            const session =
                await createSession(
                    user,
                    remember
                );

            console.log(
                `Successful login: ${email} (${user.role})`
            );

            return res.json({

                success: true,

                message:
                    "Login successful.",

                token:
                    session.token,

                expiresAt:
                    session.expiresAt,

                remember,

                user:
                    publicUser(user)

            });

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to login."
            });

        }

    }
);


// =========================================================
// LOGOUT
// =========================================================

router.post(
    "/logout",
    async (req, res) => {

        try {

            await databaseReady;

            const token =
                getTokenFromRequest(req);

            if (token) {

                await deleteSession(
                    token
                );

            }

            return res.json({

                success: true,

                message:
                    "Logged out successfully."

            });

        } catch (error) {

            console.error(
                "Logout error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to logout."
            });

        }

    }
);


// =========================================================
// CURRENT USER
// =========================================================

router.get(
    "/me",
    async (req, res) => {

        try {

            await databaseReady;

            const user =
                await getAuthenticatedUser(req);

            if (!user) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Not authenticated."
                });

            }

            return res.json({

                success: true,

                authenticated: true,

                user:
                    publicUser(user)

            });

        } catch (error) {

            console.error(
                "GET /me error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load user."
            });

        }

    }
);


// =========================================================
// ADMIN CHECK
// =========================================================

router.get(
    "/admin-check",
    async (req, res) => {

        try {

            await databaseReady;

            const user =
                await getAuthenticatedUser(req);

            if (!user) {

                return res.status(401).json({
                    success: false,
                    isAdmin: false,
                    message:
                        "Not authenticated."
                });

            }

            if (user.role !== "admin") {

                return res.status(403).json({
                    success: false,
                    isAdmin: false,
                    message:
                        "Administrator access required."
                });

            }

            return res.json({

                success: true,

                isAdmin: true,

                user:
                    publicUser(user)

            });

        } catch (error) {

            console.error(
                "Admin check error:",
                error
            );

            return res.status(500).json({
                success: false,
                isAdmin: false,
                message:
                    "Unable to check administrator access."
            });

        }

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

            await databaseReady;

            const name =
                cleanText(
                    req.body.name,
                    100
                );

            const email =
                normalizeEmail(
                    req.body.email
                );

            const phone =
                cleanText(
                    req.body.phone,
                    30
                );

            const password =
                String(
                    req.body.password || ""
                );

            const requestedRole =
                String(
                    req.body.role || "customer"
                )
                    .trim()
                    .toLowerCase();

            if (!name) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name is required."
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
                        "Password must be at least 8 characters and contain uppercase, lowercase and a number."
                });

            }

            if (
                requestedRole !== "customer" &&
                requestedRole !== "admin"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid user role."
                });

            }

            const existing =
                await pool.query(
                    `
                    SELECT id

                    FROM users

                    WHERE LOWER(email) = LOWER($1)

                    LIMIT 1
                    `,
                    [email]
                );

            if (existing.rows.length > 0) {

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
                await pool.query(
                    `
                    INSERT INTO users (
                        name,
                        email,
                        phone,
                        password_hash,
                        role,
                        created_at,
                        updated_at
                    )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )

                    RETURNING
                        id,
                        name,
                        email,
                        phone,
                        role,
                        created_at,
                        updated_at
                    `,
                    [
                        name,
                        email,
                        phone || null,
                        passwordHash,
                        requestedRole
                    ]
                );

            const user =
                result.rows[0];

            return res.status(201).json({

                success: true,

                message:
                    "User created successfully.",

                user:
                    publicUser(user),

                userId:
                    Number(user.id)

            });

        } catch (error) {

            console.error(
                "Admin create-user error:",
                error
            );

            if (
                error &&
                error.code === "23505"
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        "An account with this email already exists."
                });

            }

            return res.status(500).json({
                success: false,
                message:
                    "Unable to create user."
            });

        }

    }
);


// =========================================================
// FORGOT PASSWORD
// =========================================================

router.post(
    "/forgot-password",
    async (req, res) => {

        try {

            await databaseReady;

            const email =
                normalizeEmail(
                    req.body.email
                );

            if (!isValidEmail(email)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a valid email address."
                });

            }

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role

                    FROM users

                    WHERE LOWER(email) = LOWER($1)

                    LIMIT 1
                    `,
                    [email]
                );

            // Always use a generic response
            // so account existence is not exposed.
            if (result.rows.length === 0) {

                return res.json({

                    success: true,

                    message:
                        "If an account exists with this email, a password reset link has been sent."

                });

            }

            const user =
                result.rows[0];

            // -------------------------------------------------
            // INVALIDATE OLD RESET TOKENS
            // -------------------------------------------------

            await pool.query(
                `
                UPDATE password_resets

                SET used_at = $1

                WHERE user_id = $2

                AND used_at IS NULL
                `,
                [
                    Date.now(),
                    user.id
                ]
            );

            const resetToken =
                createRandomToken();

            const tokenHash =
                hashToken(resetToken);

            const expiresAt =
                Date.now() +
                RESET_TOKEN_DURATION_MS;

            await pool.query(
                `
                INSERT INTO password_resets (
                    user_id,
                    token_hash,
                    expires_at,
                    created_at
                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    user.id,
                    tokenHash,
                    expiresAt
                ]
            );

            await sendPasswordResetEmail(
                user,
                resetToken
            );

            return res.json({

                success: true,

                message:
                    "If an account exists with this email, a password reset link has been sent."

            });

        } catch (error) {

            console.error(
                "Forgot password error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to process password reset request."
            });

        }

    }
);


// =========================================================
// RESET PASSWORD
// =========================================================

router.post(
    "/reset-password",
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            await databaseReady;

            const token =
                String(
                    req.body.token || ""
                ).trim();

            const newPassword =
                String(
                    req.body.password ||
                    req.body.newPassword ||
                    ""
                );

            if (!token) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Reset token is required."
                });

            }

            if (!isStrongPassword(newPassword)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Password must be at least 8 characters and contain uppercase, lowercase and a number."
                });

            }

            const tokenHash =
                hashToken(token);

            await client.query(
                "BEGIN"
            );

            const resetResult =
                await client.query(
                    `
                    SELECT
                        id,
                        user_id,
                        expires_at,
                        used_at

                    FROM password_resets

                    WHERE token_hash = $1

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [tokenHash]
                );

            if (
                resetResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid or expired reset token."
                });

            }

            const reset =
                resetResult.rows[0];

            if (
                reset.used_at !== null ||
                Number(reset.expires_at) <= Date.now()
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid or expired reset token."
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

            await client.query(
                `
                UPDATE users

                SET
                    password_hash = $1,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    passwordHash,
                    reset.user_id
                ]
            );

            // -------------------------------------------------
            // MARK TOKEN USED
            // -------------------------------------------------

            await client.query(
                `
                UPDATE password_resets

                SET used_at = $1

                WHERE id = $2
                `,
                [
                    Date.now(),
                    reset.id
                ]
            );

            // -------------------------------------------------
            // DELETE ALL OLD SESSIONS
            // -------------------------------------------------

            await client.query(
                `
                DELETE FROM sessions

                WHERE user_id = $1
                `,
                [reset.user_id]
            );

            await client.query(
                "COMMIT"
            );

            return res.json({

                success: true,

                message:
                    "Password reset successfully. Please login again."

            });

        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}

            console.error(
                "Reset password error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to reset password."
            });

        } finally {

            client.release();

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

            await databaseReady;

            const currentPassword =
                String(
                    req.body.currentPassword || ""
                );

            const newPassword =
                String(
                    req.body.newPassword ||
                    req.body.password ||
                    ""
                );

            if (!currentPassword) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Current password is required."
                });

            }

            if (!isStrongPassword(newPassword)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "New password must be at least 8 characters and contain uppercase, lowercase and a number."
                });

            }

            if (
                currentPassword === newPassword
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "New password must be different from the current password."
                });

            }

            const passwordMatch =
                await bcrypt.compare(
                    currentPassword,
                    req.user.password_hash
                );

            if (!passwordMatch) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Current password is incorrect."
                });

            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            await pool.query(
                `
                UPDATE users

                SET
                    password_hash = $1,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    passwordHash,
                    req.user.id
                ]
            );

            // -------------------------------------------------
            // SECURITY:
            // Remove all old sessions.
            // User must login again.
            // -------------------------------------------------

            await deleteAllUserSessions(
                req.user.id
            );

            return res.json({

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
                    "Unable to change password."
            });

        }

    }
);


// =========================================================
// CLEAN EXPIRED SESSIONS / RESET TOKENS
// =========================================================

async function cleanupExpiredAuthData() {

    try {

        await databaseReady;

        const now =
            Date.now();

        await pool.query(
            `
            DELETE FROM sessions

            WHERE expires_at <= $1
            `,
            [now]
        );

        await pool.query(
            `
            DELETE FROM password_resets

            WHERE expires_at <= $1

            OR used_at IS NOT NULL
            `,
            [now]
        );

    } catch (error) {

        console.error(
            "Auth cleanup error:",
            error
        );

    }

}


// =========================================================
// CLEANUP EVERY 30 MINUTES
// =========================================================

const cleanupTimer =
    setInterval(
        cleanupExpiredAuthData,
        30 * 60 * 1000
    );

if (
    cleanupTimer &&
    typeof cleanupTimer.unref === "function"
) {

    cleanupTimer.unref();

}


// =========================================================
// INITIAL DATABASE READY LOG
// =========================================================

databaseReady
    .then(() => {

        console.log(
            "Persistent PostgreSQL authentication is ready."
        );

    })
    .catch((error) => {

        console.error(
            "PostgreSQL authentication initialization failed:",
            error
        );

    });


// =========================================================
// EXPORT
// =========================================================

module.exports = {

    router,

    requireAuth,

    requireAdmin,

    getAuthenticatedUser,

    createSession,

    getSession,

    deleteSession,

    deleteAllUserSessions

};
