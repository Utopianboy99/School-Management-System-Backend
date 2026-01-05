// =============================================
// src/middleware/errorHandler.js
// =============================================

const { ERROR_MESSAGES } = require('../config/constants');

/**
 * CENTRALIZED ERROR HANDLER
 * 
 * This middleware catches all errors from route handlers
 * Place it LAST in middleware chain
 * 
 * app.use(routes);
 * app.use(errorHandler); // <-- Last
 */

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      error: ERROR_MESSAGES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: errors
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      error: ERROR_MESSAGES.DUPLICATE_ENTRY,
      message: `Duplicate value for field: ${field}`
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: ERROR_MESSAGES.VALIDATION_ERROR,
      message: `Invalid ${err.path}: ${err.value}`
    });
  }

  // JWT errors (if using JWT elsewhere)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: ERROR_MESSAGES.INVALID_TOKEN,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: ERROR_MESSAGES.TOKEN_EXPIRED,
      message: 'Token expired'
    });
  }

  // Default to 500 server error
  return res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * 404 handler for undefined routes
 */
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: ERROR_MESSAGES.NOT_FOUND,
    message: `Route ${req.originalUrl} not found`
  });
};

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why centralized error handling?
 * A: DRY PRINCIPLE & CONSISTENCY
 * 
 *    Without:
 *    Every route handler needs try-catch
 *    Every handler formats errors differently
 *    Inconsistent error responses
 * 
 *    With:
 *    throw new Error() anywhere
 *    Caught by errorHandler
 *    Consistent format
 * 
 * Q: Why different error types?
 * A: CLIENT NEEDS TO KNOW WHY IT FAILED
 * 
 *    ValidationError → 400: Fix your input
 *    Duplicate key → 409: Already exists
 *    CastError → 400: Invalid ID format
 *    Default → 500: Our problem, not yours
 * 
 * Q: Why expose stack trace only in development?
 * A: SECURITY
 *    - Stack traces reveal code structure
 *    - Attackers can use to find vulnerabilities
 *    - Only show in dev for debugging
 *    - In production, log to file instead
 */

module.exports = {
  errorHandler,
  notFound
};