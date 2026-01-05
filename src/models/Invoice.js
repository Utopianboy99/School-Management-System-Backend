const mongoose = require('mongoose');

/**
 * INVOICE MODEL
 * 
 * Represents a bill for services (tuition, fees, etc.)
 * 
 * CRITICAL SEPARATION: Invoice vs Payment
 * 
 * Why separate?
 * - An invoice can have multiple payments (partial payments)
 * - Need to track payment history
 * - Financial auditing requirements
 * - Refund scenarios
 * 
 * Real-world example:
 * - Invoice: $1000 tuition for Term 1
 * - Payment 1: $400 on Jan 1
 * - Payment 2: $600 on Jan 15
 * - Invoice status: paid
 */

const invoiceSchema = new mongoose.Schema({
  // Who is being billed
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },

  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  // Invoice identification
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
    // Format: "INV-2025-00001"
  },

  // Financial details
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },

  // What is being charged
  description: {
    type: String,
    required: true,
    trim: true
    // Examples: "Tuition Term 1 2025", "Transport Fee", "Books"
  },

  lineItems: [{
    description: String,
    quantity: { type: Number, default: 1 },
    unitPrice: Number,
    amount: Number
  }],

  // Billing period
  term: {
    type: String,
    required: true
    // Examples: "Term 1 2025", "Q1 2025"
  },

  academicYear: {
    type: String,
    required: true,
    index: true
  },

  // Due date
  dueDate: {
    type: Date,
    required: true,
    index: true
  },

  // Payment status
  status: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'],
    default: 'unpaid',
    required: true,
    index: true
  },

  // Amount paid so far
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },

  // Balance remaining
  balance: {
    type: Number,
    default: function() { return this.amount; }
  },

  // Who issued the invoice
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Dates
  issueDate: {
    type: Date,
    default: Date.now
  },

  paidDate: {
    type: Date // When fully paid
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
 * COMPOUND INDEXES
 */
invoiceSchema.index({ schoolId: 1, studentId: 1, academicYear: 1 });
invoiceSchema.index({ schoolId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ studentId: 1, status: 1 });

/**
 * VIRTUAL FIELDS
 */

// Get all payments for this invoice
invoiceSchema.virtual('payments', {
  ref: 'Payment',
  localField: '_id',
  foreignField: 'invoiceId'
});

invoiceSchema.virtual('isOverdue').get(function() {
  return this.status !== 'paid' && 
         this.status !== 'cancelled' && 
         new Date() > this.dueDate;
});

/**
 * INSTANCE METHODS
 */

// Record a payment
invoiceSchema.methods.recordPayment = async function(paymentAmount, paymentData) {
  if (this.status === 'paid') {
    throw new Error('Invoice is already paid');
  }
  if (this.status === 'cancelled') {
    throw new Error('Cannot pay cancelled invoice');
  }

  // Create payment record
  const Payment = mongoose.model('Payment');
  const payment = await Payment.create({
    invoiceId: this._id,
    studentId: this.studentId,
    amount: paymentAmount,
    paymentMethod: paymentData.paymentMethod,
    reference: paymentData.reference,
    notes: paymentData.notes
  });

  // Update invoice
  this.amountPaid += paymentAmount;
  this.balance = this.amount - this.amountPaid;

  if (this.balance <= 0) {
    this.status = 'paid';
    this.paidDate = new Date();
  } else if (this.amountPaid > 0) {
    this.status = 'partially_paid';
  }

  await this.save();
  return payment;
};

// Cancel invoice
invoiceSchema.methods.cancel = async function() {
  if (this.amountPaid > 0) {
    throw new Error('Cannot cancel invoice with payments');
  }
  this.status = 'cancelled';
  return this.save();
};

/**
 * STATIC METHODS
 */

// Generate next invoice number
invoiceSchema.statics.generateInvoiceNumber = async function(schoolId) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  
  const lastInvoice = await this.findOne({
    schoolId,
    invoiceNumber: new RegExp(`^${prefix}`)
  }).sort('-invoiceNumber');

  let nextNumber = 1;
  if (lastInvoice) {
    const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
};

// Find overdue invoices
invoiceSchema.statics.findOverdue = function(schoolId) {
  return this.find({
    schoolId,
    status: { $in: ['unpaid', 'partially_paid'] },
    dueDate: { $lt: new Date() }
  }).populate('studentId', 'firstName lastName admissionNumber');
};

/**
 * MIDDLEWARE
 */

// Update overdue status
invoiceSchema.pre('save', function(next) {
  if (this.isOverdue && this.status === 'unpaid') {
    this.status = 'overdue';
  }
  next();
});

// Auto-calculate balance
invoiceSchema.pre('save', function(next) {
  this.balance = this.amount - this.amountPaid;
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);