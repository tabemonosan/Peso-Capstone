import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { createReport } from 'docx-templates'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { Applicant, Employer, Admin, Notification, Referral, HireReport, Rating, findUserByEmail, createUserInRole, updateUserProfileByEmail } from './models/collections.js'

const app = express()
const PORT = process.env.PORT || 4000

// Allow the deployed frontend plus local dev. Set FRONTEND_URL (e.g. https://your-app.vercel.app) in production.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean)
app.use(cors({
  origin: (origin, callback) => {
    // allow same-origin / curl (no origin) and any whitelisted origin
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(null, true) // permissive for now; tighten by returning an Error to block others
  },
  credentials: true,
}))
// Capture raw request body for debugging JSON parse issues
app.use(express.json({
  limit: '8mb',
  verify: (req, _res, buf) => {
    try {
      req.rawBody = buf && buf.toString ? buf.toString() : ''
    } catch (e) {
      req.rawBody = ''
    }
  },
}))
app.use((req, res, next) => {
  console.log('HTTP', req.method, req.path)
  next()
})

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL
const jwtSecret = process.env.JWT_SECRET || 'dev-secret'
if (!mongoUri) {
  console.warn('Warning: MONGODB_URI not set. Connect by setting MONGODB_URI in .env')
}

mongoose.connect(mongoUri || 'mongodb://localhost:27017/peso-portal')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.warn('MongoDB connection error:', err.message))

const { Schema } = mongoose

const jobSchema = new Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: String,
  description: String,
  requirements: String,
  salary: String,
  locationType: { type: String, enum: ['', 'On-site', 'Hybrid', 'Remote'], default: '' },
  employmentType: { type: String, enum: ['', 'Full-time', 'Part-time', 'Contract', 'Internship'], default: '' },
  skills: [String],
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  reviewReason: String,
  approvedBy: String,
  approvedAt: Date,
  createdBy: String,
  applicants: [{ email: String, appliedAt: Date }],
  createdAt: { type: Date, default: Date.now },
})
const JobPosting = mongoose.model('JobPosting', jobSchema)

const jobApplicationSchema = new Schema({
  jobId: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  applicantEmail: { type: String, required: true },
  nsrpFile: {
    originalName: String,
    mimetype: String,
    size: Number,
    data: { type: Buffer, required: true, select: false },
  },
  submittedAt: { type: Date, default: Date.now },
})
jobApplicationSchema.index({ jobId: 1, applicantEmail: 1 }, { unique: true })
const JobApplication = mongoose.model('JobApplication', jobApplicationSchema)

const employerRequestSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  companyName: { type: String, required: true },
  contactName: { type: String, required: true },
  location: String,
  phone: String,
  message: String,
  status: { type: String, enum: ['pending', 'under_review', 'approved', 'declined'], default: 'pending' },
  requirementsFile: {
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number,
    data: { type: Buffer, select: false },
  },
  requirementsSubmittedAt: Date,
  reviewReason: String,
  approvedBy: String,
  approvedAt: Date,
  createdAt: { type: Date, default: Date.now },
})
const EmployerRequest = mongoose.model('EmployerRequest', employerRequestSchema)

const requirementsDirectory = path.join(process.cwd(), 'server', 'uploads', 'employer-requirements')
fs.mkdirSync(requirementsDirectory, { recursive: true })
const requirementsUpload = multer({
  dest: requirementsDirectory,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== 'application/pdf' || path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return callback(new Error('Only PDF files are accepted'))
    }
    callback(null, true)
  },
})
const applicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(file.mimetype) || !['.pdf', '.docx'].includes(ext)) {
      return callback(new Error('Only PDF or DOCX files are accepted'))
    }
    callback(null, true)
  },
})

async function requireApprovedEmployer(decoded, res) {
  if (decoded.role !== 'Employer') {
    res.status(403).json({ error: 'Forbidden' })
    return false
  }
  const employer = await Employer.findOne({ email: decoded.email }).select('verificationStatus').lean()
  if (!employer) {
    res.status(404).json({ error: 'Employer not found' })
    return false
  }
  if (employer.verificationStatus && employer.verificationStatus !== 'approved') {
    res.status(403).json({ error: 'Employer verification is required before using this feature' })
    return false
  }
  return true
}

app.get('/', (req, res) => res.json({ ok: true }))
app.get('/ping', (req, res) => {
  console.log('PING received')
  res.json({ ok: true })
})

