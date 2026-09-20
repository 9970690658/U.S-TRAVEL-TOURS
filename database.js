// =========================================================
// U.S TRAVEL & TOURS
// DATABASE CONFIGURATION
// PostgreSQL / Supabase
//
// IMPORTANT:
// This file replaces the old better-sqlite3 database.
// Render DATABASE_URL -> Supabase PostgreSQL
// =========================================================

const { Pool } = require("pg");

// =========================================================
// DATABASE CONFIGURATION
// =========================================================

const DATABASE_URL =
    process.env.DATABASE_URL;

if (!DATABASE_URL) {

    console.error(
        "========================================================="
    );

    console.error(
        "DATABASE_URL IS MISSING"
    );

    console.error(
        "Please add DATABASE_URL in Render Environment Variables."
    );

    console.error(
        "========================================================="
    );

    throw new Error(
        "DATABASE_URL environment variable is required."
    );

}


// =========================================================
// POSTGRESQL CONNECTION POOL
// =========================================================

const pool =
    new Pool({

        connectionString:
            DATABASE_URL,

        ssl: {
            rejectUnauthorized:
                false
        },

        max: 10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            15000

    });


// =========================================================
// DATABASE ERROR HANDLER
// =========================================================

pool.on(
    "error",
    function (
        error
    ) {

        console.error(
            "Unexpected PostgreSQL pool error:",
            error
        );

    }
);


// =========================================================
// TEST DATABASE CONNECTION
// =========================================================

async function testDatabaseConnection() {

    const client =
        await pool.connect();

    try {

        await client.query(
            "SELECT 1"
        );

        console.log(
            "PostgreSQL / Supabase database connection successful."
        );

    } finally {

        client.release();

    }

}


// =========================================================
// INITIALIZE DATABASE
// =========================================================
//
// All tables required by the existing U.S TRAVEL & TOURS
// backend are created here.
//
// Existing API functionality is preserved.
// =========================================================

