// =============================================
// src/controllers/authController.js
// =============================================

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { ROLES, AUDIT_ACTIONS } = require('../config/constants');

/**
 * AUTH CONTROLLER
 * 
 * Handles the bridge between Firebase Authentication and MongoDB
 * 
 * Flow:
 * 1. User signs up in Firebase (frontend)
 * 2. Frontend calls POST /api/auth/sync with Firebase idToken
 * 3. Backend verifies token, creates/updates MongoDB user
 * 4. User can now use the system
 */

class AuthController {
  /**
   * Sync Firebase user to MongoDB
   * 
   * This endpoint is called after Firebase authentication
   * Creates or updates user record in MongoDB
   * 
   * POST /api/auth/sync
   * Headers: Authorization: Bearer <firebase-idToken>
   * Body: { schoolId, role, additionalData }
   * 
   * @route POST /api/auth/sync
   * @access Public (but requires valid Firebase token)
   */
  static async syncUser(req, res, next) {
    try {
      // req.user is set by authenticate middleware
      // It contains firebaseUid, email from verified token

      const { schoolId, role, ...additionalData } = req.body;

      // Validate required fields
      if (!schoolId) {
        return res.status(400).json({
          success: false,
          error: 'School ID is required'
        });
      }

      // In production, validate that user is authorized to join this school
      // This could be via invitation code, admin approval, etc.
      // For now, we'll allow any valid Firebase user

      // Check if user already exists
      let user = await User.findOne({ firebaseUid: req.firebaseUid });

      if (user) {
        // User exists, update their information
        user.email = req.email;
        user.lastLoginAt = new Date();
        
        // Update additional fields if provided
        if (additionalData.profilePictureUrl) {
          user.profilePictureUrl = additionalData.profilePictureUrl;
        }

        await user.save();

        // Audit log
        await AuditLog.log({
          userId: user._id,
          action: AUDIT_ACTIONS.LOGIN,
          entity: 'user',
          entityId: user._id,
          schoolId: user.schoolId,
          success: true,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        return res.json({
          success: true,
          message: 'User logged in successfully',
          data: {
            user: {
              id: user._id,
              email: user.email,
              role: user.role,
              schoolId: user.schoolId,
              isActive: user.isActive
            }
          }
        });
      }

      // User doesn't exist, create new user
      // Validate role
      const validRoles = Object.values(ROLES);
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Valid role is required'
        });
      }

      // Create new user
      user = await User.create({
        firebaseUid: req.firebaseUid,
        email: req.email,
        schoolId,
        role,
        isActive: true,
        lastLoginAt: new Date(),
        ...additionalData
      });

      // Audit log
      await AuditLog.log({
        userId: user._id,
        action: AUDIT_ACTIONS.LOGIN,
        entity: 'user',
        entityId: user._id,
        schoolId: user.schoolId,
        success: true,
        metadata: {
          firstLogin: true
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user._id,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            isActive: user.isActive
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   * 
   * GET /api/auth/me
   * 
   * @route GET /api/auth/me
   * @access Private
   */
  static async getCurrentUser(req, res, next) {
    try {
      // req.user is set by authenticate middleware
      const user = await User.findById(req.user._id)
        .select('-__v')
        .lean();

      return res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile
   * 
   * PUT /api/auth/profile
   * 
   * @route PUT /api/auth/profile
   * @access Private
   */
  static async updateProfile(req, res, next) {
    try {
      const { profilePictureUrl } = req.body;

      // Only allow updating certain fields
      const updates = {};
      if (profilePictureUrl) {
        updates.profilePictureUrl = profilePictureUrl;
      }

      const user = await User.findByIdAndUpdate(
        req.user._id,
        updates,
        { new: true, runValidators: true }
      ).select('-__v');

      return res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout (soft logout - just for audit trail)
   * 
   * POST /api/auth/logout
   * 
   * Note: Firebase tokens are stateless, so we can't truly "logout"
   * This endpoint is just for creating an audit log entry
   * 
   * @route POST /api/auth/logout
   * @access Private
   */
  static async logout(req, res, next) {
    try {
      // Create audit log
      await AuditLog.log({
        userId: req.user._id,
        action: AUDIT_ACTIONS.LOGOUT,
        entity: 'user',
        entityId: req.user._id,
        schoolId: req.user.schoolId,
        success: true,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

/**
 * EXPLAIN TO STUDENT - CRITICAL UNDERSTANDING:
 * 
 * Q: Why do we need to sync Firebase users to MongoDB?
 * A: SEPARATION OF AUTHENTICATION AND AUTHORIZATION
 * 
 *    Firebase provides:
 *    - Identity (who you are)
 *    - Authentication (you are who you say you are)
 *    
 *    MongoDB provides:
 *    - Authorization (what you can do)
 *    - Business context (which school, which role)
 *    - Relationships (link to student/teacher/parent records)
 * 
 *    Example flow:
 *    1. User signs up in Firebase
 *       → Firebase knows: email, uid
 *    2. User calls /api/auth/sync with schoolId and role
 *       → MongoDB stores: firebaseUid, email, schoolId, role
 *    3. User makes API request
 *       → Firebase verifies: "This is user abc123"
 *       → MongoDB provides: "User abc123 is admin at School XYZ"
 *       → API allows/denies based on MongoDB data
 * 
 * Q: When should sync be called?
 * A: TWO SCENARIOS:
 * 
 *    First time (registration):
 *    1. User signs up in Firebase (frontend)
 *    2. Frontend immediately calls POST /api/auth/sync
 *    3. Creates user record in MongoDB
 *    
 *    Subsequent logins:
 *    1. User logs in via Firebase (frontend)
 *    2. Frontend calls POST /api/auth/sync
 *    3. Updates lastLoginAt in MongoDB
 *    4. Returns user data
 * 
 * Q: Why not just use Firebase for everything?
 * A: FIREBASE LIMITATIONS FOR COMPLEX APPS:
 * 
 *    Firebase Auth is great for:
 *    ✓ Authentication
 *    ✓ Password management
 *    ✓ Social logins
 *    ✓ Email verification
 *    
 *    But not designed for:
 *    ✗ Complex authorization rules
 *    ✗ Multi-tenancy (schoolId)
 *    ✗ Business logic
 *    ✗ Relationships between entities
 *    ✗ Advanced queries
 *    
 *    Example: "Find all students in Grade 1 at School X"
 *    - With Firebase only: Need Firestore, complex queries, high cost
 *    - With MongoDB: Simple indexed query, full control, lower cost
 * 
 * Q: How does the frontend use this?
 * A: TYPICAL FRONTEND FLOW:
 * 
 *    ```javascript
 *    // 1. User signs up in Firebase
 *    const userCredential = await signInWithEmailAndPassword(
 *      auth, email, password
 *    );
 *    
 *    // 2. Get Firebase ID token
 *    const idToken = await userCredential.user.getIdToken();
 *    
 *    // 3. Sync with backend
 *    const response = await fetch('/api/auth/sync', {
 *      method: 'POST',
 *      headers: {
 *        'Authorization': `Bearer ${idToken}`,
 *        'Content-Type': 'application/json'
 *      },
 *      body: JSON.stringify({
 *        schoolId: 'abc123',
 *        role: 'teacher'
 *      })
 *    });
 *    
 *    // 4. Store user data
 *    const { user } = await response.json();
 *    localStorage.setItem('user', JSON.stringify(user));
 *    
 *    // 5. For all subsequent requests, use the same idToken
 *    fetch('/api/students', {
 *      headers: {
 *        'Authorization': `Bearer ${idToken}`
 *      }
 *    });
 *    ```
 * 
 * Q: What about security? Can anyone set any role?
 * A: IN PRODUCTION, ADD AUTHORIZATION:
 * 
 *    Current code allows any role (for simplicity)
 *    
 *    Production approach:
 *    
 *    Option 1: Invitation codes
 *    ```javascript
 *    const invitation = await Invitation.findOne({
 *      code: req.body.invitationCode,
 *      used: false
 *    });
 *    if (!invitation) throw new Error('Invalid invitation');
 *    
 *    // Create user with role from invitation
 *    role = invitation.role;
 *    schoolId = invitation.schoolId;
 *    ```
 *    
 *    Option 2: Admin approval
 *    ```javascript
 *    // Create user with role 'pending'
 *    const user = await User.create({
 *      firebaseUid, email, schoolId,
 *      role: 'pending',
 *      isActive: false
 *    });
 *    
 *    // Admin later approves and sets real role
 *    ```
 *    
 *    Option 3: Email domain restrictions
 *    ```javascript
 *    if (role === 'admin') {
 *      // Only school email domains can be admin
 *      const school = await School.findById(schoolId);
 *      if (!email.endsWith(school.emailDomain)) {
 *        throw new Error('Unauthorized');
 *      }
 *    }
 *    ```
 */

module.exports = AuthController;
