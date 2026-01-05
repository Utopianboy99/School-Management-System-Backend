// =============================================
// src/services/attendanceService.js
// =============================================

const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');
const AuditLog = require('../models/AuditLog');
const { AUDIT_ACTIONS } = require('../config/constants');

/**
 * ATTENDANCE SERVICE
 * 
 * Handles complex attendance operations
 * Key features:
 * - Bulk marking for entire classes
 * - Date range queries
 * - Statistical aggregations
 * - Historical reporting
 */

class AttendanceService {
  /**
   * Mark attendance for entire class
   * 
   * This is the MAIN operation teachers perform daily
   * 
   * @param {String} classId
   * @param {Date} date
   * @param {Array} attendanceRecords - [{studentId, status, notes}]
   * @param {Object} recordedBy - User marking attendance
   * @returns {Promise<Object>} Result with count
   */
  static async markClassAttendance(classId, date, attendanceRecords, recordedBy) {
    // Validate class exists and belongs to teacher's school
    const classDoc = await Class.findOne({
      _id: classId,
      schoolId: recordedBy.schoolId
    });

    if (!classDoc) {
      throw new Error('Class not found');
    }

    // Get all active students in class
    const enrollments = await Enrollment.findActiveByClass(classId);
    const enrolledStudentIds = enrollments.map(e => e.studentId.toString());

    // Validate all students in attendance records are enrolled
    const invalidStudents = attendanceRecords.filter(
      record => !enrolledStudentIds.includes(record.studentId.toString())
    );

    if (invalidStudents.length > 0) {
      throw new Error(
        `Students not enrolled in class: ${invalidStudents.map(s => s.studentId).join(', ')}`
      );
    }

    // Mark attendance (uses bulkWrite for efficiency)
    const result = await Attendance.markClassAttendance(
      classId,
      date,
      attendanceRecords,
      recordedBy._id
    );

    // Audit log
    await AuditLog.log({
      userId: recordedBy._id,
      action: AUDIT_ACTIONS.ATTENDANCE_MARKED,
      entity: 'attendance',
      schoolId: recordedBy.schoolId,
      success: true,
      metadata: {
        classId,
        date,
        studentCount: attendanceRecords.length,
        presentCount: attendanceRecords.filter(r => r.status === 'present').length,
        absentCount: attendanceRecords.filter(r => r.status === 'absent').length
      }
    });

    return {
      success: true,
      message: 'Attendance marked successfully',
      studentsMarked: result.upsertedCount + result.modifiedCount
    };
  }

  /**
   * Get attendance for class on specific date
   * 
   * Used by teachers to view daily attendance
   * 
   * @param {String} classId
   * @param {Date} date
   * @param {String} schoolId
   * @returns {Promise<Array>} Attendance records with student info
   */
  static async getClassAttendance(classId, date, schoolId) {
    // Validate class
    const classDoc = await Class.findOne({ _id: classId, schoolId });
    if (!classDoc) {
      throw new Error('Class not found');
    }

    // Get attendance
    const attendance = await Attendance.getClassAttendance(classId, date);

    // If no attendance marked yet, return all enrolled students
    if (attendance.length === 0) {
      const enrollments = await Enrollment.findActiveByClass(classId);
      return enrollments.map(enrollment => ({
        studentId: enrollment.studentId,
        status: null, // Not marked yet
        date: new Date(date)
      }));
    }

    return attendance;
  }

  /**
   * Get student attendance for date range
   * 
   * @param {String} studentId
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {String} schoolId
   * @returns {Promise<Object>} { records, statistics }
   */
  static async getStudentAttendance(studentId, startDate, endDate, schoolId) {
    // Get attendance records
    const records = await Attendance.getStudentAttendance(
      studentId,
      startDate,
      endDate
    );

    // Calculate statistics
    const stats = await Attendance.getAttendanceStats(
      studentId,
      startDate,
      endDate
    );

    return {
      records,
      statistics: stats
    };
  }

  /**
   * Get attendance report for class
   * 
   * Used by admins/teachers for reporting
   * 
   * @param {String} classId
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {String} schoolId
   * @returns {Promise<Array>} Summary by student
   */
  static async getClassAttendanceReport(classId, startDate, endDate, schoolId) {
    // Validate class
    const classDoc = await Class.findOne({ _id: classId, schoolId });
    if (!classDoc) {
      throw new Error('Class not found');
    }

    return await Attendance.getClassAttendanceReport(
      classId,
      startDate,
      endDate
    );
  }

