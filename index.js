// שלב 1: ייבוא הספריות הדרושות
require('dotenv').config(); // טוען את המשתנים מקובץ .env
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const mongoose = require('mongoose');

// =================================================================
// שלב 2: הגדרת שרת Keep-Alive (כמו במדריך הטלגרם)
// =================================================================
const app = express();
const PORT = process.env.PORT || 8080; // Render יספק את הפורט דרך משתנה סביבה

app.get('/', (req, res) => {
    res.status(200).send('WhatsApp Bot is alive and running!');
});

app.listen(PORT, () => {
    console.log(`Server for Keep-Alive is listening on port ${PORT}`);
});

// =================================================================
// שלב 3: התחברות למסד הנתונים MongoDB (מומלץ)
// =================================================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Successfully connected to MongoDB Atlas.'))
    .catch(err => console.error('Error connecting to MongoDB:', err));


// =================================================================
// שלב 4: הגדרת הלקוח של וואטסאפ
// =================================================================
const client = new Client({
    // אסטרטגיית אימות: שומר את ה-session מקומית בתיקייה בשם 'session'
    // ב-Render, נגדיר שהתיקייה הזו תשב על ה-Persistent Disk
    authStrategy: new LocalAuth({ dataPath: 'session' }),
    
    // הגדרות חסכוניות עבור Puppeteer (הדפדפן שרץ ברקע)
    // חיוני כדי לרוץ בסביבה חינמית ומוגבלת משאבים כמו Render
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

// =================================================================
// שלב 5: טיפול באירועים של הלקוח
// =================================================================

// אירוע 1: קבלת QR Code
// יקרה רק פעם אחת, בהפעלה הראשונה
client.on('qr', qr => {
    console.log('QR Code Received, please scan with your phone.');
    qrcode.generate(qr, { small: true }); // מדפיס את הקוד לטרמינל
});

// אירוע 2: הלקוח מוכן לפעולה
// יקרה לאחר סריקה מוצלחת, או אוטומטית בהפעלות הבאות
client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

// אירוע 3: קבלת הודעה
// כאן תכתוב את הלוגיקה המרכזית של הבוט שלך
client.on('message', message => {
    console.log(`Message received from ${message.from}: ${message.body}`);

    if (message.body.toLowerCase() === '!ping') {
        message.reply('pong');
        console.log(`Replied 'pong' to ${message.from}`);
    }
    
    // כאן תוכל להוסיף עוד פקודות ותגובות
});


// =================================================================
// שלב 6: הפעלת הלקוח
// =================================================================
console.log('Initializing WhatsApp client...');
client.initialize();