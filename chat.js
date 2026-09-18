/* =========================================================
   U.S TRAVEL & TOURS
   LIVE SUPPORT CHAT MODULE
   MongoDB Version
========================================================= */

const express = require("express");

const {
    getDatabase,
    getNextSequence
} = require("./database");

const {
    requireAuth,
    requireAdmin
} = require("./auth");

const router = express.Router();


/* =========================================================
   OPTIONAL EMAIL CONFIG
========================================================= */

const nodemailer = require("nodemailer");

const SMTP_HOST =
    process.env.SMTP_HOST || "smtp-relay.brevo.com";

const SMTP_PORT =
    Number(process.env.SMTP_PORT || 587);

const SMTP_USER =
    process.env.SMTP_USER || "";

const SMTP_PASS =
    process.env.SMTP_PASS || "";

const MAIL_FROM =
    process.env.MAIL_FROM ||
    SMTP_USER ||
    "";

const transporter =
    SMTP_USER && SMTP_PASS
        ? nodemailer.createTransport({

            host:
                SMTP_HOST,

            port:
                SMTP_PORT,

            secure:
                SMTP_PORT === 465,

            auth: {

                user:
                    SMTP_USER,

                pass:
                    SMTP_PASS

            }

        })
        : null;


/* =========================================================
   HELPERS
========================================================= */

function cleanString(
    value,
    maxLength = 5000
) {

    if (
        value === undefined ||
        value === null
    ) {

        return "";

    }

    return String(value)
        .trim()
        .slice(0, maxLength);

}


function cleanEmail(
    value
) {

    return cleanString(
        value,
        320
    ).toLowerCase();

}


function formatMessage(
    message
) {

    return {

        id:
            message.id,

        userId:
            message.user_id,

        senderType:
            message.sender_type,

        message:
            message.message,

        isRead:
            Boolean(
                message.is_read
            ),

        createdAt:
            message.created_at

    };

}


/* =========================================================
   GET CUSTOMER CHAT MESSAGES
========================================================= */

router.get(
    "/messages",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const db =
                getDatabase();

            const messages =
                db.collection(
                    "support_chat_messages"
                );


            const userId =
                Number(
                    req.user.id
                );


            /* -------------------------------------------------
               GET OWN CONVERSATION
            ------------------------------------------------- */

            const chatMessages =
                await messages
                    .find({
                        user_id:
                            userId
                    })
                    .sort({
                        id: 1
                    })
                    .toArray();


            /* -------------------------------------------------
               CUSTOMER OPENED CHAT
               MARK ADMIN REPLIES AS READ
            ------------------------------------------------- */

            await messages.updateMany(

                {
                    user_id:
                        userId,

                    sender_type:
                        "admin",

                    is_read:
                        false

                },

                {
                    $set: {

                        is_read:
                            true

                    }

                }

            );


            return res.json({

                success: true,

                messages:
                    chatMessages.map(
                        formatMessage
                    )

            });

        } catch (error) {

            console.error(
                "GET CHAT MESSAGES ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load chat messages."

            });

        }

    }
);


/* =========================================================
   CUSTOMER SEND MESSAGE
========================================================= */

router.post(
    "/messages",
    requireAuth,
    async function (
        req,
        res
    ) {

        try {

            const message =
                cleanString(
                    req.body?.message,
                    5000
                );


            if (!message) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Message is required."

                });

            }


            const db =
                getDatabase();

            const messages =
                db.collection(
                    "support_chat_messages"
                );


            const userId =
                Number(
                    req.user.id
                );


            const user =
                await db.collection(
                    "users"
                ).findOne({

                    id:
                        userId

                });


            if (!user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }


            const now =
                new Date();


            const messageId =
                await getNextSequence(
                    "support_chat_messages"
                );


            const chatMessage = {

                id:
                    messageId,

                user_id:
                    userId,

                sender_type:
                    "customer",

                message:
                    message,

                is_read:
                    false,

                created_at:
                    now

            };


            await messages.insertOne(
                chatMessage
            );


            return res.status(201).json({

                success: true,

                message:
                    "Message sent successfully.",

                chatMessage:
                    formatMessage(
                        chatMessage
                    )

            });

        } catch (error) {

            console.error(
                "SEND CHAT MESSAGE ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send message."

            });

        }

    }
);


