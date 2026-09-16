const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

// Existing SQLite database is preserved for compatibility
const { db } = require("./database");

const router = express.Router();


// =========================================================
// CONFIGURATION
// =========================================================

const SESSION_DURATION_MS =
    1000 * 60 * 60 * 24 * 7;

const RESET_TOKEN_DURATION_MS =
    1000 * 60 * 30;

// Login sessions remain temporary in RAM.
// Customer accounts themselves are stored permanently
// in Supabase PostgreSQL.
const sessions = new Map();


// =========================================================
// SUPABASE / POSTGRES CONNECTION
// =========================================================

let supabasePool = null;

if (process.env.DATABASE_URL) {

    supabasePool = new Pool({
        connectionString: process.env.DATABASE_URL,

        ssl: {
            rejectUnauthorized: false
        },

        max: 5,

        idleTimeoutMillis: 30000,

        connectionTimeoutMillis: 10000
    });

    supabasePool.on("error", (error) => {

        console.error(
            "Supabase PostgreSQL pool error:",
            error
        );

    });

    console.log(
        "Supabase PostgreSQL authentication database configured."
    );

} else {

    console.warn(
        "DATABASE_URL is not configured. " +
        "Customer Supabase authentication will not work."
    );
}


// =========================================================
// DATABASE CHECK
// =========================================================

async function checkSupabaseDatabase() {

    if (!supabasePool) {

        throw new Error(
            "DATABASE_URL is not configured."
        );

    }

    const result = await supabasePool.query(
        "SELECT NOW() AS current_time"
    );

    return result.rows[0];
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

    if (
        value === undefined ||
        value === null
    ) {

        return "";

    }

    return String(value).trim();

}


function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
    );

}


function isStrongPassword(password) {

    return (
        typeof password === "string" &&
        password.length >= 6
    );

}


// =========================================================
// SESSION FUNCTIONS
// =========================================================

function createSession(user, source) {

    const token =
        crypto.randomBytes(32).toString("hex");

    const expiresAt =
        Date.now() + SESSION_DURATION_MS;

    sessions.set(token, {

        userId:
            Number(user.id),

        role:
            user.role,

        source:
            source,

        expiresAt:
            expiresAt

    });

    return {

        token:
            token,

        expiresAt:
            expiresAt

    };

}


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
        Date.now() >=
        session.expiresAt
    ) {

        sessions.delete(token);

        return null;

    }

    return session;

}


function getTokenFromRequest(req) {

    const authorization =
        req.headers.authorization || "";

    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {

        return null;

    }

    return authorization
        .substring(7)
        .trim();

}


// =========================================================
// GET USER BY ID
//
// IMPORTANT:
// SQLite and Supabase have separate ID systems.
//
// source = "sqlite"
// source = "supabase"
//
// This prevents an Admin SQLite ID from accidentally
// matching a Customer Supabase ID.
// =========================================================

