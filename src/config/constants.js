// =============================================
// src/config/constants.js
// =============================================

/**
 * APPLICATION CONSTANTS
 * 
 * Centralizing constants prevents typos and makes changes easy
 */

const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  PARENT: 'parent',
  STUDENT: 'student'
};

const ENROLLMENT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  TRANSFERRED: 'transferred',
  WITHDRAWN: 'withdrawn',
  SUSPENDED: 'suspended'
};

const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EXCUSED: 'excused',
  SICK: 'sick'
};

const INVOICE_STATUS = {
  UNPAID: 'unpaid',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

const PAYMENT_METHODS = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  CREDIT_CARD: 'credit_card',
  DEBIT_CARD: 'debit_card',
  MOBILE_MONEY: 'mobile_money',
  CHECK: 'check'
};

const AUDIT_ACTIONS = {
  // Auth
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',
  
  // Student
  STUDENT_CREATED: 'student_created',
  STUDENT_UPDATED: 'student_updated',
  STUDENT_DELETED: 'student_deleted',
  STUDENT_VIEWED: 'student_viewed',
  
  // Financial
  INVOICE_CREATED: 'invoice_created',
  PAYMENT_RECORDED: 'payment_recorded',
  
  // Security
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  PERMISSION_DENIED: 'permission_denied'
};

/**
 * Role hierarchy for permission checks
 * Higher number = more permissions
 */
const ROLE_HIERARCHY = {
  [ROLES.SUPERADMIN]: 100,
  [ROLES.ADMIN]: 50,
  [ROLES.TEACHER]: 30,
  [ROLES.PARENT]: 20,
  [ROLES.STUDENT]: 10
};

/**
 * Helper function: Check if role has sufficient permissions
 */
const hasPermission = (userRole, requiredRole) => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};

/**
 * Validation regex patterns
 */
const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s-()]+$/,
  ADMISSION_NUMBER: /^[A-Z0-9-]+$/,
  INVOICE_NUMBER: /^INV-\d{4}-\d{5}$/,
  PAYMENT_NUMBER: /^PAY-\d{4}-\d{5}$/
};

/**
 * Error messages
 */
const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden: Insufficient permissions',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation error',
  DUPLICATE_ENTRY: 'Duplicate entry',
  INVALID_TOKEN: 'Invalid authentication token',
  TOKEN_EXPIRED: 'Authentication token expired'
};

/**
 * EXPLAIN TO STUDENT:
 * 
 * Q: Why use constants instead of strings everywhere?
 * A: MAINTAINABILITY AND SAFETY
 * 
 *    Bad:
 *    if (user.role === 'admin') { ... }
 *    if (user.role === 'admim') { ... } // TYPO!
 *    
 *    Good:
 *    if (user.role === ROLES.ADMIN) { ... }
 *    // Typo would cause error immediately
 * 
 *    Benefits:
 *    - IDE autocomplete
 *    - Typos caught at development time
 *    - Easy to refactor (change in one place)
 *    - Self-documenting code
 * 
 * Q: What is ROLE_HIERARCHY for?
 * A: PERMISSION INHERITANCE
 *    
 *    Pattern: Admins can do everything teachers can
 *    
 *    Instead of:
 *    if (role === 'admin' || role === 'teacher') { allow() }
 *    
 *    Use:
 *    if (hasPermission(role, ROLES.TEACHER)) { allow() }
 *    // Automatically includes admin!
 */

module.exports = {
  ROLES,
  ENROLLMENT_STATUS,
  ATTENDANCE_STATUS,
  INVOICE_STATUS,
  PAYMENT_METHODS,
  AUDIT_ACTIONS,
  ROLE_HIERARCHY,
  hasPermission,
  REGEX_PATTERNS,
  ERROR_MESSAGES
};
