// =============================================
// src/config/firebase.js
// =============================================

const admin = require('firebase-admin');

/**
 * FIREBASE ADMIN SDK INITIALIZATION
 * 
 * This allows backend to:
 * 1. Verify ID tokens from frontend
 * 2. Manage users (if needed)
 * 3. Send notifications (optional)
 * 
 * SECURITY: Service account key must be kept secret!
 */

let firebaseApp;

const initializeFirebase = () => {
  if (!firebaseApp) {
    try {
      // In production, use service account JSON file
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
      });

      console.log('Firebase Admin SDK initialized');
    } catch (error) {
      console.error('Error initializing Firebase Admin SDK:', error);
      throw error;
    }
  }
  return firebaseApp;
};

/**
 * Verify Firebase ID token
 * This is the CORE authentication function
 */
const verifyIdToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return {
      success: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: What is verifyIdToken doing?
 * A: CRYPTOGRAPHIC TOKEN VERIFICATION
 * 
 *    Flow:
 *    1. Frontend logs user in via Firebase
 *    2. Firebase returns JWT (JSON Web Token)
 *    3. Frontend sends JWT to backend in Authorization header
 *    4. Backend calls verifyIdToken(jwt)
 *    5. Firebase Admin SDK verifies:
 *       - Token signature (cryptographically signed by Firebase)
 *       - Token not expired
 *       - Token issued by your Firebase project
 *    6. Returns user info (uid, email)
 * 
 *    Security benefits:
 *    - Backend doesn't store secrets per user
 *    - Firebase handles key rotation
 *    - Impossible to forge valid tokens
 *    - Stateless (no session storage needed)
 * 
 * Q: Why service account JSON?
 * A: Allows backend to act as admin
 *    - Can verify tokens
 *    - Can manage users
 *    - Can access Firebase services
 *    
 *    CRITICAL: Never commit service account to git!
 *    Store in environment variable or secrets manager.
 */

module.exports = {
  initializeFirebase,
  verifyIdToken,
  admin
};