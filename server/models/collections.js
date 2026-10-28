import mongoose from 'mongoose'
import { normalizeEmail } from '../utils/emailVerification.js'
import { formatFullName, formatDisplayName } from '../../shared/nameFields.js'

const { Schema } = mongoose

// Shared email-verification fields (applicants and employers only; admins are provisioned)
const emailVerificationFields = {
  emailNormalized: { type: String, unique: true, sparse: true, index: true },
  emailVerified: { type: Boolean, default: false },
  emailVerifyTokenHash: { type: String, select: false },
  emailVerifyExpires: Date,
  emailVerifySentAt: Date,
}

// Separate collections for each account type
// One version of an uploaded document. Old versions are kept (status: 'superseded')
// for audit and purged by the retention job.
const verificationDocVersionSchema = new Schema({
  originalName: String,
  storedName: String, // randomized server-side name; never exposed as a public URL
  mimetype: String,
  size: Number,
  uploadedAt: Date,
  data: { type: Buffer, select: false }, // private: only streamed via signed, expiring URLs
  back: {
    originalName: String,
    storedName: String,
    mimetype: String,
    size: Number,
    uploadedAt: Date,
    data: { type: Buffer, select: false },
  },
  version: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'superseded'], default: 'pending' },
  reviewReason: String,
  reviewedAt: Date,
  reviewedBy: String,
}, { _id: false })

// Per-document slot (including resume) with version history
const verificationDocSlotSchema = new Schema({
  idType: String, // only used by validId1 / validId2
  uploads: { type: Number, default: 0 }, // capped at 5 per document
  versions: { type: [verificationDocVersionSchema], default: [] },
  // Admin review action log (approvals, rejections, reverts) for audit
  history: {
    type: [{ action: String, reason: String, by: String, at: { type: Date, default: Date.now } }],
    default: [],
  },
}, { _id: false })

const nsrpEducationSchema = new Schema({
  level: { type: String, maxlength: 40 },
  school: { type: String, maxlength: 120 },
  course: { type: String, maxlength: 100 },
  year: { type: String, maxlength: 20 },
}, { _id: false })

const nsrpTrainingSchema = new Schema({
  name: { type: String, maxlength: 120 },
  provider: { type: String, maxlength: 120 },
  course: { type: String, maxlength: 100 },
  year: { type: String, maxlength: 20 },
}, { _id: false })

const nsrpWorkExperienceSchema = new Schema({
  company: { type: String, maxlength: 120 },
  position: { type: String, maxlength: 100 },
  startDate: { type: String, maxlength: 20 },
  endDate: { type: String, maxlength: 20 },
}, { _id: false })

const applicantSchema = new Schema({
  email: { type: String, required: true, unique: true },  passwordHash: { type: String, required: true },
  ...emailVerificationFields,
  verificationStatus: { type: String, enum: ['under_review', 'approved', 'declined', 'restricted'], default: 'under_review' },
  verificationReason: String,
  consentGivenAt: Date, // RA 10173 consent recorded at sign up
  verificationDocuments: {
    nsrpForm: verificationDocSlotSchema,
    birthCertificate: verificationDocSlotSchema,
    validId1: verificationDocSlotSchema,
    validId2: verificationDocSlotSchema,
    resume: verificationDocSlotSchema,
  },
  documentsPurgedAt: Date,
  // Set by the name-split migration; user is asked to confirm their name on next login
  needsNameConfirmation: { type: Boolean, default: false },
  profile: {
    // Structured name parts are canonical; `name` is the legacy field kept in
    // sync with the computed full name until the migration is fully verified.
    firstName: { type: String, maxlength: 50 },
    middleName: { type: String, maxlength: 50 },
    lastName: { type: String, maxlength: 50 },
    suffix: { type: String, enum: ['', 'Jr.', 'Sr.', 'II', 'III', 'IV'], default: '' },
    name: String,
    location: String,
    skills: [String],
    education: { type: [nsrpEducationSchema], default: [] },
    technicalTraining: { type: [nsrpTrainingSchema], default: [] },
    workExperience: { type: [nsrpWorkExperienceSchema], default: [] },
    nsrp: { type: Schema.Types.Mixed, default: undefined },
    traits: String,
    summary: String,
    profileImage: String,
    bannerImage: String,
  },
  resumeFile: {
    originalName: String,
    mimetype: String,
    size: Number,
    uploadedAt: Date,
    data: { type: Buffer, select: false },
  },
  nsrpVerificationFile: {
    originalName: String,
    mimetype: String,
    size: Number,
    uploadedAt: Date,
    data: { type: Buffer, select: false },
  },
  // Applicant's drawn/uploaded NSRP signature. Private: `data` is never selected
  // by default and list queries must not include it.
  nsrpSignature: {
    mimetype: String,
    size: Number,
    uploadedAt: Date,
    certifiedAt: Date,
    data: { type: Buffer, select: false },
  },
}, { collection: 'applicants', timestamps: true })

