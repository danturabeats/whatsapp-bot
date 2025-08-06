require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const CustomerProfileModel = require('./CustomerProfile.js');
const winston = require('winston');
const NodeCache = require('node-cache');
const EventEmitter = require('events');
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');

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
    sessionPath: '.wwebjs_auth',
    sessionBackupInterval: 300000, // 5 minutes
    sessionValidationInterval: 300000, // 5 minutes
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

// מחלקת ניהול Session מותאמת אישית
class CustomSessionStore {
    constructor() {
        this.sessionPath = config.sessionPath;
        this.sessionCollection = 'whatsapp_sessions';
        this.backupInterval = null;
        this.lastBackupTime = null;
        
        // יצירת Schema וModel פעם אחת עם chunking support
        this.sessionSchema = new require('mongoose').Schema({
            sessionId: { type: String, unique: true },
            data: Buffer,
            checksum: String,
            createdAt: Date,
            size: Number,
            isChunked: { type: Boolean, default: false },
            chunkCount: { type: Number, default: 1 }
        });

        this.chunkSchema = new require('mongoose').Schema({
            sessionId: String,
            chunkIndex: Number,
            data: Buffer,
            createdAt: Date
        });
        
        // בדיקה אם המודלים כבר קיימים
        try {
            this.SessionModel = require('mongoose').model('Session');
            this.ChunkModel = require('mongoose').model('SessionChunk');
        } catch (error) {
            this.SessionModel = require('mongoose').model('Session', this.sessionSchema);
            this.ChunkModel = require('mongoose').model('SessionChunk', this.chunkSchema);
        }

        // הגדרת גודל chunk מקסימלי (10MB = בטוח למונגו)
        this.maxChunkSize = 10 * 1024 * 1024; // 10MB
        
        logger.info('CustomSessionStore initialized');
    }

