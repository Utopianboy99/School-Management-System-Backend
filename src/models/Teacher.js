// src/models/Teacher.js
const mongoose = require('mongoose');

/**
 * TEACHER MODEL
 * 
 * Critical Design Decisions:
 * 1. Teachers MUST have user accounts (userId required)
 * 2. No classes array stored here (anti-pattern!)
 * 3. Classes are linked via Class model (teacherId field)
 * 
 * Why not store classes on teacher?
 * - Classes change every academic year
 * - Historical tracking becomes messy
 * - Querying "all teachers of a class" becomes harder
 * - Violates single source of truth
 */

const teacherSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  // Personal information
  firstName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  lastName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  // Professional information
  employeeId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },

  dateOfJoining: {
    type: Date,
    required: true,
    default: Date.now
  },

  // Subject specialization
  subjects: [{
    type: String,
    trim: true
  }],

  // Qualifications
  qualifications: [{
    degree: String,
    institution: String,
    year: Number
  }],

  // Employment status
  employmentStatus: {
    type: String,
    enum: ['active', 'on-leave', 'resigned', 'terminated'],
    default: 'active',
    index: true
  },

  // Contact information
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },

  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },

  // Emergency contact
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  }

}, {
  timestamps: true
});

/**
 * COMPOUND INDEXES
 */
teacherSchema.index({ schoolId: 1, employeeId: 1 }, { unique: true });
teacherSchema.index({ schoolId: 1, employmentStatus: 1 });

/**
 * VIRTUAL FIELDS
 */
teacherSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual to get assigned classes (from Class model)
teacherSchema.virtual('assignedClasses', {
  ref: 'Class',
  localField: '_id',
  foreignField: 'teacherId'
});

/**
 * INSTANCE METHODS
 */
teacherSchema.methods.isActive = function() {
  return this.employmentStatus === 'active';
};

/**
 * STATIC METHODS
 */
teacherSchema.statics.findActiveBySchool = function(schoolId) {
  return this.find({
    schoolId,
    employmentStatus: 'active'
  }).populate('userId', 'email');
};

teacherSchema.statics.findBySubject = function(schoolId, subject) {
  return this.find({
    schoolId,
    employmentStatus: 'active',
    subjects: subject
  });
};

/**
 * MIDDLEWARE
 */
teacherSchema.pre('save', function(next) {
  if (this.isModified('employeeId')) {
    this.employeeId = this.employeeId.toUpperCase();
  }
  next();
});

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why not store classes array here?
 * A: CRITICAL ANTI-PATTERN to avoid!
 *    
 *    BAD: teacher.classes = [classId1, classId2]
 *    
 *    Problems:
 *    - Duplicate data (class also stores teacherId)
 *    - Sync issues (which is source of truth?)
 *    - Historical tracking (teacher changes classes yearly)
 *    - Query complexity (find all teachers of a class?)
 *    
 *    GOOD: Store teacherId on Class model
 *    - Single source of truth
 *    - Easy historical queries
 *    - Use virtuals or populate for convenience
 * 
 * Q: Why separate subjects array?
 * A: Teachers can teach multiple subjects.
 *    Embedded array is appropriate here because:
 *    - Small dataset (few subjects per teacher)
 *    - Queried together
 *    - No need for separate collection
 */

module.exports = mongoose.model('Teacher', teacherSchema);