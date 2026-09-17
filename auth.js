// =========================================================
// U.S TRAVEL & TOURS
// CUSTOMER + ADMIN AUTHENTICATION SYSTEM
// SUPABASE / POSTGRESQL VERSION
// =========================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

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

    console.error(
        "SUPABASE DATABASE ERROR: DATABASE_URL is not configured."
    );

}

// =========================================================
// DATABASE CHECK
// =========================================================

function getPool() {

    if (!supabasePool) {

        throw new Error(
            "Supabase PostgreSQL database is not configured. DATABASE_URL is missing."
        );

    }

    return supabasePool;
}


// =========================================================
// CONFIGURATION
// =========================================================

// Normal session duration
const SESSION_DURATION_MS =
    1000 * 60 * 60 * 24 * 7;

// Remember-me session duration
const REMEMBER_SESSION_DURATION_MS =
    1000 * 60 * 60 * 24 * 30;

// Password reset duration
const RESET_TOKEN_DURATION_MS =
    1000 * 60 * 30;


// =========================================================
// AUTH INITIALIZATION
// =========================================================
//
// This creates the bootstrap admin directly in Supabase
// when BOOTSTRAP_ADMIN_* environment variables are present.
//
// server.js can continue running unchanged.
// =========================================================

let authInitialization = null;


async function initializeAuthDatabase() {

    const pool = getPool();

    // -----------------------------------------------------
    // Make sure required tables exist.
    //
    // These tables should normally already exist because
    // they were created in Supabase SQL.
    // -----------------------------------------------------

    await pool.query(`

        CREATE TABLE IF NOT EXISTS users (

            id BIGSERIAL PRIMARY KEY,

            name TEXT NOT NULL,

            email TEXT NOT NULL UNIQUE,

            phone TEXT,

            password_hash TEXT NOT NULL,

            role TEXT NOT NULL DEFAULT 'customer'
                CHECK (
                    role IN ('customer', 'admin')
                ),

            created_at TIMESTAMPTZ DEFAULT NOW(),

            updated_at TIMESTAMPTZ DEFAULT NOW()

        );

        CREATE INDEX IF NOT EXISTS idx_users_email
        ON users(email);

    `);


    await pool.query(`

        CREATE TABLE IF NOT EXISTS sessions (

            id BIGSERIAL PRIMARY KEY,

            token_hash TEXT UNIQUE NOT NULL,

            user_id BIGINT NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,

            expires_at BIGINT NOT NULL,

            created_at TIMESTAMPTZ DEFAULT NOW(),

            last_used_at TIMESTAMPTZ DEFAULT NOW()

        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
        ON sessions(token_hash);

        CREATE INDEX IF NOT EXISTS idx_sessions_user_id
        ON sessions(user_id);

        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
        ON sessions(expires_at);

    `);


    await pool.query(`

        CREATE TABLE IF NOT EXISTS password_resets (

            id BIGSERIAL PRIMARY KEY,

            user_id BIGINT NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,

            token_hash TEXT UNIQUE NOT NULL,

            expires_at BIGINT NOT NULL,

            used_at BIGINT,

            created_at TIMESTAMPTZ DEFAULT NOW()

        );

        CREATE INDEX IF NOT EXISTS idx_password_resets_token
        ON password_resets(token_hash);

        CREATE INDEX IF NOT EXISTS idx_password_resets_user
        ON password_resets(user_id);

    `);


    // -----------------------------------------------------
    // BOOTSTRAP ADMIN
    // -----------------------------------------------------

    const adminName =
        String(
            process.env.BOOTSTRAP_ADMIN_NAME || ""
        ).trim();

    const adminEmail =
        String(
            process.env.BOOTSTRAP_ADMIN_EMAIL || ""
        )
            .trim()
            .toLowerCase();

    const adminPassword =
        String(
            process.env.BOOTSTRAP_ADMIN_PASSWORD || ""
        );


    if (
        adminName &&
        adminEmail &&
        adminPassword
    ) {

        if (
            isValidEmail(adminEmail) &&
            isStrongPassword(adminPassword)
        ) {

            const existingAdmin =
                await pool.query(
                    `
                    SELECT
                        id,
                        role
                    FROM users
                    WHERE LOWER(TRIM(email)) = $1
                    LIMIT 1
                    `,
                    [adminEmail]
                );


            if (
                existingAdmin.rows.length === 0
            ) {

                const passwordHash =
                    await bcrypt.hash(
                        adminPassword,
                        12
                    );


                await pool.query(
                    `
                    INSERT INTO users (
                        name,
                        email,
                        phone,
                        password_hash,
                        role
                    )
                    VALUES ($1, $2, $3, $4, $5)
                    `,
                    [
                        adminName,
                        adminEmail,
                        null,
                        passwordHash,
                        "admin"
                    ]
                );


                console.log(
                    "SUPABASE ADMIN: Bootstrap admin created."
                );

            } else {

                const existingRole =
                    String(
                        existingAdmin.rows[0].role || ""
                    )
                        .trim()
                        .toLowerCase();


                if (
                    existingRole !== "admin"
                ) {

                    await pool.query(
                        `
                        UPDATE users
                        SET
                            role = 'admin',
                            updated_at = NOW()
                        WHERE id = $1
                        `,
                        [
                            existingAdmin.rows[0].id
                        ]
                    );


                    console.log(
                        "SUPABASE ADMIN: Existing bootstrap account promoted to admin."
                    );

                } else {

                    console.log(
                        "SUPABASE ADMIN: Bootstrap admin already exists."
                    );

                }

            }

        } else {

            console.warn(
                "SUPABASE ADMIN: Bootstrap admin credentials are invalid."
            );

        }

    } else {

        console.warn(
            "SUPABASE ADMIN: BOOTSTRAP_ADMIN_NAME / EMAIL / PASSWORD not fully configured."
        );

    }

}


