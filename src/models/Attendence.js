// src/models/Attendance.js
const mongoose = require('mongoose');

/**
 * ATTENDANCE MODEL
 * 
 * Records daily attendance for each student
 * 
 * Critical Design Decisions:
 * 1. One document per student per day
 * 2. Separate collection (not embedded in student/enrollment)
 * 3. Denormalized classId for efficient queries
 * 
 * Why separate collection?
 * - Attendance is time-series data (grows continuously)
 * - Queried by date ranges frequently
 * - Would bloat student/enrollment documents
 * - Enables efficient aggregations
 * 
 * Why store classId?
 * - Denormalization for performance
 * - Common query: "Show attendance for class on date"
 * - Without classId: Must query enrollments first
 * - Trade-off: slight redundancy for major speed gain
 */

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },

  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },

  // The date of attendance
  date: {
    type: Date,
    required: true,
    index: true
    // Stored as start of day (midnight) for consistency
  },

  // Attendance status
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'excused', 'sick'],
    required: true,
    default: 'present'
  },

  // Time student arrived (for late arrivals)
  arrivalTime: {
    type: String // Format: "09:15"
  },

  // Notes from teacher
  notes: {
    type: String,
    trim: true
  },

  // Who recorded this attendance
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Academic year (denormalized for efficient queries)
  academicYear: {
    type: String,
    required: true,
    index: true
  }

}, {
  timestamps: true
});

/**
 * COMPOUND INDEXES - CRITICAL FOR PERFORMANCE
 * 
 * Attendance queries are DATE-HEAVY and STUDENT-HEAVY
 */

// Ensure one attendance record per student per day
attendanceSchema.index(
  { studentId: 1, date: 1 },
  { unique: true }
);

// Common query: "Show class attendance for date"
attendanceSchema.index({ classId: 1, date: 1 });

// Common query: "Show student attendance for date range"
attendanceSchema.index({ studentId: 1, date: 1, status: 1 });

// Reporting query: "Attendance summary for academic year"
attendanceSchema.index({ academicYear: 1, classId: 1, date: 1 });

/**
 * STATIC METHODS
 */

// Mark attendance for entire class
attendanceSchema.statics.markClassAttendance = async function(classId, date, attendanceRecords, recordedBy) {
  /**
   * attendanceRecords format:
   * [
   *   { studentId: '...', status: 'present' },
   *   { studentId: '...', status: 'absent', notes: 'Sick' },
   *   ...
   * ]
   */
  
  // Get class to extract academic year
  const classDoc = await mongoose.model('Class').findById(classId);
  if (!classDoc) {
    throw new Error('Class not found');
  }

  // Normalize date to start of day
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  const operations = attendanceRecords.map(record => ({
    updateOne: {
      filter: {
        studentId: record.studentId,
        date: normalizedDate
      },
      update: {
        $set: {
          classId,
          status: record.status,
          notes: record.notes || '',
          recordedBy,
          academicYear: classDoc.academicYear,
          arrivalTime: record.arrivalTime || null
        }
      },
      upsert: true // Create if doesn't exist
    }
  }));

  return this.bulkWrite(operations);
};

// Get attendance for class on specific date
attendanceSchema.statics.getClassAttendance = function(classId, date) {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  return this.find({
    classId,
    date: normalizedDate
  }).populate('studentId', 'firstName lastName admissionNumber');
};

