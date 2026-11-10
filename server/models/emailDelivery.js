import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  recipientEmail: String, subject: String,
  purpose: { type: String, default: 'notification' },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'failed', 'expired'], default: 'queued' },
  retryable: { type: Boolean, default: true },
  attempts: { type: Number, default: 0 },
  payload: { type: String, select: false },
  nextAttemptAt: Date, leaseUntil: Date, deliveredAt: Date, lastError: String,
  expiresAt: Date,
}, { timestamps: true })
schema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 })
export const EmailDelivery = mongoose.models.EmailDelivery || mongoose.model('EmailDelivery', schema)
