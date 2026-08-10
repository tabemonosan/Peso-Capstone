import mongoose from 'mongoose'

const { Schema } = mongoose

// Separate collections for each account type
const applicantSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  profile: {
    name: String,
    location: String,
    skills: [String],
    traits: String,
    summary: String,
  },
}, { collection: 'applicants', timestamps: true })

const employerSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  companyName: String,
  contactName: String,
  profile: {
    location: String,
    summary: String,
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
  kind: { type: String, default: 'job-review' },
  linkPath: String,
  createdAt: { type: Date, default: Date.now },
}, { collection: 'notifications', timestamps: true })

const Applicant = mongoose.models.Applicant || mongoose.model('Applicant', applicantSchema)
const Employer = mongoose.models.Employer || mongoose.model('Employer', employerSchema)
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema)
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema)

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

export { Applicant, Employer, Admin, Notification, findUserByEmail, createUserInRole, updateUserProfileByEmail }
