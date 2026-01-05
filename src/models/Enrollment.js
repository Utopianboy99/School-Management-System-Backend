// src/models/Enrollment.js
const mongoose = require('mongoose');

/**
 * ENROLLMENT MODEL - THE HEART OF THE SYSTEM
 * 
 * This is a JUNCTION TABLE / ASSOCIATION MODEL
 * Links Students to Classes with metadata
 * 
 * ⭐ CRITICAL UNDERSTANDING ⭐
 * 
 * This is THE MOST IMPORTANT model in the system.
 * 
 * Why Enrollment Exists:
 * 
 * 1. HISTORY PRESERVATION
 *    Without enrollment:
 *    - Can't answer "Which class was John in last year?"
 *    - Can't generate historical reports
 *    - Lose track of student progression
 * 
 *    With enrollment:
 *    - Complete history of every student's classes
 *    - Can query any past academic year
 *    - Audit trail of changes
 * 
 * 2. METADATA STORAGE
 *    Without enrollment:
 *    - Can't track when student joined class
 *    - Can't track why they left (graduated, transferred)
 *    - Can't handle mid-year transfers
 * 
 *    With enrollment:
 *    - Enrollment date
 *    - Status (active, completed, withdrawn, transferred)
 *    - Reason for changes
 * 
 * 3. MANY-TO-MANY RELATIONSHIP
 *    - A student can be in multiple classes (different subjects)
 *    - A class has multiple students
 *    - Junction table is the ONLY correct solution
 * 
 * Real-World Scenarios This Handles:
 * - Student transfers from Class A to Class B mid-year
 * - Student enrolled in multiple subject-specific classes
 * - Historical queries: "Show all students who were in Grade 1 in 2023"
 * - Audit: "When did John move from Class A to Class B?"
 */

const enrollmentSchema = new mongoose.Schema({
  // Student reference
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },

  // Class reference
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },

  // Academic year this enrollment belongs to
  academicYear: {
    type: String,
    required: true,
    index: true
    // Must match the class's academic year
  },

  // Enrollment metadata
  enrollmentDate: {
    type: Date,
    required: true,
    default: Date.now
  },

  // Status tracking - THIS IS CRITICAL
  status: {
    type: String,
    enum: [
      'active',      // Currently enrolled
      'completed',   // Finished the year successfully
      'transferred', // Moved to another class
      'withdrawn',   // Left the school
      'suspended'    // Temporarily not attending
    ],
    default: 'active',
    required: true,
    index: true
  },

  // When status changed
  statusChangeDate: {
    type: Date
  },

  // Why status changed
  statusChangeReason: {
    type: String,
    trim: true
  },

  // If transferred, which class?
  transferredToClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },

  // Academic performance (optional - can be extended)
  finalGrade: {
    type: String
  },

  // Attendance summary (computed periodically)
  attendanceSummary: {
    totalDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 }
  },

  // Notes from teacher
  notes: {
    type: String,
    trim: true
  }

}, {
  timestamps: true
});

/**
 * COMPOUND INDEXES - PERFORMANCE CRITICAL
 * 
 * These indexes are ESSENTIAL for common queries
 */

// Most common query: Find student's current class
enrollmentSchema.index({ studentId: 1, status: 1 });
enrollmentSchema.index({ studentId: 1, academicYear: 1 });

// Find all students in a class
enrollmentSchema.index({ classId: 1, status: 1 });
enrollmentSchema.index({ classId: 1, academicYear: 1 });

// Ensure student can't be in same class twice in same year
// (unless previous enrollment is not active)
enrollmentSchema.index(
  { studentId: 1, classId: 1, academicYear: 1, status: 1 },
  { 
    unique: true,
    partialFilterExpression: { status: 'active' }
    // Partial index: only applies to active enrollments
  }
);

/**
 * VIRTUAL FIELDS
 */
enrollmentSchema.virtual('attendancePercentage').get(function() {
  if (this.attendanceSummary.totalDays === 0) return 0;
  return Math.round(
    (this.attendanceSummary.presentDays / this.attendanceSummary.totalDays) * 100
  );
});

/**
 * INSTANCE METHODS
 */

// Transfer student to another class
enrollmentSchema.methods.transferTo = async function(newClassId, reason) {
  // Mark current enrollment as transferred
  this.status = 'transferred';
  this.transferredToClassId = newClassId;
  this.statusChangeDate = new Date();
  this.statusChangeReason = reason;
  await this.save();

  // Create new enrollment
  const newClass = await mongoose.model('Class').findById(newClassId);
  if (!newClass) {
    throw new Error('Target class not found');
  }

  const newEnrollment = await mongoose.model('Enrollment').create({
    studentId: this.studentId,
    classId: newClassId,
    academicYear: newClass.academicYear,
    enrollmentDate: new Date(),
    status: 'active'
  });

  return newEnrollment;
};

