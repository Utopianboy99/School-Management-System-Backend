// =============================================
// src/server.js
// =============================================

require('dotenv').config(); // Load environment variables

const app = require('./app');
const connectDB = require('./config/database');
const { initializeFirebase } = require('./config/firebase');

/**
 * SERVER ENTRY POINT
 * 
 * Responsibilities:
 * 1. Load environment variables
 * 2. Connect to database
 * 3. Initialize Firebase
 * 4. Start HTTP server
 * 5. Handle process events
 */

const PORT = process.env.PORT || 5000;

/**
 * Start server
 */
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✓ MongoDB connected');

    // Initialize Firebase Admin SDK
    initializeFirebase();
    console.log('✓ Firebase initialized');

    // Start listening for requests
    const server = app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║  School Management System API                 ║
║                                               ║
║  Environment: ${process.env.NODE_ENV || 'development'}                        ║
║  Port: ${PORT}                                    ║
║  Database: ${process.env.MONGODB_URI?.split('@')[1]?.split('/')[0] || 'MongoDB'}         ║
║                                               ║
║  Server is ready to accept connections        ║
║                                               ║
╚═══════════════════════════════════════════════╝
      `);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error('UNHANDLED REJECTION! 💥 Shutting down...');
      console.error(err);
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
      console.error(err);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('👋 SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('💥 Process terminated');
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: What is unhandledRejection?
 * A: PROMISE ERRORS NOT CAUGHT
 * 
 *    Example:
 *    someAsyncFunction().then(...); // No .catch()!
 *    
 *    If function rejects, error is unhandled
 *    Default: Silent failure (bad!)
 *    With handler: Log error and gracefully shutdown
 * 
 * Q: What is uncaughtException?
 * A: SYNCHRONOUS ERRORS NOT CAUGHT
 * 
 *    Example:
 *    const x = y.z; // y is undefined, throws error
 *    
 *    If not in try-catch: Crash entire app
 *    With handler: Log error and exit cleanly
 * 
 * Q: Why handle SIGTERM?
 * A: GRACEFUL SHUTDOWN
 * 
 *    SIGTERM sent by:
 *    - Docker stop
 *    - Kubernetes pod termination
 *    - PM2 restart
 *    - systemd service stop
 *    
 *    Without handler:
 *    - Server killed immediately
 *    - Active requests interrupted
 *    - Database connections not closed
 *    
 *    With handler:
 *    - Stop accepting new requests
 *    - Finish active requests
 *    - Close database connections
 *    - Exit cleanly
 * 
 * Q: Why separate startServer function?
 * A: ERROR HANDLING
 *    - Wrap everything in try-catch
 *    - If anything fails, can clean up
 *    - Can retry connection (in production)
 */

// Start the server
startServer();

// =============================================
// .env.example (for reference)
// =============================================

/**
 * Create this file in project root as .env
 * Add .env to .gitignore (NEVER commit secrets!)
 * 
# Server Configuration
NODE_ENV=development
PORT=5000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/school_management
# Or MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/school_management

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Optional: For production
# JWT_SECRET=your-jwt-secret-if-needed
# SENDGRID_API_KEY=for-sending-emails
# AWS_S3_BUCKET=for-file-uploads
 */