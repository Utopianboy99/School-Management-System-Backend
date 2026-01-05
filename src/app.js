// =============================================
// src/app.js
// =============================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const studentRoutes = require('./routes/studentRoutes');
// const teacherRoutes = require('./routes/teacherRoutes');
// const classRoutes = require('./routes/classRoutes');
// const enrollmentRoutes = require('./routes/enrollmentRoutes');
// const attendanceRoutes = require('./routes/attendanceRoutes');
// const invoiceRoutes = require('./routes/invoiceRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');

/**
 * EXPRESS APP CONFIGURATION
 * 
 * This file configures Express but doesn't start the server
 * Separation allows for easier testing
 */

const app = express();

// =============================================
// SECURITY MIDDLEWARE
// =============================================

/**
 * Helmet - Sets various HTTP headers for security
 * Protects against common web vulnerabilities
 */
app.use(helmet());

/**
 * CORS - Cross-Origin Resource Sharing
 * Allows frontend (different domain) to call API
 */
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/**
 * Rate limiting - Prevent abuse and DDoS
 * Limits each IP to 100 requests per 15 minutes
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// =============================================
// PARSING MIDDLEWARE
// =============================================

/**
 * Parse JSON bodies
 * Limit size to prevent large payload attacks
 */
app.use(express.json({ limit: '10mb' }));

/**
 * Parse URL-encoded bodies (form submissions)
 */
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================
// LOGGING MIDDLEWARE
// =============================================

/**
 * Morgan - HTTP request logger
 * In production, log to file instead of console
 */
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev')); // Colored, concise output
} else {
  app.use(morgan('combined')); // Apache style logs
}

// =============================================
// HEALTH CHECK ENDPOINT
// =============================================

/**
 * Health check endpoint
 * Used by load balancers, monitoring tools
 * Should NOT require authentication
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// =============================================
// API ROUTES
// =============================================

/**
 * Mount all API routes under /api prefix
 * Versioning: /api/v1/... (for future API versions)
 */
app.use('/api/students', studentRoutes);
// app.use('/api/teachers', teacherRoutes);
// app.use('/api/classes', classRoutes);
// app.use('/api/enrollments', enrollmentRoutes);
// app.use('/api/attendance', attendanceRoutes);
// app.use('/api/invoices', invoiceRoutes);
// app.use('/api/payments', paymentRoutes);

// =============================================
// ERROR HANDLING
// =============================================

/**
 * 404 handler - Must come after all other routes
 */
app.use(notFound);

/**
 * Global error handler - Must be last middleware
 */
app.use(errorHandler);

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why separate app.js and server.js?
 * A: TESTABILITY
 * 
 *    app.js: Configure Express app
 *    server.js: Start HTTP server
 *    
 *    Benefits:
 *    - Can test routes without starting server
 *    - Can create multiple servers (HTTP, HTTPS)
 *    - Clean separation of concerns
 * 
 * Q: Why use helmet()?
 * A: SECURITY HEADERS
 * 
 *    Sets HTTP headers that protect against:
 *    - XSS (Cross-Site Scripting)
 *    - Clickjacking
 *    - MIME type sniffing
 *    - Insecure requests
 *    
 *    Example: X-Frame-Options: DENY
 *    Prevents site from being embedded in iframe (clickjacking)
 * 
 * Q: Why rate limiting?
 * A: PREVENT ABUSE
 * 
 *    Without rate limiting:
 *    - Attacker can hammer server with requests
 *    - Brute force password attempts
 *    - DDoS attack
 *    - API abuse
 *    
 *    With rate limiting:
 *    - Max 100 requests per 15 minutes per IP
 *    - Automatic 429 response after limit
 *    - Protects server resources
 * 
 * Q: Why limit request body size?
 * A: SECURITY
 * 
 *    Without limit:
 *    - Attacker sends 1GB JSON
 *    - Server tries to parse
 *    - Out of memory crash
 *    
 *    With limit (10MB):
 *    - Large payloads rejected
 *    - 413 Payload Too Large
 * 
 * Q: Why /health endpoint?
 * A: OPERATIONAL NECESSITY
 * 
 *    Used by:
 *    - Load balancers (is server alive?)
 *    - Monitoring tools (UptimeRobot, Pingdom)
 *    - Kubernetes (liveness probes)
 *    - Alerting systems
 *    
 *    Should be fast and not hit database
 *    Just confirms app is running
 */

module.exports = app;