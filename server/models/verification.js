import mongoose from 'mongoose'
import { DOCUMENT_STATUSES, FINDING_SEVERITIES, FINDING_LEVELS } from '../../shared/verification.js'

const findingSchema = new mongoose.Schema({
  ruleId: { type: String, required: true, maxlength: 100 },
  severity: { type: String, enum: FINDING_SEVERITIES, required: true },
  fieldGroup: { type: String, maxlength: 60 },
  evidence: { type: String, enum: ['independent', 'self-declared'], default: 'self-declared' },
  status: { type: String, enum: ['open', 'dismissed'], default: 'open' },
  approvalBlocking: { type: Boolean, default: true },
  dismissedBy: String, note: { type: String, maxlength: 500 },
}, { _id: false })
export const verificationVersionFields = {
  status: { type: String, enum: DOCUMENT_STATUSES, default: 'pending' },
  autoApproved: { type: Boolean, default: false }, approvedBy: String,
  autoApprovalSummary: { type: [{ ruleId: String, level: { type: String, enum: FINDING_LEVELS } }], default: [] },
  adminConfirmedBy: String, adminConfirmedAt: Date,
  findings: { type: [findingSchema], default: [] },
  reviewReasons: { type: [String], default: [] },
  explanation: { requestedAt: Date, status: { type: String, enum: ['requested', 'submitted', 'reviewed'] }, category: String, note: String },
  reviewRevision: { type: Number, default: 0 },
  verificationAudit: { type: [{ action: String, reason: String, by: String, at: Date, ruleId: String }], default: [] },
}
export const verificationAccountFields = {
  holdAutoApproval: { type: Boolean, default: false, select: false },
  autoApprovalHoldHistory: { type: [{ action: String, reason: String, by: String, at: Date }], select: false },
}