async function initializeDatabase() {

    const client =
        await pool.connect();

    try {

        await client.query(
            "BEGIN"
        );


        // =====================================================
        // USERS
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (

                id BIGSERIAL PRIMARY KEY,

                name TEXT NOT NULL,

                email TEXT NOT NULL UNIQUE,

                phone TEXT,

                password_hash TEXT NOT NULL,

                role TEXT NOT NULL DEFAULT 'customer',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT users_role_check
                CHECK (
                    role IN (
                        'customer',
                        'admin'
                    )
                )

            );
        `);


        // =====================================================
        // APPLICATIONS
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS applications (

                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT,

                application_data TEXT NOT NULL,

                status TEXT NOT NULL DEFAULT 'pending',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT applications_status_check
                CHECK (
                    status IN (
                        'pending',
                        'payment_pending',
                        'payment_submitted',
                        'under_review',
                        'approved',
                        'rejected',
                        'completed'
                    )
                ),

                CONSTRAINT applications_user_fk
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE SET NULL

            );
        `);


        // =====================================================
        // PAYMENTS
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (

                id BIGSERIAL PRIMARY KEY,

                application_id BIGINT NOT NULL,

                payment_method TEXT NOT NULL,

                payment_reference TEXT NOT NULL,

                message TEXT,

                proof_file TEXT,

                status TEXT NOT NULL DEFAULT 'pending',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT payments_method_check
                CHECK (
                    payment_method IN (
                        'bitcoin',
                        'paypal'
                    )
                ),

                CONSTRAINT payments_status_check
                CHECK (
                    status IN (
                        'pending',
                        'verified',
                        'rejected'
                    )
                ),

                CONSTRAINT payments_application_fk
                FOREIGN KEY (application_id)
                REFERENCES applications(id)
                ON DELETE CASCADE

            );
        `);


        // =====================================================
        // SUPPORT CHAT MESSAGES
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS support_chat_messages (

                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT NOT NULL,

                sender_type TEXT NOT NULL,

                message TEXT NOT NULL,

                is_read INTEGER NOT NULL DEFAULT 0,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT support_chat_sender_check
                CHECK (
                    sender_type IN (
                        'customer',
                        'admin'
                    )
                ),

                CONSTRAINT support_chat_user_fk
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE

            );
        `);


        // =====================================================
        // CONTACT MESSAGES
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS contact_messages (

                id BIGSERIAL PRIMARY KEY,

                name TEXT NOT NULL,

                email TEXT NOT NULL,

                phone TEXT NOT NULL,

                service TEXT NOT NULL,

                subject TEXT,

                message TEXT NOT NULL,

                consent INTEGER DEFAULT 0,

                status TEXT NOT NULL DEFAULT 'new',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT contact_status_check
                CHECK (
                    status IN (
                        'new',
                        'read',
                        'replied',
                        'closed'
                    )
                )

            );
        `);


        // =====================================================
        // JOB APPLICATIONS
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS job_applications (

                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT,

                job_title TEXT NOT NULL,

                name TEXT NOT NULL,

                email TEXT NOT NULL,

                phone TEXT NOT NULL,

                resume_file TEXT,

                cover_letter TEXT,

                status TEXT NOT NULL DEFAULT 'new',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                date_of_birth TEXT,

                country TEXT,

                city TEXT,

                experience TEXT,

                education TEXT,

                CONSTRAINT job_status_check
                CHECK (
                    status IN (
                        'new',
                        'reviewing',
                        'shortlisted',
                        'rejected',
                        'hired'
                    )
                ),

                CONSTRAINT job_user_fk
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE SET NULL

            );
        `);


        // =====================================================
        // PASSWORD RESETS
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS password_resets (

                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT NOT NULL,

                token_hash TEXT NOT NULL UNIQUE,

                expires_at BIGINT NOT NULL,

                used_at BIGINT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT password_reset_user_fk
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE

            );
        `);


        // =====================================================
        // AUTH SESSIONS
        // =====================================================
        //
        // IMPORTANT:
        // Old system used:
        //
        // const sessions = new Map();
        //
        // That disappeared whenever Render restarted.
        //
        // This table makes sessions persistent.
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS auth_sessions (

                id BIGSERIAL PRIMARY KEY,

                token_hash TEXT NOT NULL UNIQUE,

                user_id BIGINT NOT NULL,

                role TEXT NOT NULL,

                expires_at BIGINT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT auth_session_user_fk
                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE

            );
        `);


        // =====================================================
        // USERS INDEX
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_users_email
            ON users(email);
        `);


        // =====================================================
        // APPLICATION INDEXES
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_applications_user
            ON applications(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_applications_status
            ON applications(status);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_applications_created
            ON applications(created_at);
        `);


        // =====================================================
        // PAYMENT INDEXES
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_payments_application
            ON payments(application_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_payments_status
            ON payments(status);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_payments_reference
            ON payments(payment_reference);
        `);


        // =====================================================
        // CHAT INDEXES
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_user
            ON support_chat_messages(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_created
            ON support_chat_messages(created_at);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_chat_user_sender_read
            ON support_chat_messages(
                user_id,
                sender_type,
                is_read
            );
        `);


        // =====================================================
        // CONTACT INDEXES
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_contact_status
            ON contact_messages(status);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_contact_created
            ON contact_messages(created_at);
        `);


        // =====================================================
        // JOB INDEXES
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_job_user
            ON job_applications(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_job_created
            ON job_applications(created_at);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_job_status
            ON job_applications(status);
        `);


        // =====================================================
        // PASSWORD RESET INDEXES
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_password_resets_user
            ON password_resets(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_password_resets_expiry
            ON password_resets(expires_at);
        `);


        // =====================================================
        // SESSION INDEXES
        // =====================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_auth_sessions_user
            ON auth_sessions(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS
            idx_auth_sessions_expiry
            ON auth_sessions(expires_at);
        `);


        // =====================================================
        // COMMIT
        // =====================================================

        await client.query(
            "COMMIT"
        );


        console.log(
            "========================================================="
        );

        console.log(
            "U.S TRAVEL & TOURS DATABASE"
        );

        console.log(
            "========================================================="
        );

        console.log(
            "Database: PostgreSQL / Supabase"
        );

        console.log(
            "Tables initialized successfully."
        );

        console.log(
            "Users: ready"
        );

        console.log(
            "Applications: ready"
        );

        console.log(
            "Payments: ready"
        );

        console.log(
            "Support Chat: ready"
        );

        console.log(
            "Contact Messages: ready"
        );

        console.log(
            "Job Applications: ready"
        );

        console.log(
            "Password Resets: ready"
        );

        console.log(
            "Persistent Sessions: ready"
        );

        console.log(
            "========================================================="
        );


    } catch (error) {

        try {

            await client.query(
                "ROLLBACK"
            );

        } catch (
            rollbackError
        ) {

            console.error(
                "Database rollback error:",
                rollbackError
            );

        }

        console.error(
            "========================================================="
        );

        console.error(
            "DATABASE INITIALIZATION ERROR"
        );

        console.error(
            error
        );

        console.error(
            "========================================================="
        );

        throw error;

    } finally {

        client.release();

    }

}


// =========================================================
// SIMPLE QUERY HELPER
// =========================================================
//
// Other backend modules will use:
// const { pool } = require("./database");
// const result = await pool.query(...);
//
// =========================================================

async function query(
    text,
    params = []
) {

    return pool.query(
        text,
        params
    );

}


// =========================================================
// CLOSE DATABASE
// =========================================================

async function closeDatabase() {

    await pool.end();

    console.log(
        "PostgreSQL connection pool closed."
    );

}


// =========================================================
// EXPORT
// =========================================================

module.exports = {

    pool,

    query,

    initializeDatabase,

    testDatabaseConnection,

    closeDatabase

};