// Keep the legacy `profile.name` synced with the structured name parts so
// older consumers keep working while the new fields are the source of truth.
applicantSchema.index({ 'profile.lastName': 1, 'profile.firstName': 1, _id: 1 })
applicantSchema.index({ createdAt: -1, _id: 1 })
function syncApplicantName(doc) {
  const profile = doc?.profile
  if (!profile) return
  if (profile.firstName || profile.lastName) profile.name = formatFullName(profile)
}
applicantSchema.pre('validate', function syncOnValidate() { syncApplicantName(this) })
applicantSchema.pre('findOneAndUpdate', function syncOnUpdate() {
  const update = this.getUpdate()
  const profile = update?.profile || update?.$set?.profile
  if (profile && (profile.firstName || profile.lastName)) profile.name = formatFullName(profile)
})

export function applicantFullName(applicant) {
  return formatFullName(applicant?.profile) || applicant?.email || ''
}
export function applicantDisplayName(applicant) {
  return formatDisplayName(applicant?.profile) || applicant?.email || ''
}

const employerSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  ...emailVerificationFields,
  verificationStatus: { type: String, enum: ['pending_verification', 'under_review', 'approved', 'declined'], default: 'approved' },
  verificationReason: String,
  requirementsSubmittedAt: Date,
  companyName: String,
  contactName: String,
  phone: String,
  profile: {
    location: String,
    summary: String,
    website: String,
    profileImage: String,
    bannerImage: String,
  },
}, { collection: 'employers', timestamps: true })

const adminSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  profile: { name: String },
}, { collection: 'admins', timestamps: true })

const jobTitleSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
}, { collection: 'job_titles', timestamps: true })

const notificationSchema = new Schema({
  recipient: {
    id: { type: Schema.Types.ObjectId },
    role: { type: String, enum: ['Applicant', 'Employer', 'Admin'] },
  },
  recipientEmail: { type: String, lowercase: true, trim: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'general' },
  link: { type: String, default: '' },
  readAt: { type: Date, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  // Legacy fields kept so older documents and consumers keep working
  kind: String,
  read: { type: Boolean, default: false },
  actionable: { type: Boolean, default: false },
  linkPath: String,
  applicantId: { type: Schema.Types.ObjectId, ref: 'Applicant' },
  jobId: { type: Schema.Types.ObjectId, ref: 'JobPosting' },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer' },
  applicantName: String,
  jobTitle: String,
  employerName: String,
  createdAt: { type: Date, default: Date.now },
}, { collection: 'notifications', timestamps: true })
notificationSchema.index({ 'recipient.id': 1, 'recipient.role': 1, createdAt: -1 })
notificationSchema.index({ recipientEmail: 1, createdAt: -1 })

const referralSchema = new Schema({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  applicantId: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  referredBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'referrals', timestamps: true })
referralSchema.index({ employerId: 1, createdAt: -1, _id: 1 })
referralSchema.index({ createdAt: -1, _id: 1 })

const hireReportSchema = new Schema({
  referralId: { type: Schema.Types.ObjectId, ref: 'Referral' },
  applicantId: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  status: { type: String, enum: ['hired', 'deployed'], required: true },
  reportedAt: { type: Date, default: Date.now },
}, { collection: 'hire_reports', timestamps: true })
hireReportSchema.index({ reportedAt: -1, _id: 1 })
hireReportSchema.index({ employerId: 1, reportedAt: -1 })

// Binary content of applicant verification documents lives here, NOT inside the
// Applicant document: a full set of 5 MB files would exceed MongoDB's 16 MB
// BSON document limit. The Applicant document keeps only version metadata;
// `data` is select:false so queries must opt in explicitly.
const documentFileSchema = new Schema({
  applicant: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true, index: true },
  slot: { type: String, enum: ['nsrpForm', 'birthCertificate', 'validId1', 'validId2', 'resume'], required: true },
  version: { type: Number, required: true },
  side: { type: String, enum: ['front', 'back'], default: 'front' },
  mimetype: String,
  size: Number,
  uploadedAt: Date,
  data: { type: Buffer, select: false },
}, { collection: 'document_files', timestamps: true })
documentFileSchema.index({ applicant: 1, slot: 1, version: 1, side: 1 }, { unique: true })