// Get student attendance for date range
attendanceSchema.statics.getStudentAttendance = function(studentId, startDate, endDate) {
  return this.find({
    studentId,
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort('date');
};

// Calculate attendance statistics
attendanceSchema.statics.getAttendanceStats = async function(studentId, startDate, endDate) {
  const records = await this.find({
    studentId,
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  });

  const stats = {
    totalDays: records.length,
    presentDays: 0,
    absentDays: 0,
    lateDays: 0,
    excusedDays: 0,
    sickDays: 0
  };

  records.forEach(record => {
    switch (record.status) {
      case 'present': stats.presentDays++; break;
      case 'absent': stats.absentDays++; break;
      case 'late': stats.lateDays++; break;
      case 'excused': stats.excusedDays++; break;
      case 'sick': stats.sickDays++; break;
    }
  });

  stats.attendancePercentage = stats.totalDays > 0
    ? Math.round((stats.presentDays / stats.totalDays) * 100)
    : 0;

  return stats;
};

// Get class attendance summary for a date range
attendanceSchema.statics.getClassAttendanceReport = async function(classId, startDate, endDate) {
  const result = await this.aggregate([
    {
      $match: {
        classId: new mongoose.Types.ObjectId(classId),
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: '$studentId',
        totalDays: { $sum: 1 },
        presentDays: {
          $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
        },
        absentDays: {
          $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
        },
        lateDays: {
          $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] }
        }
      }
    },
    {
      $lookup: {
        from: 'students',
        localField: '_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    {
      $unwind: '$student'
    },
    {
      $project: {
        studentId: '$_id',
        firstName: '$student.firstName',
        lastName: '$student.lastName',
        admissionNumber: '$student.admissionNumber',
        totalDays: 1,
        presentDays: 1,
        absentDays: 1,
        lateDays: 1,
        attendancePercentage: {
          $multiply: [
            { $divide: ['$presentDays', '$totalDays'] },
            100
          ]
        }
      }
    },
    {
      $sort: { lastName: 1, firstName: 1 }
    }
  ]);

  return result;
};

/**
 * MIDDLEWARE
 */

// Normalize date to start of day before saving
attendanceSchema.pre('save', function(next) {
  if (this.isModified('date')) {
    const normalized = new Date(this.date);
    normalized.setHours(0, 0, 0, 0);
    this.date = normalized;
  }
  next();
});

// Fetch and set academic year if not provided
attendanceSchema.pre('save', async function(next) {
  if (this.isNew && !this.academicYear) {
    const classDoc = await mongoose.model('Class').findById(this.classId);
    if (classDoc) {
      this.academicYear = classDoc.academicYear;
    }
  }
  next();
});

/**
 * EXPLAIN TO STUDENT
 * 
 * Q: Why separate Attendance collection instead of embedded array in Student?
 * A: Embedding would be a DISASTER:
 * 
 *    BAD: Student.attendance = [{ date, status }, ...]
 *    
 *    Problems:
 *    1. Unbounded growth: Array grows forever (180+ days per year)
 *    2. Document size: Would hit MongoDB's 16MB limit
 *    3. Query performance: Can't index array elements efficiently
 *    4. Aggregations: Can't calculate class-wide statistics easily
 * 
 *    GOOD: Separate Attendance collection
 *    - Each record is independent
 *    - Efficient indexes on date, student, class
 *    - Powerful aggregation queries
 *    - Time-series optimizations possible
 * 
 * Q: Why denormalize classId in Attendance?
 * A: PERFORMANCE TRADE-OFF:
 * 
 *    Without classId:
 *    - Query: "Show attendance for class on date X"
 *    - Steps: 
 *      1. Query Enrollment to get studentIds in class
 *      2. Query Attendance with those studentIds + date
 *    - 2 database queries!
 * 
 *    With classId (denormalized):
 *    - Query: "Show attendance for class on date X"
 *    - Steps:
 *      1. Query Attendance directly by classId + date
 *    - 1 database query!
 * 
 *    Trade-off:
 *    - Pros: Faster queries (critical for daily operations)
 *    - Cons: Slight data redundancy (worth it for this use case)
 * 
 * Q: Why normalize date to start of day?
 * A: CONSISTENCY:
 *    - Without: Same day could be stored as multiple timestamps
 *      "2025-01-15 08:30:00", "2025-01-15 14:22:13"
 *    - With: Always "2025-01-15 00:00:00"
 *    - Makes uniqueness constraint work
 *    - Makes date range queries accurate
 * 
 * Q: Why bulkWrite for marking class attendance?
 * A: EFFICIENCY:
 *    - Marking attendance for 30 students
 *    - Without bulk: 30 separate database operations
 *    - With bulk: 1 database round trip with 30 operations
 *    - Network latency is expensive!
 */

module.exports = mongoose.model('Attendance', attendanceSchema);