// src/models/Parent.js

const mongoose = require('mongoose');

/**
 * PARENT MODEL
 * 
 * KEY DESIGN: Parents are linked to Students via a SEPARATE junction table (ParentStudent)
 * 
 * Why not store student references directly in Parent?
 * 
 * 1. Many-to-Many Relationship:
 *    - One parent can have multiple children
 *    - One child can have multiple parents/guardians
 *    - Direct embedding would duplicate data
 * 
 * 2. Relationship Metadata:
 *    - Need to store WHO is the primary guardian
 *    - Need to store WHAT is the relationship (father, mother, guardian, grandparent)
 *    - This metadata belongs in the junction table, not in Parent or Student
 * 
 * 3. Flexible Queries:
 *    - "Find all parents of student X"
 *    - "Find all children of parent Y"
 *    - These are easy with a junction table, complex with arrays
 */

const parentSchema = new mongoose.Schema(
  {
    // Reference to User
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Multi-Tenancy
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School ID is required'],
      index: true,
    },

    // Personal Information
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },

    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },

    // Professional Information
    occupation: {
      type: String,
      trim: true,
    },

    employer: {
      type: String,
      trim: true,
    },

    // Contact Information
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },

    alternatePhone: {
      type: String,
      trim: true,
    },

    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },

    // Emergency Contact (in case parent is unreachable)
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
    },

    // Profile Picture
    profilePicture: {
      type: String,
    },

    // Notes
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
parentSchema.index({ schoolId: 1, userId: 1 }, { unique: true }); // One parent record per user per school

// Virtual: Full Name
parentSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual: Get all children
parentSchema.virtual('children', {
  ref: 'ParentStudent',
  localField: '_id',
  foreignField: 'parentId',
});

// Instance Method: Get all children as populated students
parentSchema.methods.getChildren = async function () {
  const ParentStudent = mongoose.model('ParentStudent');
  return ParentStudent.find({ parentId: this._id }).populate('studentId');
};

// Static Method: Find parent by user
parentSchema.statics.findByUser = function (userId) {
  return this.findOne({ userId }).populate('children');
};

module.exports = mongoose.model('Parent', parentSchema);

// ============================================================================
// PARENT-STUDENT JUNCTION TABLE
// ============================================================================

/**
 * WHY A JUNCTION TABLE?
 * 
 * This is a classic many-to-many relationship problem:
 * - One parent → many students
 * - One student → many parents/guardians
 * 
 * The junction table stores:
 * - The relationship itself (parentId + studentId)
 * - Metadata about the relationship (isPrimary, relationship type)
 */

const parentStudentSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Parent',
      required: true,
      index: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },

    // Relationship metadata
    relationship: {
      type: String,
      enum: ['father', 'mother', 'guardian', 'grandparent', 'other'],
      required: true,
    },

    isPrimary: {
      type: Boolean,
      default: false, // Is this the primary contact for the student?
    },

    // Financial responsibility
    isFinanciallyResponsible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound index for fast lookups
parentStudentSchema.index({ parentId: 1, studentId: 1 }, { unique: true });
parentStudentSchema.index({ studentId: 1 }); // Fast "find parents of student X"

// Ensure only one primary parent per student
parentStudentSchema.pre('save', async function (next) {
  if (this.isPrimary && this.isNew) {
    await this.constructor.updateMany(
      { studentId: this.studentId, _id: { $ne: this._id } },
      { isPrimary: false }
    );
  }
  next();
});

mongoose.model('ParentStudent', parentStudentSchema);