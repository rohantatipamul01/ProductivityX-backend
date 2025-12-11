const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['work', 'personal', 'health', 'learning', 'other'],
    default: 'other'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  scheduledTime: {
    type: String,
    required: true
  },
  estimatedDuration: {
    type: Number, // in minutes
    default: 60
  },
  actualDuration: {
    type: Number, // in minutes
    default: 0
  },
  completedAt: {
    type: Date
  },
  productivityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
taskSchema.index({ userId: 1, scheduledDate: 1 });
taskSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);





