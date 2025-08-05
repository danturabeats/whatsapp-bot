console.log("--- MAIN BOT SCRIPT (RESTORE AND RUN) ---");
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');
const stream = require('stream');
const unzipper = require('unzipper');

// הגדרות זהות לקובץ יצירת ה-session
const { Schema } = mongoose;
const SessionSchema = new Schema({_id: String, session_zip: Buffer});
const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema);
const CLIENT_ID = 'my-whatsapp-bot';
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');

async function startBot() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    // שחזר את ה-session מה-DB
    console.log('Attempting to restore session from DB...');
    const savedSession = await Session.findById(CLIENT_ID);
    if (!savedSession) {
        throw new Error('SESSION NOT FOUND IN MONGODB. Please run the generate-session.js script locally first.');
    }

    try {
        console.log('✅ Found session in DB. Restoring...');
        await fs.remove(AUTH_DIR); // נקה תיקייה ישנה
        const bufferStream = new stream.PassThrough();
        bufferStream.end(savedSession.session_zip);
        await bufferStream.pipe(unzipper.Extract({ path: AUTH_DIR })).promise();
        console.log('✅ Session restored locally.');
    } catch (e) {
        throw new Error(`Failed to restore session from DB: ${e.message}`);
    }

    // הפעל את הלקוח, הוא ימצא את הקבצים המשוחזרים
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
        
        // <<< התיקון הקריטי והסופי נמצא כאן >>>
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // <- יכול לעזור בסביבות מוגבלות
                '--disable-gpu'
            ],
        }
    });

    client.on('ready', () => {
        console.log('WhatsApp client is ready!');
    });

    client.on('message', message => {
        if (message.body.toLowerCase() === '!ping') {
            message.reply('pong');
        }
    });

    client.on('auth_failure', (msg) => {
        // אם האימות נכשל, זה אומר שה-session שגובה כבר לא תקין
        console.error('AUTHENTICATION FAILURE. The saved session might be invalid. Please run generate-session.js again.', msg);
        process.exit(1); // צא מהתהליך עם שגיאה
    });
    
    client.on('disconnected', (reason) => {
        console.log('Client was logged out', reason);
        // הבוט יפסיק לעבוד. צריך יהיה להפעיל מחדש את generate-session.js
        process.exit(1);
    });

    console.log('Initializing client with restored session...');
    await client.initialize();
    
    const app = express();
    const PORT = process.env.PORT || 8080;
    app.get('/', (req, res) => res.status(200).send('WhatsApp Bot is alive!'));
    app.listen(PORT, () => console.log(`Server for Keep-Alive is listening on port ${PORT}`));
}

startBot().catch(err => {
    console.error("FATAL ERROR during bot startup:", err);
    process.exit(1); // צא מהתהליך עם שגיאה
});