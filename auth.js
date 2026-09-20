// =========================================================
// U.S TRAVEL & TOURS
// AUTHENTICATION MODULE
//
// PostgreSQL / Supabase
//
// FEATURES:
// - Customer registration
// - Customer login
// - Persistent sessions
// - Admin authentication
// - Logout
// - /me
// - Admin check
// - Create user
// - Forgot password
// - Reset password
// - Change password
//
// IMPORTANT:
// Old system used an in-memory Map for sessions.
// This version stores sessions in PostgreSQL.
// =========================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const router = express.Router();

const {
    pool
} = require("./database");


// =========================================================
// CONFIGURATION
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


// =========================================================
// SMTP CONFIGURATION
// =========================================================

const SMTP_HOST =
    process.env.SMTP_HOST ||
    "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(
        process.env.SMTP_PORT
    ) || 587;

const SMTP_SECURE =
    String(
        process.env.SMTP_SECURE || ""
    ).toLowerCase() === "true";

const SMTP_USER =
    process.env.SMTP_USER;

const SMTP_PASS =
    process.env.SMTP_PASS;

const MAIL_FROM =
    process.env.MAIL_FROM ||
    SMTP_USER ||
    "ellisgeorge690@gmail.com";

const OWNER_EMAIL =
    process.env.OWNER_EMAIL ||
    "ellisgeorge690@gmail.com";

const APP_BASE_URL =
    (
        process.env.APP_BASE_URL ||
        "http://localhost:3000"
    ).replace(
        /\/+$/,
        ""
    );


// =========================================================
// SMTP TRANSPORTER
// =========================================================

let transporter = null;

if (
    SMTP_USER &&
    SMTP_PASS
) {

    transporter =
        nodemailer.createTransport({

            host:
                SMTP_HOST,

            port:
                SMTP_PORT,

            secure:
                SMTP_SECURE,

            auth: {

                user:
                    SMTP_USER,

                pass:
                    SMTP_PASS

            },

            connectionTimeout:
                15000,

            greetingTimeout:
                15000,

            socketTimeout:
                30000

        });


    transporter.verify(
        function (
            error
        ) {

            if (error) {

                console.error(
                    "AUTH SMTP verification failed:",
                    error
                );

            } else {

                console.log(
                    "AUTH: Brevo SMTP connection verified successfully."
                );

            }

        }
    );

} else {

    console.warn(
        "AUTH SMTP: SMTP_USER or SMTP_PASS is not configured."
    );

}


// =========================================================
// HELPERS
// =========================================================

function cleanText(
    value,
    maxLength
) {

    return String(
        value ?? ""
    )
        .replace(
            /\0/g,
            ""
        )
        .trim()
        .slice(
            0,
            maxLength
        );

}


function normalizeEmail(
    value
) {

    return cleanText(
        value,
        180
    ).toLowerCase();

}


function isValidEmail(
    email
) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
    );

}


function isStrongPassword(
    password
) {

    if (
        typeof password !==
        "string"
    ) {

        return false;

    }

    if (
        password.length < 8 ||
        password.length > 128
    ) {

        return false;

    }

    return true;

}


function hashToken(
    token
) {

    return crypto
        .createHash(
            "sha256"
        )
        .update(
            token
        )
        .digest(
            "hex"
        );

}


function createRawToken() {

    return crypto
        .randomBytes(
            32
        )
        .toString(
            "hex"
        );

}


function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
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
// USER PUBLIC DATA
// =========================================================

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
            user.name,

        email:
            user.email,

        phone:
            user.phone || "",

        role:
            user.role,

        createdAt:
            user.created_at,

        updatedAt:
            user.updated_at

    };

}


// =========================================================
// CREATE PERSISTENT SESSION
// =========================================================
//
// IMPORTANT:
// Token itself is NEVER stored in database.
// Only SHA-256 hash is stored.
//
// Raw token goes to frontend.
// Database stores token_hash.
//
// Session survives Render restart/redeploy.
// =========================================================

