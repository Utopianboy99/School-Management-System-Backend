// =============================================
// src/controllers/studentController.js
// =============================================

const StudentService = require('../services/studentService');
const { ROLES } = require('../config/constants');

/**
 * STUDENT CONTROLLER
 * 
 * Thin layer that:
 * 1. Validates request
 * 2. Calls service
 * 3. Formats response
 * 4. Handles errors
 * 
 * No business logic here!
 */

class StudentController {
  /**
   * Create student
   * POST /api/students
   */
  static async createStudent(req, res, next) {
    try {
      const studentData = {
        ...req.body,
        schoolId: req.user.schoolId // Force user's school
      };

      const student = await StudentService.createStudent(
        studentData,
        req.user
      );

      return res.status(201).json({
        success: true,
        message: 'Student created successfully',
        data: student
      });
    } catch (error) {
      next(error); // Pass to error handler
    }
  }

  /**
   * Get single student
   * GET /api/students/:id
   */
  static async getStudent(req, res, next) {
    try {
      const student = await StudentService.getStudentById(
        req.params.id,
        req.user.schoolId,
        req.user
      );

      return res.json({
        success: true,
        data: student
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all students with filters
   * GET /api/students
   * Query params: page, limit, status, search
   */
  static async getStudents(req, res, next) {
    try {
      const { page, limit, status, search } = req.query;

      const result = await StudentService.getStudents(
        req.user.schoolId,
        { enrollmentStatus: status, search },
        { page, limit }
      );

      return res.json({
        success: true,
        data: result.students,
        pagination: {
          page: result.page,
          limit: parseInt(limit) || 50,
          total: result.total,
          pages: result.pages
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update student
   * PUT /api/students/:id
   */
  static async updateStudent(req, res, next) {
    try {
      // Don't allow changing schoolId
      delete req.body.schoolId;

      const student = await StudentService.updateStudent(
        req.params.id,
        req.body,
        req.user.schoolId,
        req.user
      );

      return res.json({
        success: true,
        message: 'Student updated successfully',
        data: student
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete student (soft delete)
   * DELETE /api/students/:id
   */
  static async deleteStudent(req, res, next) {
    try {
      const student = await StudentService.deleteStudent(
        req.params.id,
        req.user.schoolId,
        req.user
      );

      return res.json({
        success: true,
        message: 'Student deleted successfully',
        data: student
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get student's enrollment history
   * GET /api/students/:id/history
   */
  static async getStudentHistory(req, res, next) {
    try {
      const history = await StudentService.getStudentHistory(
        req.params.id,
        req.user.schoolId
      );

      return res.json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
  }
}

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why are controllers so thin?
 * A: SINGLE RESPONSIBILITY
 * 
 *    Controller responsibility: HTTP layer
 *    - Extract data from request
 *    - Call appropriate service
 *    - Format successful response
 *    - Pass errors to error handler
 * 
 *    NOT controller responsibility:
 *    - Business logic
 *    - Database queries
 *    - Complex calculations
 *    - Audit logging
 * 
 * Q: Why use next(error)?
 * A: CENTRALIZED ERROR HANDLING
 * 
 *    Without:
 *    try { ... }
 *    catch (error) {
 *      if (error.name === 'ValidationError') { ... }
 *      else if (error.code === 11000) { ... }
 *      else { ... }
 *    }
 *    // Repeated in every controller!
 * 
 *    With:
 *    catch (error) { next(error); }
 *    // Error handler middleware does the rest
 * 
 * Q: Why force req.user.schoolId?
 * A: SECURITY - NEVER TRUST CLIENT
 * 
 *    Even though we have validateSchool middleware,
 *    defense in depth: Always use authenticated user's school
 *    
 *    Client could send: { schoolId: 'evil-school-id' }
 *    We ignore it and use: req.user.schoolId
 */

module.exports = StudentController;