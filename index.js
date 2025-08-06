console.log("--- MAIN BOT SCRIPT (RESTORE AND RUN) ---");
// =========================================================
// קובץ מפעיל ראשי - index.js
// =========================================================

// טעינת משתני סביבה מקובץ .env
require('dotenv').config();
const express = require('express');

// ייבוא מחלקת הבוט הראשית מהקובץ החדש שיצרנו
const PresentorWhatsAppBot = require('./bot.js');
const mongoose = require('mongoose');

// פונקציית הפעלה ראשית
async function main() {
    // ודא שכל המפתחות הנדרשים קיימים
    if (!process.env.GEMINI_API_KEY || !process.env.MONGODB_URI) {
        console.error('FATAL ERROR: Required environment variables (GEMINI_API_KEY, MONGODB_URI) are not defined in .env file.');
        process.exit(1);
    }

    // התחברות למסד הנתונים
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Successfully connected to MongoDB Atlas.');
    } catch (error) {
        console.error('FATAL ERROR: Could not connect to MongoDB Atlas.', error);
        process.exit(1);
    }

    // יצירת מופע חדש של הבוט
    const bot = new PresentorWhatsAppBot();

    // (אופציונלי) האזנה לאירועים שהבוט מייצר
    bot.on('ready', () => {
        console.log('Main application confirmed: Bot is fully operational and ready.');
    });

    bot.on('newCustomer', (phoneNumber) => {
        console.log(`New customer detected in main application: ${phoneNumber}`);
    });

    bot.on('statistics', (data) => {
        // כאן תוכל, למשל, לשמור את הנתונים ל-MongoDB
        // console.log('Statistics event received:', data);
    });

    // הפעלת הבוט
    bot.start().catch(error => {
        console.error('Failed to start the bot:', error);
        process.exit(1);
    });

    // Express server for Keep-Alive on Render + QR Code endpoint
    const app = express();
    const port = process.env.PORT || 3000;
    
    app.get('/', (req, res) => res.send(`
        <h1>WhatsApp Bot is running!</h1>
        <p>Status: Active ✅</p>
        <p><a href="/qr">View QR Code (when available)</a></p>
        <p><a href="/status">Bot Status</a></p>
    `));
    
    // QR Code endpoint
    app.get('/qr', (req, res) => {
        if (bot && bot.qrDataURL) {
            res.send(`
                <html>
                <head><title>WhatsApp QR Code</title></head>
                <body style="text-align: center; font-family: Arial;">
                    <h1>📱 Scan QR Code with WhatsApp</h1>
                    <img src="${bot.qrDataURL}" alt="WhatsApp QR Code" style="max-width: 512px;"/>
                    <p>⏰ QR Code expires quickly - scan immediately!</p>
                    <script>setTimeout(() => location.reload(), 5000);</script>
                </body>
                </html>
            `);
        } else {
            res.send(`
                <html>
                <head><title>No QR Code</title></head>
                <body style="text-align: center; font-family: Arial;">
                    <h1>No QR Code Available</h1>
                    <p>Bot is either already authenticated or not ready yet.</p>
                    <p><a href="/">Back to Home</a></p>
                    <script>setTimeout(() => location.reload(), 3000);</script>
                </body>
                </html>
            `);
        }
    });

    // Status endpoint  
    app.get('/status', (req, res) => {
        const status = {
            botReady: bot?.client?.info ? true : false,
            sessionBackupTime: bot?.sessionStore?.lastBackupTime,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
        res.json(status);
    });

    app.listen(port, () => console.log(`Server for Keep-Alive is listening on port ${port}`));
}

// קריאה לפונקציה הראשית
main().catch(err => {
    console.error("An unexpected error occurred in the main function:", err);
    process.exit(1);
});