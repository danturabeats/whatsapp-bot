const mongoose = require('mongoose');
const { Schema } = mongoose;

// הגדרת תתי-סכמות כדי לשמור על סדר
const memorySchema = new Schema({
    content: String,
    date: Date
});

const historySchema = new Schema({
    timestamp: Date,
    user: String,
    bot: String
});

// הסכמה הראשית של פרופיל הלקוח
const profileSchema = new Schema({
    _id: { type: String, required: true }, // phoneNumber בפורמט 972...
    name: { type: String, default: null },
    email: { type: String, default: null },
    lastInteraction: { type: Date, default: Date.now },
    interactionCount: { type: Number, default: 0 },
    mood: { type: String, default: 'neutral' },
    interests: [String],
    memories: [memorySchema],
    conversationHistory: [historySchema]
});

// ייצוא המודל כדי שנוכל להשתמש בו בקבצים אחרים
module.exports = mongoose.models.CustomerProfile || mongoose.model('CustomerProfile', profileSchema);