/* =========================================================
   ADMIN - GET ALL CONVERSATIONS
========================================================= */

router.get(
    "/conversations",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const db =
                getDatabase();

            const messages =
                db.collection(
                    "support_chat_messages"
                );

            const users =
                db.collection(
                    "users"
                );


            /* -------------------------------------------------
               GET ALL CUSTOMER USERS
            ------------------------------------------------- */

            const customerUsers =
                await users
                    .find({
                        role:
                            "customer"
                    })
                    .sort({
                        id: 1
                    })
                    .toArray();


            const conversations = [];


            for (
                const user
                of customerUsers
            ) {

                const userId =
                    Number(
                        user.id
                    );


                /* -------------------------------------------------
                   LATEST MESSAGE
                ------------------------------------------------- */

                const latestMessage =
                    await messages
                        .findOne(
                            {
                                user_id:
                                    userId
                            },
                            {
                                sort: {
                                    id: -1
                                }
                            }
                        );


                /* -------------------------------------------------
                   UNREAD CUSTOMER MESSAGES
                ------------------------------------------------- */

                const unreadCount =
                    await messages.countDocuments({

                        user_id:
                            userId,

                        sender_type:
                            "customer",

                        is_read:
                            false

                    });


                /* -------------------------------------------------
                   ONLY SHOW USERS WITH CHAT
                   OR KEEP ALL USERS FOR ADMIN LIST
                ------------------------------------------------- */

                conversations.push({

                    userId:
                        userId,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    phone:
                        user.phone || "",

                    latestMessage:
                        latestMessage
                            ? formatMessage(
                                latestMessage
                            )
                            : null,

                    unreadCount:
                        unreadCount

                });

            }


            /* -------------------------------------------------
               SORT:
               1. UNREAD FIRST
               2. LATEST MESSAGE
            ------------------------------------------------- */

            conversations.sort(
                function (
                    a,
                    b
                ) {

                    if (
                        b.unreadCount !==
                        a.unreadCount
                    ) {

                        return (
                            b.unreadCount -
                            a.unreadCount
                        );

                    }


                    const aTime =
                        a.latestMessage?.createdAt
                            ? new Date(
                                a.latestMessage.createdAt
                            ).getTime()
                            : 0;

                    const bTime =
                        b.latestMessage?.createdAt
                            ? new Date(
                                b.latestMessage.createdAt
                            ).getTime()
                            : 0;


                    return (
                        bTime -
                        aTime
                    );

                }
            );


            return res.json({

                success: true,

                conversations:
                    conversations

            });

        } catch (error) {

            console.error(
                "GET CHAT CONVERSATIONS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load conversations."

            });

        }

    }
);


/* =========================================================
   ADMIN - GET SPECIFIC CONVERSATION
========================================================= */

router.get(
    "/conversations/:userId",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const userId =
                Number(
                    req.params.userId
                );


            if (
                !Number.isInteger(
                    userId
                ) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid user ID."

                });

            }


            const db =
                getDatabase();

            const messages =
                db.collection(
                    "support_chat_messages"
                );

            const users =
                db.collection(
                    "users"
                );


            const user =
                await users.findOne({

                    id:
                        userId

                });


            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."

                });

            }


            const chatMessages =
                await messages
                    .find({
                        user_id:
                            userId
                    })
                    .sort({
                        id: 1
                    })
                    .toArray();


            /* -------------------------------------------------
               MARK CUSTOMER MESSAGES AS READ
            ------------------------------------------------- */

            await messages.updateMany(

                {
                    user_id:
                        userId,

                    sender_type:
                        "customer",

                    is_read:
                        false

                },

                {
                    $set: {

                        is_read:
                            true

                    }

                }

            );


            return res.json({

                success: true,

                user: {

                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    phone:
                        user.phone || ""

                },

                messages:
                    chatMessages.map(
                        formatMessage
                    )

            });

        } catch (error) {

            console.error(
                "GET ADMIN CONVERSATION ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load conversation."

            });

        }

    }
);


