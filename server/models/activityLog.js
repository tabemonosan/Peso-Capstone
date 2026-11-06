import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  actorEmail: { type: String, required: true },
  action: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  targetId: String,
  statusCode: { type: Number, required: true },
  outcome: { type: String, enum: ['success', 'failed', 'interrupted'], required: true },
  at: { type: Date, default: Date.now, required: true },
}, { versionKey: false })
schema.index({ at: -1, _id: -1 })
schema.index({ actorEmail: 1, at: -1 })
schema.index({ outcome: 1, at: -1 })
export const ActivityLog = mongoose.model('ActivityLog', schema)
