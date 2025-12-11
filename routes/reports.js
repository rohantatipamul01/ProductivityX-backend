const express = require('express');
const PDFDocument = require('pdfkit');
const Productivity = require('../models/Productivity');
const Task = require('../models/Task');
const User = require('../models/User');
const auth = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// All routes require authentication
router.use(auth);

// @route   GET /api/reports/pdf
// @desc    Generate and download productivity report as PDF
// @access  Private
router.get('/pdf', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment().subtract(30, 'days').startOf('day').toDate();
    const end = endDate ? moment(endDate).endOf('day').toDate() : moment().endOf('day').toDate();

    // Get user data
    const user = await User.findById(req.user._id);

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

    // Calculate summary statistics
    const totalTasksCompleted = productivity.reduce((sum, p) => sum + p.tasksCompleted, 0);
    const totalTasksPlanned = productivity.reduce((sum, p) => sum + p.tasksPlanned, 0);
    const totalWorkTime = productivity.reduce((sum, p) => sum + p.totalWorkTime, 0);
    const averageProductivityScore = productivity.length > 0
      ? productivity.reduce((sum, p) => sum + p.productivityScore, 0) / productivity.length
      : 0;

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ProductivityX_Report_${moment().format('YYYY-MM-DD')}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add title
    doc.fontSize(24).text('ProductivityX Report', { align: 'center' });
    doc.moveDown();

    // Add user information
    doc.fontSize(14).text(`Generated for: ${user.name}`, { align: 'left' });
    doc.text(`Email: ${user.email}`, { align: 'left' });
    doc.text(`Report Period: ${moment(start).format('MMMM DD, YYYY')} - ${moment(end).format('MMMM DD, YYYY')}`, { align: 'left' });
    doc.text(`Generated on: ${moment().format('MMMM DD, YYYY [at] h:mm A')}`, { align: 'left' });
    doc.moveDown(2);

    // Add summary section
    doc.fontSize(18).text('Summary Statistics', { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Total Tasks Planned: ${totalTasksPlanned}`, { indent: 20 });
    doc.text(`Total Tasks Completed: ${totalTasksCompleted}`, { indent: 20 });
    doc.text(`Completion Rate: ${totalTasksPlanned > 0 ? ((totalTasksCompleted / totalTasksPlanned) * 100).toFixed(1) : 0}%`, { indent: 20 });
    doc.text(`Total Work Time: ${Math.round(totalWorkTime / 60)} hours ${totalWorkTime % 60} minutes`, { indent: 20 });
    doc.text(`Average Productivity Score: ${averageProductivityScore.toFixed(1)}%`, { indent: 20 });
    doc.moveDown(2);

    // Add daily breakdown
    doc.fontSize(18).text('Daily Productivity Breakdown', { underline: true });
    doc.moveDown();

    if (productivity.length > 0) {
      doc.fontSize(10);
      let yPosition = doc.y;
      
      // Table header
      doc.text('Date', 50, yPosition);
      doc.text('Planned', 150, yPosition);
      doc.text('Completed', 220, yPosition);
      doc.text('Score', 290, yPosition);
      doc.text('Work Time', 350, yPosition);
      
      yPosition += 20;
      doc.moveTo(50, yPosition).lineTo(500, yPosition).stroke();
      yPosition += 10;

      // Table rows
      productivity.forEach((p, index) => {
        if (yPosition > 700) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.text(moment(p.date).format('MMM DD'), 50, yPosition);
        doc.text(p.tasksPlanned.toString(), 150, yPosition);
        doc.text(p.tasksCompleted.toString(), 220, yPosition);
        doc.text(`${p.productivityScore}%`, 290, yPosition);
        doc.text(`${Math.round(p.totalWorkTime / 60)}h ${p.totalWorkTime % 60}m`, 350, yPosition);
        
        yPosition += 20;
      });
    } else {
      doc.text('No productivity data available for the selected period.', { indent: 20 });
    }

    doc.moveDown(2);

    // Add task breakdown by category
    doc.fontSize(18).text('Task Breakdown by Category', { underline: true });
    doc.moveDown();
    doc.fontSize(12);

    const categoryCounts = {
      work: tasks.filter(t => t.category === 'work').length,
      personal: tasks.filter(t => t.category === 'personal').length,
      health: tasks.filter(t => t.category === 'health').length,
      learning: tasks.filter(t => t.category === 'learning').length,
      other: tasks.filter(t => t.category === 'other').length
    };

    Object.keys(categoryCounts).forEach(category => {
      doc.text(`${category.charAt(0).toUpperCase() + category.slice(1)}: ${categoryCounts[category]} tasks`, { indent: 20 });
    });

    doc.moveDown(2);

    // Add task breakdown by status
    doc.fontSize(18).text('Task Breakdown by Status', { underline: true });
    doc.moveDown();
    doc.fontSize(12);

    const statusCounts = {
      pending: tasks.filter(t => t.status === 'pending').length,
      'in-progress': tasks.filter(t => t.status === 'in-progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length
    };

    Object.keys(statusCounts).forEach(status => {
      const statusLabel = status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);
      doc.text(`${statusLabel}: ${statusCounts[status]} tasks`, { indent: 20 });
    });

    doc.moveDown(2);

    // Add footer
    doc.fontSize(10)
       .text('This report was generated by ProductivityX - Your Personal Productivity Management System', 
             50, doc.page.height - 50, { align: 'center' });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error generating PDF report', error: error.message });
  }
});

// @route   GET /api/reports/summary
// @desc    Get report summary data (for preview before PDF generation)
// @access  Private
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment().subtract(30, 'days').startOf('day').toDate();
    const end = endDate ? moment(endDate).endOf('day').toDate() : moment().endOf('day').toDate();

    const productivity = await Productivity.find({
      userId: req.user._id,
      date: { $gte: start, $lte: end }
    }).sort({ date: 1 });

    const tasks = await Task.find({
      userId: req.user._id,
      scheduledDate: { $gte: start, $lte: end }
    });

    const summary = {
      dateRange: {
        start: moment(start).format('YYYY-MM-DD'),
        end: moment(end).format('YYYY-MM-DD')
      },
      totalTasksPlanned: productivity.reduce((sum, p) => sum + p.tasksPlanned, 0),
      totalTasksCompleted: productivity.reduce((sum, p) => sum + p.tasksCompleted, 0),
      completionRate: productivity.reduce((sum, p) => sum + p.tasksPlanned, 0) > 0
        ? (productivity.reduce((sum, p) => sum + p.tasksCompleted, 0) / productivity.reduce((sum, p) => sum + p.tasksPlanned, 0)) * 100
        : 0,
      totalWorkTime: productivity.reduce((sum, p) => sum + p.totalWorkTime, 0),
      averageProductivityScore: productivity.length > 0
        ? productivity.reduce((sum, p) => sum + p.productivityScore, 0) / productivity.length
        : 0,
      categoryBreakdown: {
        work: tasks.filter(t => t.category === 'work').length,
        personal: tasks.filter(t => t.category === 'personal').length,
        health: tasks.filter(t => t.category === 'health').length,
        learning: tasks.filter(t => t.category === 'learning').length,
        other: tasks.filter(t => t.category === 'other').length
      },
      statusBreakdown: {
        pending: tasks.filter(t => t.status === 'pending').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        cancelled: tasks.filter(t => t.status === 'cancelled').length
      }
    };

    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

