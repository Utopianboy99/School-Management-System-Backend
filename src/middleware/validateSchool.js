// =============================================
// src/middleware/validateSchool.js
// =============================================

/**
 * MULTI-TENANT VALIDATION MIDDLEWARE
 * 
 * Ensures users can only access data from their own school
 * 
 * This is CRITICAL for data isolation
 * Without this, School A could access School B's data
 * 
 * Pattern:
 * 1. Extract schoolId from request (param, body, or query)
 * 2. Compare with req.user.schoolId
 * 3. Reject if mismatch (except superadmin)
 */

const validateSchool = (paramName = 'schoolId') => {
  return (req, res, next) => {
    try {
      // Superadmins can access any school
      if (req.user.role === ROLES.SUPERADMIN) {
        return next();
      }

      // Extract schoolId from request
      const requestedSchoolId = 
        req.params[paramName] || 
        req.body[paramName] || 
        req.query[paramName];

      // If no schoolId in request, use user's school
      if (!requestedSchoolId) {
        // Inject user's schoolId for convenience
        req.schoolId = req.user.schoolId;
        return next();
      }

      // Compare with user's school
      if (requestedSchoolId !== req.user.schoolId.toString()) {
        // Log suspicious attempt
        AuditLog.log({
          userId: req.user._id,
          action: 'unauthorized_access',
          entity: 'school',
          entityId: requestedSchoolId,
          schoolId: req.user.schoolId,
          success: false,
          errorMessage: 'Attempted cross-school access',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: {
            userSchool: req.user.schoolId.toString(),
            requestedSchool: requestedSchoolId
          }
        }).catch(console.error);

        return res.status(403).json({
          success: false,
          error: ERROR_MESSAGES.FORBIDDEN,
          message: 'Access to this school is not allowed'
        });
      }

      // School validated
      req.schoolId = req.user.schoolId;
      next();

    } catch (error) {
      console.error('School validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Validation failed'
      });
    }
  };
};

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: What is multi-tenancy?
 * A: MULTIPLE SCHOOLS IN ONE DATABASE
 * 
 *    Single database serves multiple schools:
 *    - School A: 1000 students
 *    - School B: 500 students
 *    - School C: 2000 students
 *    
 *    All stored in same 'students' collection
 *    Isolated by schoolId field
 * 
 * Q: Why is this middleware critical?
 * A: PREVENT DATA LEAKAGE
 * 
 *    Attack scenario:
 *    1. User from School A is authenticated
 *    2. User crafts request: GET /students?schoolId=SCHOOL_B_ID
 *    3. Without validation: Gets School B's students!
 *    4. With validation: Request blocked
 * 
 *    This middleware is your defense against:
 *    - Accidental bugs (wrong schoolId)
 *    - Malicious users (trying to access other schools)
 *    - API misuse (developers forgetting to filter)
 * 
 * Q: Why allow superadmin to bypass?
 * A: OPERATIONAL NECESSITY
 *    - Platform support team needs access to all schools
 *    - Debugging issues
 *    - Data migrations
 *    - Always log these accesses for audit
 */

module.exports = validateSchool;
