// =============================================
// src/middleware/authorize.js
// =============================================

const { ROLES, hasPermission, ERROR_MESSAGES } = require('../config/constants');
const AuditLog = require('../models/AuditLog');

/**
 * AUTHORIZATION MIDDLEWARE FACTORY
 * 
 * Creates middleware that checks if user has required role
 * 
 * Usage:
 * router.get('/admin-only', authenticate, authorize([ROLES.ADMIN]), handler)
 * router.get('/teachers-and-admins', authenticate, authorize([ROLES.TEACHER]), handler)
 * 
 * Note: Due to role hierarchy, admin automatically passes teacher checks
 */

const authorize = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      // Prerequisite: authenticate middleware must run first
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: ERROR_MESSAGES.UNAUTHORIZED,
          message: 'Authentication required'
        });
      }

      const userRole = req.user.role;

      // Check if user has any of the allowed roles (using hierarchy)
      const hasAccess = allowedRoles.some(allowedRole => 
        hasPermission(userRole, allowedRole)
      );

      if (!hasAccess) {
        // Log unauthorized access attempt
        await AuditLog.log({
          userId: req.user._id,
          action: 'permission_denied',
          entity: 'system',
          schoolId: req.user.schoolId,
          success: false,
          errorMessage: `User with role ${userRole} attempted to access resource requiring ${allowedRoles.join(' or ')}`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: {
            path: req.path,
            method: req.method
          }
        });

        return res.status(403).json({
          success: false,
          error: ERROR_MESSAGES.FORBIDDEN,
          message: 'Insufficient permissions'
        });
      }

      // User authorized
      next();

    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({
        success: false,
        error: 'Authorization failed',
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Shorthand for common role checks
 */
const requireAdmin = authorize([ROLES.ADMIN]);
const requireTeacher = authorize([ROLES.TEACHER]); // Also allows admin
const requireParent = authorize([ROLES.PARENT]); // Also allows teacher, admin

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why is authorize a factory function?
 * A: FLEXIBILITY IN ROUTE DEFINITIONS
 * 
 *    Pattern: Higher-order function that returns middleware
 *    
 *    authorize([ROLES.ADMIN]) returns a function(req, res, next)
 *    
 *    This allows:
 *    - Different roles per route
 *    - Compose with other middleware
 *    - Readable route definitions
 * 
 * Q: Why check req.user?
 * A: DEFENSE IN DEPTH
 *    - Programmer might forget to add authenticate middleware
 *    - authorize should fail gracefully
 *    - Never assume prerequisites
 * 
 * Q: Why log denied attempts?
 * A: SECURITY MONITORING
 *    - Pattern: Someone probing for vulnerabilities
 *    - Example: Parent trying to access admin endpoints
 *    - Can detect compromised accounts
 *    - Alert ops team to suspicious activity
 */

module.exports = {
  authorize,
  requireAdmin,
  requireTeacher,
  requireParent
};