    // יצירת checksum לקובץ
    createChecksum(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    // פיצול buffer לchunks
    splitIntoChunks(buffer) {
        const chunks = [];
        for (let i = 0; i < buffer.length; i += this.maxChunkSize) {
            chunks.push(buffer.slice(i, i + this.maxChunkSize));
        }
        return chunks;
    }

    // איחוד chunks חזרה לbuffer
    combineChunks(chunks) {
        return Buffer.concat(chunks);
    }

    // דחיסת תיקיית Session ל-buffer (ZIP format - יציב יותר)
    async compressSession(sessionPath) {
        return new Promise((resolve, reject) => {
            try {
                const buffers = [];
                const archive = archiver('zip', { 
                    zlib: { level: 9 },
                    forceLocalTime: true
                });

                archive.on('error', (error) => {
                    logger.error('Compression error:', error);
                    reject(error);
                });

                archive.on('data', (data) => buffers.push(data));
                
                archive.on('end', () => {
                    try {
                        const buffer = Buffer.concat(buffers);
                        logger.info(`Compression completed: ${buffer.length} bytes`);
                        resolve(buffer);
                    } catch (error) {
                        reject(error);
                    }
                });

                if (fs.existsSync(sessionPath)) {
                    archive.directory(sessionPath, false);
                    archive.finalize();
                } else {
                    // יצירת ZIP ריק אם התיקייה לא קיימת
                    archive.finalize();
                }
                
            } catch (error) {
                logger.error('Failed to initialize compression:', error);
                reject(error);
            }
        });
    }

    // שחזור Session מ-buffer (ZIP format)
    async extractSession(buffer, targetPath) {
        try {
            await fs.ensureDir(targetPath);
            logger.info(`Extracting session to ${targetPath}...`);
            
            return new Promise((resolve, reject) => {
                const stream = require('stream');
                const bufferStream = new stream.PassThrough();
                bufferStream.end(buffer);

                bufferStream
                    .pipe(unzipper.Extract({ path: targetPath }))
                    .on('close', () => {
                        logger.info(`Session extracted successfully to ${targetPath}`);
                        resolve();
                    })
                    .on('error', (error) => {
                        logger.error('Extraction error:', error);
                        reject(error);
                    });
            });
        } catch (error) {
            logger.error('Error extracting session:', error);
            throw error;
        }
    }

    // שמירת Session במסד הנתונים
    async saveSession(sessionId = 'default') {
        try {
            if (!fs.existsSync(this.sessionPath)) {
                logger.warn('Session path does not exist, skipping backup');
                return false;
            }

            // תיקון באג ה-session ID - אם זה undefined, נשתמש בdefault
            const originalSessionId = sessionId;
            if (!sessionId || sessionId === 'undefined') {
                sessionId = 'RemoteAuth-my-whatsapp-bot';
                logger.warn(`Session ID was '${originalSessionId}', using default: ${sessionId}`);
            }

            logger.info(`Starting session backup for ID: ${sessionId}...`);
            
            let buffer;
            try {
                buffer = await this.compressSession(this.sessionPath);
            } catch (compressionError) {
                logger.error('Compression failed:', compressionError);
                return false;
            }

            if (!buffer || buffer.length === 0) {
                logger.warn('Empty buffer generated, skipping backup');
                return false;
            }

            const checksum = this.createChecksum(buffer);
            const sizeMB = Math.round(buffer.length / 1024 / 1024 * 100) / 100;

            // בדיקה אם צריך chunking (מעל 15MB)
            const needsChunking = buffer.length > 15 * 1024 * 1024;

            if (needsChunking) {
                logger.info(`Large session (${sizeMB}MB) - using chunked storage`);
                return await this.saveChunkedSession(sessionId, buffer, checksum);
            } else {
                // שמירה רגילה לsessions קטנים
                const sessionData = {
                    sessionId,
                    data: buffer,
                    checksum,
                    createdAt: new Date(),
                    size: buffer.length,
                    isChunked: false,
                    chunkCount: 1
                };

                try {
                    await this.SessionModel.findOneAndUpdate(
                        { sessionId },
                        sessionData,
                        { upsert: true }
                    );

                    this.lastBackupTime = new Date();
                    logger.info(`Session backed up successfully. Size: ${sizeMB}MB, Checksum: ${checksum.substring(0, 8)}...`);
                    return true;

                } catch (dbError) {
                    logger.error('Database save failed:', dbError);
                    return false;
                }
            }

        } catch (error) {
            logger.error('Error saving session:', error);
            return false;
        }
    }

    // שמירת session גדול בחלקים
    async saveChunkedSession(sessionId, buffer, checksum) {
        try {
            const chunks = this.splitIntoChunks(buffer);
            logger.info(`Saving session in ${chunks.length} chunks`);

            // מחיקת chunks ישנים
            await this.ChunkModel.deleteMany({ sessionId });

            // שמירת chunks
            for (let i = 0; i < chunks.length; i++) {
                const chunkData = {
                    sessionId,
                    chunkIndex: i,
                    data: chunks[i],
                    createdAt: new Date()
                };

                await this.ChunkModel.create(chunkData);
                logger.info(`Chunk ${i + 1}/${chunks.length} saved (${Math.round(chunks[i].length / 1024)}KB)`);
            }

            // שמירת metadata
            const sessionData = {
                sessionId,
                data: Buffer.alloc(0), // buffer ריק
                checksum,
                createdAt: new Date(),
                size: buffer.length,
                isChunked: true,
                chunkCount: chunks.length
            };

            await this.SessionModel.findOneAndUpdate(
                { sessionId },
                sessionData,
                { upsert: true }
            );

            this.lastBackupTime = new Date();
            logger.info(`Chunked session saved successfully. Total: ${Math.round(buffer.length / 1024 / 1024 * 100) / 100}MB, Chunks: ${chunks.length}, Checksum: ${checksum.substring(0, 8)}...`);
            return true;

        } catch (error) {
            logger.error('Error saving chunked session:', error);
            return false;
        }
    }

    // שחזור Session מהמסד
    async restoreSession(sessionId = 'default') {
        try {
            // תיקון באג ה-session ID - שימוש באותו ID כמו בsave
            if (!sessionId || sessionId === 'undefined') {
                sessionId = 'RemoteAuth-my-whatsapp-bot';
            }

            logger.info(`Attempting to restore session for ID: ${sessionId}...`);

            const sessionDoc = await this.SessionModel.findOne({ sessionId });
            
            if (!sessionDoc) {
                logger.info('No session found in database');
                return false;
            }

            let buffer;
            
            if (sessionDoc.isChunked) {
                logger.info(`Restoring chunked session (${sessionDoc.chunkCount} chunks)`);
                buffer = await this.restoreChunkedSession(sessionId, sessionDoc);
            } else {
                buffer = sessionDoc.data;
            }

            if (!buffer || buffer.length === 0) {
                logger.error('No session data to restore');
                return false;
            }

            // בדיקת תקינות
            const currentChecksum = this.createChecksum(buffer);
            if (currentChecksum !== sessionDoc.checksum) {
                logger.error('Session checksum mismatch - data corrupted');
                return false;
            }

            // ניקוי תיקייה קיימת
            if (fs.existsSync(this.sessionPath)) {
                await fs.remove(this.sessionPath);
            }

            // שחזור הקבצים
            await this.extractSession(buffer, this.sessionPath);
            
            logger.info(`Session restored successfully. Size: ${Math.round(sessionDoc.size / 1024 / 1024 * 100) / 100}MB, Age: ${Math.round((Date.now() - sessionDoc.createdAt) / 60000)} minutes`);
            return true;

        } catch (error) {
            logger.error('Error restoring session:', error);
            return false;
        }
    }

    // שחזור session מחלקים
    async restoreChunkedSession(sessionId, sessionDoc) {
        try {
            const chunks = await this.ChunkModel.find({ sessionId }).sort({ chunkIndex: 1 });
            
            if (chunks.length !== sessionDoc.chunkCount) {
                logger.error(`Chunk count mismatch: expected ${sessionDoc.chunkCount}, found ${chunks.length}`);
                return null;
            }

            logger.info(`Combining ${chunks.length} chunks...`);
            const chunkBuffers = chunks.map(chunk => chunk.data);
            const buffer = this.combineChunks(chunkBuffers);
            
            if (buffer.length !== sessionDoc.size) {
                logger.error(`Size mismatch: expected ${sessionDoc.size}, got ${buffer.length}`);
                return null;
            }

            return buffer;

        } catch (error) {
            logger.error('Error restoring chunked session:', error);
            return null;
        }
    }

    // בדיקת קיום Session תקין
    async sessionExists(sessionId = 'default') {
        try {
            // תיקון באג ה-session ID - שימוש באותו ID כמו בfunctions אחרים
            if (!sessionId || sessionId === 'undefined') {
                sessionId = 'RemoteAuth-my-whatsapp-bot';
            }

            const session = await this.SessionModel.findOne({ sessionId });
            return session && session.data && session.data.length > 0;
        } catch (error) {
            logger.error('Error checking session existence:', error);
            return false;
        }
    }

    // התחלת גיבוי תקופתי
    startPeriodicBackup() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }

