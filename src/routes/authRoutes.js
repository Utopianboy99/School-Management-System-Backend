// =============================================
// src/routes/authRoutes.js
// =============================================

const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

/**
 * AUTH ROUTES
 * 
 * Note: These routes have different authentication patterns
 * /sync - Uses modified authenticate (allows new users)
 * /me, /profile, /logout - Requires full authentication
 */

/**
 * @route   POST /api/auth/sync
 * @desc    Sync Firebase user to MongoDB (login/register)
 * @access  Public (but requires Firebase token)
 */
router.post('/sync', authenticate, AuthController.syncUser);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate, AuthController.getCurrentUser);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticate, AuthController.updateProfile);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout (audit log only)
 * @access  Private
 */
router.post('/logout', authenticate, AuthController.logout);

module.exports = router;

// =============================================
// Modified authenticate middleware for /sync
// src/middleware/authenticateForSync.js
// =============================================

const { verifyIdToken } = require('../config/firebase');

/**
 * Special authentication for sync endpoint
 * 
 * Difference from regular authenticate:
 * - Doesn't require user to exist in MongoDB
 * - Just verifies Firebase token and extracts uid/email
 * - Attaches firebaseUid and email to req (not full user)
 * 
 * This allows new users to register
 */

const authenticateForSync = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify token with Firebase
    const verificationResult = await verifyIdToken(idToken);

    if (!verificationResult.success) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }

    // Attach Firebase info to request
    // Note: NOT attaching full user object
    req.firebaseUid = verificationResult.uid;
    req.email = verificationResult.email;

    next();

  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * UPDATE authRoutes.js to use this middleware:
 * 
 * router.post('/sync', authenticateForSync, AuthController.syncUser);
 */

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why two different authenticate middlewares?
 * A: CHICKEN-AND-EGG PROBLEM
 * 
 *    Regular authenticate:
 *    1. Verify Firebase token ✓
 *    2. Get firebaseUid ✓
 *    3. Query MongoDB for user ✓
 *    4. Attach req.user ✓
 *    
 *    Problem for /sync: User doesn't exist in MongoDB yet!
 *    
 *    authenticateForSync:
 *    1. Verify Firebase token ✓
 *    2. Get firebaseUid ✓
 *    3. Attach firebaseUid and email to req ✓
 *    4. Let controller create user ✓
 * 
 * Q: Is this secure?
 * A: YES, because:
 * 
 *    - Firebase token is cryptographically verified
 *    - Can't forge a valid token
 *    - Token proves user owns that email (if verified)
 *    - Controller still validates role and school
 *    
 *    In production, add:
 *    - Email verification requirement
 *    - Invitation code system
 *    - Admin approval workflow
 */

module.exports = authenticateForSync;