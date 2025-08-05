require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const CustomerProfileModel = require('./CustomerProfile.js');
const winston = require('winston');
const NodeCache = require('node-cache');
const EventEmitter = require('events');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// הגדרת Logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'whatsapp-bot.log' })
    ]
});

// הגדרות קונפיגורציה
const config = {
    geminiModel: 'gemini-1.5-flash',
    cacheTimeout: 3600, // 1 hour
    personality: {
        name: 'ג\'יני',
        style: 'ידידותי, משעשע, ומעט שיווקי',
        creativity: 0.8
    },
    responseStyles: [
        'תשובה קצרה ועניינית עם אימוג\'י מתאים.',
        'תשובה מפורטת יותר עם הסבר קצר.',
        'תשובה עם קריצה הומוריסטית.',
        'תשובה שיווקית המציעה ערך מוסף.',
        'תשובה אישית המתייחסת לשיחות קודמות.'
    ]
};

// בנק תגובות מהנות
const FUN_RESPONSES = {
    greetings: [
        "היי! 👋 איזה כיף שהגעת! מה נשמע?",
        "שלום שלום! 🎉 איך היום שלך מתגלגל?",
        "וואו, איזה טיימינג! בדיוק חשבתי עליך 😊",
        "הייי! מוכן/ה לשמוע משהו מגניב? 🚀"
    ],
    compliments: [
        "אתה פשוט מדהים/ה! 🌟",
        "איזו אנרגיה טובה יש לך! 💪",
        "כיף לדבר איתך! 😄",
        "אתה תותח/ית! 🎯"
    ],
    jokes: [
        "למה המתכנת תמיד קר לו? כי הוא השאיר את החלונות פתוחים! 🪟😂",
        "מה אומר רובוט כשהוא נכנס לבר? 'תן לי משהו עם הרבה ביטים!' 🤖🍺",
        "איך קוראים לבוט שעושה יוגה? צ'אט-אסנה! 🧘‍♂️😄"
    ],
    motivational: [
        "היום זה היום שלך להצליח! 💯",
        "אני מאמין בך! אתה יכול/ה! 🔥",
        "כל צעד קטן מוביל להצלחה גדולה 👣",
        "אתה על הדרך הנכונה! 🛤️"
    ]
};

// מחלקת AI
class WhatsAppAI {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.geminiModel });
        this.cache = new NodeCache({ stdTTL: config.cacheTimeout });
    }
    
    async generateResponse(message, profile, context) {
        const prompt = `
        **אתה בוט וואטסאפ חכם ומבדר של חברת "פרזנטור"**
        
        🎭 **האישיות שלך:**
        - שם: ${config.personality.name}
        - סגנון: ${config.personality.style}
        - יצירתיות: ${config.personality.creativity * 100}%
        
        👤 **פרטי הלקוח:**
        - שם: ${profile.name || 'לא ידוע'}
        - מצב רוח: ${profile.mood}
        - אינטראקציות: ${profile.interactionCount}
        - זיכרונות: ${profile.memories.slice(-3).map(m => m.content).join(', ')}
        
        📱 **הוראות:**
        1. השתמש באמוג'ים בצורה טבעית
        2. הודעות קצרות (עד 3-4 שורות)
        3. הוסף הומור אם מתאים
        4. היה אישי וחם
        5. זכור פרטים מהשיחות הקודמות
        
        🎯 **השירותים שלנו:**
        - בניית צ'אט בוטים מתקדמים
        - שיווק דיגיטלי
        - אוטומציות עסקיות
        
        📊 **הקשר:** ${context}
        
        💬 **הודעת הלקוח:** "${message}"
        
        **ענה בעברית, קצר ומהנה:**`;
        
        try {
            const result = await this.model.generateContent(prompt);
            return await result.response.text();
        } catch (error) {
            logger.error('AI Error:', error);
            return "אופס! 😅 משהו השתבש... אפשר לנסות שוב?";
        }
    }
    
    async detectIntent(message) {
        const prompt = `
        נתח את ההודעה וזהה את הכוונה (ענה במילה אחת):
        - greeting (ברכה)
        - service_info (מידע על שירותים)
        - pricing (מחירים)
        - appointment (פגישה)
        - support (תמיכה)
        - joke (בדיחה)
        - other (אחר)
        
        הודעה: "${message}"`;
        
        try {
            const result = await this.model.generateContent(prompt);
            return (await result.response.text()).trim().toLowerCase();
        } catch (error) {
            return 'other';
        }
    }
}

