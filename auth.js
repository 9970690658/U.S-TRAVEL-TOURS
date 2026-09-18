// =========================================================
// U.S TRAVEL & TOURS
// AUTHENTICATION BACKEND
// MongoDB Version
// =========================================================

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const {
    getDatabase,
    getNextSequence
} = require("./database");

const router = express.Router();

// =========================================================
// CONFIG
// =========================================================

const SESSION_DURATION_MS =
    1000 *
    60 *
    60 *
    24 *
    7;

const RESET_TOKEN_DURATION_MS =
    1000 *
    60 *
    30;

const APP_BASE_URL =
    process.env.APP_BASE_URL ||
    "http://localhost:3000";

const OWNER_EMAIL =
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";

// =========================================================
// EMAIL TRANSPORTER
// =========================================================

let transporter = null;

try {

    transporter =
        nodemailer.createTransport({

            host:
                process.env.SMTP_HOST ||
                "smtp-relay.brevo.com",

            port:
                Number(
                    process.env.SMTP_PORT ||
                    587
                ),

            secure:
                String(
                    process.env.SMTP_SECURE ||
                    "false"
                ).toLowerCase() === "true",

            auth: {

                user:
                    process.env.SMTP_USER,

                pass:
                    process.env.SMTP_PASS

            }

        });

} catch (error) {

    console.error(
        "Auth email transporter error:",
        error
    );

}

// =========================================================
// HELPERS
// =========================================================

function normalizeEmail(
    email
) {

    return String(
        email || ""
    )
        .trim()
        .toLowerCase();

}

function cleanText(
    value,
    maxLength = 500
) {

    return String(
        value ?? ""
    )
        .trim()
        .slice(
            0,
            maxLength
        );

}

function cleanHeader(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /[\r\n]/g,
            ""
        )
        .trim();

}

function isValidEmail(
    email
) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);

}

function isValidPassword(
    password
) {

    return (
        typeof password === "string" &&
        password.length >= 6 &&
        password.length <= 200
    );

}

function hashToken(
    token
) {

    return crypto
        .createHash("sha256")
        .update(
            String(token)
        )
        .digest("hex");

}

function createRawToken() {

    return crypto
        .randomBytes(48)
        .toString("hex");

}

function getTokenFromRequest(
    req
) {

    const authorization =
        req.headers.authorization;

    if (
        !authorization ||
        typeof authorization !== "string"
    ) {

        return null;

    }

    const parts =
        authorization
            .trim()
            .split(/\s+/);

    if (
        parts.length !== 2 ||
        parts[0].toLowerCase() !==
            "bearer"
    ) {

        return null;

    }

    return parts[1];

}

function publicUser(
    user
) {

    if (!user) {

        return null;

    }

    return {

        id:
            Number(
                user.id
            ),

        name:
            user.name || "",

        email:
            user.email || "",

        phone:
            user.phone || "",

        role:
            user.role || "customer"

    };

}

// =========================================================
// SESSION CREATION
// =========================================================

async function createSession(
    user
) {

    const db =
        getDatabase();

    const rawToken =
        createRawToken();

    const tokenHash =
        hashToken(
            rawToken
        );

    const now =
        new Date();

    const expiresAt =
        new Date(
            Date.now() +
            SESSION_DURATION_MS
        );

    await db
        .collection("sessions")
        .insertOne({

            token_hash:
                tokenHash,

            user_id:
                Number(
                    user.id
                ),

            role:
                user.role,

            created_at:
                now,

            expires_at:
                expiresAt

        });

    return {

        token:
            rawToken,

        expiresAt:
            expiresAt.toISOString()

    };

}

// =========================================================
// GET SESSION
// =========================================================

async function getSession(
    token
) {

    if (!token) {

        return null;

    }

    const db =
        getDatabase();

    const tokenHash =
        hashToken(
            token
        );

    const session =
        await db
            .collection("sessions")
            .findOne({

                token_hash:
                    tokenHash

            });

    if (!session) {

        return null;

    }

    if (
        !session.expires_at ||
        new Date(
            session.expires_at
        ).getTime() <=
            Date.now()
    ) {

        await db
            .collection("sessions")
            .deleteOne({

                _id:
                    session._id

            });

        return null;

    }

    const user =
        await db
            .collection("users")
            .findOne({

                id:
                    Number(
                        session.user_id
                    )

            });

    if (!user) {

        await db
            .collection("sessions")
            .deleteOne({

                _id:
                    session._id

            });

        return null;

    }

    return {

        session,

        user

    };

}

// =========================================================
// AUTHENTICATED USER
// =========================================================