// ---------------------------------------------------------
// Start initialization once.
// ---------------------------------------------------------

if (supabasePool) {

    authInitialization =
        initializeAuthDatabase()
            .then(() => {

                console.log(
                    "SUPABASE AUTH: Database initialization completed."
                );

            })
            .catch((error) => {

                console.error(
                    "SUPABASE AUTH INITIALIZATION ERROR:",
                    error
                );

                throw error;

            });

} else {

    authInitialization =
        Promise.reject(
            new Error(
                "DATABASE_URL is missing."
            )
        );

}


// =========================================================
// WAIT FOR AUTH DATABASE
// =========================================================

async function waitForAuthDatabase() {

    if (!authInitialization) {

        throw new Error(
            "Authentication database initialization was not created."
        );

    }

    await authInitialization;

}


// =========================================================
// HELPERS
// =========================================================

function normalizeEmail(email) {

    return String(email || "")
        .trim()
        .toLowerCase();

}


function cleanText(value) {

    return String(value || "")
        .trim();

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
// TOKEN HASH
// =========================================================

function hashToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}


// =========================================================
// EMAIL CONFIGURATION - BREVO SMTP
// =========================================================

let mailTransporter = null;


function getMailTransporter() {

    if (mailTransporter) {

        return mailTransporter;

    }


    const smtpHost =
        process.env.SMTP_HOST;

    const smtpPort =
        Number(
            process.env.SMTP_PORT || 587
        );

    const smtpUser =
        process.env.SMTP_USER;

    const smtpPass =
        process.env.SMTP_PASS;


    if (
        !smtpHost ||
        !smtpUser ||
        !smtpPass
    ) {

        console.error(
            "SMTP CONFIG ERROR: SMTP_HOST / SMTP_USER / SMTP_PASS missing."
        );

        return null;

    }


    console.log(
        "Creating SMTP transporter..."
    );

    console.log(
        "SMTP Host:",
        smtpHost
    );

    console.log(
        "SMTP Port:",
        smtpPort
    );

    console.log(
        "SMTP User:",
        smtpUser
    );


    mailTransporter =
        nodemailer.createTransport({

            host:
                smtpHost,

            port:
                smtpPort,

            secure:
                String(
                    process.env.SMTP_SECURE || "false"
                ).toLowerCase() === "true",

            auth: {

                user:
                    smtpUser,

                pass:
                    smtpPass

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


    console.log(
        "SMTP connection verified successfully."
    );


    const baseUrl =
        String(
            process.env.APP_BASE_URL ||
            "http://localhost:3000"
        )
            .replace(
                /\/+$/,
                ""
            );


    const resetUrl =
        `${baseUrl}/reset-password.html?token=${encodeURIComponent(rawToken)}`;


    const mailFrom =
        process.env.MAIL_FROM ||
        process.env.SMTP_USER;


    const safeName =
        escapeHtml(
            user.name ||
            "Customer"
        );


    const mailResult =
        await transporter.sendMail({

            from:
                mailFrom,

            to:
                user.email,

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

<body
style="
margin:0;
padding:0;
background:#f5f5f5;
font-family:Arial,sans-serif;
">

<div
style="
max-width:600px;
margin:40px auto;
background:#ffffff;
padding:40px;
border-radius:10px;
">

<h2 style="margin-top:0;">
U.S TRAVEL & TOURS
</h2>

<p>
Hello ${safeName},
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

<p
style="
font-size:14px;
color:#666;
">

This link expires in 30 minutes and can only be used once.

</p>

<p
style="
font-size:14px;
color:#666;
">

If you did not request this password reset, you can safely ignore this email.

</p>

</div>

</body>

</html>
`

        });


    console.log(
        "PASSWORD RESET EMAIL SENT"
    );

    console.log(
        "Message ID:",
        mailResult.messageId
    );

    console.log(
        "Accepted:",
        mailResult.accepted
    );

    console.log(
        "Rejected:",
        mailResult.rejected
    );

}


// =========================================================
// HTML ESCAPE
// =========================================================

function escapeHtml(value) {

    return String(value || "")
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


// =========================================================
// CREATE SESSION
// =========================================================

async function createSession(
    user,
    remember = false
) {

    await waitForAuthDatabase();


    const pool =
        getPool();


    const token =
        crypto
            .randomBytes(32)
            .toString("hex");


    const tokenHash =
        hashToken(token);


    const duration =
        remember
            ? REMEMBER_SESSION_DURATION_MS
            : SESSION_DURATION_MS;


    const expiresAt =
        Date.now() +
        duration;


    await pool.query(
        `
        INSERT INTO sessions (
            token_hash,
            user_id,
            expires_at,
            created_at,
            last_used_at
        )
        VALUES (
            $1,
            $2,
            $3,
            NOW(),
            NOW()
        )
        `,
        [
            tokenHash,
            user.id,
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


    await waitForAuthDatabase();


    const pool =
        getPool();


    const tokenHash =
        hashToken(token);


    const result =
        await pool.query(
            `
            SELECT
                id,
                token_hash,
                user_id,
                expires_at,
                created_at,
                last_used_at
            FROM sessions
            WHERE token_hash = $1
            LIMIT 1
            `,
            [
                tokenHash
            ]
        );


    if (
        result.rows.length === 0
    ) {

        return null;

    }


    const session =
        result.rows[0];


    if (
        Date.now() >
        Number(
            session.expires_at
        )
    ) {

        await pool.query(
            `
            DELETE FROM sessions
            WHERE id = $1
            `,
            [
                session.id
            ]
        );


        return null;

    }


    // Update last activity.
    await pool.query(
        `
        UPDATE sessions
        SET
            last_used_at = NOW()
        WHERE id = $1
        `,
        [
            session.id
        ]
    );


    return {

        id:
            session.id,

        userId:
            Number(
                session.user_id
            ),

        expiresAt:
            Number(
                session.expires_at
            ),

        createdAt:
            session.created_at,

        lastUsedAt:
            session.last_used_at

    };

}


// =========================================================
// GET TOKEN FROM REQUEST
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

async function getAuthenticatedUser(req) {

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


    const pool =
        getPool();


    const result =
        await pool.query(
            `
            SELECT
                id,
                name,
                email,
                phone,
                role,
                created_at,
                updated_at
            FROM users
            WHERE id = $1
            LIMIT 1
            `,
            [
                session.userId
            ]
        );


    if (
        result.rows.length === 0
    ) {

        await pool.query(
            `
            DELETE FROM sessions
            WHERE token_hash = $1
            `,
            [
                hashToken(token)
            ]
        );


        return null;

    }


    const user =
        result.rows[0];


    return {

        token,

        session,

        user

    };

}


// =========================================================
// REQUIRE LOGIN
// =========================================================

async function requireAuth(
    req,
    res,
    next
) {

    try {

        const authenticated =
            await getAuthenticatedUser(req);


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


    } catch (error) {

        console.error(
            "Authentication middleware error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to verify authentication."

        });

    }

}


// =========================================================
// REQUIRE ADMIN
// =========================================================

async function requireAdmin(
    req,
    res,
    next
) {

    try {

        const authenticated =
            await getAuthenticatedUser(req);


        if (!authenticated) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required."

            });

        }


        if (
            String(
                authenticated.user.role || ""
            )
                .trim()
                .toLowerCase() !==
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


    } catch (error) {

        console.error(
            "Admin authentication middleware error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to verify admin authentication."

        });

    }

}


// =========================================================
// CUSTOMER REGISTER
// POST /api/auth/register
// =========================================================

router.post(
    "/register",
    async (req, res) => {

        try {

            await waitForAuthDatabase();


            const pool =
                getPool();


            const name =
                cleanText(
                    req.body?.name
                );


            const email =
                normalizeEmail(
                    req.body?.email
                );


            const phone =
                cleanText(
                    req.body?.phone
                );


            const country =
                cleanText(
                    req.body?.country
                );


            const city =
                cleanText(
                    req.body?.city
                );


            const password =
                String(
                    req.body?.password || ""
                );


            const consent =
                Boolean(
                    req.body?.consent
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


            if (
                !isValidEmail(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });

            }


            if (
                !isStrongPassword(password)
            ) {

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
                await pool.query(
                    `
                    SELECT
                        id
                    FROM users
                    WHERE LOWER(TRIM(email)) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                existingUser.rows.length > 0
            ) {

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

            // country and city are accepted from the
            // frontend for compatibility.
            //
            // Existing users table does not require them.
            // They are intentionally not stored because the
            // current database schema has no such columns.

            void country;
            void city;


            const result =
                await pool.query(
                    `
                    INSERT INTO users (
                        name,
                        email,
                        phone,
                        password_hash,
                        role
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5
                    )
                    RETURNING
                        id
                    `,
                    [
                        name,
                        email,
                        phone || null,
                        passwordHash,
                        "customer"
                    ]
                );


            const newUserId =
                Number(
                    result.rows[0].id
                );


            console.log(
                "CUSTOMER REGISTERED:",
                {
                    userId:
                        newUserId,

                    email
                }
            );


            return res.status(201).json({

                success: true,

                message:
                    "Account created successfully. Please login.",

                userId:
                    newUserId

            });


        } catch (error) {

            console.error(
                "Customer registration error:",
                error
            );


            // PostgreSQL duplicate unique email
            if (
                error &&
                error.code === "23505"
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "An account with this email already exists. Please login instead."

                });

            }


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

            await waitForAuthDatabase();


            const pool =
                getPool();


            // -------------------------------------------------
            // NORMALIZE EMAIL
            // -------------------------------------------------

            const email =
                normalizeEmail(
                    req.body?.email
                );


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


            if (
                !isValidEmail(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

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
                        role
                    FROM users
                    WHERE LOWER(TRIM(email)) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                result.rows.length === 0
            ) {

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


            const user =
                result.rows[0];


            // -------------------------------------------------
            // PASSWORD CHECK
            // -------------------------------------------------

            if (
                !user.password_hash
            ) {

                console.error(
                    "LOGIN ERROR - PASSWORD HASH MISSING:",
                    {
                        userId:
                            user.id,

                        email:
                            user.email
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
            // CREATE PERSISTENT DATABASE SESSION
            // -------------------------------------------------

            const session =
                await createSession(
                    {
                        ...user,
                        role:
                            normalizedRole
                    },
                    remember
                );


            // -------------------------------------------------
            // RESPONSE USER
            // -------------------------------------------------

            const responseUser = {

                id:
                    Number(
                        user.id
                    ),

                name:
                    user.name,

                email:
                    normalizeEmail(
                        user.email
                    ),

                phone:
                    user.phone,

                role:
                    normalizedRole

            };


            console.log(
                "LOGIN SUCCESS:",
                {
                    userId:
                        user.id,

                    email:
                        responseUser.email,

                    role:
                        normalizedRole,

                    remember
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
// POST /api/auth/logout
// =========================================================

router.post(
    "/logout",
    requireAuth,
    async (req, res) => {

        try {

            await waitForAuthDatabase();


            const pool =
                getPool();


            const tokenHash =
                hashToken(
                    req.authToken
                );


            await pool.query(
                `
                DELETE FROM sessions
                WHERE token_hash = $1
                `,
                [
                    tokenHash
                ]
            );


            return res.status(200).json({

                success: true,

                message:
                    "Logout successful."

            });


        } catch (error) {

            console.error(
                "Logout error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to logout right now."

            });

        }

    }
);


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
// GET /api/auth/admin-check
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
// POST /api/auth/create-user
// =========================================================

router.post(
    "/create-user",
    requireAdmin,
    async (req, res) => {

        try {

            await waitForAuthDatabase();


            const pool =
                getPool();


            const name =
                cleanText(
                    req.body?.name
                );


            const email =
                normalizeEmail(
                    req.body?.email
                );


            const phone =
                cleanText(
                    req.body?.phone
                );


            const password =
                String(
                    req.body?.password || ""
                );


            const role =
                cleanText(
                    req.body?.role ||
                    "customer"
                )
                    .toLowerCase();


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


            if (
                !isValidEmail(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });

            }


            if (
                !isStrongPassword(password)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must contain at least 8 characters and include letters and numbers."

                });

            }


            if (
                ![
                    "customer",
                    "admin"
                ].includes(role)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid account role."

                });

            }


            const existingUser =
                await pool.query(
                    `
                    SELECT
                        id
                    FROM users
                    WHERE LOWER(TRIM(email)) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                existingUser.rows.length > 0
            ) {

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
                        role
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5
                    )
                    RETURNING
                        id
                    `,
                    [
                        name,
                        email,
                        phone || null,
                        passwordHash,
                        role
                    ]
                );


            const userId =
                Number(
                    result.rows[0].id
                );


            return res.status(201).json({

                success: true,

                message:
                    "User account created successfully.",

                userId

            });


        } catch (error) {

            console.error(
                "Create user error:",
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

            await waitForAuthDatabase();


            const pool =
                getPool();


            const email =
                normalizeEmail(
                    req.body?.email
                );


            // Always return same message.
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


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email
                    FROM users
                    WHERE LOWER(TRIM(email)) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(200).json({

                    success: true,

                    message:
                        genericMessage

                });

            }


            const user =
                result.rows[0];


            // -------------------------------------------------
            // REMOVE OLD RESET TOKENS
            // -------------------------------------------------

            await pool.query(
                `
                DELETE FROM password_resets
                WHERE user_id = $1
                `,
                [
                    user.id
                ]
            );


            // -------------------------------------------------
            // GENERATE SECURE TOKEN
            // -------------------------------------------------

            const rawToken =
                crypto
                    .randomBytes(32)
                    .toString("hex");


            const tokenHash =
                hashToken(
                    rawToken
                );


            const expiresAt =
                Date.now() +
                RESET_TOKEN_DURATION_MS;


            await pool.query(
                `
                INSERT INTO password_resets (
                    user_id,
                    token_hash,
                    expires_at
                )
                VALUES (
                    $1,
                    $2,
                    $3
                )
                `,
                [
                    user.id,
                    tokenHash,
                    expiresAt
                ]
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


                await pool.query(
                    `
                    DELETE FROM password_resets
                    WHERE token_hash = $1
                    `,
                    [
                        tokenHash
                    ]
                );


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

            await waitForAuthDatabase();


            const pool =
                getPool();


            const token =
                cleanText(
                    req.body?.token
                );


            const newPassword =
                String(
                    req.body?.newPassword || ""
                );


            const confirmPassword =
                String(
                    req.body?.confirmPassword || ""
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
                hashToken(
                    token
                );


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        expires_at,
                        used_at
                    FROM password_resets
                    WHERE token_hash = $1
                    LIMIT 1
                    `,
                    [
                        tokenHash
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This password reset link is invalid or has expired."

                });

            }


            const resetRecord =
                result.rows[0];


            if (
                resetRecord.used_at
            ) {

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

                await pool.query(
                    `
                    DELETE FROM password_resets
                    WHERE id = $1
                    `,
                    [
                        resetRecord.id
                    ]
                );


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

            const client =
                await pool.connect();


            try {

                await client.query(
                    "BEGIN"
                );


                await client.query(
                    `
                    UPDATE users
                    SET
                        password_hash = $1,
                        updated_at = NOW()
                    WHERE id = $2
                    `,
                    [
                        passwordHash,
                        resetRecord.user_id
                    ]
                );


                await client.query(
                    `
                    UPDATE password_resets
                    SET
                        used_at = $1
                    WHERE id = $2
                    `,
                    [
                        Date.now(),
                        resetRecord.id
                    ]
                );


                // Invalidate ALL existing sessions.
                await client.query(
                    `
                    DELETE FROM sessions
                    WHERE user_id = $1
                    `,
                    [
                        resetRecord.user_id
                    ]
                );


                await client.query(
                    "COMMIT"
                );


            } catch (transactionError) {

                await client.query(
                    "ROLLBACK"
                );

                throw transactionError;


            } finally {

                client.release();

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
// POST /api/auth/change-password
// =========================================================

router.post(
    "/change-password",
    requireAuth,
    async (req, res) => {

        try {

            await waitForAuthDatabase();


            const pool =
                getPool();


            const currentPassword =
                String(
                    req.body?.currentPassword || ""
                );


            const newPassword =
                String(
                    req.body?.newPassword || ""
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


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        password_hash
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        req.user.id
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }


            const user =
                result.rows[0];


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


            // -------------------------------------------------
            // UPDATE PASSWORD + INVALIDATE SESSIONS
            // -------------------------------------------------

            const client =
                await pool.connect();


            try {

                await client.query(
                    "BEGIN"
                );


                await client.query(
                    `
                    UPDATE users
                    SET
                        password_hash = $1,
                        updated_at = NOW()
                    WHERE id = $2
                    `,
                    [
                        newPasswordHash,
                        req.user.id
                    ]
                );


                await client.query(
                    `
                    DELETE FROM sessions
                    WHERE user_id = $1
                    `,
                    [
                        req.user.id
                    ]
                );


                await client.query(
                    "COMMIT"
                );


            } catch (transactionError) {

                await client.query(
                    "ROLLBACK"
                );

                throw transactionError;


            } finally {

                client.release();

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

setInterval(
    async () => {

        try {

            if (!supabasePool) {

                return;

            }


            await waitForAuthDatabase();


            const pool =
                getPool();


            const now =
                Date.now();


            // -------------------------------------------------
            // EXPIRED SESSIONS
            // -------------------------------------------------

            await pool.query(
                `
                DELETE FROM sessions
                WHERE expires_at < $1
                `,
                [
                    now
                ]
            );


            // -------------------------------------------------
            // EXPIRED / USED PASSWORD RESET TOKENS
            // -------------------------------------------------

            await pool.query(
                `
                DELETE FROM password_resets
                WHERE expires_at < $1
                OR used_at IS NOT NULL
                `,
                [
                    now
                ]
            );


        } catch (error) {

            console.error(
                "Auth cleanup error:",
                error
            );

        }

    },
    1000 * 60 * 30
);


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

console.log(
    "AUTH MODE: SUPABASE / POSTGRESQL"
);
