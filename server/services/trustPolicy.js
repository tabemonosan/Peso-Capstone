import mongoose from 'mongoose'
import { ApplicationError } from './referralWorkflow.js'

export const LOW_TRUST_THRESHOLD = 50
export const INITIAL_TRUST = 100
export const TRUST_DELTAS = { confirmed_no_show: -20, late_cancellation: -10, attended_interview: 5, hired: 10 }
// Called only by admin-confirmation paths. One document update changes the
// private value and appends its idempotent audit event together.
export async function recordTrustEvent(Applicant, { applicantId, key, type, delta = TRUST_DELTAS[type], by, reason, at = new Date() }) {
  if (!by || typeof reason !== 'string' || !reason.trim() || !key || ![...Object.keys(TRUST_DELTAS), 'manual_adjustment'].includes(type) || !Number.isInteger(delta) || Math.abs(delta) > 100) throw new ApplicationError('INVALID_TRUST_EVENT', 'Enter an event and a reason; adjustments must be whole numbers from -100 to 100.', 403)
  const before = { $ifNull: ['$trustValue', INITIAL_TRUST] }
  const after = { $max: [0, { $min: [100, { $add: [before, delta] }] }] }
  const result = await Applicant.collection.updateOne({ _id: new mongoose.Types.ObjectId(applicantId), 'trustEvents.key': { $ne: key } }, [{ $set: {
    trustValue: after,
    trustEvents: { $concatArrays: [{ $ifNull: ['$trustEvents', []] }, [{ $mergeObjects: [{ $literal: { key, type, delta, by, reason: reason.trim(), at } }, { before, after }] }]] },
  } }])
  return result.modifiedCount === 1
}