        this.backupInterval = setInterval(async () => {
            try {
                if (fs.existsSync(this.sessionPath)) {
                    const success = await this.saveSession();
                    if (!success) {
                        logger.warn('Periodic backup failed, will retry next interval');
                    }
                }
            } catch (error) {
                logger.error('Periodic backup error:', error);
            }
        }, config.sessionBackupInterval);

        logger.info(`Periodic backup started (every ${config.sessionBackupInterval / 1000} seconds)`);
    }

    // עצירת גיבוי תקופתי
    stopPeriodicBackup() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
            logger.info('Periodic backup stopped');
        }
    }

    // ניקוי sessions עם IDs פגומים
    async cleanupCorruptedSessions() {
        try {
            // מחיקת sessions עם undefined או null
            const sessionResult = await this.SessionModel.deleteMany({ 
                $or: [
                    { sessionId: { $in: [null, 'undefined', ''] } },
                    { sessionId: { $exists: false } }
                ]
            });

            // מחיקת chunks יתומים
            const chunkResult = await this.ChunkModel.deleteMany({
                $or: [
                    { sessionId: { $in: [null, 'undefined', ''] } },
                    { sessionId: { $exists: false } }
                ]
            });

            const totalCleaned = sessionResult.deletedCount + chunkResult.deletedCount;
            if (totalCleaned > 0) {
                logger.info(`Cleaned up ${sessionResult.deletedCount} corrupted sessions and ${chunkResult.deletedCount} orphaned chunks`);
            }

            return totalCleaned;
        } catch (error) {
            logger.error('Error cleaning corrupted sessions:', error);
            return 0;
        }
    }
}