const ratingSchema = new Schema({
  fromUserId: { type: Schema.Types.ObjectId, required: true },
  fromRole: { type: String, enum: ['employer', 'applicant'], required: true },
  toUserId: { type: Schema.Types.ObjectId, required: true },
  toRole: { type: String, required: true },
  hireReportId: { type: Schema.Types.ObjectId, ref: 'HireReport', required: true },
  score: { type: Number, min: 1, max: 5, required: true },
  comment: String,
  createdAt: { type: Date, default: Date.now },
}, { collection: 'ratings', timestamps: true })

const Applicant = mongoose.models.Applicant || mongoose.model('Applicant', applicantSchema)
const Employer = mongoose.models.Employer || mongoose.model('Employer', employerSchema)
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema)
const JobTitle = mongoose.models.JobTitle || mongoose.model('JobTitle', jobTitleSchema)
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema)
const HireReport = mongoose.models.HireReport || mongoose.model('HireReport', hireReportSchema)
const Rating = mongoose.models.Rating || mongoose.model('Rating', ratingSchema)
const DocumentFile = mongoose.models.DocumentFile || mongoose.model('DocumentFile', documentFileSchema)

async function findUserByEmail(email) {
  if (!email) return null
  const normalized = normalizeEmail(email)
  let user = await Admin.findOne({ email: email.trim() }).lean()
  if (user) return { user, type: 'Admin' }
  // Match applicants/employers on the normalized value so gmail aliases collapse
  user = await Employer.findOne({ $or: [{ emailNormalized: normalized }, { email }] }).lean()
  if (user) return { user, type: 'Employer' }
  user = await Applicant.findOne({ $or: [{ emailNormalized: normalized }, { email }] }).lean()
  if (user) return { user, type: 'Applicant' }
  return null
}

// True if the normalized email is already used in ANY role collection
async function emailTakenAcrossRoles(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  const [admin, employer, applicant] = await Promise.all([
    Admin.findOne({ email: email.trim() }).select('_id').lean(),
    Employer.findOne({ $or: [{ emailNormalized: normalized }, { email }] }).select('_id').lean(),
    Applicant.findOne({ $or: [{ emailNormalized: normalized }, { email }] }).select('_id').lean(),
  ])
  return Boolean(admin || employer || applicant)
}

async function createUserInRole(role, data) {
  const payload = { ...data }
  if (payload.email) payload.emailNormalized = normalizeEmail(payload.email)
  if (role === 'Admin') return Admin.create(payload)
  if (role === 'Employer') return Employer.create(payload)
  return Applicant.create(payload)
}

async function updateUserProfileByEmail(email, profile) {
  // Try updating in each collection; return updated doc if found
  let user = await Applicant.findOneAndUpdate({ email }, { profile }, { new: true })
  if (user) return { user, type: 'Applicant' }
  user = await Employer.findOneAndUpdate({ email }, { profile }, { new: true })
  if (user) return { user, type: 'Employer' }
  user = await Admin.findOneAndUpdate({ email }, { profile }, { new: true })
  if (user) return { user, type: 'Admin' }
  return null
}

export {
  Applicant,
  Employer,
  Admin,
  JobTitle,
  Notification,
  Referral,
  HireReport,
  Rating,
  DocumentFile,
  findUserByEmail,
  emailTakenAcrossRoles,
  createUserInRole,
  updateUserProfileByEmail,
}
