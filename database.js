// =========================================================
// U.S TRAVEL & TOURS
// DATABASE CONFIGURATION
// SUPABASE POSTGRESQL
// =========================================================

const { Pool } = require("pg");

// =========================================================
// DATABASE URL
// =========================================================

const DATABASE_URL =
    process.env.DATABASE_URL;

if (!DATABASE_URL) {

    throw new Error(
        "DATABASE_URL is not configured. Add your Supabase PostgreSQL connection string to Render Environment Variables."
    );

}

// =========================================================
// POSTGRESQL POOL
// =========================================================

const pool =
    new Pool({

        connectionString:
            DATABASE_URL,

        ssl:
            process.env.NODE_ENV === "production"
                ? {
                    rejectUnauthorized: false
                }
                : false,

        max: 10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000

    });

// =========================================================
// DATABASE TEST
// =========================================================

async function testDatabase() {

    const client =
        await pool.connect();

    try {

        await client.query(
            "SELECT 1"
        );

        console.log(
            "DATABASE: Supabase PostgreSQL connected successfully."
        );

    } finally {

        client.release();

    }

}

// =========================================================
// INITIALIZE TABLES
// =========================================================

async function initializeDatabase() {

    // -----------------------------------------------------
    // USERS
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

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // -----------------------------------------------------
    // SESSIONS
    // -----------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (

            id BIGSERIAL PRIMARY KEY,

            user_id BIGINT NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,

            token_hash TEXT NOT NULL UNIQUE,

            expires_at BIGINT NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // -----------------------------------------------------
    // PASSWORD RESETS
    // -----------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_resets (

            id BIGSERIAL PRIMARY KEY,

            user_id BIGINT NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,

            token_hash TEXT NOT NULL UNIQUE,

            expires_at BIGINT NOT NULL,

            used_at BIGINT,

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // -----------------------------------------------------
    // APPLICATIONS
    // -----------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS applications (

            id BIGSERIAL PRIMARY KEY,

            user_id BIGINT
                REFERENCES users(id)
                ON DELETE SET NULL,

            application_data TEXT NOT NULL,

            status TEXT NOT NULL DEFAULT 'pending'
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

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // -----------------------------------------------------
    // PAYMENTS
    // -----------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS payments (

            id BIGSERIAL PRIMARY KEY,

            application_id BIGINT NOT NULL
                REFERENCES applications(id)
                ON DELETE CASCADE,

            payment_method TEXT NOT NULL
                CHECK (
                    payment_method IN (
                        'bitcoin',
                        'paypal'
                    )
                ),

            payment_reference TEXT NOT NULL,

            message TEXT,

            proof_file TEXT,

            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (
                    status IN (
                        'pending',
                        'verified',
                        'rejected'
                    )
                ),

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // -----------------------------------------------------
    // CHAT
    // -----------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS support_chat_messages (

            id BIGSERIAL PRIMARY KEY,

            user_id BIGINT NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,

            sender_type TEXT NOT NULL
                CHECK (
                    sender_type IN (
                        'customer',
                        'admin'
                    )
                ),

            message TEXT NOT NULL,

            is_read INTEGER NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // -----------------------------------------------------
    // CONTACT MESSAGES
    // -----------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_messages (

            id BIGSERIAL PRIMARY KEY,

            name TEXT NOT NULL,

            email TEXT NOT NULL,

            phone TEXT,

            service TEXT,

            subject TEXT,

            message TEXT NOT NULL,

            consent INTEGER DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'new'
                CHECK (
                    status IN (
                        'new',
                        'read',
                        'replied',
                        'closed'
                    )
                ),

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // -----------------------------------------------------
    // JOB APPLICATIONS
    // -----------------------------------------------------

    await pool.query(`
        CREATE TABLE IF NOT EXISTS job_applications (

            id BIGSERIAL PRIMARY KEY,

            user_id BIGINT
                REFERENCES users(id)
                ON DELETE SET NULL,

            job_title TEXT NOT NULL,

            name TEXT NOT NULL,

            email TEXT NOT NULL,

            phone TEXT NOT NULL,

            resume_file TEXT,

            cover_letter TEXT,

            status TEXT NOT NULL DEFAULT 'new'
                CHECK (
                    status IN (
                        'new',
                        'reviewing',
                        'shortlisted',
                                               'rejected',
                        'hired'
                    )
                ),

            date_of_birth TEXT,

            country TEXT,

            city TEXT,

            experience TEXT,

            education TEXT,

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // =====================================================
    // MIGRATION COLUMNS FOR EXISTING DATABASES
    // =====================================================

    await pool.query(`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS user_id BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL;
    `);

    await pool.query(`
        ALTER TABLE job_applications
        ADD COLUMN IF NOT EXISTS user_id BIGINT
        REFERENCES users(id)
        ON DELETE SET NULL;
    `);

    await pool.query(`
        ALTER TABLE job_applications
        ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
    `);

    await pool.query(`
        ALTER TABLE job_applications
        ADD COLUMN IF NOT EXISTS country TEXT;
    `);

    await pool.query(`
        ALTER TABLE job_applications
        ADD COLUMN IF NOT EXISTS city TEXT;
    `);

    await pool.query(`
        ALTER TABLE job_applications
        ADD COLUMN IF NOT EXISTS experience TEXT;
    `);

    await pool.query(`
        ALTER TABLE job_applications
        ADD COLUMN IF NOT EXISTS education TEXT;
    `);

    // =====================================================
    // INDEXES
    // =====================================================

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email
        ON users(email);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
        ON sessions(token_hash);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_user
        ON sessions(user_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_expires
        ON sessions(expires_at);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_password_resets_token
        ON password_resets(token_hash);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_password_resets_user
        ON password_resets(user_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_applications_user
        ON applications(user_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_applications_status
        ON applications(status);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_payments_application
        ON payments(application_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_payments_status
        ON payments(status);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_support_chat_user
        ON support_chat_messages(user_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_support_chat_created
        ON support_chat_messages(created_at);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_support_chat_unread
        ON support_chat_messages(
            user_id,
            sender_type,
            is_read
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_contact_created
        ON contact_messages(created_at);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_contact_status
        ON contact_messages(status);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_job_created
        ON job_applications(created_at);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_job_user
        ON job_applications(user_id);
    `);

    console.log(
        "DATABASE: All PostgreSQL tables and indexes are ready."
    );
}

