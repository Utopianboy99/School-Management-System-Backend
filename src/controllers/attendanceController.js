// =============================================
// src/controllers/attendanceController.js
// =============================================

const AttendanceService = require('../services/attendanceService');

class AttendanceController {
  /**
   * Mark class attendance
   * POST /api/attendance/class/:classId
   */
  static async markClassAttendance(req, res, next) {
    try {
      const { classId } = req.params;
      const { date, records } = req.body;

      // Validate input
      if (!date || !records || !Array.isArray(records)) {
        return res.status(400).json({
          success: false,
          error: 'Date and records array are required'
        });
      }

      if (records.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Records array cannot be empty'
        });
      }

      const result = await AttendanceService.markClassAttendance(
        classId,
        date,
        records,
        req.user
      );

      return res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get class attendance for date
   * GET /api/attendance/class/:classId?date=2025-01-15
   */
  static async getClassAttendance(req, res, next) {
    try {
      const { classId } = req.params;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Date is required'
        });
      }

      const attendance = await AttendanceService.getClassAttendance(
        classId,
        date,
        req.user.schoolId
      );

      return res.json({
        success: true,
        data: attendance
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get student attendance
   * GET /api/attendance/student/:studentId?startDate=2025-01-01&endDate=2025-01-31
   */
  static async getStudentAttendance(req, res, next) {
    try {
      const { studentId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required'
        });
      }

      const result = await AttendanceService.getStudentAttendance(
        studentId,
        startDate,
        endDate,
        req.user.schoolId
      );

      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get class attendance report
   * GET /api/attendance/class/:classId/report?startDate=2025-01-01&endDate=2025-01-31
   */
  static async getClassReport(req, res, next) {
    try {
      const { classId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required'
        });
      }

      const report = await AttendanceService.getClassAttendanceReport(
        classId,
        startDate,
        endDate,
        req.user.schoolId
      );

      return res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update attendance record
   * PUT /api/attendance/:id
   */
  static async updateAttendance(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const attendance = await AttendanceService.updateAttendance(
        id,
        updates,
        req.user
      );

      return res.json({
        success: true,
        message: 'Attendance updated successfully',
        data: attendance
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get dashboard summary
   * GET /api/attendance/dashboard?date=2025-01-15
   */
  static async getDashboard(req, res, next) {
    try {
      const { date } = req.query;

      const summary = await AttendanceService.getAttendanceDashboard(
        req.user.schoolId,
        date ? new Date(date) : undefined
      );

      return res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AttendanceController;
