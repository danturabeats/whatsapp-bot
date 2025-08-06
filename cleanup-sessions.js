#!/usr/bin/env node

// ========================================
// Session Cleanup Utility
// ========================================
// Cleans corrupted sessions from MongoDB

require('dotenv').config();
const mongoose = require('mongoose');

async function cleanupSessions() {
    console.log('🧹 WhatsApp Session Cleanup Utility\n');

    if (!process.env.MONGODB_URI) {
        console.log('❌ MONGODB_URI not found in .env file');
        process.exit(1);
    }

    try {
        // Connect to MongoDB
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Define session schema
        const SessionModel = mongoose.model('Session', new mongoose.Schema({
            sessionId: { type: String, unique: true },
            data: Buffer,
            checksum: String,
            createdAt: Date,
            size: Number
        }));

        // Find all sessions
        console.log('\n📋 Current sessions in database:');
        const allSessions = await SessionModel.find({});
        
        if (allSessions.length === 0) {
            console.log('   No sessions found');
        } else {
            allSessions.forEach((session, index) => {
                console.log(`   ${index + 1}. ID: "${session.sessionId}" | Size: ${Math.round(session.size / 1024)}KB | Date: ${session.createdAt}`);
            });
        }

        // Find corrupted sessions
        const corruptedSessions = await SessionModel.find({ 
            $or: [
                { sessionId: { $in: [null, 'undefined', ''] } },
                { sessionId: { $exists: false } }
            ]
        });

        console.log(`\n🔍 Found ${corruptedSessions.length} corrupted sessions`);

        if (corruptedSessions.length > 0) {
            console.log('\n🗑️  Deleting corrupted sessions...');
            const result = await SessionModel.deleteMany({ 
                $or: [
                    { sessionId: { $in: [null, 'undefined', ''] } },
                    { sessionId: { $exists: false } }
                ]
            });
            
            console.log(`✅ Cleaned up ${result.deletedCount} corrupted sessions`);
        } else {
            console.log('✅ No corrupted sessions found');
        }

        // Show remaining sessions
        console.log('\n📋 Sessions after cleanup:');
        const remainingSessions = await SessionModel.find({});
        
        if (remainingSessions.length === 0) {
            console.log('   No sessions remaining');
        } else {
            remainingSessions.forEach((session, index) => {
                console.log(`   ${index + 1}. ID: "${session.sessionId}" | Size: ${Math.round(session.size / 1024)}KB | Date: ${session.createdAt}`);
            });
        }

        await mongoose.disconnect();
        console.log('\n🎉 Cleanup completed successfully!');
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        process.exit(1);
    }
}

cleanupSessions();