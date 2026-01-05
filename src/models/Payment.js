// ============================================
// PAYMENT MODEL
// ============================================

/**
 * PAYMENT MODEL
 * 
 * Records individual payment transactions
 * 
 * Why separate from Invoice?
 * - One invoice can have multiple payments
 * - Payment represents actual money movement
 * - Audit trail for financial compliance
 * - Refunds are separate payment records (negative amount)
 */

const paymentSchema = new mongoose.Schema({
  // Which invoice is being paid
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },

  // Who made the payment (for reporting)
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },

  // Payment identification
  paymentNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
    // Format: "PAY-2025-00001"
  },

  // Financial details
  amount: {
    type: Number,
    required: true
    // Can be negative for refunds
  },

  currency: {
    type: String,
    default: 'RAND',
    uppercase: true
  },

  // How was it paid
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'mobile_money', 'check'],
    required: true
  },

  // Transaction reference
  reference: {
    type: String,
    trim: true
    // Bank reference, transaction ID, check number, etc.
  },

  // When payment was made
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  // Who recorded it
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['successful', 'pending', 'failed', 'refunded'],
    default: 'successful'
  },

  // Notes
  notes: {
    type: String,
    trim: true
  }

}, {
  timestamps: true
});

/**
 * INDEXES
 */
paymentSchema.index({ invoiceId: 1, paymentDate: 1 });
paymentSchema.index({ studentId: 1, paymentDate: 1 });
paymentSchema.index({ paymentDate: 1 });

/**
 * STATIC METHODS
 */

// Generate next payment number
paymentSchema.statics.generatePaymentNumber = async function() {
  const year = new Date().getFullYear();
  const prefix = `PAY-${year}-`;
  
  const lastPayment = await this.findOne({
    paymentNumber: new RegExp(`^${prefix}`)
  }).sort('-paymentNumber');

  let nextNumber = 1;
  if (lastPayment) {
    const lastNumber = parseInt(lastPayment.paymentNumber.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
};

// Get payment history for student
paymentSchema.statics.getStudentPayments = function(studentId, startDate, endDate) {
  const query = { studentId };
  if (startDate && endDate) {
    query.paymentDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  return this.find(query)
    .populate('invoiceId', 'invoiceNumber description amount')
    .sort('-paymentDate');
};

/**
 * MIDDLEWARE
 */

// Auto-generate payment number
paymentSchema.pre('save', async function(next) {
  if (this.isNew && !this.paymentNumber) {
    this.paymentNumber = await this.constructor.generatePaymentNumber();
  }
  next();
});

/**
 * EXPLAIN TO STUDENT
 * 
 * Q: Why separate Invoice and Payment models?
 * A: FINANCIAL INTEGRITY
 * 
 *    Real-world scenario:
 *    - Parent owes $1000 for tuition
 *    - Pays $400 on Jan 1
 *    - Pays $600 on Feb 1
 * 
 *    BAD: Update invoice.amountPaid = 1000
 *    Problem: Lost track of WHEN and HOW they paid
 * 
 *    GOOD: 
 *    - Invoice: amount=$1000, amountPaid=$1000, status=paid
 *    - Payment 1: amount=$400, date=Jan 1, method=bank_transfer
 *    - Payment 2: amount=$600, date=Feb 1, method=cash
 * 
 *    Benefits:
 *    - Complete audit trail
 *    - Can handle refunds (negative payment)
 *    - Can track payment methods
 *    - Financial reporting accurate
 * 
 * Q: Why auto-generate invoice/payment numbers?
 * A: PROFESSIONAL ACCOUNTING
 *    - Sequential numbers for audit trail
 *    - Easy reference for parents ("Please reference INV-2025-00123")
 *    - Year prefix for easy filtering
 *    - Prevents duplicates
 * 
 * Q: Why amountPaid and balance on Invoice?
 * A: DENORMALIZATION FOR PERFORMANCE
 *    - Could calculate by summing payments
 *    - But that's expensive for every query
 *    - Trade-off: Store computed values, update on payment
 *    - Common pattern in financial systems
 */

// Export Payment model
const Payment = mongoose.model('Payment', paymentSchema);
module.exports = { Invoice: mongoose.model('Invoice'), Payment };