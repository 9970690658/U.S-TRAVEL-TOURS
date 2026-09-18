/* =========================================================
   U.S TRAVEL & TOURS
   DATABASE MODULE
   MongoDB Version
========================================================= */

const {
    MongoClient
} = require("mongodb");


/* =========================================================
   MONGODB CONFIGURATION
========================================================= */

const MONGODB_URI =
    process.env.MONGODB_URI;

const MONGODB_DB_NAME =
    process.env.MONGODB_DB_NAME ||
    "us-travel-tours";


/* =========================================================
   DATABASE STATE
========================================================= */

let client = null;

let database = null;

let initialized = false;

let initializationPromise = null;


/* =========================================================
   VALIDATE CONFIGURATION
========================================================= */

function validateMongoConfig() {

    if (
        !MONGODB_URI ||
        typeof MONGODB_URI !== "string"
    ) {

        throw new Error(
            "MONGODB_URI environment variable is not configured."
        );

    }

}


/* =========================================================
   INITIALIZE DATABASE
========================================================= */

async function initDatabase() {

    /*
       Prevent multiple simultaneous
       MongoDB connection attempts.
    */

    if (initialized) {

        return database;

    }


    if (initializationPromise) {

        return initializationPromise;

    }


    initializationPromise =
        (async function () {

            try {

                validateMongoConfig();


                console.log(
                    "Connecting to MongoDB..."
                );


                client =
                    new MongoClient(
                        MONGODB_URI,
                        {

                            maxPoolSize:
                                20,

                            minPoolSize:
                                1,

                            serverSelectionTimeoutMS:
                                15000,

                            connectTimeoutMS:
                                15000,

                            socketTimeoutMS:
                                45000

                        }
                    );


                await client.connect();


                /*
                   Confirm the database connection
                   before the server starts.
                */

                await client
                    .db("admin")
                    .command({
                        ping: 1
                    });


                database =
                    client.db(
                        MONGODB_DB_NAME
                    );


                /*
                   IMPORTANT:
                   Set initialized BEFORE createIndexes()
                   because createIndexes() uses getDatabase().
                */

                initialized =
                    true;


                await createIndexes();


                console.log(
                    `MongoDB connected successfully: ${MONGODB_DB_NAME}`
                );


                return database;

            } catch (error) {

                initialized =
                    false;

                database =
                    null;


                if (client) {

                    try {

                        await client.close();

                    } catch (
                        closeError
                    ) {

                        console.error(
                            "MongoDB close error:",
                            closeError
                        );

                    }

                }


                client =
                    null;


                console.error(
                    "MongoDB initialization failed:",
                    error
                );


                throw error;

            } finally {

                initializationPromise =
                    null;

            }

        })();


    return initializationPromise;

}


/* =========================================================
   GET DATABASE
========================================================= */

function getDatabase() {

    if (
        !initialized ||
        !database
    ) {

        throw new Error(
            "MongoDB database is not initialized. Call initDatabase() first."
        );

    }


    return database;

}


/* =========================================================
   GET COLLECTION
========================================================= */

function getCollection(
    collectionName
) {

    if (
        !collectionName ||
        typeof collectionName !== "string"
    ) {

        throw new Error(
            "A valid collection name is required."
        );

    }


    return getDatabase()
        .collection(
            collectionName
        );

}


/* =========================================================
   CREATE INDEXES
========================================================= */