async function getUserById(userId, source) {

    const numericId =
        Number(userId);

    if (
        !Number.isInteger(numericId) ||
        numericId <= 0
    ) {

        return null;

    }


    // =====================================================
    // SQLITE USER
    // =====================================================

    if (source === "sqlite") {

        try {

            const user =
                db.prepare(
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
                    WHERE id = ?
                    LIMIT 1
                    `
                ).get(numericId);

            return user || null;

        } catch (error) {

            console.error(
                "SQLite user lookup error:",
                error
            );

            return null;

        }

    }


    // =====================================================
    // SUPABASE USER
    // =====================================================

    if (
        source === "supabase" &&
        supabasePool
    ) {

        try {

            const result =
                await supabasePool.query(
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
                    [numericId]
                );

            if (
                result.rows.length > 0
            ) {

                return result.rows[0];

            }

            return null;

        } catch (error) {

            console.error(
                "Supabase user lookup error:",
                error
            );

            return null;

        }

    }


    return null;

}


// =========================================================
// AUTHENTICATED USER
// =========================================================

async function getAuthenticatedUser(req) {

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

    // IMPORTANT:
    // Use the same database from which the session was created.
    const user =
        await getUserById(
            session.userId,
            session.source
        );

    if (!user) {

        sessions.delete(token);

        return null;

    }

    return user;

}


// =========================================================
// REQUIRE AUTH
// =========================================================

async function requireAuth(req, res, next) {

    try {

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

        req.authenticatedUser = user;

        next();

    } catch (error) {

        console.error(
            "Authentication error:",
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
// REQUIRE ADMIN
// =========================================================

async function requireAdmin(req, res, next) {

    try {

        const user =
            await getAuthenticatedUser(req);

        if (!user) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required."

            });

        }

        if (
            user.role !== "admin"
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Administrator access required."

            });

        }

        req.user = user;

        req.authenticatedUser = user;

        next();

    } catch (error) {

        console.error(
            "Admin authentication error:",
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
// POST /api/auth/register
// =========================================================

router.post(
    "/register",
    async (req, res) => {

        try {

            if (!supabasePool) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Customer database is not configured."

                });

            }


            const name =
                cleanText(req.body?.name);

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


            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (!name) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please provide your name."

                });

            }

            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please provide a valid email address."

                });

            }

            if (!isStrongPassword(password)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be at least 6 characters."

                });

            }


            // -------------------------------------------------
            // CHECK EXISTING CUSTOMER
            // -------------------------------------------------

            const existing =
                await supabasePool.query(
                    `
                    SELECT id, email
                    FROM users
                    WHERE LOWER(email) = LOWER($1)
                    LIMIT 1
                    `,
                    [email]
                );


            if (
                existing.rows.length > 0
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

            const result =
                await supabasePool.query(
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
                        'customer'
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
                `New customer account created. ` +
                `Customer ID: ${user.id}, ` +
                `Email: ${user.email}`
            );


            // -------------------------------------------------
            // CREATE SUPABASE LOGIN SESSION
            // -------------------------------------------------

            const session =
                createSession(
                    user,
                    "supabase"
                );


            return res.status(201).json({

                success: true,

                message:
                    "Account created successfully.",

                token:
                    session.token,

                expiresAt:
                    session.expiresAt,

                user: {

                    id:
                        Number(user.id),

                    name:
                        user.name,

                    email:
                        user.email,

                    phone:
                        user.phone,

                    role:
                        user.role

                }

            });


        } catch (error) {

            console.error(
                "Customer registration error:",
                error
            );


            if (
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
                    "Unable to create account. Please try again."

            });

        }

    }
);


// =========================================================
// LOGIN
// POST /api/auth/login
//
// IMPORTANT:
//
// 1. SQLite is checked FIRST.
//    This keeps the existing Admin account working.
//
// 2. If SQLite user is not found,
//    Supabase customer database is checked.
//
// 3. Session remembers the database source.
// =========================================================

router.post(
    "/login",
    async (req, res) => {

        try {

            const email =
                normalizeEmail(
                    req.body?.email
                );

            const password =
                String(
                    req.body?.password || ""
                );


            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please provide a valid email address."

                });

            }

            if (!password) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter your password."

                });

            }


            let user = null;

            let authSource = null;


            // -------------------------------------------------
            // FIRST: CHECK EXISTING SQLITE USERS
            //
            // This is important for the existing Admin account.
            // -------------------------------------------------

            try {

                user =
                    db.prepare(
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
                        WHERE LOWER(email) = LOWER(?)
                        LIMIT 1
                        `
                    ).get(email);


                if (user) {

                    authSource =
                        "sqlite";

                }

            } catch (error) {

                console.error(
                    "SQLite login lookup error:",
                    error
                );

            }


            // -------------------------------------------------
            // SECOND: CHECK SUPABASE CUSTOMER
            // -------------------------------------------------

            if (
                !user &&
                supabasePool
            ) {

                try {

                    const result =
                        await supabasePool.query(
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


                    if (
                        result.rows.length > 0
                    ) {

                        user =
                            result.rows[0];

                        authSource =
                            "supabase";

                    }

                } catch (error) {

                    console.error(
                        "Supabase login lookup error:",
                        error
                    );

                }

            }


            // -------------------------------------------------
            // USER NOT FOUND
            // -------------------------------------------------

            if (!user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid email or password."

                });

            }


            // -------------------------------------------------
            // PASSWORD CHECK
            // -------------------------------------------------

            const passwordMatches =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );


            if (!passwordMatches) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid email or password."

                });

            }


            // -------------------------------------------------
            // CREATE SESSION
            //
            // IMPORTANT FIX:
            // Save whether this user came from SQLite
            // or Supabase.
            // -------------------------------------------------

            const session =
                createSession(
                    user,
                    authSource
                );


            console.log(
                `User logged in: ${user.email} ` +
                `(${authSource})`
            );


            return res.json({

                success: true,

                message:
                    "Login successful.",

                token:
                    session.token,

                expiresAt:
                    session.expiresAt,

                user: {

                    id:
                        Number(user.id),

                    name:
                        user.name,

                    email:
                        user.email,

                    phone:
                        user.phone,

                    role:
                        user.role

                }

            });


        } catch (error) {

            console.error(
                "Login error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to login. Please try again."

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
    (req, res) => {

        try {

            const token =
                getTokenFromRequest(req);

            if (token) {

                sessions.delete(token);

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
// GET /api/auth/me
// =========================================================

router.get(
    "/me",
    requireAuth,
    (req, res) => {

        return res.json({

            success: true,

            user: {

                id:
                    Number(req.user.id),

                name:
                    req.user.name,

                email:
                    req.user.email,

                phone:
                    req.user.phone,

                role:
                    req.user.role

            }

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

        return res.json({

            success: true,

            message:
                "Administrator access verified.",

            user: {

                id:
                    Number(req.user.id),

                name:
                    req.user.name,

                email:
                    req.user.email,

                role:
                    req.user.role

            }

        });

    }
);


// =========================================================
// CREATE USER
// POST /api/auth/create-user
//
// ADMIN ONLY
//
// New users are created in Supabase.
// =========================================================

router.post(
    "/create-user",
    requireAdmin,
    async (req, res) => {

        try {

            if (!supabasePool) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Customer database is not configured."

                });

            }


            const name =
                cleanText(req.body?.name);

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
                    req.body?.role
                ) || "customer";


            if (
                !name ||
                !isValidEmail(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Valid name and email are required."

                });

            }

            if (!isStrongPassword(password)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be at least 6 characters."

                });

            }

            if (
                !["customer", "admin"].includes(
                    role
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid user role."

                });

            }


            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            const result =
                await supabasePool.query(
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
                        id,
                        name,
                        email,
                        phone,
                        role,
                        created_at
                    `,
                    [
                        name,
                        email,
                        phone || null,
                        passwordHash,
                        role
                    ]
                );


            return res.status(201).json({

                success: true,

                message:
                    "User created successfully.",

                user: {

                    id:
                        Number(result.rows[0].id),

                    name:
                        result.rows[0].name,

                    email:
                        result.rows[0].email,

                    phone:
                        result.rows[0].phone,

                    role:
                        result.rows[0].role

                }

            });


        } catch (error) {

            console.error(
                "Create user error:",
                error
            );


            if (
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
// POST /api/auth/forgot-password
// =========================================================

router.post(
    "/forgot-password",
    async (req, res) => {

        try {

            if (!supabasePool) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Customer database is not configured."

                });

            }


            const email =
                normalizeEmail(
                    req.body?.email
                );


            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please provide a valid email address."

                });

            }


            const result =
                await supabasePool.query(
                    `
                    SELECT
                        id,
                        name,
                        email
                    FROM users
                    WHERE LOWER(email) = LOWER($1)
                    LIMIT 1
                    `,
                    [email]
                );


            // Do not reveal whether an email exists.
            if (
                result.rows.length === 0
            ) {

                return res.json({

                    success: true,

                    message:
                        "If an account exists, a password reset email will be sent."

                });

            }


            const user =
                result.rows[0];


            // -------------------------------------------------
            // CREATE RESET TOKEN
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
                new Date(
                    Date.now() +
                    RESET_TOKEN_DURATION_MS
                );


            // -------------------------------------------------
            // CREATE RESET TABLE IF REQUIRED
            // -------------------------------------------------

            await supabasePool.query(
                `
                CREATE TABLE IF NOT EXISTS password_resets (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    expires_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                `
            );


            await supabasePool.query(
                `
                DELETE FROM password_resets
                WHERE user_id = $1
                `,
                [user.id]
            );


            await supabasePool.query(
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

            const smtpSecure =
                String(
                    process.env.SMTP_SECURE || "false"
                ).toLowerCase() === "true";

            const mailFrom =
                process.env.MAIL_FROM ||
                smtpUser;

            const appBaseUrl =
                process.env.APP_BASE_URL ||
                "http://localhost:3000";


            if (
                smtpHost &&
                smtpUser &&
                smtpPass
            ) {

                const transporter =
                    nodemailer.createTransport({

                        host:
                            smtpHost,

                        port:
                            smtpPort,

                        secure:
                            smtpSecure,

                        auth: {

                            user:
                                smtpUser,

                            pass:
                                smtpPass

                        }

                    });


                const resetUrl =
                    `${appBaseUrl}/reset-password.html?token=${rawToken}`;


                await transporter.sendMail({

                    from:
                        mailFrom,

                    to:
                        user.email,

                    subject:
                        "U.S TRAVEL & TOURS - Password Reset",

                    text:
                        `Hello ${user.name},\n\n` +
                        `Use the following link to reset your password:\n\n` +
                        `${resetUrl}\n\n` +
                        `This link expires in 30 minutes.\n\n` +
                        `If you did not request this, you can ignore this email.`

                });

            }


            return res.json({

                success: true,

                message:
                    "If an account exists, a password reset email will be sent."

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
// POST /api/auth/reset-password
// =========================================================

router.post(
    "/reset-password",
    async (req, res) => {

        try {

            if (!supabasePool) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Customer database is not configured."

                });

            }


            const token =
                cleanText(
                    req.body?.token
                );

            const newPassword =
                String(
                    req.body?.password || ""
                );


            if (!token) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Reset token is required."

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
                        "Password must be at least 6 characters."

                });

            }


            const tokenHash =
                crypto
                    .createHash("sha256")
                    .update(token)
                    .digest("hex");


            const resetResult =
                await supabasePool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        expires_at
                    FROM password_resets
                    WHERE token_hash = $1
                    LIMIT 1
                    `,
                    [tokenHash]
                );


            if (
                resetResult.rows.length === 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid or expired reset token."

                });

            }


            const reset =
                resetResult.rows[0];


            if (
                new Date(reset.expires_at).getTime()
                <= Date.now()
            ) {

                await supabasePool.query(
                    `
                    DELETE FROM password_resets
                    WHERE id = $1
                    `,
                    [reset.id]
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


            await supabasePool.query(
                `
                UPDATE users
                SET
                    password_hash = $1,
                    updated_at = NOW()
                WHERE id = $2
                `,
                [
                    passwordHash,
                    reset.user_id
                ]
            );


            await supabasePool.query(
                `
                DELETE FROM password_resets
                WHERE user_id = $1
                `,
                [reset.user_id]
            );


            // Invalidate current temporary sessions
            for (
                const [
                    sessionToken,
                    session
                ] of sessions.entries()
            ) {

                if (
                    session.source === "supabase" &&
                    Number(session.userId) ===
                    Number(reset.user_id)
                ) {

                    sessions.delete(
                        sessionToken
                    );

                }

            }


            return res.json({

                success: true,

                message:
                    "Password reset successfully. Please login again."

            });


        } catch (error) {

            console.error(
                "Reset password error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to reset password."

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

            const currentPassword =
                String(
                    req.body?.currentPassword || ""
                );

            const newPassword =
                String(
                    req.body?.newPassword || ""
                );


            if (!currentPassword) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Current password is required."

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
                        "New password must be at least 6 characters."

                });

            }


            const passwordMatches =
                await bcrypt.compare(
                    currentPassword,
                    req.user.password_hash
                );


            if (!passwordMatches) {

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


            // -------------------------------------------------
            // GET SOURCE FROM CURRENT SESSION
            // -------------------------------------------------

            const token =
                getTokenFromRequest(req);

            const session =
                getSession(token);


            // -------------------------------------------------
            // SUPABASE CUSTOMER
            // -------------------------------------------------

            if (
                session &&
                session.source === "supabase" &&
                supabasePool
            ) {

                const result =
                    await supabasePool.query(
                        `
                        UPDATE users
                        SET
                            password_hash = $1,
                            updated_at = NOW()
                        WHERE id = $2
                        RETURNING id
                        `,
                        [
                            passwordHash,
                            req.user.id
                        ]
                    );


                if (
                    result.rows.length > 0
                ) {

                    for (
                        const [
                            sessionToken,
                            storedSession
                        ] of sessions.entries()
                    ) {

                        if (
                            storedSession.source === "supabase" &&
                            Number(storedSession.userId) ===
                            Number(req.user.id)
                        ) {

                            sessions.delete(
                                sessionToken
                            );

                        }

                    }


                    return res.json({

                        success: true,

                        message:
                            "Password changed successfully. Please login again."

                    });

                }

            }


            // -------------------------------------------------
            // EXISTING SQLITE USER / ADMIN
            // -------------------------------------------------

            const result =
                db.prepare(
                    `
                    UPDATE users
                    SET
                        password_hash = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    `
                ).run(
                    passwordHash,
                    req.user.id
                );


            if (
                result.changes === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."

                });

            }


            for (
                const [
                    sessionToken,
                    storedSession
                ] of sessions.entries()
            ) {

                if (
                    storedSession.source === "sqlite" &&
                    Number(storedSession.userId) ===
                    Number(req.user.id)
                ) {

                    sessions.delete(
                        sessionToken
                    );

                }

            }


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
// CLEAN EXPIRED SESSIONS
// =========================================================

setInterval(
    () => {

        const now =
            Date.now();

        for (
            const [
                token,
                session
            ] of sessions.entries()
        ) {

            if (
                now >=
                session.expiresAt
            ) {

                sessions.delete(token);

            }

        }

    },
    60 * 60 * 1000
);


// =========================================================
// SUPABASE CONNECTION TEST
// =========================================================

if (supabasePool) {

    checkSupabaseDatabase()
        .then(() => {

            console.log(
                "Supabase PostgreSQL connection successful."
            );

        })
        .catch((error) => {

            console.error(
                "Supabase PostgreSQL connection failed:",
                error.message
            );

        });

}


// =========================================================
// EXPORT
// =========================================================

module.exports = router;

module.exports.requireAuth =
    requireAuth;

module.exports.requireAdmin =
    requireAdmin;