// =========================================================
// START DATABASE
// =========================================================

const databaseReady =
    initializeDatabase()
        .then(() => testDatabase())
        .catch(error => {

            console.error(
                "DATABASE INITIALIZATION ERROR:",
                error
            );

            throw error;

        });

// =========================================================
// QUERY HELPERS
// =========================================================

async function query(
    text,
    params = []
) {

    await databaseReady;

    return pool.query(
        text,
        params
    );
}

// =========================================================
// GET SINGLE ROW
// =========================================================

async function get(
    text,
    params = []
) {

    const result =
        await query(
            text,
            params
        );

    return result.rows[0] || null;
}

// =========================================================
// GET ALL ROWS
// =========================================================

async function all(
    text,
    params = []
) {

    const result =
        await query(
            text,
            params
        );

    return result.rows;
}

// =========================================================
// RUN QUERY
// =========================================================

async function run(
    text,
    params = []
) {

    const result =
        await query(
            text,
            params
        );

    return result;
}

// =========================================================
// TRANSACTION
// =========================================================

async function transaction(
    callback
) {

    await databaseReady;

    const client =
        await pool.connect();

    try {

        await client.query(
            "BEGIN"
        );

        const result =
            await callback(client);

        await client.query(
            "COMMIT"
        );

        return result;

    } catch (error) {

        try {

            await client.query(
                "ROLLBACK"
            );

        } catch (rollbackError) {

            console.error(
                "DATABASE ROLLBACK ERROR:",
                rollbackError
            );

        }

        throw error;

    } finally {

        client.release();

    }
}

// =========================================================
// DATABASE CLOSE
// =========================================================

async function closeDatabase() {

    await pool.end();

}

// =========================================================
// EXPORT
// =========================================================

module.exports = {

    pool,

    query,

    get,

    all,

    run,

    transaction,

    initializeDatabase,

    databaseReady,

    closeDatabase

};

console.log(
    "U.S TRAVEL & TOURS PostgreSQL database module loaded."
);