// Complete enrollment (end of year)
enrollmentSchema.methods.complete = async function(finalGrade, notes) {
  this.status = 'completed';
  this.statusChangeDate = new Date();
  this.finalGrade = finalGrade;
  if (notes) this.notes = notes;
  return this.save();
};

// Withdraw student
enrollmentSchema.methods.withdraw = async function(reason) {
  this.status = 'withdrawn';
  this.statusChangeDate = new Date();
  this.statusChangeReason = reason;
  return this.save();
};

/**
 * STATIC METHODS
 */

// Find student's current enrollment
enrollmentSchema.statics.findCurrentByStudent = function(studentId) {
  return this.findOne({ studentId, status: 'active' })
    .populate('classId')
    .populate('studentId');
};

// Find all active students in a class
enrollmentSchema.statics.findActiveByClass = function(classId) {
  return this.find({ classId, status: 'active' })
    .populate('studentId')
    .sort('studentId.lastName studentId.firstName');
};

// Historical query: students in a specific year
enrollmentSchema.statics.findByAcademicYear = function(academicYear, classId) {
  const query = { academicYear };
  if (classId) query.classId = classId;
  return this.find(query)
    .populate('studentId')
    .populate('classId');
};

// Get enrollment history for a student
enrollmentSchema.statics.getStudentHistory = function(studentId) {
  return this.find({ studentId })
    .populate('classId')
    .sort('-academicYear -enrollmentDate');
};

/**
 * MIDDLEWARE
 */

// Validation: Ensure academic year matches class
enrollmentSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('classId')) {
    const classDoc = await mongoose.model('Class').findById(this.classId);
    if (!classDoc) {
      return next(new Error('Class not found'));
    }
    
    // Auto-set academic year from class
    if (!this.academicYear) {
      this.academicYear = classDoc.academicYear;
    }
    
    // Validate it matches
    if (this.academicYear !== classDoc.academicYear) {
      return next(new Error(
        `Academic year mismatch: Enrollment is for ${this.academicYear} but class is for ${classDoc.academicYear}`
      ));
    }
  }
  next();
});

// Update status change date automatically
enrollmentSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isModified('statusChangeDate')) {
    this.statusChangeDate = new Date();
  }
  next();
});

// Audit logging
enrollmentSchema.post('save', function(doc) {
  console.log(`Enrollment ${doc._id} saved: ${doc.status}`);
  // In production, create audit log entry
});

/**
 * EXPLAIN TO STUDENT - DEEP DIVE
 * 
 * Q: Why not just store classId on Student model?
 * A: Let's trace through why that fails:
 * 
 *    SCENARIO 1: Historical queries
 *    - Student.classId = "current-class-id"
 *    - Question: "Which class was student in last year?"
 *    - Answer: Can't tell! We overwrote it.
 * 
 *    SCENARIO 2: Mid-year transfer
 *    - Student moves from Class A to Class B
 *    - We update Student.classId = "class-b-id"
 *    - Question: "When did they transfer? Why?"
 *    - Answer: Can't tell! No metadata.
 * 
 *    SCENARIO 3: Multiple classes
 *    - Student takes Math in Class A, Science in Class B
 *    - Store array? Student.classIds = [classA, classB]?
 *    - Problems: No dates, no per-class metadata, no history
 * 
 *    SOLUTION: Enrollment model
 *    - Each enrollment is a record of student in class at a time
 *    - Complete history preserved
 *    - Metadata attached to each enrollment
 *    - Handles all edge cases
 * 
 * Q: What's a "junction table" in MongoDB?
 * A: In relational databases, it's called a "join table".
 *    In MongoDB, it's just another collection that represents relationships.
 *    
 *    Pattern:
 *    - Collection A (Student) has many of Collection B (Class)
 *    - Collection B (Class) has many of Collection A (Student)
 *    - Junction collection (Enrollment) sits in the middle
 *    - Stores IDs from both sides + metadata
 * 
 * Q: When to use junction tables vs embedding?
 * A: Use junction table when:
 *    - Many-to-many relationship
 *    - Need history
 *    - Need metadata about the relationship
 *    - Either side is queried independently
 *    
 *    Use embedding when:
 *    - One-to-many (and few on "many" side)
 *    - No history needed
 *    - Always accessed together
 *    - Example: Student.address (embedded object)
 * 
 * Q: Performance implications?
 * A: Junction tables require joins (populate in Mongoose).
 *    But they enable efficient queries:
 *    - "Find all students in a class" → query enrollments by classId
 *    - "Find student's class" → query enrollments by studentId
 *    - Both indexed, both fast
 *    
 *    Alternative (embedded) would require scanning entire collection.
 */

module.exports = mongoose.model('Enrollment', enrollmentSchema);