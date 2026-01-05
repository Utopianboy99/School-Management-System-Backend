// =============================================
// src/routes/studentRoutes.js
// =============================================

const express = require('express');
const router = express.Router();
const StudentController = require('../controllers/studentController');
const authenticate = require('../middleware/authenticate');
const { requireAdmin, requireTeacher } = require('../middleware/authorize');
const validateSchool = require('../middleware/validateSchool');

/**
 * STUDENT ROUTES
 * 
 * All routes protected by:
 * 1. authenticate - Verify user is logged in
 * 2. authorize - Check role permissions
 * 3. validateSchool - Ensure school isolation
 * 
 * Route Design:
 * - RESTful conventions
 * - Consistent URL structure
 * - Appropriate HTTP methods
 */

/**
 * @route   POST /api/students
 * @desc    Create new student
 * @access  Admin, Teacher
 */
router.post(
  '/',
  authenticate,
  requireTeacher, // Teachers and admins can create
  StudentController.createStudent
);

/**
 * @route   GET /api/students
 * @desc    Get all students (with filters and pagination)
 * @access  Admin, Teacher
 * @query   ?page=1&limit=50&status=active&search=John
 */
router.get(
  '/',
  authenticate,
  requireTeacher,
  StudentController.getStudents
);

/**
 * @route   GET /api/students/:id
 * @desc    Get single student
 * @access  Admin, Teacher, Parent (if their child)
 */
router.get(
  '/:id',
  authenticate,
  requireTeacher, // In production, add logic for parents to view their children
  validateSchool(),
  StudentController.getStudent
);

/**
 * @route   PUT /api/students/:id
 * @desc    Update student
 * @access  Admin, Teacher
 */
router.put(
  '/:id',
  authenticate,
  requireTeacher,
  validateSchool(),
  StudentController.updateStudent
);

/**
 * @route   DELETE /api/students/:id
 * @desc    Delete student (soft delete)
 * @access  Admin only
 */
router.delete(
  '/:id',
  authenticate,
  requireAdmin, // Only admins can delete
  validateSchool(),
  StudentController.deleteStudent
);

/**
 * @route   GET /api/students/:id/history
 * @desc    Get student's enrollment history
 * @access  Admin, Teacher
 */
router.get(
  '/:id/history',
  authenticate,
  requireTeacher,
  validateSchool(),
  StudentController.getStudentHistory
);

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why this middleware order?
 * A: LOGICAL FLOW
 * 
 *    1. authenticate - "Who are you?"
 *       Must run first - other middleware need req.user
 * 
 *    2. authorize - "What can you do?"
 *       Needs req.user from authenticate
 * 
 *    3. validateSchool - "Which school?"
 *       Needs req.user.schoolId from authenticate
 * 
 *    4. controller - Business logic
 *       Knows user is authenticated, authorized, and in right school
 * 
 * Q: Why different permissions per route?
 * A: FINE-GRAINED ACCESS CONTROL
 * 
 *    Teachers can:
 *    - Create students ✓
 *    - View students ✓
 *    - Update students ✓
 *    - Delete students ✗
 * 
 *    Admins can:
 *    - Everything ✓
 * 
 *    Design principle: Least privilege
 *    Give minimum permissions needed for job
 * 
 * Q: Why RESTful design?
 * A: INDUSTRY STANDARD
 * 
 *    Predictable:
 *    POST /students - Create
 *    GET /students - List
 *    GET /students/:id - Get one
 *    PUT /students/:id - Update
 *    DELETE /students/:id - Delete
 * 
 *    Benefits:
 *    - Developers know what to expect
 *    - Tools can auto-generate docs
 *    - Follows HTTP semantics
 *    - Cacheable (GET requests)
 */

module.exports = router;