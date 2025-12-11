const express = require('express');
const Productivity = require('../models/Productivity');
const Task = require('../models/Task');
const auth = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// All routes require authentication
router.use(auth);

// @route   GET /api/analytics/dashboard
// @desc    Get analytics data for dashboard (Power BI compatible format)
// @access  Private
router.get('/dashboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment().subtract(30, 'days').startOf('day').toDate();
    const end = endDate ? moment(endDate).endOf('day').toDate() : moment().endOf('day').toDate();

    // Get productivity data
    const productivity = await Productivity.find({
      userId: req.user._id,
      date: { $gte: start, $lte: end }
    }).sort({ date: 1 });

    // Get task data
    const tasks = await Task.find({
      userId: req.user._id,
      scheduledDate: { $gte: start, $lte: end }
    });

    // Format data for Power BI
    const dashboardData = {
      dailyProductivity: productivity.map(p => ({
        date: moment(p.date).format('YYYY-MM-DD'),
        tasksCompleted: p.tasksCompleted,
        tasksPlanned: p.tasksPlanned,
        completionRate: p.tasksPlanned > 0 ? (p.tasksCompleted / p.tasksPlanned) * 100 : 0,
        productivityScore: p.productivityScore,
        totalWorkTime: p.totalWorkTime,
        focusTime: p.focusTime,
        breaks: p.breaks
      })),
      taskBreakdown: {
        byStatus: {
          pending: tasks.filter(t => t.status === 'pending').length,
          inProgress: tasks.filter(t => t.status === 'in-progress').length,
          completed: tasks.filter(t => t.status === 'completed').length,
          cancelled: tasks.filter(t => t.status === 'cancelled').length
        },
        byCategory: {
          work: tasks.filter(t => t.category === 'work').length,
          personal: tasks.filter(t => t.category === 'personal').length,
          health: tasks.filter(t => t.category === 'health').length,
          learning: tasks.filter(t => t.category === 'learning').length,
          other: tasks.filter(t => t.category === 'other').length
        },
        byPriority: {
          low: tasks.filter(t => t.priority === 'low').length,
          medium: tasks.filter(t => t.priority === 'medium').length,
          high: tasks.filter(t => t.priority === 'high').length,
          urgent: tasks.filter(t => t.priority === 'urgent').length
        }
      },
      timeAnalysis: {
        totalWorkTime: productivity.reduce((sum, p) => sum + p.totalWorkTime, 0),
        averageWorkTimePerDay: productivity.length > 0
          ? productivity.reduce((sum, p) => sum + p.totalWorkTime, 0) / productivity.length
          : 0,
        totalFocusTime: productivity.reduce((sum, p) => sum + p.focusTime, 0),
        averageFocusTimePerDay: productivity.length > 0
          ? productivity.reduce((sum, p) => sum + p.focusTime, 0) / productivity.length
          : 0
      },
      categoryTimeBreakdown: productivity.reduce((acc, p) => {
        Object.keys(p.categoryBreakdown).forEach(category => {
          if (!acc[category]) acc[category] = 0;
          acc[category] += p.categoryBreakdown[category] || 0;
        });
        return acc;
      }, {}),
      trends: {
        productivityTrend: productivity.map(p => ({
          date: moment(p.date).format('YYYY-MM-DD'),
          score: p.productivityScore
        })),
        completionTrend: productivity.map(p => ({
          date: moment(p.date).format('YYYY-MM-DD'),
          completed: p.tasksCompleted,
          planned: p.tasksPlanned
        }))
      },
      summary: {
        totalDays: productivity.length,
        totalTasksCompleted: productivity.reduce((sum, p) => sum + p.tasksCompleted, 0),
        totalTasksPlanned: productivity.reduce((sum, p) => sum + p.tasksPlanned, 0),
        overallProductivityScore: productivity.length > 0
          ? productivity.reduce((sum, p) => sum + p.productivityScore, 0) / productivity.length
          : 0,
        bestDay: productivity.length > 0
          ? productivity.reduce((best, p) => p.productivityScore > best.productivityScore ? p : best, productivity[0])
          : null
      }
    };

    res.json(dashboardData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/analytics/export
// @desc    Export analytics data in CSV/JSON format for Power BI
// @access  Private
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', startDate, endDate } = req.query;
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment().subtract(90, 'days').startOf('day').toDate();
    const end = endDate ? moment(endDate).endOf('day').toDate() : moment().endOf('day').toDate();

    const productivity = await Productivity.find({
      userId: req.user._id,
      date: { $gte: start, $lte: end }
    }).sort({ date: 1 });

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'Date,Tasks Completed,Tasks Planned,Productivity Score,Total Work Time (min),Focus Time (min),Breaks,Work Time,Personal Time,Health Time,Learning Time,Other Time\n';
      const csvRows = productivity.map(p => {
        const date = moment(p.date).format('YYYY-MM-DD');
        const cat = p.categoryBreakdown;
        return `${date},${p.tasksCompleted},${p.tasksPlanned},${p.productivityScore},${p.totalWorkTime},${p.focusTime},${p.breaks},${cat.work || 0},${cat.personal || 0},${cat.health || 0},${cat.learning || 0},${cat.other || 0}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=productivity_export_${moment().format('YYYY-MM-DD')}.csv`);
      res.send(csvHeader + csvRows);
    } else {
      // JSON format
      res.json({
        exportDate: moment().toISOString(),
        dateRange: {
          start: moment(start).format('YYYY-MM-DD'),
          end: moment(end).format('YYYY-MM-DD')
        },
        data: productivity.map(p => ({
          date: moment(p.date).format('YYYY-MM-DD'),
          tasksCompleted: p.tasksCompleted,
          tasksPlanned: p.tasksPlanned,
          productivityScore: p.productivityScore,
          totalWorkTime: p.totalWorkTime,
          focusTime: p.focusTime,
          breaks: p.breaks,
          categoryBreakdown: p.categoryBreakdown
        }))
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

