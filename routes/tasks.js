const express = require('express');
const { body, validationResult } = require('express-validator');
const Task = require('../models/Task');
const Productivity = require('../models/Productivity');
const auth = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// All routes require authentication
router.use(auth);

// @route   GET /api/tasks
// @desc    Get all tasks for the authenticated user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { status, category, startDate, endDate } = req.query;
    const query = { userId: req.user._id };

    if (status) query.status = status;
    if (category) query.category = category;
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    const tasks = await Task.find(query)
      .sort({ scheduledDate: 1, scheduledTime: 1 })
      .populate('userId', 'name email');

    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/tasks/:id
// @desc    Get a single task by ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post('/', [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('scheduledDate').notEmpty().withMessage('Scheduled date is required'),
  body('scheduledTime').notEmpty().withMessage('Scheduled time is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskData = {
      ...req.body,
      userId: req.user._id
    };

    const task = new Task(taskData);
    await task.save();

    // Update productivity metrics
    await updateProductivityMetrics(req.user._id, task.scheduledDate);

    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update a task
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Update task fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        task[key] = req.body[key];
      }
    });

    // If task is being marked as completed, set completedAt and calculate productivity score
    if (req.body.status === 'completed' && task.status !== 'completed') {
      task.completedAt = new Date();
      if (task.actualDuration && task.estimatedDuration) {
        // Calculate productivity score based on time efficiency
        const timeEfficiency = (task.estimatedDuration / task.actualDuration) * 100;
        task.productivityScore = Math.min(100, Math.max(0, timeEfficiency));
      }
    }

    await task.save();

    // Update productivity metrics
    if (task.scheduledDate) {
      await updateProductivityMetrics(req.user._id, task.scheduledDate);
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Update productivity metrics
    if (task.scheduledDate) {
      await updateProductivityMetrics(req.user._id, task.scheduledDate);
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to update productivity metrics
async function updateProductivityMetrics(userId, date) {
  const dateStart = moment(date).startOf('day').toDate();
  const dateEnd = moment(date).endOf('day').toDate();

  const tasks = await Task.find({
    userId,
    scheduledDate: { $gte: dateStart, $lte: dateEnd }
  });

  const tasksPlanned = tasks.length;
  const tasksCompleted = tasks.filter(t => t.status === 'completed').length;
  const totalWorkTime = tasks
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.actualDuration || 0), 0);

  const categoryBreakdown = {
    work: 0,
    personal: 0,
    health: 0,
    learning: 0,
    other: 0
  };

  tasks.forEach(task => {
    if (task.status === 'completed' && task.category) {
      categoryBreakdown[task.category] = (categoryBreakdown[task.category] || 0) + (task.actualDuration || 0);
    }
  });

  const productivityScore = tasksPlanned > 0 
    ? Math.round((tasksCompleted / tasksPlanned) * 100)
    : 0;

  await Productivity.findOneAndUpdate(
    { userId, date: { $gte: dateStart, $lte: dateEnd } },
    {
      userId,
      date: dateStart,
      tasksPlanned,
      tasksCompleted,
      totalWorkTime,
      productivityScore,
      categoryBreakdown
    },
    { upsert: true, new: true }
  );
}

module.exports = router;