app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, name, location, skills, traits, summary } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' })

    const exists = await findUserByEmail(email)
    if (exists) return res.status(409).json({ error: 'Account exists' })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await createUserInRole('Applicant', { email, passwordHash, profile: { name, location, skills, traits, summary } })

    const safe = { id: String(user._id), email: user.email, role: 'Applicant', profile: user.profile }
    const token = jwt.sign({ email: user.email, role: 'Applicant' }, jwtSecret, { expiresIn: '7d' })
    res.json({ user: safe, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' })

    const found = await findUserByEmail(email)
    if (!found) return res.status(401).json({ error: 'Invalid credentials' })
    const { user, type } = found
    const requirements = type === 'Employer' ? await EmployerRequest.findOne({ email: user.email }).lean() : null

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    if (user.verificationStatus === 'restricted') return res.status(403).json({ error: 'Your account has been restricted. Please contact PESO support.' })

    const safe = { id: String(user._id), email: user.email, role: type, companyName: type === 'Employer' ? (user.companyName || requirements?.companyName) : undefined, contactName: type === 'Employer' ? (user.contactName || requirements?.contactName) : undefined, phone: type === 'Employer' ? (user.phone || requirements?.phone) : undefined, profile: user.profile, verificationStatus: ['Employer', 'Applicant'].includes(type) ? (user.verificationStatus || 'approved') : undefined, verificationReason: ['Employer', 'Applicant'].includes(type) ? user.verificationReason : undefined, requirementsFile: requirements?.requirementsFile ? { originalName: requirements.requirementsFile.originalName, size: requirements.requirementsFile.size } : undefined, resumeFile: type === 'Applicant' && user.resumeFile?.originalName ? { originalName: user.resumeFile.originalName, size: user.resumeFile.size, uploadedAt: user.resumeFile.uploadedAt } : undefined, nsrpVerificationFile: type === 'Applicant' && user.nsrpVerificationFile?.originalName ? { originalName: user.nsrpVerificationFile.originalName, size: user.nsrpVerificationFile.size, uploadedAt: user.nsrpVerificationFile.uploadedAt } : undefined }
    const token = jwt.sign({ email: user.email, role: type }, jwtSecret, { expiresIn: '7d' })
    res.json({ user: safe, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Protected profile read: require valid JWT
app.get('/api/profile', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    const found = await findUserByEmail(decoded.email)
    if (!found) return res.status(404).json({ error: 'Not found' })
    const { user, type } = found
    const requirements = type === 'Employer' ? await EmployerRequest.findOne({ email: user.email }).lean() : null
    res.json({ id: String(user._id), email: user.email, role: type, companyName: type === 'Employer' ? (user.companyName || requirements?.companyName) : undefined, contactName: type === 'Employer' ? (user.contactName || requirements?.contactName) : undefined, phone: type === 'Employer' ? (user.phone || requirements?.phone) : undefined, profile: user.profile, verificationStatus: ['Employer', 'Applicant'].includes(type) ? (user.verificationStatus || 'approved') : undefined, verificationReason: ['Employer', 'Applicant'].includes(type) ? user.verificationReason : undefined, requirementsFile: requirements?.requirementsFile ? { originalName: requirements.requirementsFile.originalName, size: requirements.requirementsFile.size } : undefined, hasResume: type === 'Applicant' ? Boolean(user.resumeFile?.data || user.resumeFile?.originalName) : undefined, resumeFile: type === 'Applicant' && user.resumeFile?.originalName ? { originalName: user.resumeFile.originalName, size: user.resumeFile.size, uploadedAt: user.resumeFile.uploadedAt } : undefined, nsrpVerificationFile: type === 'Applicant' && user.nsrpVerificationFile?.originalName ? { originalName: user.nsrpVerificationFile.originalName, size: user.nsrpVerificationFile.size, uploadedAt: user.nsrpVerificationFile.uploadedAt } : undefined })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Applicant resume upload (PDF only)
app.post('/api/profile/resume', applicationUpload.single('resume'), async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Only applicants can upload a resume' })
    if (!req.file) return res.status(400).json({ error: 'Resume PDF is required' })

    const applicant = await Applicant.findOneAndUpdate(
      { email: decoded.email },
      {
        resumeFile: {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          uploadedAt: new Date(),
          data: req.file.buffer,
        },
      },
      { new: true },
    )
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    res.json({ ok: true, resumeFile: { originalName: req.file.originalname, size: req.file.size, uploadedAt: new Date() } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Applicant NSRP verification document upload (separate from jobseeker resume)
app.post('/api/profile/nsrp-verification', applicationUpload.single('nsrpVerification'), async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Only applicants can upload NSRP verification' })
    if (!req.file) return res.status(400).json({ error: 'NSRP verification document is required' })

    const applicant = await Applicant.findOneAndUpdate(
      { email: decoded.email },
      {
        $set: {
          nsrpVerificationFile: {
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            uploadedAt: new Date(),
            data: req.file.buffer,
          },
          // Resubmitting after a decline moves the account back to review
          verificationStatus: 'under_review',
        },
        $unset: { verificationReason: 1 },
      },
      { new: true },
    )
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })

    const admins = await Admin.find().lean()
    if (admins.length > 0) {
      await Notification.insertMany(admins.map((admin) => ({
        recipientEmail: admin.email,
        title: 'Applicant NSRP verification submitted',
        message: `${decoded.email} submitted an NSRP verification document for account approval.`,
        kind: 'applicant-verification',
        linkPath: '/applicants',
      })))
    }

    res.json({ ok: true, nsrpVerificationFile: { originalName: req.file.originalname, size: req.file.size, uploadedAt: new Date() } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin: view an applicant's NSRP verification document
app.get('/api/applicants/:id/nsrp-verification', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!['Admin', 'Applicant'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })
    const applicant = await Applicant.findById(req.params.id).select('+nsrpVerificationFile.data').lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (decoded.role === 'Applicant' && applicant.email !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    if (!applicant.nsrpVerificationFile?.data) return res.status(404).json({ error: 'No NSRP verification document uploaded' })
    const raw = applicant.nsrpVerificationFile.data
    const buffer = Buffer.isBuffer(raw) ? raw : (raw?.buffer ? Buffer.from(raw.buffer) : Buffer.from(raw))
    res.type(applicant.nsrpVerificationFile.mimetype || 'application/pdf')
    res.set('Content-Disposition', `inline; filename="${applicant.nsrpVerificationFile.originalName || 'nsrp-verification.pdf'}"`)
    res.send(buffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// View an applicant's resume (self, employer, or admin)
app.get('/api/applicants/:id/resume', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!['Employer', 'Admin', 'Applicant'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })

    const applicant = await Applicant.findById(req.params.id).select('+resumeFile.data').lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (decoded.role === 'Applicant' && applicant.email !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    if (!applicant.resumeFile?.data) return res.status(404).json({ error: 'No resume uploaded' })

    // MongoDB returns BSON Binary; extract the raw buffer for a valid PDF response
    const raw = applicant.resumeFile.data
    const buffer = Buffer.isBuffer(raw) ? raw : (raw?.buffer ? Buffer.from(raw.buffer) : Buffer.from(raw))
    res.type(applicant.resumeFile.mimetype || 'application/pdf')
    res.set('Content-Disposition', `inline; filename="${applicant.resumeFile.originalName || 'resume.pdf'}"`)
    res.send(buffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Protected profile update: require valid JWT
app.put('/api/profile', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    const { profile, companyName, contactName, phone, website } = req.body
    if (!profile) return res.status(400).json({ error: 'Missing profile' })
    for (const key of ['profileImage', 'bannerImage']) {
      if (typeof profile[key] === 'string' && profile[key].length > 3 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image is too large. Please use an image under 2 MB.' })
      }
    }
    const updated = await updateUserProfileByEmail(decoded.email, profile)
    if (!updated) return res.status(404).json({ error: 'Not found' })

    // Persist editable top-level employer fields as well
    if (updated.type === 'Employer') {
      const topLevel = {}
      if (typeof companyName === 'string') topLevel.companyName = companyName.trim()
      if (typeof contactName === 'string') topLevel.contactName = contactName.trim()
      if (typeof phone === 'string') topLevel.phone = phone.trim()
      if (typeof website === 'string') topLevel.website = website.trim()
      if (Object.keys(topLevel).length > 0) {
        await Employer.updateOne({ email: decoded.email }, { $set: topLevel })
      }
    }
    res.json({ profile: updated.user.profile })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/jobs', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!(await requireApprovedEmployer(decoded, res))) return
    const { title, company, location, description, requirements, salary, skills, locationType, employmentType } = req.body || {}
    const employer = await Employer.findOne({ email: decoded.email }).lean()
    const request = await EmployerRequest.findOne({ email: decoded.email }).lean()
    const resolvedCompany = company || employer?.companyName || employer?.profile?.companyName || request?.companyName || ''
    const resolvedLocation = location || employer?.profile?.location || request?.location || ''
    if (!title || !resolvedCompany || !description) return res.status(400).json({ error: 'Missing required fields. Set your company name in your employer profile first.' })
    if (!Array.isArray(skills) || skills.length === 0) return res.status(400).json({ error: 'Select at least one skill' })
    const normalizedSkills = skills.filter((skill) => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean)
    const job = new JobPosting({ title, company: resolvedCompany, location: resolvedLocation, description, requirements, salary, skills: normalizedSkills, locationType: locationType || '', employmentType: employmentType || '', createdBy: decoded.email })
    await job.save()

    const admins = await Admin.find().lean()
    if (admins.length > 0) {
      await Promise.all(admins.map((admin) => Notification.create({
        recipientEmail: admin.email,
        title: 'New job posting pending review',
        message: `${decoded.email} submitted “${job.title}” for approval.`,
        kind: 'job-review',
        linkPath: '/jobs',
      })))
    }

    res.json(job)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.put('/api/jobs/:id', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!(await requireApprovedEmployer(decoded, res))) return

    const { title, company, location, description, requirements, salary, skills, locationType, employmentType } = req.body || {}
    if (!title || !company || !description) return res.status(400).json({ error: 'Missing required fields' })
    if (!Array.isArray(skills) || skills.length === 0) return res.status(400).json({ error: 'Select at least one skill' })

    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.createdBy !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    if (job.status !== 'pending') return res.status(400).json({ error: 'Only pending job postings can be edited' })

    job.title = title
    job.company = company
    job.location = location || ''
    job.description = description
    job.requirements = requirements || ''
    job.salary = salary || ''
    job.locationType = locationType || ''
    job.employmentType = employmentType || ''
    job.skills = skills.filter((skill) => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean)
    await job.save()

    res.json(job)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/jobs', async (req, res) => {
  try {
    const attachEmployerBranding = async (jobDocs) => {
      const emails = [...new Set(jobDocs.map((job) => job.createdBy).filter(Boolean))]
      if (emails.length === 0) return jobDocs
      const employers = await Employer.find({ email: { $in: emails.map((email) => new RegExp(`^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } }).select('email profile.profileImage profile.bannerImage').lean()
      const brandingByEmail = new Map(employers.map((employer) => [employer.email.toLowerCase(), {
        profileImage: employer.profile?.profileImage || '',
        bannerImage: employer.profile?.bannerImage || '',
      }]))
      return jobDocs.map((job) => {
        const plain = typeof job.toObject === 'function' ? job.toObject() : job
        return { ...plain, employerBranding: brandingByEmail.get((plain.createdBy || '').toLowerCase()) || null }
      })
    }
    const { status } = req.query
    if (status === 'pending') {
      const auth = req.headers.authorization
      if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
      const token = auth.split(' ')[1]
      const decoded = jwt.verify(token, jwtSecret)
      if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
      const jobs = await JobPosting.find({ status: 'pending' }).sort({ createdAt: -1 })
      return res.json(await attachEmployerBranding(jobs))
    }
    if (status === 'mine') {
      const auth = req.headers.authorization
      if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
      const token = auth.split(' ')[1]
      const decoded = jwt.verify(token, jwtSecret)
      if (!(await requireApprovedEmployer(decoded, res))) return
      const jobs = await JobPosting.find({ createdBy: decoded.email }).sort({ createdAt: -1 })
      return res.json(jobs)
    }
    if (status === 'applied') {
      const auth = req.headers.authorization
      if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
      const token = auth.split(' ')[1]
      const decoded = jwt.verify(token, jwtSecret)
      if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
      if (!decoded.email) return res.status(401).json({ error: 'Invalid token payload' })
      const jobs = await JobPosting.find({ applicants: { $elemMatch: { email: decoded.email } } }).sort({ createdAt: -1 })
      return res.json(jobs)
    }
    if (status === 'declined') {
      const auth = req.headers.authorization
      if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
      const token = auth.split(' ')[1]
      const decoded = jwt.verify(token, jwtSecret)
      if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
      const jobs = await JobPosting.find({ status: 'declined' }).sort({ createdAt: -1 })
      return res.json(await attachEmployerBranding(jobs))
    }
    const jobs = await JobPosting.find({ status: 'approved' }).sort({ createdAt: -1 })
    res.json(await attachEmployerBranding(jobs))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.put('/api/jobs/:id/status', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const { status } = req.body || {}
    if (!['approved', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    const reviewReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
    job.status = status
    if (status === 'approved') {
      job.approvedBy = decoded.email
      job.approvedAt = new Date()
      job.reviewReason = undefined
    } else {
      job.reviewReason = reviewReason || undefined
    }
    await job.save()

    if (job.createdBy) {
      const reviewTitle = status === 'approved' ? 'Posting approved' : 'Posting declined'
      const reviewMessage = status === 'approved'
        ? `Your job posting “${job.title}” was approved by the admin.`
        : `Your job posting “${job.title}” was declined by the admin.${reviewReason ? ` Reason: ${reviewReason}` : ''}`
      await Notification.create({
        recipientEmail: job.createdBy,
        title: reviewTitle,
        message: reviewMessage,
        kind: 'job-review',
        linkPath: '/jobs',
      })
    }

    const admins = await Admin.find().lean()
    if (admins.length > 0) {
      await Promise.all(admins.map((admin) => Notification.create({
        recipientEmail: admin.email,
        title: 'Job review updated',
        message: `The posting “${job.title}” was ${status}.`,
        kind: 'job-review',
        linkPath: '/jobs',
      })))
    }

    res.json(job)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

const nsrpTemplatePath = path.join(process.cwd(), 'server', 'nsrp-template.docx')
const nsrpOfficialPdfPath = path.join(process.cwd(), 'public', 'NSRP-Form-1-Jobseeker-Reg-Form.pdf')

// Overlay answers onto the official NSRP Form 1 PDF at measured coordinates.
// pdf-lib uses a bottom-left origin; coordinates below were measured from the top (see pdfplumber map),
// so y = pageHeight - top.
async function generateNsrpPdf(answers) {
  const existingPdfBytes = fs.readFileSync(nsrpOfficialPdfPath)
  const pdfDoc = await PDFDocument.load(existingPdfBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0, 0, 0)
  const pages = pdfDoc.getPages()
  const page1 = pages[0]
  const H = page1.getSize().height
  const y = (top) => H - top
  const size = 9
  const write = (text, x, top, opts = {}) => {
    const value = text == null ? '' : String(text)
    if (!value.trim()) return
    page1.drawText(value, { x, y: y(top), size: opts.size || size, font: opts.bold ? bold : font, color: ink })
  }
  const mark = (checked, x, top) => {
    if (!checked) return
    page1.drawText('X', { x, y: y(top), size: 10, font: bold, color: ink })
  }

  // I. PERSONAL INFORMATION (answers placed inside each cell, using the table grid lines)
  // Name row: labels at top 167; answer band ~180-206
  write(answers.surname, 32, 196)
  write(answers.firstName, 155, 196)
  write(answers.middleName, 300, 196)
  write(answers.suffix, 440, 196)
  // DOB / PLACE OF BIRTH row: labels at 180; answer within band 192-206, right of the label
  write(answers.dob, 170, 198)
  write(answers.placeOfBirth, 340, 198)
  // SEX row band ~206-228
  mark(answers.sex === 'Male', 178, 211)
  mark(answers.sex === 'Female', 250, 211)
  // RELIGION row band ~206-228, answer right of label
  write(answers.religion, 100, 224)
  // PRESENT ADDRESS right column (x>=321), four stacked lines
  write(answers.addressStreet, 340, 218)
  write(answers.addressBarangay, 340, 233)
  write(answers.addressCity, 340, 247)
  write(answers.addressProvince, 340, 261)
  // CIVIL STATUS checkboxes
  mark(answers.civilStatus === 'Single', 105, 233)
  mark(answers.civilStatus === 'Separated', 200, 233)
  mark(answers.civilStatus === 'Married', 105, 246)
  mark(answers.civilStatus === 'Live-in', 200, 246)
  mark(answers.civilStatus === 'Widowed', 105, 261)
  // TIN / HEIGHT row band ~270-284
  write(answers.tin, 100, 278)
  write(answers.height, 340, 278)
  // GSIS/SSS / EMAIL row band ~284-298
  write(answers.gsisSss, 100, 292)
  write(answers.email, 340, 292)
  // PAG-IBIG / LANDLINE row band ~298-312
  write(answers.pagibig, 100, 306)
  write(answers.landline, 340, 306)
  // PHILHEALTH / CELLPHONE row band ~312-326
  write(answers.philhealth, 100, 320)
  write(answers.cellphone, 340, 320)
  // DISABILITY specify line (next to 'Others, specify:')
  write(answers.disability, 380, 344, { size: 8 })

  // EMPLOYMENT STATUS / TYPE
  mark(answers.employmentStatus === 'Employed', 116, 364)
  mark(answers.employmentStatus === 'Unemployed', 246, 364)
  const typeDetail = (answers.employmentTypeDetail || '').toLowerCase()
  mark(typeDetail.includes('wage'), 132, 390)
  mark(typeDetail.includes('self'), 132, 416)
  mark(typeDetail.includes('fresh') || typeDetail.includes('new entrant'), 258, 390)
  mark(typeDetail.includes('finished') || typeDetail.includes('contract'), 258, 412)
  mark(typeDetail.includes('resigned'), 258, 432)
  mark(typeDetail.includes('retired'), 258, 456)
  if (typeDetail.includes('terminated') && typeDetail.includes('abroad')) write(answers.employmentTypeDetail, 443, 424, { size: 7 })
  else if (typeDetail && !['wage', 'self', 'fresh', 'new entrant', 'finished', 'contract', 'resigned', 'retired'].some((k) => typeDetail.includes(k))) {
    write(answers.employmentTypeDetail, 445, 444, { size: 7 })
  }

  // Looking-for-work questions
  mark(answers.activelyLooking === 'Yes', 155, 473)
  mark(answers.activelyLooking === 'No', 180, 473)
  write(answers.lookingDuration, 430, 473, { size: 8 })
  mark(answers.willingImmediately === 'Yes', 155, 485)
  mark(answers.willingImmediately === 'No', 180, 485)
  write(answers.willingWhen, 340, 485, { size: 8 })
  mark(answers.fourPs === 'Yes', 155, 509)
  mark(answers.fourPs === 'No', 180, 509)
  write(answers.fourPsId, 430, 509, { size: 8 })

  // II. JOB PREFERENCE
  write(answers.occupation1, 36, 562)
  write(answers.occupation2, 36, 584)
  write(answers.occupation3, 36, 606)
  write(answers.occupation4, 36, 626)
  write(answers.localPref1, 175, 582)
  write(answers.localPref2, 175, 606)
  write(answers.localPref3, 175, 626)
  write(answers.overseasPref1, 400, 582)
  write(answers.overseasPref2, 400, 606)
  write(answers.overseasPref3, 400, 626)
  write(answers.expectedSalary, 36, 662)
  write(answers.passportNo, 322, 662)
  write(answers.passportExpiry, 480, 662)

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

async function generateNsrpDocument(answers, fallbackEmail) {
  const templateBuffer = fs.readFileSync(nsrpTemplatePath)
  const filledBuffer = await createReport({
    template: templateBuffer,
    data: {
      surname: answers.surname || '',
      firstName: answers.firstName || '',
      middleName: answers.middleName || '',
      suffix: answers.suffix || '',
      dob: answers.dob || '',
      placeOfBirth: answers.placeOfBirth || '',
      sexMale: answers.sex === 'Male' ? '[X]' : '[  ]',
      sexFemale: answers.sex === 'Female' ? '[X]' : '[  ]',
      religion: answers.religion || '',
      addressStreet: answers.addressStreet || '',
      addressBarangay: answers.addressBarangay || '',
      addressCity: answers.addressCity || '',
      addressProvince: answers.addressProvince || '',
      civilSingle: answers.civilStatus === 'Single' ? '[X]' : '[  ]',
      civilSeparated: answers.civilStatus === 'Separated' ? '[X]' : '[  ]',
      civilMarried: answers.civilStatus === 'Married' ? '[X]' : '[  ]',
      civilLiveIn: answers.civilStatus === 'Live-in' ? '[X]' : '[  ]',
      civilWidowed: answers.civilStatus === 'Widowed' ? '[X]' : '[  ]',
      tin: answers.tin || '',
      height: answers.height || '',
      gsisSss: answers.gsisSss || '',
      email: answers.email || fallbackEmail || '',
      pagibig: answers.pagibig || '',
      landline: answers.landline || '',
      philhealth: answers.philhealth || '',
      cellphone: answers.cellphone || '',
      disability: answers.disability ? `Disability: ${answers.disability}` : '',
      empEmployed: answers.employmentStatus === 'Employed' ? '[X]' : '[  ]',
      empUnemployed: answers.employmentStatus === 'Unemployed' ? '[X]' : '[  ]',
      empTypeDetail: answers.employmentTypeDetail ? `Type: ${answers.employmentTypeDetail}` : '',
      activelyLooking: `Actively looking for work: ${answers.activelyLooking || 'N/A'}`,
      lookingDuration: answers.lookingDuration || 'N/A',
      willingImmediately: answers.willingImmediately || 'N/A',
      willingWhen: answers.willingWhen || 'N/A',
      fourPs: `4Ps beneficiary: ${answers.fourPs || 'N/A'}`,
      fourPsId: answers.fourPsId || 'N/A',
      occupation1: answers.occupation1 || '',
      occupation2: answers.occupation2 || '',
      occupation3: answers.occupation3 || '',
      occupation4: answers.occupation4 || '',
      localPref1: answers.localPref1 || '',
      localPref2: answers.localPref2 || '',
      localPref3: answers.localPref3 || '',
      overseasPref1: answers.overseasPref1 || '',
      overseasPref2: answers.overseasPref2 || '',
      overseasPref3: answers.overseasPref3 || '',
      expectedSalary: answers.expectedSalary || '',
      passportNo: answers.passportNo || '',
      passportExpiry: answers.passportExpiry || '',
    },
    cmdDelimiter: ['{', '}'],
  })
  const docxBuffer = Buffer.isBuffer(filledBuffer) ? filledBuffer : Buffer.from(filledBuffer)
  const filename = `NSRP-${(answers.surname || 'applicant').replace(/\s+/g, '_')}-${Date.now()}.docx`
  return { docxBuffer, filename }
}

// Generate a filled NSRP Form 1 document from browser answers and let the applicant download it
app.post('/api/nsrp/generate', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const answers = req.body || {}
    if (!answers.surname || !answers.firstName) return res.status(400).json({ error: 'Surname and first name are required' })

    const surname = (answers.surname || 'form').replace(/\s+/g, '_')
    const pdfBuffer = await generateNsrpPdf(answers)
    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', `attachment; filename="NSRP-${surname}.pdf"`)
    res.send(pdfBuffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/jobs/:id/apply', applicationUpload.single('nsrp'), async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.status !== 'approved') return res.status(400).json({ error: 'Job is not available' })

    const applicant = await Applicant.findOne({ email: decoded.email }).lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })

    // Submission requires uploading the completed form (PDF or DOCX)
    if (!req.file) return res.status(400).json({ error: 'Please upload your completed NSRP form (PDF or DOCX)' })
    const nsrpFilePayload = {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
    }

    if (job.applicants.some((existingApplicant) => existingApplicant.email === decoded.email)) {
      return res.status(409).json({ error: 'You have already applied for this job' })
    }

    await JobApplication.create({
      jobId: job._id,
      applicantEmail: decoded.email,
      nsrpFile: nsrpFilePayload,
    })

    job.applicants.push({ email: decoded.email, appliedAt: new Date() })
    await job.save()

    const admins = await Admin.find().lean()
    if (admins.length > 0) {
      const employer = await Employer.findOne({ email: job.createdBy }).lean()
      const applicantName = applicant?.profile?.name || applicant.email
      const employerName = employer?.companyName || job.company || job.createdBy || 'Unknown employer'

      await Notification.insertMany(
        admins.map((admin) => ({
          recipientEmail: admin.email,
          title: 'New applicant needs referral review',
          message: `${applicantName} applied to "${job.title}" at ${employerName}. Review and decide whether to refer.`,
          type: 'new_application',
          kind: 'new_application',
          read: false,
          linkPath: '/peso-referrals',
          actionable: true,
          applicantId: applicant._id,
          jobId: job._id,
          employerId: employer?._id,
          applicantName,
          jobTitle: job.title,
          employerName,
        })),
      )
    }

    res.json({ success: true, job })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/referrals', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })

    const { jobId, applicantIds } = req.body || {}
    if (!jobId || !Array.isArray(applicantIds) || applicantIds.length === 0) {
      return res.status(400).json({ error: 'jobId and applicantIds are required' })
    }

    const job = await JobPosting.findById(jobId)
    if (!job) return res.status(404).json({ error: 'Job not found' })

    const employer = await Employer.findOne({ email: job.createdBy }).lean()
    if (!employer) return res.status(404).json({ error: 'Employer for job not found' })

    const admin = await Admin.findOne({ email: decoded.email }).lean()
    if (!admin) return res.status(404).json({ error: 'Admin not found' })

    const normalizedApplicantIds = applicantIds
      .filter((id) => typeof id === 'string' || typeof id === 'number' || (id && typeof id === 'object'))
      .map((id) => String(id))

    if (normalizedApplicantIds.length === 0) {
      return res.status(400).json({ error: 'No valid applicantIds provided' })
    }

    const existingApplicants = await Applicant.find({ _id: { $in: normalizedApplicantIds } }).select('_id').lean()
    const existingApplicantIds = new Set(existingApplicants.map((a) => String(a._id)))

    const existingReferrals = await Referral.find({
      jobId: job._id,
      applicantId: { $in: normalizedApplicantIds },
    }).select('applicantId').lean()
    const alreadyReferredApplicantIds = new Set(existingReferrals.map((referral) => String(referral.applicantId)))

    const referralsPayload = normalizedApplicantIds
      .filter((applicantId) =>
        existingApplicantIds.has(applicantId) && !alreadyReferredApplicantIds.has(applicantId),
      )
      .map((applicantId) => ({
        jobId: job._id,
        applicantId,
        employerId: employer._id,
        referredBy: admin._id,
        status: 'pending',
      }))

    if (referralsPayload.length === 0) {
      return res.json({ createdCount: 0, referrals: [], message: 'Applicants already referred for this job' })
    }

    const created = await Referral.insertMany(referralsPayload)
    res.json({ createdCount: created.length, referrals: created })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.delete('/api/referrals', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })

    const { jobId, applicantIds } = req.body || {}
    const applicantId = Array.isArray(applicantIds) ? applicantIds[0] : null
    if (!jobId || !applicantId) return res.status(400).json({ error: 'jobId and applicantId are required' })

    const deleted = await Referral.deleteOne({ jobId, applicantId: String(applicantId) })
    res.json({ deletedCount: deleted.deletedCount || 0 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/referrals/admin', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })

    const referrals = await Referral.find().select('jobId applicantId status').lean()
    res.json(referrals)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/referrals/employer/:employerId', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!['Admin', 'Employer'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })

    if (decoded.role === 'Employer') {
      if (!(await requireApprovedEmployer(decoded, res))) return
      const employer = await Employer.findOne({ email: decoded.email }).lean()
      if (!employer) return res.status(404).json({ error: 'Employer not found' })
      if (String(employer._id) !== String(req.params.employerId)) return res.status(403).json({ error: 'Forbidden' })
    }

    const referrals = await Referral.find({ employerId: req.params.employerId })
      .sort({ createdAt: -1 })
      .populate({ path: 'applicantId', select: 'email profile resumeFile.originalName resumeFile.size resumeFile.uploadedAt' })
      .populate({
        path: 'jobId',
        model: JobPosting,
        select: 'title company location description requirements salary locationType employmentType status createdBy createdAt',
      })

    res.json(referrals)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.put('/api/referrals/:id/respond', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!(await requireApprovedEmployer(decoded, res))) return

    const { status } = req.body || {}
    if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const employer = await Employer.findOne({ email: decoded.email }).lean()
    if (!employer) return res.status(404).json({ error: 'Employer not found' })

    const referral = await Referral.findById(req.params.id)
    if (!referral) return res.status(404).json({ error: 'Referral not found' })
    if (String(referral.employerId) !== String(employer._id)) return res.status(403).json({ error: 'Forbidden' })

    referral.status = status
    await referral.save()

    res.json(referral)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/hire-reports', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })

    const { applicantId, jobId, status, referralId } = req.body || {}
    if (!applicantId || !jobId || !status) {
      return res.status(400).json({ error: 'applicantId, jobId, and status are required' })
    }
    if (!['hired', 'deployed'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const employer = await Employer.findOne({ email: decoded.email }).lean()
    if (!employer) return res.status(404).json({ error: 'Employer not found' })

    const job = await JobPosting.findById(jobId)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.createdBy !== decoded.email) return res.status(403).json({ error: 'Forbidden' })

    const applicant = await Applicant.findById(applicantId).lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })

    let referral = null
    if (referralId) {
      referral = await Referral.findById(referralId)
      if (!referral) return res.status(404).json({ error: 'Referral not found' })
      if (String(referral.employerId) !== String(employer._id)) return res.status(403).json({ error: 'Forbidden' })
      if (String(referral.applicantId) !== String(applicantId) || String(referral.jobId) !== String(jobId)) {
        return res.status(400).json({ error: 'Referral does not match applicant/job' })
      }
    }

    const hireReport = await HireReport.create({
      referralId: referral ? referral._id : undefined,
      applicantId,
      employerId: employer._id,
      jobId,
      status,
    })

    res.json(hireReport)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/hire-reports', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })

    const { employerId, status, from, to } = req.query || {}
    const filter = {}

    if (employerId) filter.employerId = employerId
    if (status) {
      if (!['hired', 'deployed'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
      filter.status = status
    }

    if (from || to) {
      const reportedAt = {}
      if (from) {
        const fromDate = new Date(from)
        if (Number.isNaN(fromDate.getTime())) return res.status(400).json({ error: 'Invalid from date' })
        reportedAt.$gte = fromDate
      }
      if (to) {
        const toDate = new Date(to)
        if (Number.isNaN(toDate.getTime())) return res.status(400).json({ error: 'Invalid to date' })
        reportedAt.$lte = toDate
      }
      filter.reportedAt = reportedAt
    }

    const hireReports = await HireReport.find(filter).sort({ reportedAt: -1 })
    res.json(hireReports)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/ratings', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)

    const { toUserId, toRole, hireReportId, score, comment } = req.body || {}
    if (!toUserId || !toRole || !hireReportId || score === undefined || score === null) {
      return res.status(400).json({ error: 'toUserId, toRole, hireReportId, and score are required' })
    }

    const numericScore = Number(score)
    if (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 5) {
      return res.status(400).json({ error: 'Invalid score' })
    }

    const hireReport = await HireReport.findById(hireReportId)
    if (!hireReport) return res.status(404).json({ error: 'Hire report not found' })

    let fromUser = null
    let fromRole = null
    if (decoded.role === 'Employer') {
      if (!(await requireApprovedEmployer(decoded, res))) return
      fromUser = await Employer.findOne({ email: decoded.email }).select('_id').lean()
      fromRole = 'employer'
      if (!fromUser) return res.status(404).json({ error: 'Employer not found' })
      if (String(hireReport.employerId) !== String(fromUser._id)) return res.status(403).json({ error: 'Forbidden' })
      if (String(toUserId) !== String(hireReport.applicantId)) return res.status(400).json({ error: 'toUserId does not match hire report' })
    } else if (decoded.role === 'Applicant') {
      fromUser = await Applicant.findOne({ email: decoded.email }).select('_id').lean()
      fromRole = 'applicant'
      if (!fromUser) return res.status(404).json({ error: 'Applicant not found' })
      if (String(hireReport.applicantId) !== String(fromUser._id)) return res.status(403).json({ error: 'Forbidden' })
      if (String(toUserId) !== String(hireReport.employerId)) return res.status(400).json({ error: 'toUserId does not match hire report' })
    } else {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const existingRating = await Rating.findOne({ fromUserId: fromUser._id, hireReportId })
    if (existingRating) return res.status(400).json({ error: 'Rating already exists for this hire report' })

    const rating = await Rating.create({
      fromUserId: fromUser._id,
      fromRole,
      toUserId,
      toRole,
      hireReportId,
      score: numericScore,
      comment,
    })

    res.json(rating)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/ratings/:userId', async (req, res) => {
  try {
    const ratings = await Rating.find({ toUserId: req.params.userId }).sort({ createdAt: -1 })
    const total = ratings.reduce((sum, item) => sum + Number(item.score || 0), 0)
    const averageScore = ratings.length > 0 ? total / ratings.length : 0

    res.json({
      userId: req.params.userId,
      averageScore,
      totalRatings: ratings.length,
      ratings,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/notifications', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!decoded.email) return res.status(401).json({ error: 'Invalid token payload' })

    const storedNotifications = await Notification.find({ recipientEmail: decoded.email }).sort({ createdAt: -1 }).lean()
    const filteredStoredNotifications = decoded.role === 'Admin'
      ? storedNotifications.filter((item) => !(item.title === 'New job posting pending review' && item.kind === 'job-review'))
      : storedNotifications

    // Derive notifications from job records so historic approve/decline events still appear.
    let derivedNotifications = []
    if (decoded.role === 'Employer') {
      const reviewedJobs = await JobPosting.find({
        createdBy: decoded.email,
        status: { $in: ['approved', 'declined'] },
      }).sort({ approvedAt: -1, createdAt: -1 }).lean()

      derivedNotifications = reviewedJobs.map((job) => ({
        _id: `job-status-${job._id}`,
        jobId: job._id,
        status: job.status,
        company: job.company,
        location: job.location,
        description: job.description,
        requirements: job.requirements,
        salary: job.salary,
        requestedBy: job.createdBy,
        actionable: false,
        recipientEmail: decoded.email,
        title: job.status === 'approved' ? 'Posting approved' : 'Posting declined',
        message: job.status === 'approved'
          ? `Your job posting "${job.title}" was approved by the admin.`
          : `Your job posting "${job.title}" was declined by the admin.`,
        kind: 'job-review',
        linkPath: '/jobs',
        createdAt: job.approvedAt || job.updatedAt || job.createdAt,
        source: 'derived',
      }))
    }

    if (decoded.role === 'Admin') {
      const pendingJobs = await JobPosting.find({ status: 'pending' }).sort({ createdAt: -1 }).lean()
      const reviewedJobs = await JobPosting.find({ status: { $in: ['approved', 'declined'] } }).sort({ approvedAt: -1, createdAt: -1 }).lean()

      const pendingItems = pendingJobs.map((job) => ({
        _id: `job-pending-${job._id}`,
        jobId: job._id,
        status: job.status,
        company: job.company,
        location: job.location,
        description: job.description,
        requirements: job.requirements,
        salary: job.salary,
        requestedBy: job.createdBy,
        actionable: true,
        recipientEmail: decoded.email,
        title: 'New job posting pending review',
        message: `${job.createdBy || 'An employer'} submitted "${job.title}" for approval.`,
        kind: 'job-review',
        linkPath: '/jobs',
        createdAt: job.createdAt,
        source: 'derived',
      }))

      const reviewedItems = reviewedJobs.map((job) => ({
        _id: `job-reviewed-${job._id}`,
        jobId: job._id,
        status: job.status,
        company: job.company,
        location: job.location,
        description: job.description,
        requirements: job.requirements,
        salary: job.salary,
        requestedBy: job.createdBy,
        actionable: false,
        recipientEmail: decoded.email,
        title: 'Job review updated',
        message: `The posting "${job.title}" was ${job.status}.`,
        kind: 'job-review',
        linkPath: '/jobs',
        createdAt: job.approvedAt || job.updatedAt || job.createdAt,
        source: 'derived',
      }))

      derivedNotifications = [...pendingItems, ...reviewedItems]
    }

    const merged = [...filteredStoredNotifications, ...derivedNotifications]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    res.json(merged)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!decoded.email) return res.status(401).json({ error: 'Invalid token payload' })

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid notification id' })
    }

    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientEmail: decoded.email },
      { read: true },
      { new: true },
    ).lean()

    if (!updated) return res.status(404).json({ error: 'Notification not found' })

    res.json({ success: true, notification: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/employer-requests', async (req, res) => {
  try {
    const { email, password, companyName, contactName, location, phone, message } = req.body || {}
    if (!email || !password || !companyName || !contactName) return res.status(400).json({ error: 'Missing required fields' })
    if (!/^\d{11}$/.test(String(phone || ''))) return res.status(400).json({ error: 'Phone number must contain exactly 11 digits' })

    const existingUser = await findUserByEmail(email)
    if (existingUser) return res.status(409).json({ error: 'Email already in use' })
    const existingRequest = await EmployerRequest.findOne({ email })
    if (existingRequest) return res.status(409).json({ error: 'Employer request already submitted' })

    const passwordHash = await bcrypt.hash(password, 10)
    await createUserInRole('Employer', {
      email,
      passwordHash,
      verificationStatus: 'pending_verification',
      companyName,
      contactName,
      phone,
      profile: { name: contactName, location, summary: companyName },
    })
    const request = new EmployerRequest({ email, passwordHash, companyName, contactName, location, phone, message })
    await request.save()
    res.json({ success: true, request: { email: request.email, companyName, contactName, location, phone, message, status: request.status } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/employer-requests', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })

    const requests = await EmployerRequest.find({ status: { $in: ['pending', 'under_review'] } }).sort({ createdAt: -1 })
    res.json(requests)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/employer-requirements', requirementsUpload.single('requirements'), async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
    if (!req.file) return res.status(400).json({ error: 'An NSRP registration PDF is required' })

    const request = await EmployerRequest.findOne({ email: decoded.email })
    if (!request) return res.status(404).json({ error: 'Employer request not found' })
    if (!['pending', 'declined'].includes(request.status)) {
      return res.status(400).json({ error: 'This employer request has already been approved' })
    }

    if (request.requirementsFile?.path && fs.existsSync(request.requirementsFile.path)) {
      fs.unlinkSync(request.requirementsFile.path)
    }

    request.requirementsFile = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
    }
    request.requirementsSubmittedAt = new Date()
    request.status = 'under_review'
    request.reviewReason = undefined
    await request.save()
    await Employer.updateOne({ email: decoded.email }, {
      $set: { verificationStatus: 'under_review', requirementsSubmittedAt: request.requirementsSubmittedAt },
      $unset: { verificationReason: 1 },
    })

    const admins = await Admin.find().select('email').lean()
    if (admins.length > 0) {
      await Notification.insertMany(admins.map((admin) => ({
        recipientEmail: admin.email,
        title: 'Employer requirements submitted',
        message: `${decoded.email} submitted an NSRP registration form for review.`,
        type: 'employer_requirements',
        kind: 'employer-requirements',
        actionable: true,
        linkPath: '/requests',
      })))
    }

    res.json({ success: true, status: request.status, submittedAt: request.requirementsSubmittedAt })
  } catch (err) {
    console.error(err)
    res.status(err?.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: err?.message || 'Failed to submit requirements' })
  }
})

app.get('/api/employer-requirements/current/view', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
    const request = await EmployerRequest.findOne({ email: decoded.email }).select('+requirementsFile.data').lean()
    if (!request?.requirementsFile?.data && (!request?.requirementsFile?.path || !fs.existsSync(request.requirementsFile.path))) {
      return res.status(404).json({ error: 'Requirements PDF not found' })
    }
    if (request.requirementsFile.data) {
      res.type('application/pdf')
      res.set('Content-Disposition', 'inline')
      return res.send(request.requirementsFile.data)
    }
    res.type('application/pdf')
    res.set('Content-Disposition', 'inline')
    res.sendFile(path.resolve(request.requirementsFile.path))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to view requirements' })
  }
})

app.get('/api/employer-requirements/:id/download', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const request = await EmployerRequest.findById(req.params.id).select('+requirementsFile.data').lean()
    if (!request?.requirementsFile?.data && (!request?.requirementsFile?.path || !fs.existsSync(request.requirementsFile.path))) {
      return res.status(404).json({ error: 'Requirements PDF not found' })
    }
    if (request.requirementsFile.data) {
      res.type('application/pdf')
      res.set('Content-Disposition', `attachment; filename="${request.requirementsFile.originalName || 'nsrp-registration-form.pdf'}"`)
      return res.send(request.requirementsFile.data)
    }
    res.download(request.requirementsFile.path, request.requirementsFile.originalName || 'nsrp-registration-form.pdf')
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to download requirements' })
  }
})

app.get('/api/employer-requirements/:id/view', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const request = await EmployerRequest.findById(req.params.id).select('+requirementsFile.data').lean()
    if (!request?.requirementsFile?.data && (!request?.requirementsFile?.path || !fs.existsSync(request.requirementsFile.path))) {
      return res.status(404).json({ error: 'Requirements PDF not found' })
    }
    if (request.requirementsFile.data) {
      res.type('application/pdf')
      res.set('Content-Disposition', 'inline')
      return res.send(request.requirementsFile.data)
    }
    res.type('application/pdf')
    res.set('Content-Disposition', 'inline')
    res.sendFile(path.resolve(request.requirementsFile.path))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to view requirements' })
  }
})

// Admin: view an applicant's NSRP application PDF for a given job
app.get('/api/job-applications/view', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const { jobId, email } = req.query || {}
    if (!jobId || !email) return res.status(400).json({ error: 'jobId and email are required' })
    const application = await JobApplication.findOne({ jobId, applicantEmail: { $regex: `^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }).select('+nsrpFile.data').lean()
    if (!application?.nsrpFile?.data) return res.status(404).json({ error: 'Application NSRP PDF not found' })
    const file = application.nsrpFile
    const raw = file.data
    const buffer = Buffer.isBuffer(raw) ? raw : (raw?.buffer ? Buffer.from(raw.buffer) : Buffer.from(raw))
    const filename = file.originalName || 'nsrp-form'
    // Serve with the correct content type so PDFs render inline and DOCX files download cleanly
    res.type(file.mimetype || 'application/octet-stream')
    const isPdf = (file.mimetype || '').includes('pdf') || filename.toLowerCase().endsWith('.pdf')
    res.set('Content-Disposition', `${isPdf ? 'inline' : 'attachment'}; filename="${filename}"`)
    res.send(buffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to view application NSRP' })
  }
})

app.put('/api/employer-requests/:id/status', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const { status } = req.body || {}
    if (!['approved', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const request = await EmployerRequest.findById(req.params.id)
    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (!['pending', 'under_review'].includes(request.status)) return res.status(400).json({ error: 'Request already processed' })

    request.status = status
    if (status === 'approved') {
      request.approvedBy = decoded.email
      request.approvedAt = new Date()
      if (!request.requirementsFile?.data && request.requirementsFile?.path && fs.existsSync(request.requirementsFile.path)) {
        request.requirementsFile.data = fs.readFileSync(request.requirementsFile.path)
      }
    }
    await request.save()

    const reviewReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
    request.reviewReason = reviewReason || undefined
    await request.save()
    const employerUpdate = reviewReason
      ? { $set: { verificationStatus: status, verificationReason: reviewReason } }
      : { $set: { verificationStatus: status }, $unset: { verificationReason: 1 } }
    await Employer.updateOne({ email: request.email }, employerUpdate)

    res.json(request)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin: review an applicant's NSRP (resume) for account verification
app.put('/api/applicants/:id/verification', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const { status, reason } = req.body || {}
    if (!['approved', 'declined', 'restricted'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const applicant = await Applicant.findById(req.params.id)
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })

    const reviewReason = typeof reason === 'string' ? reason.trim() : ''
    applicant.verificationStatus = status
    if (reviewReason) applicant.verificationReason = reviewReason
    else applicant.verificationReason = undefined
    await applicant.save()

    res.json({ id: String(applicant._id), email: applicant.email, verificationStatus: applicant.verificationStatus })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin: list all accounts across collections
app.get('/api/admin/users', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })

    const admins = await Admin.find().lean()
    const employers = await Employer.find().lean()
    const applicants = await Applicant.find().lean()
    const employerRequests = await EmployerRequest.find().lean()
    const requestByEmail = new Map(employerRequests.map((request) => [request.email.toLowerCase(), request]))

    const mapAdmin = admins.map((u) => ({ id: u._id, email: u.email, role: 'Admin', profile: u.profile, createdAt: u.createdAt }))
    const mapEmployer = employers.map((u) => {
      const request = requestByEmail.get(u.email.toLowerCase())
      return {
        id: u._id,
        email: u.email,
        role: 'Employer',
        companyName: u.companyName,
        contactName: u.contactName,
        phone: u.phone || request?.phone,
        website: u.website,
        profile: u.profile,
        approvalStatus: request?.status || 'approved',
        requestId: request ? String(request._id) : undefined,
        requirementsFile: request?.requirementsFile ? {
          requestId: String(request._id),
          originalName: request.requirementsFile.originalName,
          size: request.requirementsFile.size,
          submittedAt: request.requirementsSubmittedAt,
        } : undefined,
        createdAt: u.createdAt,
      }
    })
    const employerAccountEmails = new Set(employers.map((u) => u.email.toLowerCase()))
    const mapEmployerRequests = employerRequests.filter((request) => !employerAccountEmails.has(request.email.toLowerCase())).map((request) => ({
      id: request._id, email: request.email, role: 'Employer', companyName: request.companyName, contactName: request.contactName, phone: request.phone,
      profile: { location: request.location, summary: request.message }, approvalStatus: request.status, createdAt: request.createdAt,
    }))
    const mapApplicant = applicants.map((u) => ({ id: u._id, email: u.email, role: 'Applicant', phone: u.phone || u.profile?.phone, profile: u.profile, verificationStatus: u.verificationStatus || 'approved', hasResume: Boolean(u.resumeFile?.data || u.resumeFile?.originalName), hasNsrpVerification: Boolean(u.nsrpVerificationFile?.data || u.nsrpVerificationFile?.originalName), createdAt: u.createdAt }))

    const combined = [...mapAdmin, ...mapEmployer, ...mapEmployerRequests, ...mapApplicant]
    res.json(combined)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Error handler to surface raw body when JSON parsing fails
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('JSON parse error. Raw body:', req.rawBody)
    return res.status(400).json({ error: 'Invalid JSON payload' })
  }
  next(err)
})

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