async function getAuthenticatedUser(
    req
) {

    const token =
        getTokenFromRequest(
            req
        );

    if (!token) {

        return null;

    }

    const result =
        await getSession(
            token
        );

    if (!result) {

        return null;

    }

    return publicUser(
        result.user
    );

}

// =========================================================
// REQUIRE AUTH
// =========================================================

async function requireAuth(
    req,
    res,
    next
) {

    try {

        const user =
            await getAuthenticatedUser(
                req
            );

        if (!user) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required."

            });

        }

        req.user =
            user;

        return next();

    } catch (error) {

        console.error(
            "Authentication error:",
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

        const user =
            await getAuthenticatedUser(
                req
            );

        if (!user) {

            return res.status(401).json({

                success: false,

                message:
                    "Authentication required."

            });

        }

        if (
            user.role !==
            "admin"
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Administrator access required."

            });

        }

        req.user =
            user;

        return next();

    } catch (error) {

        console.error(
            "Admin authentication error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to verify administrator access."

        });

    }

}

// =========================================================
// SEND EMAIL
// =========================================================

async function sendEmail(
    options
) {

    if (
        !transporter ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
    ) {

        console.warn(
            "Email skipped: SMTP configuration is missing."
        );

        return false;

    }

    try {

        await transporter.sendMail({

            from:
                process.env.MAIL_FROM ||
                process.env.SMTP_USER,

            ...options

        });

        return true;

    } catch (error) {

        console.error(
            "Auth email error:",
            error
        );

        return false;

    }

}

// =========================================================
// REGISTER
//
// POST /api/auth/register
// =========================================================