// מחלקת הבוט הראשית
class PresentorWhatsAppBot extends EventEmitter {
    constructor() {
        super();
        
        // אתחול מערכת ניהול Session
        this.sessionStore = new CustomSessionStore();
        
        // אתחול WhatsApp Client עם הגדרות משופרות
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
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
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
            logger.info('QR Code received, generating enhanced display...');
            
            // שמירת QR במטמון לwebapi
            this.currentQR = qr;
            
            // יצירת data URL לדפדפן
            const QRCode = require('qrcode');
            QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', width: 512 }, (err, url) => {
                if (err) {
                    logger.error('Failed to generate QR code data URL', err);
                    return;
                }
                
                this.qrDataURL = url;
                
                // הדפסה משופרת
                console.log("\n" + "=".repeat(60));
                console.log("📱 WHATSAPP QR CODE - SCAN TO AUTHENTICATE");
                console.log("=".repeat(60));
                console.log("🔗 BROWSER LINK:");
                console.log(url);
                console.log("=".repeat(60));
                console.log("📋 Or access via: http://localhost:" + (process.env.PORT || 3000) + "/qr");
                console.log("⏰ QR Code expires in 20 seconds - scan quickly!");
                console.log("=".repeat(60) + "\n");

                logger.info('QR code ready - check console or browser endpoint');
                
                // ניקוי QR אחרי 20 שניות
                setTimeout(() => {
                    this.currentQR = null;
                    this.qrDataURL = null;
                }, 20000);
            });
            
            // QR terminal backup
            qrcode.generate(qr, { small: true }, (qrString) => {
                console.log("📟 Terminal QR (backup):\n" + qrString);
            });
        });
        
        // התחברות מוצלחת
        this.client.on('ready', async () => {
            logger.info('WhatsApp Bot is ready! ✅');
            
            // שמירת Session למסד נתונים
            setTimeout(async () => {
                try {
                    logger.info('Starting initial session backup...');
                    const saved = await this.sessionStore.saveSession();
                    if (saved) {
                        logger.info('Initial session backup completed successfully');
                        // התחלת גיבוי תקופתי
                        this.sessionStore.startPeriodicBackup();
                    } else {
                        logger.warn('Initial session backup failed, periodic backup will retry');
                        // התחל גיבוי תקופתי בכל מקרה - אולי יעבוד בניסיון הבא
                        this.sessionStore.startPeriodicBackup();
                    }
                } catch (error) {
                    logger.error('Error during initial session backup:', error);
                    // התחל גיבוי תקופתי למרות השגיאה
                    this.sessionStore.startPeriodicBackup();
                }
            }, 30000); // המתנה של 30 שניות במקום דקה

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
        
        // בדיקת תקינות session כל 5 דקות
        cron.schedule('*/5 * * * *', async () => {
            await this.performSessionHealthCheck();
        });
        
        // גיבוי session כל שעה (נוסף על הגיבוי הרגיל)
        cron.schedule('0 * * * *', async () => {
            if (this.client && this.client.info) {
                await this.sessionStore.saveSession();
            }
        });
    }
    
    // בדיקת תקינות Session
    async performSessionHealthCheck() {
        try {
            // בדיקה שהלקוח מחובר
            if (!this.client || !this.client.info) {
                logger.warn('Session health check: Client not connected');
                return;
            }

            // בדיקה שקבצי Session קיימים
            if (!fs.existsSync(config.sessionPath)) {
                logger.error('Session health check: Session files missing!');
                
                // ניסיון שחזור מהמסד נתונים
                const restored = await this.sessionStore.restoreSession();
                if (restored) {
                    logger.info('Session health check: Restored session from database');
                } else {
                    logger.error('Session health check: Failed to restore session');
                }
                return;
            }

            // בדיקת גודל תיקיית Session (אמור להיות לפחות כמה קבצים)
            const files = await fs.readdir(config.sessionPath);
            if (files.length < 3) {
                logger.warn(`Session health check: Only ${files.length} files in session directory`);
            }

            // בדיקת קישוריות
            try {
                const state = await this.client.getState();
                if (state !== 'CONNECTED') {
                    logger.warn(`Session health check: Client state is ${state}`);
                }
            } catch (error) {
                logger.error('Session health check: Failed to get client state:', error.message);
            }

            logger.info('Session health check completed successfully');

        } catch (error) {
            logger.error('Session health check error:', error);
        }
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
        logger.info('Attempting to reconnect with session recovery...');
        
        try {
            // עצירת גיבויים תקופתיים
            this.sessionStore.stopPeriodicBackup();
            
            // ניסיון שחזור session
            const restored = await this.sessionStore.restoreSession();
            if (restored) {
                logger.info('Session restored for reconnection');
            }
            
            setTimeout(() => {
                this.client.initialize();
            }, 5000);
            
        } catch (error) {
            logger.error('Error during reconnection attempt:', error);
            // ניסיון נקי ללא session
            setTimeout(() => {
                if (fs.existsSync(config.sessionPath)) {
                    fs.removeSync(config.sessionPath);
                }
                this.client.initialize();
            }, 10000);
        }
    }
    
    // API Methods
    async start() {
        logger.info('Starting WhatsApp Bot with enhanced session management...');
        
        try {
            // ניקוי sessions פגומים לפני שחזור
            await this.sessionStore.cleanupCorruptedSessions();
            
            // ניסיון שחזור Session מהמסד נתונים
            const sessionRestored = await this.sessionStore.restoreSession();
            if (sessionRestored) {
                logger.info('Session restored from database, attempting connection...');
            } else {
                logger.info('No valid session found, will require QR code scan');
            }
            
            // אתחול הלקוח
            await this.client.initialize();
            
        } catch (error) {
            logger.error('Error during bot startup:', error);
            
            // במקרה של שגיאה, נסה לנקות session פגום ולהתחיל מחדש
            if (fs.existsSync(config.sessionPath)) {
                logger.info('Cleaning potentially corrupted session...');
                await fs.remove(config.sessionPath);
            }
            
            // ניסיון שני
            await this.client.initialize();
        }
    }
    
    async stop() {
        logger.info('Stopping WhatsApp Bot gracefully...');
        
        try {
            // עצירת גיבויים תקופתיים
            if (this.sessionStore) {
                this.sessionStore.stopPeriodicBackup();
                
                // גיבוי אחרון לפני עצירה
                if (fs.existsSync(config.sessionPath)) {
                    await this.sessionStore.saveSession();
                    logger.info('Final session backup completed');
                }
            }
            
            // עצירת הלקוח
            if (this.client) {
                await this.client.destroy();
                logger.info('WhatsApp client stopped');
            }
            
            // ניקוי זיכרון
            this.activeChats.clear();
            this.messageQueue = [];
            this.mediaCache.clear();
            
            logger.info('WhatsApp Bot stopped successfully');
            
        } catch (error) {
            logger.error('Error during bot shutdown:', error);
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
