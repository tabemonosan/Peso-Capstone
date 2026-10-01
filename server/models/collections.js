import mongoose from 'mongoose'

const { Schema } = mongoose

// Separate collections for each account type
const applicantSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  verificationStatus: { type: String, enum: ['under_review', 'approved', 'declined', 'restricted'], default: 'under_review' },
  verificationReason: String,
  profile: {
    name: String,
    location: String,
    skills: [String],
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
}, { collection: 'applicants', timestamps: true })

const employerSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
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

const notificationSchema = new Schema({
  recipientEmail: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'job_review' },
  kind: { type: String, default: 'job-review' },
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

const referralSchema = new Schema({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  applicantId: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  referredBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'referrals', timestamps: true })

const hireReportSchema = new Schema({
  referralId: { type: Schema.Types.ObjectId, ref: 'Referral' },
  applicantId: { type: Schema.Types.ObjectId, ref: 'Applicant', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', required: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  status: { type: String, enum: ['hired', 'deployed'], required: true },
  reportedAt: { type: Date, default: Date.now },
}, { collection: 'hire_reports', timestamps: true })

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
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema)
const HireReport = mongoose.models.HireReport || mongoose.model('HireReport', hireReportSchema)
const Rating = mongoose.models.Rating || mongoose.model('Rating', ratingSchema)

async function findUserByEmail(email) {
  if (!email) return null
  let user = await Admin.findOne({ email }).lean()
  if (user) return { user, type: 'Admin' }
  user = await Employer.findOne({ email }).lean()
  if (user) return { user, type: 'Employer' }
  user = await Applicant.findOne({ email }).lean()
  if (user) return { user, type: 'Applicant' }
  return null
}

async function createUserInRole(role, data) {
  if (role === 'Admin') return Admin.create(data)
  if (role === 'Employer') return Employer.create(data)
  return Applicant.create(data)
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
  Notification,
  Referral,
  HireReport,
  Rating,
  findUserByEmail,
  createUserInRole,
  updateUserProfileByEmail,
}