router.post(
    "/register",
    async function (
        req,
        res
    ) {

        try {

            const name =
                cleanText(
                    req.body.name,
                    150
                );

            const email =
                normalizeEmail(
                    req.body.email
                );

            const phone =
                cleanText(
                    req.body.phone,
                    50
                );

            const password =
                typeof req.body.password ===
                "string"
                    ? req.body.password
                    : "";

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

            if (
                !email ||
                !isValidEmail(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });

            }

            if (
                !isValidPassword(
                    password
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be between 6 and 200 characters."

                });

            }

            const db =
                getDatabase();

            // -------------------------------------------------
            // CHECK EXISTING USER
            // -------------------------------------------------

            const existingUser =
                await db
                    .collection("users")
                    .findOne({

                        email:
                            email

                    });

            if (existingUser) {

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
            // USER ID
            // -------------------------------------------------

            const userId =
                await getNextSequence(
                    "users"
                );

            const now =
                new Date();

            // -------------------------------------------------
            // CREATE USER
            // -------------------------------------------------

            const user = {

                id:
                    userId,

                name:
                    name,

                email:
                    email,

                phone:
                    phone,

                password_hash:
                    passwordHash,

                role:
                    "customer",

                created_at:
                    now,

                updated_at:
                    now

            };

            await db
                .collection("users")
                .insertOne(
                    user
                );

            // -------------------------------------------------
            // CREATE LOGIN SESSION
            // -------------------------------------------------

            const session =
                await createSession(
                    user
                );

            return res.status(201).json({

                success: true,

                message:
                    "Account created successfully.",

                token:
                    session.token,

                expiresAt:
                    session.expiresAt,

                remember:
                    true,

                user:
                    publicUser(
                        user
                    )

            });

        } catch (error) {

            console.error(
                "Registration error:",
                error
            );

            // Duplicate email race-condition
            if (
                error?.code ===
                11000
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
//
// POST /api/auth/login
// =========================================================

router.post(
    "/login",
    async function (
        req,
        res
    ) {

        try {

            const email =
                normalizeEmail(
                    req.body.email
                );

            const password =
                typeof req.body.password ===
                "string"
                    ? req.body.password
                    : "";

            if (
                !email ||
                !isValidEmail(email)
            ) {

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

            const db =
                getDatabase();

            const user =
                await db
                    .collection("users")
                    .findOne({

                        email:
                            email

                    });

            if (!user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid email or password."

                });

            }

            const passwordHash =
                user.password_hash;

            if (!passwordHash) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid email or password."

                });

            }

            const passwordMatches =
                await bcrypt.compare(
                    password,
                    passwordHash
                );

            if (!passwordMatches) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid email or password."

                });

            }

            // -------------------------------------------------
            // SESSION
            // -------------------------------------------------

            const session =
                await createSession(
                    user
                );

            return res.json({

                success: true,

                message:
                    "Login successful.",

                token:
                    session.token,

                expiresAt:
                    session.expiresAt,

                remember:
                    true,

                user:
                    publicUser(
                        user
                    )

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
//
// POST /api/auth/logout
// =========================================================

router.post(
    "/logout",
    async function (
        req,
        res
    ) {

        try {

            const token =
                getTokenFromRequest(
                    req
                );

            if (token) {

                const db =
                    getDatabase();

                await db
                    .collection("sessions")
                    .deleteOne({

                        token_hash:
                            hashToken(
                                token
                            )

                    });

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
// ME
//
// GET /api/auth/me
// =========================================================

router.get(
    "/me",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const db =
                getDatabase();

            const user =
                await db
                    .collection("users")
                    .findOne({

                        id:
                            Number(
                                req.user.id
                            )

                    });

            if (!user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }

            return res.json({

                success: true,

                user:
                    publicUser(
                        user
                    )

            });

        } catch (error) {

            console.error(
                "Auth me error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load account."

            });

        }

    }
);

// =========================================================
// ADMIN CHECK
//
// GET /api/auth/admin-check
// =========================================================

router.get(
    "/admin-check",
    requireAdmin,
    function (
        req,
        res
    ) {

        return res.json({

            success: true,

            isAdmin: true,

            user:
                req.user

        });

    }
);

// =========================================================
// ADMIN CREATE USER
//
// POST /api/auth/admin/create-user
// =========================================================

router.post(
    "/admin/create-user",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const name =
                cleanText(
                    req.body.name,
                    150
                );

            const email =
                normalizeEmail(
                    req.body.email
                );

            const phone =
                cleanText(
                    req.body.phone,
                    50
                );

            const password =
                typeof req.body.password ===
                "string"
                    ? req.body.password
                    : "";

            const role =
                req.body.role ===
                "admin"
                    ? "admin"
                    : "customer";

            if (!name) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Name is required."

                });

            }

            if (
                !email ||
                !isValidEmail(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });

            }

            if (
                !isValidPassword(
                    password
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be between 6 and 200 characters."

                });

            }

            const db =
                getDatabase();

            const existing =
                await db
                    .collection("users")
                    .findOne({

                        email:
                            email

                    });

            if (existing) {

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

            const userId =
                await getNextSequence(
                    "users"
                );

            const now =
                new Date();

            const user = {

                id:
                    userId,

                name:
                    name,

                email:
                    email,

                phone:
                    phone,

                password_hash:
                    passwordHash,

                role:
                    role,

                created_at:
                    now,

                updated_at:
                    now

            };

            await db
                .collection("users")
                .insertOne(
                    user
                );

            return res.status(201).json({

                success: true,

                message:
                    "User created successfully.",

                user:
                    publicUser(
                        user
                    )

            });

        } catch (error) {

            console.error(
                "Admin create user error:",
                error
            );

            if (
                error?.code ===
                11000
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
//
// POST /api/auth/forgot-password
// =========================================================

router.post(
    "/forgot-password",
    async function (
        req,
        res
    ) {

        try {

            const email =
                normalizeEmail(
                    req.body.email
                );

            if (
                !email ||
                !isValidEmail(email)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });

            }

            const db =
                getDatabase();

            const user =
                await db
                    .collection("users")
                    .findOne({

                        email:
                            email

                    });

            // -------------------------------------------------
            // SECURITY:
            // Same response whether user exists or not.
            // -------------------------------------------------

            if (!user) {

                return res.json({

                    success: true,

                    message:
                        "If an account exists with this email, a password reset link has been sent."

                });

            }

            // -------------------------------------------------
            // REMOVE OLD RESET TOKENS
            // -------------------------------------------------

            await db
                .collection("password_resets")
                .deleteMany({

                    user_id:
                        Number(
                            user.id
                        )

                });

            // -------------------------------------------------
            // CREATE RESET TOKEN
            // -------------------------------------------------

            const rawToken =
                createRawToken();

            const tokenHash =
                hashToken(
                    rawToken
                );

            const expiresAt =
                new Date(
                    Date.now() +
                    RESET_TOKEN_DURATION_MS
                );

            await db
                .collection("password_resets")
                .insertOne({

                    user_id:
                        Number(
                            user.id
                        ),

                    token_hash:
                        tokenHash,

                    created_at:
                        new Date(),

                    expires_at:
                        expiresAt

                });

            const resetUrl =
                `${APP_BASE_URL.replace(/\/$/, "")}/reset-password.html?token=${encodeURIComponent(rawToken)}`;

            const emailSent =
                await sendEmail({

                    to:
                        user.email,

                    subject:
                        "Password Reset - U.S TRAVEL & TOURS",

                    text: `

Hello ${user.name || "Customer"},

We received a request to reset your U.S TRAVEL & TOURS account password.

Use the link below to reset your password:

${resetUrl}

This link will expire in 30 minutes.

If you did not request a password reset, you can ignore this email.

U.S TRAVEL & TOURS

`

                });

            if (!emailSent) {

                // Do not leave unusable reset token.
                await db
                    .collection("password_resets")
                    .deleteOne({

                        token_hash:
                            tokenHash

                    });

            }

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
//
// POST /api/auth/reset-password
// =========================================================

router.post(
    "/reset-password",
    async function (
        req,
        res
    ) {

        try {

            const token =
                cleanText(
                    req.body.token,
                    500
                );

            const newPassword =
                typeof req.body.password ===
                "string"
                    ? req.body.password
                    : "";

            if (!token) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password reset token is required."

                });

            }

            if (
                !isValidPassword(
                    newPassword
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be between 6 and 200 characters."

                });

            }

            const db =
                getDatabase();

            const tokenHash =
                hashToken(
                    token
                );

            const reset =
                await db
                    .collection("password_resets")
                    .findOne({

                        token_hash:
                            tokenHash

                    });

            if (!reset) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid or expired password reset token."

                });

            }

            if (
                !reset.expires_at ||
                new Date(
                    reset.expires_at
                ).getTime() <=
                    Date.now()
            ) {

                await db
                    .collection("password_resets")
                    .deleteOne({

                        _id:
                            reset._id

                    });

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid or expired password reset token."

                });

            }

            const user =
                await db
                    .collection("users")
                    .findOne({

                        id:
                            Number(
                                reset.user_id
                            )

                    });

            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            await db
                .collection("users")
                .updateOne(

                    {
                        id:
                            Number(
                                user.id
                            )
                    },

                    {
                        $set: {

                            password_hash:
                                passwordHash,

                            updated_at:
                                new Date()

                        }

                    }

                );

            // -------------------------------------------------
            // DELETE USED TOKEN
            // -------------------------------------------------

            await db
                .collection("password_resets")
                .deleteMany({

                    user_id:
                        Number(
                            user.id
                        )

                });

            // -------------------------------------------------
            // INVALIDATE OLD SESSIONS
            // -------------------------------------------------

            await db
                .collection("sessions")
                .deleteMany({

                    user_id:
                        Number(
                            user.id
                        )

                });

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
//
// POST /api/auth/change-password
// =========================================================

