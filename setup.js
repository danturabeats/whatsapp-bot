#!/usr/bin/env node

// ========================================
// WhatsApp Bot Setup Helper
// ========================================
// Helps validate environment and setup

const fs = require('fs');
const path = require('path');

console.log('🤖 WhatsApp Bot Setup Validator\n');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
console.log(`📦 Node.js: ${nodeVersion}`);

if (majorVersion < 18) {
    console.log('❌ Node.js 18+ required! Please upgrade.');
    process.exit(1);
} else {
    console.log('✅ Node.js version compatible');
}

// Check .env file
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.log('\n❌ .env file not found!');
    console.log('📝 Copy .env.example to .env and fill in your credentials:');
    console.log('   cp .env.example .env');
    process.exit(1);
} else {
    console.log('✅ .env file found');
}

// Load and validate .env
require('dotenv').config();

const requiredVars = ['MONGODB_URI', 'GEMINI_API_KEY'];
const missingVars = [];

console.log('\n🔧 Environment Variables:');
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value || value.includes('your_') || value.includes('username:password')) {
        missingVars.push(varName);
        console.log(`❌ ${varName}: Not configured`);
    } else {
        console.log(`✅ ${varName}: Configured (${value.substring(0, 20)}...)`);
    }
});

if (process.env.ADMIN_PHONE) {
    console.log(`📱 ADMIN_PHONE: ${process.env.ADMIN_PHONE}`);
}

// Check dependencies
console.log('\n📚 Dependencies Check:');
const packageJson = require('./package.json');
const criticalDeps = [
    'whatsapp-web.js', 
    '@google/generative-ai', 
    'mongoose', 
    'winston',
    'archiver',
    'tar-stream'
];

criticalDeps.forEach(dep => {
    try {
        require.resolve(dep);
        console.log(`✅ ${dep}`);
    } catch (error) {
        console.log(`❌ ${dep}: Not installed`);
        console.log('   Run: npm install');
        process.exit(1);
    }
});

// MongoDB Connection Test
async function testMongoDB() {
    if (missingVars.includes('MONGODB_URI')) {
        console.log('\n❌ Cannot test MongoDB - URI not configured');
        return;
    }

    console.log('\n🍃 Testing MongoDB connection...');
    try {
        const mongoose = require('mongoose');
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ MongoDB connection successful');
        await mongoose.disconnect();
    } catch (error) {
        console.log('❌ MongoDB connection failed:', error.message);
        console.log('   Check your MONGODB_URI in .env');
    }
}

// Gemini API Test
async function testGemini() {
    if (missingVars.includes('GEMINI_API_KEY')) {
        console.log('\n❌ Cannot test Gemini - API key not configured');
        return;
    }

    console.log('\n🧠 Testing Gemini AI connection...');
    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const result = await model.generateContent('Hello');
        console.log('✅ Gemini AI connection successful');
    } catch (error) {
        console.log('❌ Gemini AI connection failed:', error.message);
        console.log('   Check your GEMINI_API_KEY in .env');
    }
}

// Main validation
async function runSetup() {
    if (missingVars.length > 0) {
        console.log('\n❌ Setup incomplete. Please configure missing environment variables:');
        missingVars.forEach(varName => {
            console.log(`   ${varName}`);
        });
        console.log('\n📖 See README.md for detailed setup instructions');
        process.exit(1);
    }

    await testMongoDB();
    await testGemini();

    console.log('\n🎉 Setup validation complete!');
    console.log('\n🚀 Ready to start the bot:');
    console.log('   npm start');
    console.log('\n📱 After starting, check the console for QR code or visit:');
    console.log('   http://localhost:3000/qr');
    console.log('\n📊 Monitor status at:');
    console.log('   http://localhost:3000/status');
}

runSetup().catch(error => {
    console.error('Setup validation failed:', error);
    process.exit(1);
});