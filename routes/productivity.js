const express = require('express');
const Productivity = require('../models/Productivity');
const Task = require('../models/Task');
const auth = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// All routes require authentication
router.use(auth);

// @route   GET /api/productivity
// @desc    Get productivity data for the authenticated user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { userId: req.user._id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = moment(startDate).startOf('day').toDate();
      if (endDate) query.date.$lte = moment(endDate).endOf('day').toDate();
    }

    const productivity = await Productivity.find(query)
      .sort({ date: -1 })
      .limit(100);

    res.json(productivity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/productivity/current
// @desc    Get current day productivity data
// @access  Private
router.get('/current', async (req, res) => {
  try {
    const today = moment().startOf('day').toDate();
    const tomorrow = moment().endOf('day').toDate();

    let productivity = await Productivity.findOne({
      userId: req.user._id,
      date: { $gte: today, $lte: tomorrow }
    });

    if (!productivity) {
      // Create default productivity entry for today
      productivity = new Productivity({
        userId: req.user._id,
        date: today,
        tasksCompleted: 0,
        tasksPlanned: 0,
        totalWorkTime: 0,
        productivityScore: 0,
        focusTime: 0,
        breaks: 0,
        categoryBreakdown: {
          work: 0,
          personal: 0,
          health: 0,
          learning: 0,
          other: 0
        }
      });
      await productivity.save();
    }

    res.json(productivity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/productivity/stats
// @desc    Get productivity statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = moment().subtract(parseInt(days), 'days').startOf('day').toDate();

    const productivity = await Productivity.find({
      userId: req.user._id,
      date: { $gte: startDate }
    }).sort({ date: -1 });

    const stats = {
      totalTasksCompleted: productivity.reduce((sum, p) => sum + p.tasksCompleted, 0),
      totalTasksPlanned: productivity.reduce((sum, p) => sum + p.tasksPlanned, 0),
      totalWorkTime: productivity.reduce((sum, p) => sum + p.totalWorkTime, 0),
      averageProductivityScore: productivity.length > 0
        ? productivity.reduce((sum, p) => sum + p.productivityScore, 0) / productivity.length
        : 0,
      averageTasksPerDay: productivity.length > 0
        ? productivity.reduce((sum, p) => sum + p.tasksCompleted, 0) / productivity.length
        : 0,
      categoryBreakdown: {
        work: 0,
        personal: 0,
        health: 0,
        learning: 0,
        other: 0
      },
      dailyData: productivity.map(p => ({
        date: p.date,
        tasksCompleted: p.tasksCompleted,
        tasksPlanned: p.tasksPlanned,
        productivityScore: p.productivityScore,
        totalWorkTime: p.totalWorkTime
      }))
    };

    // Aggregate category breakdown
    productivity.forEach(p => {
      Object.keys(p.categoryBreakdown).forEach(category => {
        stats.categoryBreakdown[category] += p.categoryBreakdown[category] || 0;
      });
    });

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/productivity/:id
// @desc    Update productivity entry
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const productivity = await Productivity.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!productivity) {
      return res.status(404).json({ message: 'Productivity entry not found' });
    }

    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        productivity[key] = req.body[key];
      }
    });

    await productivity.save();
    res.json(productivity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