async function createSession(
    user
) {

    const rawToken =
        createRawToken();

    const tokenHash =
        hashToken(
            rawToken
        );

    const expiresAt =
        Date.now() +
        SESSION_DURATION_MS;


    await pool.query(
        `
        INSERT INTO auth_sessions
        (
            token_hash,
            user_id,
            role,
            expires_at,
            created_at
        )
        VALUES
        (
            $1,
            $2,
            $3,
            $4,
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

        token:
            rawToken,

        expiresAt:
            expiresAt

    };

}


// =========================================================
// GET SESSION
// =========================================================

async function getSession(
    token
) {

    if (
        !token ||
        typeof token !== "string"
    ) {

        return null;

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
                role,
                expires_at
            FROM auth_sessions
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
        Number(
            session.expires_at
        ) <= Date.now()
    ) {

        await pool.query(
            `
            DELETE FROM auth_sessions
            WHERE id = $1
            `,
            [
                session.id
            ]
        );

        return null;

    }


    return {

        id:
            Number(
                session.id
            ),

        userId:
            Number(
                session.user_id
            ),

        role:
            session.role,

        expiresAt:
            Number(
                session.expires_at
            )

    };

}


// =========================================================
// GET AUTHENTICATED USER
// =========================================================

async function getAuthenticatedUser(
    req
) {

    const authorization =
        String(
            req.headers.authorization ||
            ""
        ).trim();


    if (
        !authorization
    ) {

        return null;

    }


    if (
        !authorization
            .toLowerCase()
            .startsWith(
                "bearer "
            )
    ) {

        return null;

    }


    const token =
        authorization
            .slice(7)
            .trim();


    if (!token) {

        return null;

    }


    const session =
        await getSession(
            token
        );


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
            [
                session.userId
            ]
        );


    if (
        result.rows.length === 0
    ) {

        await pool.query(
            `
            DELETE FROM auth_sessions
            WHERE id = $1
            `,
            [
                session.id
            ]
        );

        return null;

    }


    return {

        user:
            result.rows[0],

        session:
            session,

        token:
            token

    };

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

        const authenticated =
            await getAuthenticatedUser(
                req
            );


        if (
            !authenticated
        ) {

            return res.status(401).json({

                success:
                    false,

                message:
                    "Authentication required."

            });

        }


        req.user =
            publicUser(
                authenticated.user
            );

        req.authUser =
            authenticated.user;

        req.session =
            authenticated.session;

        req.authToken =
            authenticated.token;


        return next();

    } catch (error) {

        console.error(
            "Authentication middleware error:",
            error
        );

        return res.status(500).json({

            success:
                false,

            message:
                "Unable to verify authentication."

        });

    }

}


// =========================================================
// REQUIRE ADMIN
// =========================================================
//
// ADMIN ROUTES:
// - Works when requireAuth has already run
// - Also authenticates automatically when used directly
//
// This keeps existing admin routes compatible while using
// the PostgreSQL persistent-session system.
// =========================================================

async function requireAdmin(
    req,
    res,
    next
) {

    try {

        // =================================================
        // ALWAYS VERIFY THE CURRENT BEARER TOKEN
        // =================================================

        const authenticated =
            await getAuthenticatedUser(
                req
            );


        if (!authenticated) {

            return res.status(401).json({

                success:
                    false,

                message:
                    "Authentication required."

            });

        }


        // =================================================
        // ATTACH AUTHENTICATED USER
        // =================================================

        req.user =
            publicUser(
                authenticated.user
            );

        req.authUser =
            authenticated.user;

        req.session =
            authenticated.session;

        req.authToken =
            authenticated.token;


        // =================================================
        // ADMIN ROLE CHECK
        // =================================================

        if (
            String(
                req.user.role || ""
            ).toLowerCase() !==
            "admin"
        ) {

            return res.status(403).json({

                success:
                    false,

                message:
                    "Administrator access required."

            });

        }


        // =================================================
        // ADMIN AUTHENTICATION SUCCESSFUL
        // =================================================

        return next();


    } catch (error) {

        console.error(
            "Admin authentication error:",
            error
        );

        return res.status(500).json({

            success:
                false,

            message:
                "Unable to verify administrator access."

        });

    }

}

// =========================================================
// REGISTER
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
                    req.body?.name,
                    120
                );

            const email =
                normalizeEmail(
                    req.body?.email
                );

            const phone =
                cleanText(
                    req.body?.phone,
                    30
                );

            const password =
                String(
                    req.body?.password ||
                    ""
                );

            const consent =
                Boolean(
                    req.body?.consent
                );


            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (!name) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter your name."

                });

            }


            if (
                !email ||
                !isValidEmail(
                    email
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter a valid email address."

                });

            }


            if (
                !isStrongPassword(
                    password
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Password must be between 8 and 128 characters."

                });

            }


            if (
                !consent
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please accept the terms and consent."

                });

            }


            // -------------------------------------------------
            // CHECK EXISTING USER
            // -------------------------------------------------

            const existing =
                await pool.query(
                    `
                    SELECT
                        id
                    FROM users
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                existing.rows.length > 0
            ) {

                return res.status(409).json({

                    success:
                        false,

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
            // CREATE USER
            // -------------------------------------------------

            const result =
                await pool.query(
                    `
                    INSERT INTO users
                    (
                        name,
                        email,
                        phone,
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


            // -------------------------------------------------
            // CREATE SESSION
            // -------------------------------------------------

            const session =
                await createSession(
                    user
                );


            console.log(
                `Customer account created successfully: ${email}`
            );


            return res.status(201).json({

                success:
                    true,

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


            if (
                error?.code ===
                "23505"
            ) {

                return res.status(409).json({

                    success:
                        false,

                    message:
                        "An account with this email already exists."

                });

            }


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to create your account right now. Please try again later."

            });

        }

    }
);


// =========================================================
// LOGIN
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
                    req.body?.email
                );

            const password =
                String(
                    req.body?.password ||
                    ""
                );

            const remember =
                req.body?.remember !==
                false;


            // -------------------------------------------------
            // VALIDATION
            // -------------------------------------------------

            if (
                !email ||
                !isValidEmail(
                    email
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter a valid email address."

                });

            }


            if (!password) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter your password."

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
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(401).json({

                    success:
                        false,

                    message:
                        "Invalid email or password."

                });

            }


            const user =
                result.rows[0];


            // -------------------------------------------------
            // PASSWORD CHECK
            // -------------------------------------------------
const passwordMatches =
    await bcrypt.compare(
        password,
        user.password_hash
    );

console.log("🔥 LOGIN ROUTE EXECUTED 🔥");

console.log(
    "AUTH LOGIN CHECK:",
    {
        emailFound: true,
        normalizedEmail: email,
        userId: Number(user.id),
        role: user.role,
        passwordHashExists:
            Boolean(user.password_hash),
        passwordHashLength:
            typeof user.password_hash === "string"
                ? user.password_hash.length
                : 0,
        passwordMatches:
            passwordMatches
    }
);


if (
    !passwordMatches
) {

    return res.status(401).json({

        success:
            false,

        message:
            "Invalid email or password."

    });

}


            // -------------------------------------------------
            // CREATE DATABASE SESSION
            // -------------------------------------------------

            const session =
                await createSession(
                    user
                );


            console.log(
                `Successful login: ${email}`
            );


            return res.json({

                success:
                    true,

                message:
                    "Login successful.",

                token:
                    session.token,

                expiresAt:
                    session.expiresAt,

                remember:
                    remember,

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

                success:
                    false,

                message:
                    "Unable to login right now. Please try again later."

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
    async function (
        req,
        res
    ) {

        try {

            const authorization =
                String(
                    req.headers.authorization ||
                    ""
                ).trim();


            if (
                authorization
                    .toLowerCase()
                    .startsWith(
                        "bearer "
                    )
            ) {

                const token =
                    authorization
                        .slice(7)
                        .trim();


                if (token) {

                    const tokenHash =
                        hashToken(
                            token
                        );


                    await pool.query(
                        `
                        DELETE FROM auth_sessions
                        WHERE token_hash = $1
                        `,
                        [
                            tokenHash
                        ]
                    );

                }

            }


            return res.json({

                success:
                    true,

                message:
                    "Logged out successfully."

            });

        } catch (error) {

            console.error(
                "Logout error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to logout right now."

            });

        }

    }
);


// =========================================================
// GET CURRENT USER
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

            return res.json({

                success:
                    true,

                authenticated:
                    true,

                user:
                    req.user,

                expiresAt:
                    req.session.expiresAt

            });

        } catch (error) {

            console.error(
                "Auth /me error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to load account information."

            });

        }

    }
);


// =========================================================
// ADMIN CHECK
// GET /api/auth/admin-check
// =========================================================

router.get(
    "/admin-check",
    requireAuth,
    requireAdmin,
    function (
        req,
        res
    ) {

        return res.json({

            success:
                true,

            isAdmin:
                true,

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
    requireAuth,
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const name =
                cleanText(
                    req.body?.name,
                    120
                );

            const email =
                normalizeEmail(
                    req.body?.email
                );

            const phone =
                cleanText(
                    req.body?.phone,
                    30
                );

            const password =
                String(
                    req.body?.password ||
                    ""
                );

            const requestedRole =
                String(
                    req.body?.role ||
                    "customer"
                )
                    .trim()
                    .toLowerCase();


            if (!name) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter the user's name."

                });

            }


            if (
                !email ||
                !isValidEmail(
                    email
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter a valid email address."

                });

            }


            if (
                !isStrongPassword(
                    password
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Password must be between 8 and 128 characters."

                });

            }


            const role =
                requestedRole ===
                "admin"
                    ? "admin"
                    : "customer";


            const existing =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                existing.rows.length > 0
            ) {

                return res.status(409).json({

                    success:
                        false,

                    message:
                        "A user with this email already exists."

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
                    INSERT INTO users
                    (
                        name,
                        email,
                        phone,
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
                        role
                    ]
                );


            const user =
                result.rows[0];


            console.log(
                `Admin created user: ${email} (${role})`
            );


            return res.status(201).json({

                success:
                    true,

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
                "23505"
            ) {

                return res.status(409).json({

                    success:
                        false,

                    message:
                        "A user with this email already exists."

                });

            }


            return res.status(500).json({

                success:
                    false,

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
    async function (
        req,
        res
    ) {

        try {

            const email =
                normalizeEmail(
                    req.body?.email
                );


            if (
                !email ||
                !isValidEmail(
                    email
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter a valid email address."

                });

            }


            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email
                    FROM users
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            // -------------------------------------------------
            // Always return generic response for security.
            // -------------------------------------------------

            if (
                userResult.rows.length === 0
            ) {

                return res.json({

                    success:
                        true,

                    message:
                        "If an account exists for this email, a password reset link has been sent."

                });

            }


            const user =
                userResult.rows[0];


            // -------------------------------------------------
            // Delete old unused reset tokens
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
            // Generate reset token
            // -------------------------------------------------

            const rawToken =
                createRawToken();

            const tokenHash =
                hashToken(
                    rawToken
                );

            const expiresAt =
                Date.now() +
                RESET_TOKEN_DURATION_MS;


            await pool.query(
                `
                INSERT INTO password_resets
                (
                    user_id,
                    token_hash,
                    expires_at,
                    created_at
                )
                VALUES
                (
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


            const resetUrl =
                `${APP_BASE_URL}/reset-password.html?token=${encodeURIComponent(rawToken)}`;


            // -------------------------------------------------
            // Send email
            // -------------------------------------------------

            if (!transporter) {

                console.error(
                    "Password reset email cannot be sent: SMTP not configured."
                );

                return res.json({

                    success:
                        true,

                    message:
                        "If an account exists for this email, a password reset link has been sent."

                });

            }


            const text = `
Dear ${user.name || "Customer"},

We received a request to reset your U.S TRAVEL & TOURS account password.

Use the following link to reset your password:

${resetUrl}

This password reset link will expire in 30 minutes.

If you did not request this password reset, you can safely ignore this email.

U.S TRAVEL & TOURS
${OWNER_EMAIL}
`;


            const html = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>
Reset Your Password
</title>

</head>

<body
style="
margin:0;
padding:30px 15px;
background:#f4f5f7;
font-family:Arial,Helvetica,sans-serif;
color:#182235;
"
>

<table
width="100%"
cellpadding="0"
cellspacing="0"
border="0"
>

<tr>

<td align="center">

<table
width="100%"
cellpadding="0"
cellspacing="0"
border="0"
style="
max-width:650px;
background:#ffffff;
border:1px solid #e5e7eb;
border-radius:14px;
overflow:hidden;
"
>

<tr>

<td
style="
padding:28px 30px;
border-bottom:1px solid #e8e8e8;
"
>

<div
style="
font-size:11px;
font-weight:bold;
letter-spacing:1.5px;
color:#9a7b35;
margin-bottom:7px;
"
>
U.S TRAVEL & TOURS
</div>

<h1
style="
margin:0;
font-size:24px;
color:#162033;
"
>
Reset Your Password
</h1>

</td>

</tr>

<tr>

<td
style="
padding:30px;
"
>

<p
style="
font-size:15px;
line-height:1.7;
"
>
Dear ${escapeHtml(
    user.name || "Customer"
)},
</p>

<p
style="
font-size:15px;
line-height:1.7;
color:#303846;
"
>
We received a request to reset your U.S TRAVEL & TOURS account password.
</p>

<p
style="
font-size:15px;
line-height:1.7;
color:#303846;
"
>
Click the button below to create a new password.
</p>

<p
style="
margin:30px 0;
text-align:center;
"
>

<a
href="${escapeHtml(resetUrl)}"
style="
display:inline-block;
padding:14px 24px;
background:#162033;
color:#ffffff;
text-decoration:none;
border-radius:8px;
font-weight:bold;
"
>
Reset Password
</a>

</p>

<p
style="
font-size:13px;
line-height:1.7;
color:#777;
"
>
This link will expire in 30 minutes.
</p>

<p
style="
font-size:13px;
line-height:1.7;
color:#777;
"
>
If you did not request this password reset, you can safely ignore this email.
</p>

</td>

</tr>

<tr>

<td
style="
padding:18px 30px;
background:#f8f9fa;
border-top:1px solid #e8e8e8;
font-size:12px;
color:#777;
"
>
U.S TRAVEL & TOURS
</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`;


            await transporter.sendMail({

                from:
                    MAIL_FROM,

                to:
                    user.email,

                replyTo:
                    MAIL_FROM,

                subject:
                    "Reset Your U.S TRAVEL & TOURS Password",

                text:
                    text,

                html:
                    html

            });


            console.log(
                `Password reset email sent successfully to ${user.email}`
            );


            return res.json({

                success:
                    true,

                message:
                    "If an account exists for this email, a password reset link has been sent."

            });

        } catch (error) {

            console.error(
                "Forgot password error:",
                error
            );

            return res.json({

                success:
                    true,

                message:
                    "If an account exists for this email, a password reset link has been sent."

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
    async function (
        req,
        res
    ) {

        const client =
            await pool.connect();

        try {

            const token =
                String(
                    req.body?.token ||
                    ""
                ).trim();

            const newPassword =
                String(
                    req.body?.password ||
                    req.body?.newPassword ||
                    ""
                );


            if (!token) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Password reset token is required."

                });

            }


            if (
                !isStrongPassword(
                    newPassword
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Password must be between 8 and 128 characters."

                });

            }


            const tokenHash =
                hashToken(
                    token
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
                    `,
                    [
                        tokenHash
                    ]
                );


            if (
                resetResult.rows.length === 0
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "This password reset link is invalid or has expired."

                });

            }


            const reset =
                resetResult.rows[0];


            if (
                reset.used_at
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "This password reset link has already been used."

                });

            }


            if (
                Number(
                    reset.expires_at
                ) <= Date.now()
            ) {

                await client.query(
                    `
                    DELETE FROM password_resets
                    WHERE id = $1
                    `,
                    [
                        reset.id
                    ]
                );


                return res.status(400).json({

                    success:
                        false,

                    message:
                        "This password reset link has expired."

                });

            }


            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );


            await client.query(
                "BEGIN"
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

                SET
                    used_at = $1

                WHERE id = $2
                `,
                [
                    Date.now(),
                    reset.id
                ]
            );


            // -------------------------------------------------
            // INVALIDATE ALL EXISTING SESSIONS
            // -------------------------------------------------

            await client.query(
                `
                DELETE FROM auth_sessions
                WHERE user_id = $1
                `,
                [
                    reset.user_id
                ]
            );


            await client.query(
                "COMMIT"
            );


            console.log(
                `Password reset completed for user ID ${reset.user_id}`
            );


            return res.json({

                success:
                    true,

                message:
                    "Your password has been reset successfully. Please login with your new password."

            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch (
                rollbackError
            ) {

                console.error(
                    "Reset password rollback error:",
                    rollbackError
                );

            }


            console.error(
                "Reset password error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to reset your password right now. Please try again later."

            });

        } finally {

            client.release();

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
    async function (
        req,
        res
    ) {

        try {

            const currentPassword =
                String(
                    req.body?.currentPassword ||
                    ""
                );

            const newPassword =
                String(
                    req.body?.newPassword ||
                    req.body?.password ||
                    ""
                );


            if (!currentPassword) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please enter your current password."

                });

            }


            if (
                !isStrongPassword(
                    newPassword
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "New password must be between 8 and 128 characters."

                });

            }


            if (
                currentPassword ===
                newPassword
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "New password must be different from your current password."

                });

            }


            const userResult =
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
                userResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "User account not found."

                });

            }


            const user =
                userResult.rows[0];


            const currentMatches =
                await bcrypt.compare(
                    currentPassword,
                    user.password_hash
                );


            if (
                !currentMatches
            ) {

                return res.status(401).json({

                    success:
                        false,

                    message:
                        "Current password is incorrect."

                });

            }


            const newHash =
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
                    newHash,
                    req.user.id
                ]
            );


            // -------------------------------------------------
            // Invalidate all sessions except current session.
            // -------------------------------------------------

            await pool.query(
                `
                DELETE FROM auth_sessions
                WHERE user_id = $1
                AND id <> $2
                `,
                [
                    req.user.id,
                    req.session.id
                ]
            );


            return res.json({

                success:
                    true,

                message:
                    "Password changed successfully."

            });

        } catch (error) {

            console.error(
                "Change password error:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to change your password right now."

            });

        }

    }
);


// =========================================================
// CLEAN EXPIRED SESSIONS
// =========================================================
//
// Runs periodically.
// Persistent sessions remain in PostgreSQL until expiry.
// =========================================================

const cleanupInterval =
    setInterval(
        async function () {

            try {

                const now =
                    Date.now();


                const sessionsResult =
                    await pool.query(
                        `
                        DELETE FROM auth_sessions
                        WHERE expires_at <= $1
                        `,
                        [
                            now
                        ]
                    );


                const resetResult =
                    await pool.query(
                        `
                        DELETE FROM password_resets
                        WHERE expires_at <= $1
                        OR (
                            used_at IS NOT NULL
                            AND used_at <= $1
                        )
                        `,
                        [
                            now
                        ]
                    );


                if (
                    sessionsResult.rowCount > 0 ||
                    resetResult.rowCount > 0
                ) {

                    console.log(
                        "Auth cleanup:",
                        sessionsResult.rowCount,
                        "expired sessions removed;",
                        resetResult.rowCount,
                        "expired/used reset tokens removed."
                    );

                }

            } catch (error) {

                console.error(
                    "Auth cleanup error:",
                    error
                );

            }

        },
        1000 *
        60 *
        30
    );


// =========================================================
// PREVENT NODE FROM KEEPING PROCESS ALIVE ONLY BECAUSE
// OF THIS TIMER
// =========================================================

if (
    cleanupInterval &&
    typeof cleanupInterval.unref ===
    "function"
) {

    cleanupInterval.unref();

}


// =========================================================
// EXPORT
// =========================================================

module.exports = router;

module.exports.requireAuth =
    requireAuth;

module.exports.requireAdmin =
    requireAdmin;

module.exports.getAuthenticatedUser =
    getAuthenticatedUser;

console.log(
    "Authentication module loaded - PostgreSQL persistent sessions enabled."
);