// מחלקת הבוט הראשית
class PresentorWhatsAppBot extends EventEmitter {
    constructor() {
        super();
        
        // אתחול WhatsApp Client
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: config.sessionPath
            }),
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
                ]
            }
        });
        
        // אתחול AI
        this.ai = new WhatsAppAI(process.env.GEMINI_API_KEY);
        
        // אתחול מאגרי נתונים
        this.activeChats = new Set();
        this.messageQueue = [];
        this.mediaCache = new Map();
        
        // אתחול אירועי WhatsApp
        this.initializeWhatsAppEvents();
        
        // אתחול תזמונים
        this.initializeSchedulers();
    }
    
    initializeWhatsAppEvents() {
        // QR Code להתחברות
        this.client.on('qr', (qr) => {
            logger.info('QR Code received, scan please');
            qrcode.generate(qr, { small: true });
        });
        
        // התחברות מוצלחת
        this.client.on('ready', () => {
            logger.info('WhatsApp Bot is ready! ✅');
            this.emit('ready');
            this.sendStartupNotification();
        });
        
        // קבלת הודעה
        this.client.on('message', async (msg) => {
            await this.handleIncomingMessage(msg);
        });
        
        // הודעה נקראה
        this.client.on('message_ack', async (msg, ack) => {
            this.handleMessageAck(msg, ack);
        });
        
        // משתמש מקליד
        this.client.on('change_state', state => {
            logger.info('State changed:', state);
        });
        
        // שגיאות
        this.client.on('auth_failure', msg => {
            logger.error('Authentication failure:', msg);
        });
        
        this.client.on('disconnected', (reason) => {
            logger.error('Client disconnected:', reason);
            this.reconnect();
        });
    }
    
    async handleIncomingMessage(msg) {
        try {
            const phoneNumber = msg.from;
            const messageText = msg.body;

            if (!phoneNumber || msg.isStatus || msg.from.endsWith('@g.us')) {
                return;
            }

            const profile = await this.getOrCreateProfile(phoneNumber);
            profile.interactionCount++;
            profile.lastInteraction = new Date();

            const chat = await msg.getChat();
            chat.sendStateTyping();

            const context = this.buildContext(profile);
            const intent = await this.ai.detectIntent(messageText); // Re-add intent detection
            let response = await this.ai.generateResponse(messageText, profile, context);
            response = this.enrichResponseByIntent(response, intent, profile); // Re-add response enrichment

            profile.conversationHistory.push({ timestamp: new Date(), user: messageText, bot: response });

            await this.extractAndSaveInfo(messageText, profile);

            await msg.reply(response);
            logger.info(`AI response generated and sent to ${phoneNumber}`);

            await profile.save();
            logger.info(`Profile for ${phoneNumber} saved to DB.`);

        } catch (error) {
            logger.error('Error handling incoming message:', error);
            await msg.reply('אופס, משהו השתבש רגע. אני בודק את זה... 🤖');
        }
    }
    
    async handleMediaMessage(msg) {
        const media = await msg.downloadMedia();
        const phoneNumber = msg.from;
        const profile = await this.getOrCreateProfile(phoneNumber);

        this.mediaCache.set(msg.id._serialized, media);

        const chat = await msg.getChat();
        const ack = FUN_RESPONSES.media_ack[Math.floor(Math.random() * FUN_RESPONSES.media_ack.length)];
        await msg.reply(ack);

        profile.memories.push({ content: `שלח/ה מדיה (${media.mimetype})`, date: new Date() });
        await profile.save();
    }
    
    async handleMessageAck(msg, ack) {
        if (ack === 4) { // 4 = Read
            const phoneNumber = msg.to || msg.from;
            const profile = await this.getOrCreateProfile(phoneNumber);
            if (profile) {
                logger.info(`Message read by ${phoneNumber}`);
            }
        }
    }
    
    async getOrCreateProfile(phoneNumber) {
        let profile = await CustomerProfileModel.findById(phoneNumber);
        
        if (!profile) {
            logger.info(`Profile not found for ${phoneNumber}, creating a new one.`);
            profile = new CustomerProfileModel({ _id: phoneNumber });
            await profile.save();
            this.emit('newCustomer', phoneNumber);
            logger.info(`New customer profile created in DB: ${phoneNumber}`);
        }
        
        return profile;
    }
    
    buildContext(profile) {
        const recentHistory = profile.conversationHistory.slice(-5);
        return `
        היסטוריה: ${recentHistory.map(h => `U: ${h.user}, B: ${h.bot}`).join(' | ')}
        תחומי עניין: ${profile.interests.join(', ') || 'לא ידוע'}
        מספר שיחות: ${profile.interactionCount}
        `;
    }

    enrichResponseByIntent(response, intent, profile) {
        let enriched = response;
        switch(intent) {
            case 'greeting':
                if (this.isFirstInteractionToday(profile)) {
                    const greeting = this.getPersonalizedGreeting(profile);
                    enriched = greeting + '\n' + enriched;
                }
                break;
            case 'pricing':
                enriched += '\n\n💰 רוצה לקבל הצעת מחיר מותאמת? רק תגיד!';
                break;
            case 'appointment':
                enriched += '\n\n📅 אפשר לקבוע פגישה עוד היום! מתי נוח לך?';
                break;
            case 'joke':
                const joke = FUN_RESPONSES.jokes[Math.floor(Math.random() * FUN_RESPONSES.jokes.length)];
                enriched = joke + '\n\n' + enriched;
                break;
        }
        if (profile.mood === 'concerned') {
            const motivation = FUN_RESPONSES.motivational[Math.floor(Math.random() * FUN_RESPONSES.motivational.length)];
            enriched += '\n\n' + motivation;
        }
        return enriched;
    }
    
    async extractAndSaveInfo(message, profile) {
        // חילוץ אימייל
        const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
        const emails = message.match(emailRegex);
        if (emails && !profile.email) {
            profile.email = emails[0];
            profile.memories.push({ content: `שיתף/ה אימייל: ${emails[0]}`, date: new Date() });
        }

        // חילוץ שם
        if (!profile.name) {
            const namePatterns = [
                /קוראים לי ([א-ת\s]+)/,
                /אני ([א-ת\s]+)/,
                /שמי הוא ([א-ת\s]+)/
            ];
            for (const pattern of namePatterns) {
                const match = message.match(pattern);
                if (match) {
                    profile.name = match[1].trim();
                    profile.memories.push({ content: `נודע השם: ${profile.name}`, date: new Date() });
                    break;
                }
            }
        }

        // זיהוי תחומי עניין
        const interests = ['בוט', 'שיווק', 'אוטומציה', 'אתר', 'פרסום', 'דיגיטל'];
        interests.forEach(interest => {
            if (message.includes(interest) && !profile.interests.includes(interest)) {
                profile.interests.push(interest);
            }
        });
    }
    
    async simulateTypingDelay(messageLength) {
        const delay = Math.min(
            config.typingDelay.min + (messageLength * config.typingDelay.perChar),
            config.typingDelay.max
        );
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    getPersonalizedGreeting(profile) {
        const hour = new Date().getHours();
        const name = profile.name || 'חבר/ה יקר/ה';
        
        if (hour < 12) {
            return `בוקר טוב ${name}! ☀️`;
        } else if (hour < 17) {
            return `צהריים טובים ${name}! 🌤️`;
        } else if (hour < 21) {
            return `ערב טוב ${name}! 🌅`;
        } else {
            return `לילה טוב ${name}! 🌙`;
        }
    }
    
    isFirstInteractionToday(profile) {
        const today = new Date().toDateString();
        const lastInteraction = profile.lastInteraction ? new Date(profile.lastInteraction) : null;
        return !lastInteraction || lastInteraction.toDateString() !== today;
    }
    
    initializeSchedulers() {
        // ברכת בוקר יומית
        cron.schedule('0 9 * * *', async () => {
            await this.sendDailyGreetings();
        });
        
        // מעקב אחרי לקוחות לא פעילים
        cron.schedule('0 14 * * *', async () => {
            await this.followUpInactiveCustomers();
        });
        
        // ניקוי זיכרון
        cron.schedule('0 3 * * *', () => {
            this.cleanupCache();
        });
    }
    
    async sendDailyGreetings() {
        // engagementScore is not in the new schema, so this logic is simplified
        for (const profile of await CustomerProfileModel.find({ interactionCount: { $gt: 5 } })) {
            const greeting = this.generateDailyGreeting(profile);
            await this.sendMessage(profile._id, greeting);
        }
    }
    
    generateDailyGreeting(profile) {
        const name = profile.name || 'חבר/ה יקר/ה';
        const greetings = [
            `בוקר טוב ${name}! ☀️ איך היום שלך מתחיל?`,
            `${name}, בוקר של אלופים! 💪`,
            `היי ${name}! יום נהדר מחכה לך! 🌈`
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }
    
    async followUpInactiveCustomers() {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        
        const inactiveProfiles = await CustomerProfileModel.find({
            lastInteraction: { $lt: threeDaysAgo },
            interactionCount: { $gt: 3 }
        });

        for (const profile of inactiveProfiles) {
            const followUp = this.generateFollowUp(profile);
            await this.sendMessage(profile._id, followUp);
        }
    }
    
    generateFollowUp(profile) {
        const name = profile.name || 'חבר/ה יקר/ה';
        const messages = [
            `היי ${name}! 👋 מה נשמע? מתגעגעים!`,
            `${name}, יש חדש? 🌟 יש לנו כמה דברים מגניבים להראות לך!`
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }
    
    async sendMessage(phoneNumber, message) {
        try {
            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            await this.client.sendMessage(chatId, message);
            logger.info(`Message sent to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error(`Failed to send message to ${phoneNumber}:`, error);
            return false;
        }
    }
    
    async sendStartupNotification() {
        const adminNumber = process.env.ADMIN_PHONE;
        if (adminNumber) {
            await this.sendMessage(adminNumber, '🤖 הבוט מוכן לעבודה! ✅');
        }
    }
    
    updateStatistics(phoneNumber, eventType) {
        // כאן אפשר להוסיף שמירה למסד נתונים
        this.emit('statistics', {
            phoneNumber,
            eventType,
            timestamp: new Date()
        });
    }
    
    cleanupCache() {
        // ניקוי מדיה ישנה
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        for (const [key, value] of this.mediaCache) {
            if (value.timestamp < oneDayAgo) {
                this.mediaCache.delete(key);
            }
        }
        logger.info('Cache cleaned');
    }
    
    async reconnect() {
        logger.info('Attempting to reconnect...');
        setTimeout(() => {
            this.client.initialize();
        }, 5000);
    }
    
    // API Methods
    async start() {
        logger.info('Starting WhatsApp Bot...');
        await this.client.initialize();
    }
    
    async stop() {
        logger.info('Stopping WhatsApp Bot...');
        if (this.client) {
            await this.client.destroy();
        }
    }
    
    getProfile(phoneNumber) {
        return this.profiles.get(phoneNumber);
    }
    
    getAllProfiles() {
        return Array.from(this.profiles.values());
    }
    
    exportData() {
        const data = {
            profiles: Array.from(this.profiles.entries()),
            statistics: {
                totalProfiles: this.profiles.size,
                activeChats: this.activeChats.size
            },
            exportDate: new Date()
        };
        return data;
    }
}

module.exports = PresentorWhatsAppBot;
