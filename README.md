# 🤖 WhatsApp AI Bot with Session Persistence

![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

An advanced WhatsApp bot powered by Google Gemini AI with intelligent session management for deployment on ephemeral filesystems like Render, Heroku, and other cloud platforms.

## ✨ Key Features

### 🧠 AI-Powered Intelligence
- **Google Gemini Integration** - Natural Hebrew conversations
- **Intent Recognition** - Understands user requests automatically
- **Personalized Responses** - Remembers customer preferences
- **Context Awareness** - Maintains conversation history

### 💾 Advanced Session Management
- **Custom Session Store** - MongoDB-backed persistence
- **Automatic Backup/Restore** - Session survival across restarts
- **Health Monitoring** - Proactive session integrity checks
- **Ephemeral Filesystem Support** - Works on Render, Heroku, etc.

### 📊 Customer Relationship Management
- **Profile Tracking** - Automatic customer data extraction
- **Interaction History** - Complete conversation logs
- **Mood Detection** - Adaptive response tones
- **Scheduled Engagement** - Automated follow-ups

### 🚀 Production Ready
- **Docker Optimized** - Ready for containerized deployment
- **Web Dashboard** - QR code display and status monitoring
- **Comprehensive Logging** - Winston-based logging system
- **Error Recovery** - Graceful handling of failures

## 📋 Prerequisites

1. **Node.js 18+** - Runtime environment
2. **MongoDB Atlas** - Free cloud database
3. **Google Gemini API Key** - AI capabilities
4. **WhatsApp Account** - For bot authentication

## 🛠️ Setup Instructions

### 1. Clone and Install
\`\`\`bash
git clone <your-repo-url>
cd whatsapp-bot-render
npm install
\`\`\`

### 2. Environment Configuration
\`\`\`bash
cp .env.example .env
\`\`\`

Edit `.env` with your credentials:
\`\`\`env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/whatsapp-bot
GEMINI_API_KEY=your_gemini_api_key_here
ADMIN_PHONE=972XXXXXXXXX  # Optional
\`\`\`

### 3. Get Required API Keys

#### MongoDB Atlas (Free)
1. Visit [MongoDB Atlas](https://www.mongodb.com/atlas/database)
2. Create free account and cluster
3. Get connection string from "Connect" → "Drivers"

#### Google Gemini API (Free)
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API key
3. Copy the key to your .env file

### 4. Run Locally
\`\`\`bash
npm start
\`\`\`

### 5. Authentication
- Check console for QR code data URL
- Or visit: `http://localhost:3000/qr`
- Scan with WhatsApp to authenticate

## 🐳 Docker Deployment

### Build Image
\`\`\`bash
docker build -t whatsapp-bot .
\`\`\`

### Run Container
\`\`\`bash
docker run -d --name whatsapp-bot \
  -e MONGODB_URI="your_mongodb_uri" \
  -e GEMINI_API_KEY="your_gemini_key" \
  -p 3000:3000 \
  whatsapp-bot
\`\`\`

## ☁️ Render Deployment

### 1. Connect Repository
- Link your GitHub repository to Render
- Select "Web Service" type

### 2. Configuration
- **Build Command**: `npm install`
- **Start Command**: `node index.js`
- **Environment Variables**: Add your `.env` values

### 3. First Run Authentication
1. Check deployment logs for QR code data URL
2. Or visit: `https://your-app.onrender.com/qr`
3. Scan with WhatsApp
4. Session will be automatically saved to MongoDB

## 🔧 Advanced Configuration

### Session Management
The bot uses a sophisticated session management system:

- **Automatic Backup** - Every 5 minutes when active
- **Health Checks** - Every 5 minutes
- **Smart Recovery** - Restores from MongoDB on startup
- **Corruption Detection** - Checksums verify data integrity

### Monitoring Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Main dashboard |
| `/qr` | QR code display |
| `/status` | JSON status info |

### Logging Levels
Set `LOG_LEVEL` in `.env`:
- `error` - Errors only  
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging

## 🤝 Bot Capabilities

### Customer Interaction
- **Natural Conversations** - Hebrew language support
- **Intent Understanding** - Pricing, appointments, support
- **Personalized Greetings** - Time-aware responses
- **Conversation Memory** - Remembers past interactions

### Automated Features
- **Daily Greetings** - 9:00 AM engagement
- **Follow-up Messages** - Re-engage inactive customers
- **Data Extraction** - Auto-capture emails and names
- **Interest Tracking** - Learn customer preferences

### Business Integration
- **CRM Ready** - Customer profiles in MongoDB
- **Analytics Events** - Interaction tracking
- **Scalable Architecture** - Multiple session support

## 🧪 Troubleshooting

### Common Issues

**QR Code Not Displaying**
- Check console logs for data URL
- Visit `/qr` endpoint directly
- Ensure port 3000 is accessible

**Session Not Persisting**
- Verify MongoDB connection string
- Check logs for backup errors
- Ensure database permissions

**Bot Not Responding**
- Check Gemini API key validity
- Verify MongoDB connection
- Review application logs

**Memory Issues**
- Monitor `/status` endpoint
- Check Docker memory limits
- Review cron job schedules

### Debug Mode
\`\`\`bash
LOG_LEVEL=debug npm start
\`\`\`

## 📈 Performance Optimization

### Resource Usage
- **Memory**: ~150MB base + session data
- **CPU**: Low usage, spikes during AI responses
- **Storage**: Session backups ~1-5MB each
- **Network**: Minimal, event-driven

### Scaling Considerations
- Multiple instances supported with unique session IDs
- MongoDB handles concurrent access
- Consider Redis for high-volume deployments

## 🔐 Security

### Best Practices
- Never commit `.env` files
- Use environment variables only
- Secure MongoDB with IP whitelisting
- Monitor API key usage

### Data Privacy
- Customer data encrypted in MongoDB
- Session files contain no sensitive info
- Automatic data cleanup policies available

## 📚 Technical Architecture

### Core Components
1. **WhatsApp Client** - whatsapp-web.js with LocalAuth
2. **Session Store** - Custom MongoDB-based persistence
3. **AI Engine** - Google Gemini with context awareness
4. **CRM System** - Customer profile management
5. **Web Interface** - Express.js dashboard

### Session Flow
1. **Startup** → Restore session from MongoDB
2. **Authentication** → QR code scan or automatic login
3. **Active** → Periodic backups every 5 minutes
4. **Health Checks** → Validate integrity every 5 minutes
5. **Shutdown** → Final backup before exit

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check troubleshooting section
- Review application logs

---

**Made with ❤️ for reliable WhatsApp automation on ephemeral cloud platforms**