#!/usr/bin/env node

// ========================================
// Health Check Script for Production
// ========================================
// Can be used by monitoring systems

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const options = {
    hostname: HOST,
    port: PORT,
    path: '/status',
    method: 'GET',
    timeout: 5000
};

const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const status = JSON.parse(data);
            
            if (res.statusCode === 200 && status.botReady) {
                console.log('✅ Health check passed');
                console.log(`Bot Ready: ${status.botReady}`);
                console.log(`Uptime: ${Math.round(status.uptime)}s`);
                console.log(`Memory: ${Math.round(status.memoryUsage.rss / 1024 / 1024)}MB`);
                
                if (status.sessionBackupTime) {
                    const lastBackup = new Date(status.sessionBackupTime);
                    const timeSince = Math.round((Date.now() - lastBackup) / 60000);
                    console.log(`Last Backup: ${timeSince}m ago`);
                }
                
                process.exit(0);
            } else {
                console.log('❌ Health check failed - Bot not ready');
                process.exit(1);
            }
        } catch (error) {
            console.log('❌ Health check failed - Invalid response');
            process.exit(1);
        }
    });
});

req.on('error', (error) => {
    console.log('❌ Health check failed - Connection error:', error.message);
    process.exit(1);
});

req.on('timeout', () => {
    console.log('❌ Health check failed - Timeout');
    req.destroy();
    process.exit(1);
});

req.end();