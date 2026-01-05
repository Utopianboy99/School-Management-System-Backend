// =============================================
// src/routes/attendanceRoutes.js
// =============================================

const express = require('express');
const router = express.Router();
const AttendanceController = require('../controllers/attendanceController');
const authenticate = require('../middleware/authenticate');
const { requireTeacher, requireAdmin } = require('../middleware/authorize');

/**
 * @route   POST /api/attendance/class/:classId
 * @desc    Mark attendance for entire class
 * @access  Teacher, Admin
 */
router.post(
  '/class/:classId',
  authenticate,
  requireTeacher,
  AttendanceController.markClassAttendance
);

/**
 * @route   GET /api/attendance/class/:classId
 * @desc    Get class attendance for specific date
 * @access  Teacher, Admin
 */
router.get(
  '/class/:classId',
  authenticate,
  requireTeacher,
  AttendanceController.getClassAttendance
);

/**
 * @route   GET /api/attendance/class/:classId/report
 * @desc    Get attendance report for date range
 * @access  Teacher, Admin
 */
router.get(
  '/class/:classId/report',
  authenticate,
  requireTeacher,
  AttendanceController.getClassReport
);

/**
 * @route   GET /api/attendance/student/:studentId
 * @desc    Get student attendance for date range
 * @access  Teacher, Admin, Parent (if their child)
 */
router.get(
  '/student/:studentId',
  authenticate,
  requireTeacher, // TODO: Add parent access control
  AttendanceController.getStudentAttendance
);

/**
 * @route   PUT /api/attendance/:id
 * @desc    Update single attendance record
 * @access  Teacher, Admin
 */
router.put(
  '/:id',
  authenticate,
  requireTeacher,
  AttendanceController.updateAttendance
);

/**
 * @route   GET /api/attendance/dashboard
 * @desc    Get attendance dashboard summary
 * @access  Admin
 */
router.get(
  '/dashboard',
  authenticate,
  requireAdmin,
  AttendanceController.getDashboard
);

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why different endpoints for different queries?
 * A: SPECIALIZED OPERATIONS
 * 
 *    Each endpoint serves a specific use case:
 *    
 *    POST /class/:id - Teacher's daily task
 *    GET /class/:id - View today's attendance
 *    GET /class/:id/report - Generate term report
 *    GET /student/:id - Parent portal / student view
 *    GET /dashboard - Admin overview
 *    
 *    Could combine into one "GET /attendance" with many query params,
 *    but specialized endpoints are:
 *    - More clear (intent obvious)
 *    - Easier to secure (different permissions)
 *    - Better documentation
 *    - Can optimize each query differently
 * 
 * Q: How would parent access work?
 * A: ADDITIONAL AUTHORIZATION LAYER
 * 
 *    Current: requireTeacher (allows teachers and admins)
 *    
 *    Enhanced:
 *    ```javascript
 *    const allowParentAccess = async (req, res, next) => {
 *      const { studentId } = req.params;
 *      
 *      if (req.user.role === 'parent') {
 *        // Check if this parent is linked to this student
 *        const relationship = await ParentStudent.findOne({
 *          parentId: req.user.parentId, // Assuming user has parentId
 *          studentId: studentId
 *        });
 *        
 *        if (!relationship) {
 *          return res.status(403).json({
 *            success: false,
 *            error: 'Not authorized to view this student'
 *          });
 *        }
 *      }
 *      
 *      next();
 *    };
 *    
 *    router.get(
 *      '/student/:studentId',
 *      authenticate,
 *      allowParentAccess,
 *      AttendanceController.getStudentAttendance
 *    );
 *    ```
 */

module.exports = router;