async function createIndexes() {

    const db =
        getDatabase();


    /* =====================================================
       USERS
    ===================================================== */

    await db
        .collection(
            "users"
        )
        .createIndex(
            {
                id: 1
            },
            {
                unique: true,
                name: "users_id_unique"
            }
        );


    await db
        .collection(
            "users"
        )
        .createIndex(
            {
                email: 1
            },
            {
                unique: true,
                name: "users_email_unique"
            }
        );


    await db
        .collection(
            "users"
        )
        .createIndex(
            {
                role: 1
            },
            {
                name: "users_role"
            }
        );


    /* =====================================================
       SESSIONS
    ===================================================== */

    await db
        .collection(
            "sessions"
        )
        .createIndex(
            {
                token_hash: 1
            },
            {
                unique: true,
                name: "sessions_token_hash_unique"
            }
        );


    await db
        .collection(
            "sessions"
        )
        .createIndex(
            {
                user_id: 1
            },
            {
                name: "sessions_user_id"
            }
        );


    await db
        .collection(
            "sessions"
        )
        .createIndex(
            {
                expires_at: 1
            },
            {
                name: "sessions_expires_at"
            }
        );


    /*
       MongoDB automatically removes expired
       sessions when expires_at is reached.
    */

    await db
        .collection(
            "sessions"
        )
        .createIndex(
            {
                expires_at: 1
            },
            {
                expireAfterSeconds: 0,
                name: "sessions_ttl"
            }
        );


    /* =====================================================
       PASSWORD RESETS
    ===================================================== */

    await db
        .collection(
            "password_resets"
        )
        .createIndex(
            {
                token_hash: 1
            },
            {
                unique: true,
                name: "password_resets_token_unique"
            }
        );


    await db
        .collection(
            "password_resets"
        )
        .createIndex(
            {
                user_id: 1
            },
            {
                name: "password_resets_user_id"
            }
        );


    await db
        .collection(
            "password_resets"
        )
        .createIndex(
            {
                expires_at: 1
            },
            {
                name: "password_resets_expires_at"
            }
        );


    await db
        .collection(
            "password_resets"
        )
        .createIndex(
            {
                expires_at: 1
            },
            {
                expireAfterSeconds: 0,
                name: "password_resets_ttl"
            }
        );


    /* =====================================================
       APPLICATIONS
    ===================================================== */

    await db
        .collection(
            "applications"
        )
        .createIndex(
            {
                id: 1
            },
            {
                unique: true,
                name: "applications_id_unique"
            }
        );


    await db
        .collection(
            "applications"
        )
        .createIndex(
            {
                user_id: 1
            },
            {
                name: "applications_user_id"
            }
        );


    await db
        .collection(
            "applications"
        )
        .createIndex(
            {
                status: 1
            },
            {
                name: "applications_status"
            }
        );


    await db
        .collection(
            "applications"
        )
        .createIndex(
            {
                created_at: -1
            },
            {
                name: "applications_created"
            }
        );


    /* =====================================================
       PAYMENTS
    ===================================================== */

    await db
        .collection(
            "payments"
        )
        .createIndex(
            {
                id: 1
            },
            {
                unique: true,
                name: "payments_id_unique"
            }
        );


    await db
        .collection(
            "payments"
        )
        .createIndex(
            {
                application_id: 1
            },
            {
                name: "payments_application_id"
            }
        );


    await db
        .collection(
            "payments"
        )
        .createIndex(
            {
                user_id: 1
            },
            {
                name: "payments_user_id"
            }
        );


    await db
        .collection(
            "payments"
        )
        .createIndex(
            {
                status: 1
            },
            {
                name: "payments_status"
            }
        );


    await db
        .collection(
            "payments"
        )
        .createIndex(
            {
                payment_reference: 1
            },
            {
                name: "payments_reference"
            }
        );


    await db
        .collection(
            "payments"
        )
        .createIndex(
            {
                created_at: -1
            },
            {
                name: "payments_created"
            }
        );


    /* =====================================================
       SUPPORT CHAT
    ===================================================== */

    await db
        .collection(
            "support_chat_messages"
        )
        .createIndex(
            {
                id: 1
            },
            {
                unique: true,
                name: "chat_id_unique"
            }
        );


    await db
        .collection(
            "support_chat_messages"
        )
        .createIndex(
            {
                user_id: 1,
                id: 1
            },
            {
                name: "chat_user_messages"
            }
        );


    await db
        .collection(
            "support_chat_messages"
        )
        .createIndex(
            {
                user_id: 1,
                sender_type: 1,
                is_read: 1
            },
            {
                name: "chat_unread"
            }
        );


    await db
        .collection(
            "support_chat_messages"
        )
        .createIndex(
            {
                created_at: -1
            },
            {
                name: "chat_created"
            }
        );


    /* =====================================================
       CONTACT MESSAGES
    ===================================================== */

    await db
        .collection(
            "contact_messages"
        )
        .createIndex(
            {
                id: 1
            },
            {
                unique: true,
                name: "contact_id_unique"
            }
        );


    await db
        .collection(
            "contact_messages"
        )
        .createIndex(
            {
                status: 1
            },
            {
                name: "contact_status"
            }
        );


    await db
        .collection(
            "contact_messages"
        )
        .createIndex(
            {
                created_at: -1
            },
            {
                name: "contact_created"
            }
        );


    /* =====================================================
       JOB APPLICATIONS
    ===================================================== */

    await db
        .collection(
            "job_applications"
        )
        .createIndex(
            {
                id: 1
            },
            {
                unique: true,
                name: "jobs_id_unique"
            }
        );


    await db
        .collection(
            "job_applications"
        )
        .createIndex(
            {
                user_id: 1
            },
            {
                name: "jobs_user_id"
            }
        );


    await db
        .collection(
            "job_applications"
        )
        .createIndex(
            {
                status: 1
            },
            {
                name: "jobs_status"
            }
        );


    await db
        .collection(
            "job_applications"
        )
        .createIndex(
            {
                created_at: -1
            },
            {
                name: "jobs_created"
            }
        );


    /* =====================================================
       COUNTERS
    ===================================================== */

    await db
        .collection(
            "counters"
        )
        .createIndex(
            {
                name: 1
            },
            {
                unique: true,
                name: "counters_name_unique"
            }
        );


    console.log(
        "MongoDB indexes created/verified."
    );

}


