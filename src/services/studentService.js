// =============================================
// src/services/studentService.js
// =============================================

const Student = require('../models/Student');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const AuditLog = require('../models/AuditLog');
const { AUDIT_ACTIONS, ROLES } = require('../config/constants');

/**
 * STUDENT SERVICE
 * 
 * Business logic layer - separated from HTTP layer (controller)
 * 
 * Why separate services?
 * 1. Reusability - Can call from multiple controllers, cron jobs, etc.
 * 2. Testability - Easy to unit test without HTTP mocking
 * 3. Transaction management - Complex multi-model operations
 * 4. Clean architecture - Business logic separate from presentation
 */

class StudentService {
  /**
   * Create a new student
   * 
   * @param {Object} studentData - Student information
   * @param {Object} createdBy - User who created this student
   * @returns {Promise<Object>} Created student
   */
  static async createStudent(studentData, createdBy) {
    const { schoolId, userId, ...restData } = studentData;

    // Validate school matches creator's school
    if (schoolId.toString() !== createdBy.schoolId.toString()) {
      throw new Error('Cannot create student in different school');
    }

    // If userId provided, verify user exists and belongs to same school
    if (userId) {
      const user = await User.findOne({
        _id: userId,
        schoolId,
        role: ROLES.STUDENT,
        isActive: true
      });

      if (!user) {
        throw new Error('Invalid user ID or user is not a student');
      }
    }

    // Create student
    const student = await Student.create({
      ...restData,
      schoolId,
      userId: userId || null
    });

    // Audit log
    await AuditLog.log({
      userId: createdBy._id,
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      entity: 'student',
      entityId: student._id,
      schoolId,
      success: true,
      metadata: {
        admissionNumber: student.admissionNumber,
        fullName: student.fullName
      }
    });

    return student;
  }

  /**
   * Get student by ID
   * 
   * @param {String} studentId
   * @param {String} schoolId - For multi-tenant validation
   * @param {Object} requestedBy - User requesting this data
   * @returns {Promise<Object>} Student with enrollment
   */
  static async getStudentById(studentId, schoolId, requestedBy) {
    const student = await Student.findOne({
      _id: studentId,
      schoolId
    })
      .populate('userId', 'email')
      .populate({
        path: 'currentEnrollment',
        populate: { path: 'classId', select: 'name grade academicYear' }
      });

    if (!student) {
      throw new Error('Student not found');
    }

    // Audit log (viewing sensitive data)
    await AuditLog.log({
      userId: requestedBy._id,
      action: AUDIT_ACTIONS.STUDENT_VIEWED,
      entity: 'student',
      entityId: student._id,
      schoolId,
      success: true
    });

    return student;
  }

  /**
   * Get all students for a school
   * 
   * @param {String} schoolId
   * @param {Object} filters - Optional filters (status, grade, etc.)
   * @param {Object} pagination - { page, limit }
   * @returns {Promise<Object>} { students, total, page, pages }
   */
  static async getStudents(schoolId, filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;

    // Build query
    const query = { schoolId };

    if (filters.enrollmentStatus) {
      query.enrollmentStatus = filters.enrollmentStatus;
    }

    if (filters.search) {
      // Search by name or admission number
      const searchRegex = new RegExp(filters.search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { admissionNumber: searchRegex }
      ];
    }

    // Execute query with pagination
    const [students, total] = await Promise.all([
      Student.find(query)
        .populate('userId', 'email')
        .sort('lastName firstName')
        .skip(skip)
        .limit(limit)
        .lean(), // Convert to plain JS objects (faster)
      Student.countDocuments(query)
    ]);

    return {
      students,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * Update student
   * 
   * @param {String} studentId
   * @param {Object} updateData
   * @param {String} schoolId
   * @param {Object} updatedBy
   * @returns {Promise<Object>} Updated student
   */
  static async updateStudent(studentId, updateData, schoolId, updatedBy) {
    // Find existing student
    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      throw new Error('Student not found');
    }

    // Capture state before update (for audit)
    const before = {
      enrollmentStatus: student.enrollmentStatus,
      ...Object.keys(updateData).reduce((acc, key) => {
        acc[key] = student[key];
        return acc;
      }, {})
    };

    // Update fields
    Object.keys(updateData).forEach(key => {
      student[key] = updateData[key];
    });

    await student.save();

    // Audit log with changes
    await AuditLog.log({
      userId: updatedBy._id,
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      entity: 'student',
      entityId: student._id,
      schoolId,
      success: true,
      changes: {
        before,
        after: updateData
      }
    });

    return student;
  }

  /**
   * Delete student (soft delete)
   * 
   * @param {String} studentId
   * @param {String} schoolId
   * @param {Object} deletedBy
   * @returns {Promise<Object>} Deleted student
   */
  static async deleteStudent(studentId, schoolId, deletedBy) {
    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      throw new Error('Student not found');
    }

    // Soft delete: Change status to withdrawn
    student.enrollmentStatus = 'withdrawn';
    await student.save();

    // Also mark any active enrollments as withdrawn
    await Enrollment.updateMany(
      { studentId, status: 'active' },
      { 
        status: 'withdrawn',
        statusChangeDate: new Date(),
        statusChangeReason: 'Student record deleted'
      }
    );

    // Audit log
    await AuditLog.log({
      userId: deletedBy._id,
      action: AUDIT_ACTIONS.STUDENT_DELETED,
      entity: 'student',
      entityId: student._id,
      schoolId,
      success: true
    });

    return student;
  }

  /**
   * Get student's enrollment history
   * 
   * @param {String} studentId
   * @param {String} schoolId
   * @returns {Promise<Array>} Enrollment history
   */
  static async getStudentHistory(studentId, schoolId) {
    // Verify student belongs to school
    const student = await Student.findOne({ _id: studentId, schoolId });
    if (!student) {
      throw new Error('Student not found');
    }

    return await Enrollment.getStudentHistory(studentId);
  }
}

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why is this a class with static methods?
 * A: ORGANIZATION PATTERN
 * 
 *    Alternative: Separate functions
 *    const createStudent = async () => {}
 *    const updateStudent = async () => {}
 *    
 *    Class benefits:
 *    - Namespace (StudentService.createStudent)
 *    - Related methods grouped
 *    - Easy to find all student operations
 *    - Static methods (no instance needed)
 * 
 * Q: Why separate service from controller?
 * A: SEPARATION OF CONCERNS
 * 
 *    Service:
 *    - Business logic
 *    - Database operations
 *    - Complex transactions
 *    - Reusable across routes
 * 
 *    Controller:
 *    - HTTP request/response
 *    - Validation
 *    - Format responses
 *    - Thin layer
 * 
 * Q: Why audit log everything?
 * A: COMPLIANCE & DEBUGGING
 *    - Know who did what and when
 *    - Required for GDPR, FERPA
 *    - Trace bugs ("When did this student's status change?")
 *    - Security ("Who accessed this student's data?")
 * 
 * Q: Why soft delete?
 * A: DATA PRESERVATION
 *    - Hard delete loses history
 *    - Can't answer "Who was in Grade 1 in 2023?"
 *    - Can't generate historical reports
 *    - Soft delete: Mark as withdrawn, keep data
 */

module.exports = StudentService;