/* =========================================================
   ADMIN - REPLY TO CUSTOMER
========================================================= */

router.post(
    "/conversations/:userId/reply",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const userId =
                Number(
                    req.params.userId
                );


            if (
                !Number.isInteger(
                    userId
                ) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid user ID."

                });

            }


            const message =
                cleanString(
                    req.body?.message,
                    5000
                );


            if (!message) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Message is required."

                });

            }


            const db =
                getDatabase();

            const messages =
                db.collection(
                    "support_chat_messages"
                );

            const users =
                db.collection(
                    "users"
                );


            const user =
                await users.findOne({

                    id:
                        userId

                });


            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Customer not found."

                });

            }


            const now =
                new Date();


            const messageId =
                await getNextSequence(
                    "support_chat_messages"
                );


            const chatMessage = {

                id:
                    messageId,

                user_id:
                    userId,

                sender_type:
                    "admin",

                message:
                    message,

                is_read:
                    false,

                created_at:
                    now

            };


            await messages.insertOne(
                chatMessage
            );


            /* -------------------------------------------------
               EMAIL CUSTOMER
               OPTIONAL
            ------------------------------------------------- */

            if (
                transporter &&
                user.email
            ) {

                try {

                    await transporter.sendMail({

                        from:
                            MAIL_FROM,

                        to:
                            user.email,

                        subject:
                            "New message from U.S TRAVEL & TOURS",

                        text:
                            message,

                        html:
                            `
                            <div style="font-family:Arial,sans-serif;line-height:1.6;">
                                <h2>U.S TRAVEL & TOURS</h2>

                                <p>Hello ${String(
                                    user.name || "Customer"
                                )},</p>

                                <p>You have received a new message from our support team:</p>

                                <div style="
                                    padding:15px;
                                    background:#f5f5f5;
                                    border-radius:8px;
                                    margin:15px 0;
                                ">
                                    ${message
                                        .replace(
                                            /\n/g,
                                            "<br>"
                                        )}
                                </div>

                                <p>Please log in to your account to continue the conversation.</p>

                                <p>
                                    Regards,<br>
                                    U.S TRAVEL & TOURS
                                </p>
                            </div>
                            `

                    });

                } catch (
                    emailError
                ) {

                    console.error(
                        "CHAT EMAIL ERROR:",
                        emailError
                    );

                    /*
                       Email failure must NOT
                       make chat message fail.
                    */

                }

            }


            return res.status(201).json({

                success: true,

                message:
                    "Reply sent successfully.",

                chatMessage:
                    formatMessage(
                        chatMessage
                    )

            });

        } catch (error) {

            console.error(
                "ADMIN CHAT REPLY ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send reply."

            });

        }

    }
);


/* =========================================================
   ADMIN - MARK CONVERSATION AS READ
========================================================= */

router.patch(
    "/conversations/:userId/read",
    requireAdmin,
    async function (
        req,
        res
    ) {

        try {

            const userId =
                Number(
                    req.params.userId
                );


            if (
                !Number.isInteger(
                    userId
                ) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid user ID."

                });

            }


            const db =
                getDatabase();

            const messages =
                db.collection(
                    "support_chat_messages"
                );


            const result =
                await messages.updateMany(

                    {
                        user_id:
                            userId,

                        sender_type:
                            "customer",

                        is_read:
                            false

                    },

                    {
                        $set: {

                            is_read:
                                true

                        }

                    }

                );


            return res.json({

                success: true,

                message:
                    "Conversation marked as read.",

                updated:
                    result.modifiedCount

            });

        } catch (error) {

            console.error(
                "MARK CHAT READ ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to mark conversation as read."

            });

        }

    }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
    router;
