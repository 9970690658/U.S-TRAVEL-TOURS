// =========================================================
// U.S TRAVEL & TOURS
// MONGODB DATABASE LAYER
// =========================================================
//
// MongoDB Atlas + Render
//
// Collections:
//   users
//   sessions
//   password_resets
//   applications
//   payments
//   support_chat_messages
//   contact_messages
//   job_applications
//   counters
//
// IMPORTANT:
// Existing frontend/API numeric IDs are preserved.
// MongoDB's internal _id is separate.
// =========================================================

const {
    MongoClient
} = require("mongodb");

// =========================================================
// CONFIG
// =========================================================

const MONGODB_URI =
    process.env.MONGODB_URI;

const MONGODB_DB_NAME =
    process.env.MONGODB_DB_NAME ||
    "us-travel-tours";

// =========================================================
// VALIDATION
// =========================================================

if (!MONGODB_URI) {

    console.error(
        "========================================================="
    );

    console.error(
        "MONGODB_URI environment variable is missing."
    );

    console.error(
        "Add MONGODB_URI in Render Environment Variables."
    );

    console.error(
        "========================================================="
    );

}

// =========================================================
// MONGODB CLIENT
// =========================================================

let client = null;

let database = null;

let initialized = false;

// =========================================================
// CONNECT DATABASE
// =========================================================

async function initDatabase() {

    if (initialized && database) {

        return database;

    }

    if (!MONGODB_URI) {

        throw new Error(
            "MONGODB_URI environment variable is not configured."
        );

    }

    try {

        client =
            new MongoClient(
                MONGODB_URI,
                {
                    maxPoolSize: 20,
                    minPoolSize: 1,
                    serverSelectionTimeoutMS: 10000,
                    connectTimeoutMS: 10000
                }
            );

        await client.connect();

        database =
            client.db(
                MONGODB_DB_NAME
            );

        // -----------------------------------------------------
        // TEST CONNECTION
        // -----------------------------------------------------

        await database.command({
            ping: 1
        });

        // -----------------------------------------------------
        // CREATE COLLECTIONS / INDEXES
        // -----------------------------------------------------

        await createIndexes();

        initialized = true;

        console.log(
            "========================================================="
        );

        console.log(
            "MongoDB connected successfully."
        );

        console.log(
            `MongoDB database: ${MONGODB_DB_NAME}`
        );

        console.log(
            "========================================================="
        );

        return database;

    } catch (error) {

        console.error(
            "MongoDB connection failed:"
        );

        console.error(
            error
        );

        database = null;

        initialized = false;

        if (client) {

            try {

                await client.close();

            } catch {}

        }

        client = null;

        throw error;

    }

}

// =========================================================
// GET DATABASE
// =========================================================

function getDatabase() {

    if (!database || !initialized) {

        throw new Error(
            "MongoDB database is not initialized. Call initDatabase() first."
        );

    }

    return database;

}

// =========================================================
// GET COLLECTION
// =========================================================

function getCollection(
    collectionName
) {

    return getDatabase().collection(
        collectionName
    );

}

// =========================================================
// CREATE INDEXES
// =========================================================

async function createIndexes() {

    const db =
        getDatabase();

    // -------------------------------------------------------
    // USERS
    // -------------------------------------------------------

    await db
        .collection("users")
        .createIndex(
            {
                id: 1
            },
            {
                unique: true
            }
        );

    await db
        .collection("users")
        .createIndex(
            {
                email: 1
            },
            {
                unique: true
            }
        );

    await db
        .collection("users")
        .createIndex({
            role: 1
        });

    // -------------------------------------------------------
    // SESSIONS
    // -------------------------------------------------------

    await db
        .collection("sessions")
        .createIndex(
            {
                token_hash: 1
            },
            {
                unique: true
            }
        );

    await db
        .collection("sessions")
        .createIndex({
            user_id: 1
        });

    await db
        .collection("sessions")
        .createIndex({
            expires_at: 1
        });

    // -------------------------------------------------------
    // PASSWORD RESETS
    // -------------------------------------------------------

    await db
        .collection("password_resets")
        .createIndex(
            {
                token_hash: 1
            },
            {
                unique: true
            }
        );

    await db
        .collection("password_resets")
        .createIndex({
            user_id: 1
        });

    await db
        .collection("password_resets")
        .createIndex({
            expires_at: 1
        });

    // -------------------------------------------------------
    // APPLICATIONS
    // -------------------------------------------------------

    await db
        .collection("applications")
        .createIndex(
            {
                id: 1
            },
            {
                unique: true
            }
        );

    await db
        .collection("applications")
        .createIndex({
            user_id: 1
        });

    await db
        .collection("applications")
        .createIndex({
            status: 1
        });

    await db
        .collection("applications")
        .createIndex({
            created_at: -1
        });

    // -------------------------------------------------------
    // PAYMENTS
    // -------------------------------------------------------

    await db
        .collection("payments")
        .createIndex(
            {
                id: 1
            },
            {
                unique: true
            }
        );

    await db
        .collection("payments")
        .createIndex({
            application_id: 1
        });

    await db
        .collection("payments")
        .createIndex({
            status: 1
        });

    await db
        .collection("payments")
        .createIndex({
            payment_reference: 1
        });

    await db
        .collection("payments")
        .createIndex({
            created_at: -1
        });

    // -------------------------------------------------------
    // SUPPORT CHAT
    // -------------------------------------------------------

    await db
        .collection("support_chat_messages")
        .createIndex({
            id: 1
        }, {
            unique: true
        });

    await db
        .collection("support_chat_messages")
        .createIndex({
            user_id: 1,
            id: 1
        });

    await db
        .collection("support_chat_messages")
        .createIndex({
            created_at: -1
        });

    // -------------------------------------------------------
    // CONTACT MESSAGES
    // -------------------------------------------------------

    await db
        .collection("contact_messages")
        .createIndex({
            id: 1
        }, {
            unique: true
        });

    await db
        .collection("contact_messages")
        .createIndex({
            status: 1
        });

    await db
        .collection("contact_messages")
        .createIndex({
            created_at: -1
        });

    // -------------------------------------------------------
    // JOB APPLICATIONS
    // -------------------------------------------------------

    await db
        .collection("job_applications")
        .createIndex({
            id: 1
        }, {
            unique: true
        });

    await db
        .collection("job_applications")
        .createIndex({
            user_id: 1
        });

    await db
        .collection("job_applications")
        .createIndex({
            status: 1
        });

    await db
        .collection("job_applications")
        .createIndex({
            created_at: -1
        });

    // -------------------------------------------------------
    // COUNTERS
    // -------------------------------------------------------

    await db
        .collection("counters")
        .createIndex(
            {
                name: 1
            },
            {
                unique: true
            }
        );

}