  /**
   * Update single attendance record
   * 
   * Used to correct mistakes
   * 
   * @param {String} attendanceId
   * @param {Object} updates
   * @param {Object} updatedBy
   * @returns {Promise<Object>} Updated attendance
   */
  static async updateAttendance(attendanceId, updates, updatedBy) {
    const attendance = await Attendance.findById(attendanceId);

    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    // Validate school
    const classDoc = await Class.findOne({
      _id: attendance.classId,
      schoolId: updatedBy.schoolId
    });

    if (!classDoc) {
      throw new Error('Unauthorized');
    }

    // Capture before state
    const before = {
      status: attendance.status,
      notes: attendance.notes
    };

    // Update
    Object.keys(updates).forEach(key => {
      if (key !== 'studentId' && key !== 'classId' && key !== 'date') {
        attendance[key] = updates[key];
      }
    });

    await attendance.save();

    // Audit log
    await AuditLog.log({
      userId: updatedBy._id,
      action: AUDIT_ACTIONS.ATTENDANCE_UPDATED,
      entity: 'attendance',
      entityId: attendance._id,
      schoolId: updatedBy.schoolId,
      success: true,
      changes: { before, after: updates }
    });

    return attendance;
  }

  /**
   * Get attendance dashboard summary
   * 
   * For school admin dashboard
   * 
   * @param {String} schoolId
   * @param {Date} date
   * @returns {Promise<Object>} Summary statistics
   */
  static async getAttendanceDashboard(schoolId, date = new Date()) {
    // Get all classes in school
    const classes = await Class.find({
      schoolId,
      isActive: true
    });

    const classIds = classes.map(c => c._id);

    // Get today's attendance across all classes
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const attendanceRecords = await Attendance.find({
      classId: { $in: classIds },
      date: normalizedDate
    });

    // Calculate summary
    const summary = {
      totalClasses: classes.length,
      classesWithAttendance: new Set(
        attendanceRecords.map(r => r.classId.toString())
      ).size,
      totalStudentsMarked: attendanceRecords.length,
      present: attendanceRecords.filter(r => r.status === 'present').length,
      absent: attendanceRecords.filter(r => r.status === 'absent').length,
      late: attendanceRecords.filter(r => r.status === 'late').length,
      excused: attendanceRecords.filter(r => r.status === 'excused').length,
      sick: attendanceRecords.filter(r => r.status === 'sick').length
    };

    summary.attendanceRate = summary.totalStudentsMarked > 0
      ? Math.round((summary.present / summary.totalStudentsMarked) * 100)
      : 0;

    return summary;
  }
}

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why bulk operations for attendance?
 * A: PERFORMANCE CRITICAL
 * 
 *    Scenario: Teacher marking attendance for 30 students
 *    
 *    Bad approach (30 separate requests):
 *    for (const student of students) {
 *      await fetch(`/api/attendance`, {
 *        method: 'POST',
 *        body: JSON.stringify({ studentId: student.id, status: 'present' })
 *      });
 *    }
 *    Time: 30 requests × 50ms = 1.5 seconds
 *    
 *    Good approach (1 bulk request):
 *    await fetch(`/api/attendance/class/${classId}`, {
 *      method: 'POST',
 *      body: JSON.stringify({
 *        date: '2025-01-15',
 *        records: [
 *          { studentId: '1', status: 'present' },
 *          { studentId: '2', status: 'absent' },
 *          // ... 28 more
 *        ]
 *      })
 *    });
 *    Time: 1 request × 100ms = 0.1 seconds
 *    
 *    15x faster! Plus:
 *    - Atomic operation (all or nothing)
 *    - Single audit log entry
 *    - Less server load
 * 
 * Q: Why validate enrolled students?
 * A: DATA INTEGRITY
 * 
 *    Without validation:
 *    - Could mark attendance for wrong student
 *    - Student from Class A marked in Class B
 *    - Data becomes meaningless
 *    
 *    With validation:
 *    - Only enrolled students can be marked
 *    - Catch bugs early
 *    - Reliable reports
 * 
 * Q: Why return empty records if not marked?
 * A: FRONTEND CONVENIENCE
 * 
 *    Teacher opens attendance page
 *    - Without: Empty screen, must manually add each student
 *    - With: Pre-populated list, just click status
 *    
 *    Frontend can:
 *    records.forEach(record => {
 *      if (record.status === null) {
 *        // Show unmarked UI
 *      } else {
 *        // Show marked status
 *      }
 *    });
 */

module.exports = AttendanceService;