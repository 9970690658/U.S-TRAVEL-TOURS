// =========================================================
// U.S TRAVEL & TOURS
// DATABASE CONFIGURATION
// PostgreSQL Database
// Render PostgreSQL
// =========================================================

const { Pool } = require("pg");

// =========================================================
// DATABASE CONNECTION
// =========================================================

const DATABASE_URL =
    String(process.env.DATABASE_URL || "").trim();

if (!DATABASE_URL) {
    console.error(
        "========================================================="
    );

    console.error(
        "DATABASE CONFIGURATION ERROR"
    );

    console.error(
        "DATABASE_URL environment variable is missing."
    );

    console.error(
        "Please add DATABASE_URL in Render Environment Variables."
    );

    console.error(
        "========================================================="
    );

    throw new Error(
        "DATABASE_URL is required."
    );
}

// ---------------------------------------------------------
// PostgreSQL SSL
// Render PostgreSQL normally requires SSL.
// ---------------------------------------------------------

const pool = new Pool({
    connectionString: DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    },

    max: 10,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 10000
});

// =========================================================
// DATABASE ERROR HANDLER
// =========================================================

pool.on("error", (error) => {

    console.error(
        "Unexpected PostgreSQL pool error:",
        error
    );

});

// =========================================================
// INITIALIZE DATABASE
// =========================================================

let initializationPromise = null;

async function initializeDatabase() {

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise =
        initializeDatabaseInternal();

    return initializationPromise;
}


