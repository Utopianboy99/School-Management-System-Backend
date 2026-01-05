// src/models/User.js

const mongoose = require('mongoose');

/**
 * USER MODEL - Authentication & Authorization Layer
 * 
 * PURPOSE:
 * This is the identity anchor. Every person who logs in has ONE User record.
 * This model handles WHO someone is, not WHAT they do.
 * 
 * CRITICAL DESIGN DECISIONS:
 * 
 * 1. firebaseUid as the Identity Key
 *    - Firebase owns authentication, so firebaseUid is the source of truth
 *    - This field is UNIQUE and REQUIRED
 *    - We never store passwords here (Firebase handles that)
 * 
 * 2. Role-Based Access Control (RBAC)
 *    - role: 'admin' | 'teacher' | 'parent' | 'student'
 *    - Simple enum, but powerful when combined with middleware
 *    - Can be changed dynamically without touching Firebase
 * 
 * 3. Multi-Tenancy via schoolId
 *    - Every user belongs to ONE school
 *    - Required field prevents orphaned users
 *    - Enables data isolation between schools
 * 
 * 4. Separation from Domain Entities
 *    - User !== Student. A student is a student record linked to a user.
 *    - Why? A person can be BOTH a teacher AND a parent
 *    - Clean separation: User = "can log in", Student = "is enrolled"
 */

const userSchema = new mongoose.Schema(
  {
    // Firebase UID - The Identity Anchor
    firebaseUid: {
      type: String,
      required: [true, 'Firebase UID is required'],
      unique: true,
      index: true, // CRITICAL: Fast lookups on every authenticated request
      trim: true,
    },

    // Email from Firebase
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true, // Fast email lookups
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
    },

    // Role-Based Access Control
    role: {
      type: String,
      enum: {
        values: ['admin', 'teacher', 'parent', 'student'],
        message: '{VALUE} is not a valid role',
      },
      required: [true, 'User role is required'],
      index: true, // Fast filtering by role
    },

    // Multi-Tenancy: Which school does this user belong to?
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School ID is required'],
      index: true, // CRITICAL: All queries filter by schoolId
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
      index: true, // Fast filtering of active users
    },

    // Metadata
    lastLogin: {
      type: Date,
    },

    profilePicture: {
      type: String, // URL to Firebase Storage or CDN
    },
  },
  {
    // Automatic createdAt and updatedAt
    timestamps: true,

    // Remove __v from JSON responses
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * INDEXES EXPLAINED:
 * 
 * Why index firebaseUid, email, schoolId, and role?
 * 
 * 1. firebaseUid: Queried on EVERY authenticated request
 *    - Without index: O(n) scan of entire collection
 *    - With index: O(log n) lookup
 *    - On 100,000 users: 100,000 operations → 17 operations
 * 
 * 2. Compound Index for Multi-Tenancy
 */
userSchema.index({ schoolId: 1, role: 1 }); // Fast queries like "all teachers in school X"
userSchema.index({ schoolId: 1, isActive: 1 }); // Fast queries like "active users in school X"

/**
 * INSTANCE METHODS
 * 
 * These are methods available on individual user documents.
 * Example: const user = await User.findById(id); user.canAccess('student-records');
 */

// Check if user has permission for a specific action
userSchema.methods.canAccess = function (resource) {
  const permissions = {
    admin: ['all'], // Admin has access to everything
    teacher: ['attendance', 'grades', 'class-management'],
    parent: ['student-records', 'invoices', 'payments'],
    student: ['own-records', 'own-grades'],
  };

  return permissions[this.role]?.includes(resource) || permissions[this.role]?.includes('all');
};

// Update last login timestamp
userSchema.methods.updateLastLogin = async function () {
  this.lastLogin = new Date();
  return this.save();
};

/**
 * STATIC METHODS
 * 
 * These are methods available on the User model itself.
 * Example: await User.findByFirebaseUid('firebase-uid-123');
 */

// Find user by Firebase UID (common operation)
userSchema.statics.findByFirebaseUid = function (firebaseUid) {
  return this.findOne({ firebaseUid, isActive: true });
};

// Find all users by role within a school
userSchema.statics.findByRoleInSchool = function (schoolId, role) {
  return this.find({ schoolId, role, isActive: true });
};

// Sync or create user from Firebase
userSchema.statics.syncFromFirebase = async function (firebaseUser, schoolId, role) {
  const { uid, email } = firebaseUser;

  // Find existing user or create new one
  let user = await this.findOne({ firebaseUid: uid });

  if (user) {
    // Update existing user
    user.email = email;
    user.lastLogin = new Date();
    await user.save();
  } else {
    // Create new user
    user = await this.create({
      firebaseUid: uid,
      email,
      role,
      schoolId,
      isActive: true,
      lastLogin: new Date(),
    });
  }

  return user;
};

/**
 * MIDDLEWARE (HOOKS)
 * 
 * Mongoose middleware runs automatically before/after certain operations.
 * 
 * pre('save'): Runs before document is saved
 * post('save'): Runs after document is saved
 * pre('remove'): Runs before document is deleted
 */

// Log when a user is created
userSchema.post('save', function (doc) {
  if (doc.isNew) {
    console.log(`✅ New user created: ${doc.email} (${doc.role})`);
  }
});

// Prevent deletion of admin users (soft delete instead)
userSchema.pre('remove', async function (next) {
  if (this.role === 'admin') {
    const adminCount = await this.constructor.countDocuments({
      schoolId: this.schoolId,
      role: 'admin',
      isActive: true,
    });

    if (adminCount <= 1) {
      throw new Error('Cannot delete the last admin user');
    }
  }
  next();
});

/**
 * VIRTUAL PROPERTIES
 * 
 * Virtual properties are fields that don't exist in MongoDB but are computed.
 * They don't take up storage space.
 */

// Full name virtual (if we add firstName and lastName later)
userSchema.virtual('fullName').get(function () {
  return this.firstName && this.lastName ? `${this.firstName} ${this.lastName}` : this.email;
});

/**
 * REAL-WORLD USAGE EXAMPLES:
 * 
 * 1. Create User (usually done automatically via Firebase sync):
 *    const user = await User.syncFromFirebase(firebaseUser, schoolId, 'teacher');
 * 
 * 2. Find User by Firebase UID (on every authenticated request):
 *    const user = await User.findByFirebaseUid(req.firebaseUid);
 * 
 * 3. Query Users by Role:
 *    const teachers = await User.findByRoleInSchool(schoolId, 'teacher');
 * 
 * 4. Check Permissions:
 *    if (user.canAccess('attendance')) { // allow }
 * 
 * 5. Populate Related Data:
 *    const user = await User.findById(userId).populate('schoolId');
 */

module.exports = mongoose.model('User', userSchema);