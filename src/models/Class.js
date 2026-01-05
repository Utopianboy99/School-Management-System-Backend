// src/models/Class.js
const mongoose = require('mongoose');

/**
 * CLASS MODEL
 * 
 * Represents a physical class/classroom in a school
 * Examples: "Grade 1 A", "Pre-K Morning", "Grade 5 Science"
 * 
 * Critical Concepts:
 * 1. Class is tied to an academic year
 * 2. Students are linked via Enrollment (not embedded)
 * 3. One teacher per class (simplified - can be extended)
 * 
 * Why Academic Year?
 * - Classes are created each year
 * - Historical tracking of "Grade 1 A in 2024" vs "Grade 1 A in 2025"
 * - Different students each year
 */

const classSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  // Class identification
  name: {
    type: String,
    required: true,
    trim: true
    // Examples: "Grade 1 A", "Pre-K Morning", "Nursery 1"
  },

  grade: {
    type: String,
    required: true,
    trim: true
    // Examples: "Pre-K", "Grade 1", "Grade 2"
  },

  section: {
    type: String,
    trim: true
    // Examples: "A", "B", "Morning", "Afternoon"
  },

  // Academic year this class belongs to
  academicYear: {
    type: String,
    required: true,
    // Format: "2024-2025" or "2025"
    index: true
  },

  // Assigned teacher
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
    index: true
  },

  // Class capacity
  capacity: {
    type: Number,
    min: 1,
    max: 100,
    default: 30
  },

  // Room information
  roomNumber: {
    type: String,
    trim: true
  },

  // Schedule information
  schedule: {
    startTime: String, // "08:00"
    endTime: String,   // "14:00"
    daysOfWeek: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }]
  },

  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }

}, {
  timestamps: true
});

/**
 * COMPOUND INDEXES - CRITICAL FOR PERFORMANCE
 * 
 * Why these indexes?
 * 1. Classes are queried by school + academic year frequently
 * 2. Finding teacher's classes is common
 * 3. Ensuring unique class names per school per year
 */
classSchema.index({ schoolId: 1, academicYear: 1 });
classSchema.index({ schoolId: 1, academicYear: 1, name: 1 }, { unique: true });
classSchema.index({ teacherId: 1, academicYear: 1 });

/**
 * VIRTUAL FIELDS
 */

// Virtual to get enrolled students (via Enrollment model)
classSchema.virtual('enrollments', {
  ref: 'Enrollment',
  localField: '_id',
  foreignField: 'classId'
});

// Virtual for student count
classSchema.virtual('studentCount', {
  ref: 'Enrollment',
  localField: '_id',
  foreignField: 'classId',
  count: true,
  match: { status: 'active' }
});

/**
 * INSTANCE METHODS
 */
classSchema.methods.isFull = async function() {
  const enrollmentCount = await mongoose.model('Enrollment').countDocuments({
    classId: this._id,
    status: 'active'
  });
  return enrollmentCount >= this.capacity;
};

classSchema.methods.getActiveStudents = function() {
  return mongoose.model('Enrollment')
    .find({ classId: this._id, status: 'active' })
    .populate('studentId');
};

/**
 * STATIC METHODS
 */
classSchema.statics.findBySchoolAndYear = function(schoolId, academicYear) {
  return this.find({
    schoolId,
    academicYear,
    isActive: true
  }).populate('teacherId', 'firstName lastName');
};

classSchema.statics.findByTeacher = function(teacherId, academicYear) {
  return this.find({
    teacherId,
    academicYear,
    isActive: true
  });
};

/**
 * MIDDLEWARE
 */

// Validation: Prevent duplicate class names in same year
classSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('name') || this.isModified('academicYear')) {
    const existingClass = await this.constructor.findOne({
      schoolId: this.schoolId,
      academicYear: this.academicYear,
      name: this.name,
      _id: { $ne: this._id } // Exclude current document
    });

    if (existingClass) {
      const error = new Error(`Class "${this.name}" already exists for academic year ${this.academicYear}`);
      return next(error);
    }
  }
  next();
});

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why not embed students array in Class?
 * A: MAJOR ANTI-PATTERN! Here's why:
 * 
 *    BAD APPROACH:
 *    class.students = [studentId1, studentId2, ...]
 * 
 *    Problems:
 *    1. No history: Can't track which students were in class last year
 *    2. No metadata: Can't track enrollment date, status
 *    3. Array limits: MongoDB has 16MB document limit
 *    4. Poor queries: "Find all classes of a student" requires scanning all classes
 *    5. Concurrency: Multiple updates to array can cause conflicts
 * 
 *    CORRECT APPROACH:
 *    Use Enrollment model (junction table)
 *    - Preserves history
 *    - Stores enrollment metadata
 *    - Efficient queries in both directions
 *    - Handles complex scenarios (transfers, withdrawals)
 * 
 * Q: Why academicYear on Class?
 * A: Classes are temporal entities. "Grade 1 A" in 2024 is different from 2025.
 *    This allows:
 *    - Historical reporting
 *    - Year-over-year comparisons
 *    - Preserving old data when creating new classes
 * 
 * Q: Why teacherId instead of embedding teacher?
 * A: References are appropriate when:
 *    - Related entity is used elsewhere (teacher has their own profile)
 *    - Entity can change (teacher can be reassigned)
 *    - Avoid data duplication
 */

module.exports = mongoose.model('Class', classSchema);