/* =========================================================
   NUMERIC SEQUENCE GENERATOR
========================================================= */

async function getNextSequence(
    sequenceName
) {

    if (
        !sequenceName ||
        typeof sequenceName !== "string"
    ) {

        throw new Error(
            "Sequence name is required."
        );

    }


    const counters =
        getDatabase()
            .collection(
                "counters"
            );


    const result =
        await counters.findOneAndUpdate(

            {
                name:
                    sequenceName
            },

            {
                $inc: {

                    seq:
                        1

                },

                $set: {

                    updated_at:
                        new Date()

                }

            },

            {
                upsert:
                    true,

                returnDocument:
                    "after"
            }

        );


    /*
       MongoDB Node driver v6 returns
       the document directly.
    */

    const document =
        result;


    if (
        !document ||
        typeof document.seq !==
            "number"
    ) {

        throw new Error(
            `Unable to generate sequence for ${sequenceName}.`
        );

    }


    return Number(
        document.seq
    );

}


/* =========================================================
   MAKE SEQUENCE AT LEAST A VALUE
========================================================= */

async function setSequenceAtLeast(
    sequenceName,
    minimumValue
) {

    if (
        !sequenceName ||
        typeof sequenceName !== "string"
    ) {

        throw new Error(
            "Sequence name is required."
        );

    }


    const minimum =
        Number(
            minimumValue
        );


    if (
        !Number.isFinite(
            minimum
        ) ||
        minimum < 0
    ) {

        throw new Error(
            "Minimum sequence value must be a valid non-negative number."
        );

    }


    const counters =
        getDatabase()
            .collection(
                "counters"
            );


    const current =
        await counters.findOne({

            name:
                sequenceName

        });


    if (
        current &&
        Number(current.seq) >=
            minimum
    ) {

        return Number(
            current.seq
        );

    }


    await counters.updateOne(

        {
            name:
                sequenceName
        },

        {
            $set: {

                seq:
                    minimum,

                updated_at:
                    new Date()

            }

        },

        {
            upsert:
                true
        }

    );


    return minimum;

}


/* =========================================================
   CLEAN EXPIRED SESSIONS
========================================================= */

async function cleanExpiredSessions() {

    const sessions =
        getDatabase()
            .collection(
                "sessions"
            );


    const result =
        await sessions.deleteMany({

            expires_at: {

                $lte:
                    new Date()

            }

        });


    return result.deletedCount || 0;

}


/* =========================================================
   CLEAN EXPIRED PASSWORD RESETS
========================================================= */

async function cleanExpiredPasswordResets() {

    const resets =
        getDatabase()
            .collection(
                "password_resets"
            );


    const result =
        await resets.deleteMany({

            expires_at: {

                $lte:
                    new Date()

            }

        });


    return result.deletedCount || 0;

}


/* =========================================================
   DATABASE CONNECTION STATUS
========================================================= */

function isDatabaseConnected() {

    return (
        initialized === true &&
        database !== null &&
        client !== null
    );

}


/* =========================================================
   CLOSE DATABASE
========================================================= */

async function closeDatabase() {

    if (!client) {

        initialized =
            false;

        database =
            null;

        return;

    }


    try {

        await client.close();

    } catch (
        error
    ) {

        console.error(
            "MongoDB close error:",
            error
        );

    } finally {

        client =
            null;

        database =
            null;

        initialized =
            false;

    }

}


/* =========================================================
   PROCESS SHUTDOWN
========================================================= */

let shuttingDown =
    false;


async function shutdown(
    signal
) {

    if (
        shuttingDown
    ) {

        return;

    }


    shuttingDown =
        true;


    console.log(
        `${signal} received. Closing MongoDB connection...`
    );


    try {

        await closeDatabase();

    } catch (
        error
    ) {

        console.error(
            "Database shutdown error:",
            error
        );

    }

}


/* =========================================================
   SIGNAL HANDLERS
========================================================= */

process.once(
    "SIGINT",
    function () {

        shutdown(
            "SIGINT"
        );

    }
);


process.once(
    "SIGTERM",
    function () {

        shutdown(
            "SIGTERM"
        );

    }
);


/* =========================================================
   EXPORTS
========================================================= */

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
