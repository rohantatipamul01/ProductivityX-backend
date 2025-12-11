const mongoose = require('mongoose');

const productivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  tasksCompleted: {
    type: Number,
    default: 0
  },
  tasksPlanned: {
    type: Number,
    default: 0
  },
  totalWorkTime: {
    type: Number, // in minutes
    default: 0
  },
  productivityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  focusTime: {
    type: Number, // in minutes
    default: 0
  },
  breaks: {
    type: Number,
    default: 0
  },
  categoryBreakdown: {
    work: { type: Number, default: 0 },
    personal: { type: Number, default: 0 },
    health: { type: Number, default: 0 },
    learning: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Index for efficient queries
productivitySchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Productivity', productivitySchema);