// =========================================================
// NUMERIC ID GENERATOR
// =========================================================
//
// This replaces SQLite AUTOINCREMENT.
//
// Example:
//
// users            → 1, 2, 3...
// applications     → 1, 2, 3...
// payments         → 1, 2, 3...
//
// Atomic MongoDB operation prevents duplicate IDs when
// multiple customers submit data at the same time.
// =========================================================

async function getNextSequence(
    sequenceName
) {

    const db =
        getDatabase();

    const result =
        await db
            .collection("counters")
            .findOneAndUpdate(

                {
                    name:
                        sequenceName
                },

                {
                    $inc: {
                        value: 1
                    }
                },

                {
                    upsert: true,
                    returnDocument: "after"
                }

            );

    if (
        !result ||
        !result.value
    ) {

        throw new Error(
            `Unable to generate ID for ${sequenceName}.`
        );

    }

    return Number(
        result.value.value
    );

}

// =========================================================
// SET / PRESERVE COUNTER
// =========================================================
//
// Used during migration when old SQLite IDs already exist.
// It makes sure future IDs continue after the largest old ID.
// =========================================================

async function setSequenceAtLeast(
    sequenceName,
    minimumValue
) {

    const db =
        getDatabase();

    const value =
        Number(
            minimumValue
        );

    if (
        !Number.isFinite(value) ||
        value < 0
    ) {

        return;

    }

    await db
        .collection("counters")
        .updateOne(

            {
                name:
                    sequenceName
            },

            {
                $max: {
                    value:
                        Math.floor(value)
                }
            },

            {
                upsert: true
            }

        );

}

// =========================================================
// CLEAN EXPIRED SESSIONS
// =========================================================

async function cleanExpiredSessions() {

    try {

        const db =
            getDatabase();

        await db
            .collection("sessions")
            .deleteMany({
                expires_at: {
                    $lte:
                        new Date()
                }
            });

    } catch (error) {

        console.error(
            "Session cleanup error:",
            error
        );

    }

}

// =========================================================
// CLEAN EXPIRED PASSWORD RESETS
// =========================================================

async function cleanExpiredPasswordResets() {

    try {

        const db =
            getDatabase();

        await db
            .collection("password_resets")
            .deleteMany({
                expires_at: {
                    $lte:
                        new Date()
                }
            });

    } catch (error) {

        console.error(
            "Password reset cleanup error:",
            error
        );

    }

}

// =========================================================
// DATABASE STATUS
// =========================================================

async function isDatabaseConnected() {

    try {

        if (
            !database ||
            !initialized
        ) {

            return false;

        }

        await database.command({
            ping: 1
        });

        return true;

    } catch {

        return false;

    }

}

// =========================================================
// CLOSE DATABASE
// =========================================================

async function closeDatabase() {

    initialized = false;

    database = null;

    if (client) {

        try {

            await client.close();

        } catch (error) {

            console.error(
                "MongoDB close error:",
                error
            );

        }

    }

    client = null;

}

// =========================================================
// SHUTDOWN HANDLERS
// =========================================================

process.once(
    "SIGINT",
    async function () {

        await closeDatabase();

        process.exit(
            0
        );

    }
);

process.once(
    "SIGTERM",
    async function () {

        await closeDatabase();

        process.exit(
            0
        );

    }
);

// =========================================================
// EXPORTS
// =========================================================

module.exports = {

    initDatabase,

    getDatabase,

    getCollection,

    getNextSequence,

    setSequenceAtLeast,

    cleanExpiredSessions,

    cleanExpiredPasswordResets,

    isDatabaseConnected,

    closeDatabase,

    MONGODB_DB_NAME

};
