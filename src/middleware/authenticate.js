// =============================================
// src/middleware/authenticate.js
// =============================================

const { verifyIdToken } = require('../config/firebase');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { ERROR_MESSAGES } = require('../config/constants');

/**
 * AUTHENTICATION MIDDLEWARE
 * 
 * This is THE MOST CRITICAL middleware in the system.
 * It runs on EVERY protected route.
 * 
 * Flow:
 * 1. Extract token from Authorization header
 * 2. Verify token with Firebase
 * 3. Get firebaseUid from verified token
 * 4. Query MongoDB User by firebaseUid
 * 5. Attach user to req.user
 * 6. Continue to route handler
 * 
 * Security:
 * - If any step fails, return 401 Unauthorized
 * - Never reveal WHY authentication failed (security)
 * - Log failed attempts to audit log
 */

const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    // Format: "Bearer <token>"
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'No authentication token provided'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify token with Firebase
    const verificationResult = await verifyIdToken(idToken);

    if (!verificationResult.success) {
      // Log failed attempt
      await AuditLog.log({
        userId: null,
        action: 'login_failed',
        entity: 'user',
        schoolId: null,
        success: false,
        errorMessage: verificationResult.error,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.INVALID_TOKEN,
        message: 'Invalid authentication token'
      });
    }

    // Get user from MongoDB by firebaseUid
    const user = await User.findByFirebaseUid(verificationResult.uid);

    if (!user) {
      // User not found in our system
      // This means they have Firebase account but not in our school system
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'User not found in system'
      });
    }

    if (!user.isActive) {
      // Account deactivated
      return res.status(403).json({
        success: false,
        error: ERROR_MESSAGES.FORBIDDEN,
        message: 'Account is deactivated'
      });
    }

    // Attach user to request object
    req.user = user;
    
    // Update last login (non-blocking)
    user.updateLastLogin().catch(console.error);

    // Continue to route handler
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: 'Internal server error'
    });
  }
};

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why is this async?
 * A: Multiple async operations:
 *    - verifyIdToken (network call to Firebase)
 *    - User.findByFirebaseUid (database query)
 *    - AuditLog.log (database write)
 * 
 * Q: Why not throw errors?
 * A: Middleware error handling best practice:
 *    - Return response immediately
 *    - Don't let errors propagate
 *    - Consistent error format
 * 
 * Q: Why check isActive?
 * A: Soft delete pattern
 *    - Don't delete users (preserve audit trail)
 *    - Mark as inactive instead
 *    - Prevents login but keeps data
 * 
 * Q: Why update lastLoginAt non-blocking?
 * A: PERFORMANCE
 *    - Don't wait for lastLogin update
 *    - User doesn't care if it fails
 *    - Shaves ~20ms off request time
 *    - Pattern: Fire-and-forget for non-critical operations
 */

module.exports = authenticate;