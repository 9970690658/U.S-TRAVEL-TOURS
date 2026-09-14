// =========================================================
// U.S TRAVEL & TOURS
// DATABASE CONFIGURATION
// SQLite Database
// =========================================================

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// ---------------------------------------------------------
// DATABASE DIRECTORY
// ---------------------------------------------------------

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "database.db");

// Create data folder if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---------------------------------------------------------
// DATABASE CONNECTION
// ---------------------------------------------------------

const db = new Database(DB_PATH);

// SQLite performance / safety settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------
// USERS TABLE
// ---------------------------------------------------------

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,

        password_hash TEXT NOT NULL,

        role TEXT NOT NULL DEFAULT 'customer'
            CHECK (role IN ('customer', 'admin')),

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ---------------------------------------------------------
// APPLICATIONS TABLE
// ---------------------------------------------------------

db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

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

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ---------------------------------------------------------
// PAYMENTS TABLE
// ---------------------------------------------------------

db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        application_id INTEGER NOT NULL,

        payment_method TEXT NOT NULL
            CHECK (payment_method IN ('bitcoin', 'paypal')),

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

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (application_id)
            REFERENCES applications(id)
            ON DELETE CASCADE
    );
`);

// ---------------------------------------------------------
// CHAT MESSAGES TABLE
// ---------------------------------------------------------

db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

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

        is_read INTEGER NOT NULL DEFAULT 0,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ---------------------------------------------------------
// CONTACT MESSAGES TABLE
// ---------------------------------------------------------

db.exec(`
    CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,

        subject TEXT,
        message TEXT NOT NULL,

        status TEXT NOT NULL DEFAULT 'new'
            CHECK (
                status IN (
                    'new',
                    'read',
                    'replied',
                    'closed'
                )
            ),

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ---------------------------------------------------------
// JOB APPLICATIONS TABLE
// ---------------------------------------------------------

db.exec(`
    CREATE TABLE IF NOT EXISTS job_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

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

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// =========================================================
// JOB APPLICATIONS MIGRATION
// =========================================================

try {

    const jobApplicationColumns =
        db.prepare(`
            PRAGMA table_info(job_applications)
        `).all();

    const hasUserId =
        jobApplicationColumns.some(
            column => column.name === "user_id"
        );

    if (!hasUserId) {

        db.exec(`
            ALTER TABLE job_applications
            ADD COLUMN user_id INTEGER
        `);

        console.log(
            "job_applications.user_id column added."
        );

    }

} catch (error) {

    console.error(
        "Job applications migration error:",
        error
    );

}

// ---------------------------------------------------------
// INDEXES
// ---------------------------------------------------------
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

    CREATE INDEX IF NOT EXISTS idx_applications_status
    ON applications(status);

    CREATE INDEX IF NOT EXISTS idx_payments_application
    ON payments(application_id);

    CREATE INDEX IF NOT EXISTS idx_payments_status
    ON payments(status);

    CREATE INDEX IF NOT EXISTS idx_chat_created
    ON chat_messages(created_at);

    CREATE INDEX IF NOT EXISTS idx_contact_created
    ON contact_messages(created_at);

    CREATE INDEX IF NOT EXISTS idx_job_created
    ON job_applications(created_at);

    CREATE INDEX IF NOT EXISTS idx_job_user
    ON job_applications(user_id);
`);
// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------

function getDatabase() {
    return db;
}

// ---------------------------------------------------------
// CLOSE DATABASE
// ---------------------------------------------------------

function closeDatabase() {
    if (db.open) {
        db.close();
    }
}

// ---------------------------------------------------------
// EXPORT
// ---------------------------------------------------------

module.exports = {
    db,
    getDatabase,
    closeDatabase,
    DB_PATH
};

console.log("==============================================");
console.log("U.S TRAVEL & TOURS DATABASE");
console.log("==============================================");
console.log(`Database: ${DB_PATH}`);
console.log("SQLite database initialized successfully.");
console.log("==============================================");