router.post(
    "/change-password",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const currentPassword =
                typeof req.body.currentPassword ===
                "string"
                    ? req.body.currentPassword
                    : "";

            const newPassword =
                typeof req.body.newPassword ===
                "string"
                    ? req.body.newPassword
                    : "";

            if (!currentPassword) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Current password is required."

                });

            }

            if (
                !isValidPassword(
                    newPassword
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "New password must be between 6 and 200 characters."

                });

            }

            const db =
                getDatabase();

            const user =
                await db
                    .collection("users")
                    .findOne({

                        id:
                            Number(
                                req.user.id
                            )

                    });

            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }

            const matches =
                await bcrypt.compare(
                    currentPassword,
                    user.password_hash
                );

            if (!matches) {

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

            await db
                .collection("users")
                .updateOne(

                    {
                        id:
                            Number(
                                user.id
                            )
                    },

                    {
                        $set: {

                            password_hash:
                                passwordHash,

                            updated_at:
                                new Date()

                        }

                    }

                );

            // -------------------------------------------------
            // INVALIDATE ALL SESSIONS
            // -------------------------------------------------

            await db
                .collection("sessions")
                .deleteMany({

                    user_id:
                        Number(
                            user.id
                        )

                });

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
// PERIODIC CLEANUP
// =========================================================

let cleanupRunning = false;

async function runCleanup() {

    if (cleanupRunning) {

        return;

    }

    cleanupRunning = true;

    try {

        const db =
            getDatabase();

        const now =
            new Date();

        await db
            .collection("sessions")
            .deleteMany({

                expires_at: {
                    $lte:
                        now
                }

            });

        await db
            .collection("password_resets")
            .deleteMany({

                expires_at: {
                    $lte:
                        now
                }

            });

    } catch (error) {

        console.error(
            "Auth cleanup error:",
            error
        );

    } finally {

        cleanupRunning = false;

    }

}

// Run cleanup every 30 minutes.

const cleanupInterval =
    setInterval(
        runCleanup,
        1000 *
        60 *
        30
    );

// Don't prevent Node from shutting down.

if (
    cleanupInterval &&
    typeof cleanupInterval.unref ===
        "function"
) {

    cleanupInterval.unref();

}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {

    router,

    requireAuth,

    requireAdmin,

    getAuthenticatedUser,

    getTokenFromRequest,

    createSession,

    getSession

};