async function initializeDatabaseInternal() {

    const client =
        await pool.connect();

    try {

        await client.query("BEGIN");

        // =================================================
        // USERS
        // =================================================

        await client.query(`
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
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // =================================================
        // APPLICATIONS
        // =================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS applications (
                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT,

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
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_applications_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE SET NULL
            );
        `);


        // =================================================
        // APPLICATIONS USER ID MIGRATION
        // =================================================

        await client.query(`
            ALTER TABLE applications
            ADD COLUMN IF NOT EXISTS user_id BIGINT;
        `);


        // =================================================
        // PAYMENTS
        // =================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id BIGSERIAL PRIMARY KEY,

                application_id BIGINT NOT NULL,

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
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_payments_application
                    FOREIGN KEY (application_id)
                    REFERENCES applications(id)
                    ON DELETE CASCADE
            );
        `);


        // =================================================
        // OLD GENERAL CHAT TABLE
        // =================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id BIGSERIAL PRIMARY KEY,

                name TEXT,

                email TEXT,

                message TEXT NOT NULL,

                sender_type TEXT NOT NULL DEFAULT 'visitor'
                    CHECK (
                        sender_type IN (
                            'visitor',
                            'admin'
                        )
                    ),

                is_read BOOLEAN NOT NULL DEFAULT FALSE,

                created_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // =================================================
        // CONTACT MESSAGES
        // =================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id BIGSERIAL PRIMARY KEY,

                name TEXT NOT NULL,

                email TEXT NOT NULL,

                phone TEXT,

                service TEXT,

                subject TEXT,

                message TEXT NOT NULL,

                consent BOOLEAN NOT NULL DEFAULT FALSE,

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
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // =================================================
        // CONTACT MIGRATIONS
        // =================================================

        await client.query(`
            ALTER TABLE contact_messages
            ADD COLUMN IF NOT EXISTS service TEXT;
        `);

        await client.query(`
            ALTER TABLE contact_messages
            ADD COLUMN IF NOT EXISTS consent BOOLEAN
            NOT NULL DEFAULT FALSE;
        `);


        // =================================================
        // JOB APPLICATIONS
        // =================================================

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
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_jobs_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE SET NULL
            );
        `);


        // =================================================
        // JOB APPLICATION MIGRATIONS
        // =================================================

        await client.query(`
            ALTER TABLE job_applications
            ADD COLUMN IF NOT EXISTS user_id BIGINT;
        `);

        await client.query(`
            ALTER TABLE job_applications
            ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
        `);

        await client.query(`
            ALTER TABLE job_applications
            ADD COLUMN IF NOT EXISTS country TEXT;
        `);

        await client.query(`
            ALTER TABLE job_applications
            ADD COLUMN IF NOT EXISTS city TEXT;
        `);

        await client.query(`
            ALTER TABLE job_applications
            ADD COLUMN IF NOT EXISTS experience TEXT;
        `);

        await client.query(`
            ALTER TABLE job_applications
            ADD COLUMN IF NOT EXISTS education TEXT;
        `);


        // =================================================
        // PERMANENT SUPPORT LIVE CHAT
        // =================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS support_chat_messages (
                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT NOT NULL,

                sender_type TEXT NOT NULL
                    CHECK (
                        sender_type IN (
                            'customer',
                            'admin'
                        )
                    ),

                message TEXT NOT NULL,

                is_read BOOLEAN NOT NULL DEFAULT FALSE,

                created_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_support_chat_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            );
        `);


        // =================================================
        // PERSISTENT LOGIN SESSIONS
        // =================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id BIGSERIAL PRIMARY KEY,

                token_hash TEXT NOT NULL UNIQUE,

                user_id BIGINT NOT NULL,

                role TEXT NOT NULL
                    CHECK (
                        role IN (
                            'customer',
                            'admin'
                        )
                    ),

                expires_at BIGINT NOT NULL,

                created_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                last_used_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_sessions_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            );
        `);


        // =================================================
        // PASSWORD RESET TOKENS
        // =================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT NOT NULL,

                token_hash TEXT NOT NULL UNIQUE,

                expires_at BIGINT NOT NULL,

                used_at BIGINT,

                created_at TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_password_reset_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            );
        `);


        // =================================================
        // INDEXES
        // =================================================

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email
            ON users(email);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_applications_status
            ON applications(status);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_applications_user
            ON applications(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_application
            ON payments(application_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_status
            ON payments(status);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_created
            ON chat_messages(created_at);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contact_created
            ON contact_messages(created_at);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contact_status
            ON contact_messages(status);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_job_created
            ON job_applications(created_at);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_job_user
            ON job_applications(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_support_chat_user
            ON support_chat_messages(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_support_chat_created
            ON support_chat_messages(created_at);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_support_chat_unread
            ON support_chat_messages(
                user_id,
                sender_type,
                is_read
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
            ON sessions(token_hash);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id
            ON sessions(user_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
            ON sessions(expires_at);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_resets_token
            ON password_resets(token_hash);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_password_resets_user
            ON password_resets(user_id);
        `);


        await client.query("COMMIT");

        console.log(
            "=============================================="
        );

        console.log(
            "U.S TRAVEL & TOURS DATABASE"
        );

        console.log(
            "PostgreSQL database initialized successfully."
        );

        console.log(
            "Persistent users enabled."
        );

        console.log(
            "Persistent sessions enabled."
        );

        console.log(
            "Persistent applications enabled."
        );

        console.log(
            "Persistent payments enabled."
        );

        console.log(
            "Persistent contact messages enabled."
        );

        console.log(
            "Persistent job applications enabled."
        );

        console.log(
            "Persistent Live Chat enabled."
        );

        console.log(
            "=============================================="
        );

    } catch (error) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "PostgreSQL rollback error:",
                rollbackError
            );
        }

        console.error(
            "PostgreSQL database initialization error:",
            error
        );

        throw error;

    } finally {

        client.release();

    }
}


// =========================================================
// DATABASE HELPER
// =========================================================

function getDatabase() {
    return pool;
}


// =========================================================
// GET CONNECTION
// Useful for transactions
// =========================================================

async function getConnection() {

    return pool.connect();

}


// =========================================================
// HEALTH CHECK
// =========================================================

async function checkDatabaseConnection() {

    const result =
        await pool.query(
            "SELECT NOW() AS current_time"
        );

    return result.rows[0];

}


// =========================================================
// CLOSE DATABASE
// =========================================================

async function closeDatabase() {

    try {

        await pool.end();

        console.log(
            "PostgreSQL database connection closed."
        );

    } catch (error) {

        console.error(
            "Error closing PostgreSQL database:",
            error
        );

    }

}


// =========================================================
// EXPORT
// =========================================================

module.exports = {

    db: pool,

    pool,

    getDatabase,

    getConnection,

    initializeDatabase,

    checkDatabaseConnection,

    closeDatabase

};
