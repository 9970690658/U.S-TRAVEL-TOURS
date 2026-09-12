// =========================================================
// U.S TRAVEL & TOURS
// ONE-TIME ADMIN ACCOUNT SETUP
// =========================================================

const bcrypt = require("bcryptjs");
const readline = require("readline");

const { db } = require("./database");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function createAdmin() {
    try {
        console.log("");
        console.log("==============================================");
        console.log("U.S TRAVEL & TOURS");
        console.log("ADMIN ACCOUNT SETUP");
        console.log("==============================================");
        console.log("");

        const name = (await ask("Admin Name: ")).trim();
        const email = (await ask("Admin Email: ")).trim().toLowerCase();
        const password = (await ask("Admin Password: ")).trim();

        if (!name || !email || !password) {
            console.error("\nName, email and password are required.");
            process.exitCode = 1;
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            console.error("\nInvalid email address.");
            process.exitCode = 1;
            return;
        }

        if (password.length < 8) {
            console.error(
                "\nPassword must contain at least 8 characters."
            );
            process.exitCode = 1;
            return;
        }

        // -------------------------------------------------
        // CHECK EXISTING ACCOUNT
        // -------------------------------------------------

        const existingUser = db.prepare(`
            SELECT id, role
            FROM users
            WHERE email = ?
            LIMIT 1
        `).get(email);

        if (existingUser) {
            console.error("");
            console.error(
                `An account with ${email} already exists.`
            );
            console.error(
                `Existing role: ${existingUser.role}`
            );
            console.error("");

            process.exitCode = 1;
            return;
        }

        // -------------------------------------------------
        // HASH PASSWORD
        // -------------------------------------------------

        const passwordHash = await bcrypt.hash(password, 12);

        // -------------------------------------------------
        // CREATE ADMIN
        // -------------------------------------------------

        const result = db.prepare(`
            INSERT INTO users (
                name,
                email,
                phone,
                password_hash,
                role
            )
            VALUES (?, ?, ?, ?, 'admin')
        `).run(
            name,
            email,
            null,
            passwordHash
        );

        console.log("");
        console.log("==============================================");
        console.log("ADMIN ACCOUNT CREATED SUCCESSFULLY");
        console.log("==============================================");
        console.log(`Admin ID: ${result.lastInsertRowid}`);
        console.log(`Name: ${name}`);
        console.log(`Email: ${email}`);
        console.log("Role: admin");
        console.log("");
        console.log(
            "You can now login using the website login page."
        );
        console.log("==============================================");
        console.log("");

    } catch (error) {
        console.error("");
        console.error("Admin creation failed.");
        console.error(error.message);
        console.error("");

        process.exitCode = 1;
    } finally {
        rl.close();
        db.close();
    }
}

createAdmin();