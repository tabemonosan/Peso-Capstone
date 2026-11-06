import mongoose from 'mongoose'
const { Schema } = mongoose
const history = [{ action: String, status: String, by: String, reason: String, at: Date }]
const interviewSchema = new Schema({
  referralId: { type: Schema.Types.ObjectId, required: true, unique: true },
  applicationId: Schema.Types.ObjectId, applicantId: { type: Schema.Types.ObjectId, required: true }, employerId: { type: Schema.Types.ObjectId, required: true }, jobId: Schema.Types.ObjectId,
  scheduledAt: { type: Date, required: true }, mode: { type: String, enum: ['In person', 'Online'], default: 'In person' }, location: String, message: String, responseMessage: String,
  city: String, barangay: String, province: String, landmark: String, meetingLink: String,
  status: { type: String, enum: ['invited', 'confirmed', 'reschedule_requested', 'declined', 'cancelled', 'held', 'attended', 'missed'], default: 'invited' },
  outcome: { type: String, enum: ['passed', 'did_not_pass', 'not_selected', 'hired'] },
  cancelledBy: String, cancelledAt: Date, history,
  postInterviewTask: {
    status: { type: String, enum: ['requested', 'submitted', 'completed'] },
    requirements: [String], instructions: String, requestedAt: Date, requestedBy: Schema.Types.ObjectId,
    completedAt: Date, completedBy: Schema.Types.ObjectId, files: Schema.Types.Mixed,
  },
}, { collection: 'interviews', timestamps: true })
interviewSchema.index({ applicantId: 1, updatedAt: -1 })
interviewSchema.index({ employerId: 1, scheduledAt: 1 })
const reportSchema = new Schema({
  _id: String, referralId: Schema.Types.ObjectId, interviewId: Schema.Types.ObjectId, applicantId: Schema.Types.ObjectId, employerId: Schema.Types.ObjectId, jobId: Schema.Types.ObjectId,
  type: { type: String, enum: ['problem', 'no_show'] }, byRole: String, byId: Schema.Types.ObjectId, reason: { type: String, select: false }, at: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'responded', 'confirmed', 'dismissed', 'resolved'], default: 'pending' }, responseDeadline: Date, applicantResponse: String, respondedAt: Date,
  reviewReason: { type: String, select: false }, reviewedBy: { type: String, select: false }, reviewedAt: Date,
}, { collection: 'application_reports' })
reportSchema.index({ interviewId: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'no_show', interviewId: { $type: 'objectId' } } })
reportSchema.index({ applicantId: 1, at: -1 })
reportSchema.index({ type: 1, status: 1 })
const appealSchema = new Schema({
  applicantId: { type: Schema.Types.ObjectId, required: true }, reason: String, status: { type: String, enum: ['pending', 'resolved'], default: 'pending' }, reviewedAt: Date,
}, { collection: 'application_appeals', timestamps: true })
appealSchema.index({ applicantId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })
export const Interview = mongoose.models.Interview || mongoose.model('Interview', interviewSchema)
export const ApplicationReport = mongoose.models.ApplicationReport || mongoose.model('ApplicationReport', reportSchema)
export const ApplicationAppeal = mongoose.models.ApplicationAppeal || mongoose.model('ApplicationAppeal', appealSchema)
const reputationReviewSchema = new Schema({
  applicantId: { type: Schema.Types.ObjectId, required: true }, eventKey: { type: String, required: true }, applicationId: Schema.Types.ObjectId,
  category: String, note: String, supportingVersion: Number, originalName: String,
  status: { type: String, enum: ['pending', 'processing', 'reversed', 'kept', 'reduced'], default: 'pending' },
  decision: String, reducedPoints: Number, reviewedBy: String, reviewedAt: Date,
  adminNote: { type: String, select: false }, publicReason: String,
}, { collection: 'reputation_reviews', timestamps: true })
reputationReviewSchema.index({ applicantId: 1, eventKey: 1 }, { unique: true })
reputationReviewSchema.index({ status: 1, createdAt: 1 })
export const ReputationReview = mongoose.models.ReputationReview || mongoose.model('ReputationReview', reputationReviewSchema)
const postInterviewFileSchema = new Schema({
  interviewId: { type: Schema.Types.ObjectId, required: true }, applicantId: { type: Schema.Types.ObjectId, required: true },
  employerId: { type: Schema.Types.ObjectId, required: true }, requirementKey: { type: String, required: true },
  version: { type: Number, required: true }, name: String, mimetype: String, size: Number,
  data: { type: Buffer, select: false }, uploadedAt: Date, expiresAt: Date,
}, { collection: 'post_interview_files' })
postInterviewFileSchema.index({ interviewId: 1, requirementKey: 1, version: 1 }, { unique: true })
postInterviewFileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const PostInterviewFile = mongoose.models.PostInterviewFile || mongoose.model('PostInterviewFile', postInterviewFileSchema)
