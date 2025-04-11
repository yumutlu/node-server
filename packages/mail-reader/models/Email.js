const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  from: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, required: true },
  labels: [String],
  sentiment: String,
  category: String,
  isAnswered: { type: Boolean, default: false },
  replyHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Email' }],
  isAnalyzed: { type: Boolean, default: false }
});

// Benzersiz bileşik indeks oluştur
emailSchema.index({ subject: 1, from: 1, timestamp: 1 }, { unique: true });

const Email = mongoose.model('Email', emailSchema);

module.exports = Email; 