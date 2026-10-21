import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import multer from 'multer'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { createReport } from 'docx-templates'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { Applicant, Employer, Admin, JobTitle, Notification, Referral, HireReport, Rating, findUserByEmail, emailTakenAcrossRoles, createUserInRole, updateUserProfileByEmail } from './models/collections.js'
import { sendEmail, sendVerificationEmail } from './mailer.js'
import { normalizeEmail, generateVerifyToken, hashVerifyToken, VERIFY_TOKEN_TTL_MS, RESEND_COOLDOWN_MS } from './utils/emailVerification.js'
import { passwordErrorMessage } from './utils/passwordPolicy.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: 'http://localhost:5173' }))
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

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
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
  slots: { type: Number, min: 1 },
  deadline: Date,
  locationType: { type: String, enum: ['', 'On-site', 'Hybrid', 'Remote'], default: '' },
  employmentType: { type: String, enum: ['', 'Full-time', 'Part-time', 'Contract', 'Internship'], default: '' },
  skills: [String],
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  reviewReason: String,
  approvedBy: String,
  approvedAt: Date,
  reviewHistory: [{
    status: { type: String, enum: ['approved', 'declined'], required: true },
    reason: String,
    reviewedBy: String,
    reviewedAt: { type: Date, default: Date.now },
  }],
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

// --- Verification documents (applicant identity docs, sensitive under RA 10173) ---
const VERIFICATION_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const VERIFICATION_MAX_BYTES = 5 * 1024 * 1024 // 5 MB per file

// Magic-byte signatures checked against the declared MIME type (not just extension)
const FILE_SIGNATURES = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
}
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const RESUME_MIME_TYPES = [...VERIFICATION_DOC_TYPES, DOCX_MIME_TYPE]
const RESUME_MAX_BYTES = 5 * 1024 * 1024

function bufferMatchesDeclaredType(buffer, mimetype) {
  if (mimetype === DOCX_MIME_TYPE) {
    return Boolean(buffer && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
  }
  const signatures = FILE_SIGNATURES[mimetype]
  if (!signatures || !buffer || buffer.length < 4) return false
  return signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte))
}

function fileMatchesDeclaredType(file) {
  if (!file) return false
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return path.extname(file.originalname).toLowerCase() === '.docx'
      && bufferMatchesDeclaredType(file.buffer, file.mimetype)
  }
  const extensions = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
  }[file.mimetype]
  return Boolean(extensions?.includes(path.extname(file.originalname).toLowerCase())
    && bufferMatchesDeclaredType(file.buffer, file.mimetype))
}

const verificationUpload = multer({
  storage: multer.memoryStorage(), // kept in DB, never on a public path
  limits: { fileSize: VERIFICATION_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!RESUME_MIME_TYPES.includes(file.mimetype)) {
      return callback(new Error('Only JPG, PNG, PDF, or DOCX files are accepted'))
    }
    callback(null, true)
  },
})
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESUME_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    const extensions = {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      [DOCX_MIME_TYPE]: ['.docx'],
    }[file.mimetype]
    if (!extensions?.includes(path.extname(file.originalname).toLowerCase())) {
      return callback(new Error('Upload a PDF, DOCX, JPG, or PNG resume with a matching extension'))
    }
    callback(null, true)
  },
})
const applicantSignupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    }
    const extensions = allowed[file.mimetype]
    if (!extensions?.includes(path.extname(file.originalname).toLowerCase())) {
      return callback(new Error('Upload a PDF, JPG, PNG, or DOCX file with a matching extension'))
    }
    callback(null, true)
  },
})

const VERIFICATION_DOC_KEYS = ['nsrpForm', 'birthCertificate', 'validId1', 'validId2', 'resume']
const REQUIRED_DOC_KEYS = ['nsrpForm', 'birthCertificate', 'validId1', 'resume']
const VALID_ID_TYPES = ['SSS', 'Passport', 'PRC', 'Pag-IBIG', "Voter's ID", 'Philippine Postal ID', 'UMID']
const MAX_UPLOADS_PER_DOC = 5
const VERIFICATION_DOC_LABELS = {
  nsrpForm: 'NSRP Registration Form',
  birthCertificate: 'Birth Certificate',
  validId1: 'Valid ID #1',
  validId2: 'Valid ID #2',
  resume: 'Resume',
}
// Projection to re-include the select:false buffers when streaming
const VERIFICATION_DATA_SELECT = VERIFICATION_DOC_KEYS.map((key) => `+verificationDocuments.${key}.versions.data`).join(' ')

function authenticateRequest(req) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return null
  try {
    return jwt.verify(auth.split(' ')[1], jwtSecret)
  } catch {
    return null
  }
}

// Signed, expiring URL so admins (and the owner) can view a doc without a public URL
function signDocumentUrl(applicantId, docKey, versionIndex) {
  const token = jwt.sign({ applicantId: String(applicantId), docKey, versionIndex }, jwtSecret, { expiresIn: '10m' })
  return `/api/documents/view/${token}`
}

const latestVersion = (slot) => (slot?.versions?.length ? slot.versions[slot.versions.length - 1] : null)
const currentDocStatus = (slot) => latestVersion(slot)?.status || 'missing'

function resumeMetadata(applicant) {
  const resume = latestVersion(applicant?.verificationDocuments?.resume)
  if (resume) {
    return { originalName: resume.originalName, mimetype: resume.mimetype, size: resume.size, uploadedAt: resume.uploadedAt, status: resume.status }
  }
  const legacy = applicant?.resumeFile
  return legacy?.originalName
    ? { originalName: legacy.originalName, mimetype: legacy.mimetype, size: legacy.size, uploadedAt: legacy.uploadedAt, status: 'pending' }
    : undefined
}

async function migrateLegacyResume(applicant) {
  const slot = applicant.verificationDocuments?.resume
  if (latestVersion(slot) || !applicant.resumeFile?.data || !applicant.resumeFile?.originalName) return false
  const uploadedAt = applicant.resumeFile.uploadedAt || applicant.updatedAt || new Date()
  applicant.set('verificationDocuments.resume', {
    uploads: 1,
    versions: [{
      originalName: applicant.resumeFile.originalName,
      storedName: crypto.randomBytes(16).toString('hex'),
      mimetype: applicant.resumeFile.mimetype || 'application/pdf',
      size: applicant.resumeFile.size || applicant.resumeFile.data.length,
      uploadedAt,
      data: applicant.resumeFile.data,
      version: 1,
      status: 'pending',
    }],
  })
  return true
}

async function loadApplicantWithCurrentResume(email) {
  const applicant = await Applicant.findOne({ email }).select('+resumeFile.data')
  if (!applicant) return null
  const migrated = await migrateLegacyResume(applicant)
  const previousStatus = applicant.verificationStatus
  recomputeVerificationStatus(applicant)
  if (migrated || applicant.verificationStatus !== previousStatus) await applicant.save()
  return applicant
}

function summarizeVerificationDocuments(applicant, { withUrls = false, includeHistory = false } = {}) {
  const docs = applicant?.verificationDocuments || {}
  return VERIFICATION_DOC_KEYS.map((key) => {
    const slot = docs[key]
    if (!slot && !REQUIRED_DOC_KEYS.includes(key)) return null
    const latest = latestVersion(slot)
    const history = includeHistory
      ? (slot?.versions || []).map((version, index) => ({
          version: version.version,
          status: version.status,
          reviewReason: version.reviewReason || undefined,
          originalName: version.originalName,
          mimetype: version.mimetype,
          size: version.size,
          uploadedAt: version.uploadedAt,
          reviewedAt: version.reviewedAt,
          url: withUrls ? signDocumentUrl(applicant._id, key, index) : undefined,
        }))
      : undefined
    return {
      docKey: key,
      label: VERIFICATION_DOC_LABELS[key],
      required: REQUIRED_DOC_KEYS.includes(key),
      idType: slot?.idType || undefined,
      status: currentDocStatus(slot), // missing | pending | approved | rejected
      uploadsUsed: slot?.uploads || 0,
      uploadsRemaining: Math.max(0, MAX_UPLOADS_PER_DOC - (slot?.uploads || 0)),
      resubmitted: (slot?.versions?.length || 0) > 1 && currentDocStatus(slot) === 'pending',
      latest: latest
        ? {
            version: latest.version,
            originalName: latest.originalName,
            mimetype: latest.mimetype,
            size: latest.size,
            uploadedAt: latest.uploadedAt,
            reviewReason: latest.reviewReason || undefined,
            url: withUrls ? signDocumentUrl(applicant._id, key, slot.versions.length - 1) : undefined,
          }
        : null,
      history,
    }
  }).filter(Boolean)
}

// Count of documents that need the user's attention (rejected or missing required)
function attentionCount(applicant) {
  const docs = applicant?.verificationDocuments || {}
  return REQUIRED_DOC_KEYS.filter((key) => ['rejected', 'missing'].includes(currentDocStatus(docs[key]))).length
}

// Recompute the account-level status from the latest version of each required document
function recomputeVerificationStatus(applicant) {
  const docs = applicant.verificationDocuments || {}
  const rejected = REQUIRED_DOC_KEYS.filter((key) => currentDocStatus(docs[key]) === 'rejected')
  if (rejected.length > 0) {
    applicant.verificationStatus = 'declined'
    applicant.verificationReason = rejected
      .map((key) => `${VERIFICATION_DOC_LABELS[key]}: ${latestVersion(docs[key])?.reviewReason || 'rejected'}`)
      .join(' | ')
  } else if (REQUIRED_DOC_KEYS.every((key) => currentDocStatus(docs[key]) === 'approved')) {
    applicant.verificationStatus = 'approved'
    applicant.verificationReason = undefined
  } else {
    applicant.verificationStatus = 'under_review'
    applicant.verificationReason = undefined
  }
}

// sendEmail and sendVerificationEmail come from ./mailer.js (console fallback when SMTP is not configured)

// Issue a single-use email verification token; only the SHA-256 hash is stored
async function issueEmailVerification(user) {
  const rawToken = generateVerifyToken()
  user.emailVerifyTokenHash = hashVerifyToken(rawToken)
  user.emailVerifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS)
  user.emailVerifySentAt = new Date()
  await user.save()
  const result = await sendVerificationEmail(user.email, rawToken, user.constructor.modelName)
  return result
}

// Block unverified applicants/employers from gated routes (admins pass through)
async function requireVerifiedEmail(req, res, next) {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const decoded = jwt.verify(auth.split(' ')[1], jwtSecret)
    req.user = decoded
    if (decoded.role === 'Admin') return next()
    if (!['Applicant', 'Employer'].includes(decoded.role)) return next()
    const Model = decoded.role === 'Employer' ? Employer : Applicant
    const account = await Model.findOne({ email: decoded.email }).select('emailVerified').lean()
    if (!account) return res.status(404).json({ error: 'Account not found' })
    if (!account.emailVerified) {
      return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', error: 'Please verify your email address to continue.' })
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// --- Registration completeness (computed, never stored so it can't go stale) ---
// Applicant complete = name/location/skills/summary + NSRP form, birth certificate, valid ID #1, resume
// Employer complete = company name, contact name, phone, location + NSRP registration PDF on file
function registrationChecklist(user, type, extras = {}) {
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0
  if (type === 'Applicant') {
    const docs = user.verificationDocuments || {}
    const hasDoc = (key) => Boolean(latestVersion(docs[key]))
    return [
      { key: 'name', label: 'Full name', done: hasText(user.profile?.name), link: 'profile' },
      { key: 'location', label: 'Location', done: hasText(user.profile?.location), link: 'profile' },
      { key: 'skills', label: 'At least one skill', done: Array.isArray(user.profile?.skills) && user.profile.skills.some((skill) => typeof skill === 'string' && skill.trim()), link: 'profile' },
      { key: 'summary', label: 'Short bio / about me', done: hasText(user.profile?.summary), link: 'profile' },
      { key: 'nsrpForm', label: 'NSRP Registration Form', done: hasDoc('nsrpForm'), link: 'documents' },
      { key: 'birthCertificate', label: 'Birth Certificate', done: hasDoc('birthCertificate'), link: 'documents' },
      { key: 'validId1', label: 'Valid ID', done: hasDoc('validId1'), link: 'documents' },
      { key: 'resume', label: 'Resume (PDF, DOCX, JPG, or PNG)', done: hasDoc('resume'), link: 'documents' },
    ]
  }
  if (type === 'Employer') {
    const requirementsFile = extras.requirementsFile
    const hasRequirementsFile = Boolean(
      requirementsFile?.data
      || (requirementsFile?.path && fs.existsSync(requirementsFile.path)),
    )
    return [
      { key: 'companyName', label: 'Company name', done: hasText(user.companyName), link: 'profile' },
      { key: 'contactName', label: 'Contact person', done: hasText(user.contactName), link: 'profile' },
      { key: 'phone', label: 'Contact number', done: /^\d{11}$/.test(String(user.phone || '')), link: 'profile' },
      { key: 'location', label: 'Company location', done: hasText(user.profile?.location) || hasText(extras.requestLocation), link: 'profile' },
      { key: 'requirements', label: 'NSRP registration PDF', done: hasRequirementsFile, link: 'dashboard' },
    ]
  }
  return []
}

function registrationProgress(user, type, extras) {
  const checklist = registrationChecklist(user, type, extras)
  const done = checklist.filter((item) => item.done).length
  return { complete: checklist.length > 0 && done === checklist.length, done, total: checklist.length, checklist }
}

// Block applicants/employers with incomplete registration from gated routes (admins pass)
async function requireCompleteRegistration(req, res, next) {
  try {
    const decoded = req.user || authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role === 'Admin') return next()
    if (!['Applicant', 'Employer'].includes(decoded.role)) return next()
    const Model = decoded.role === 'Employer' ? Employer : Applicant
    const account = decoded.role === 'Applicant'
      ? await loadApplicantWithCurrentResume(decoded.email)
      : await Model.findOne({ email: decoded.email }).lean()
    if (!account) return res.status(404).json({ error: 'Account not found' })
    const extras = decoded.role === 'Employer'
      ? await EmployerRequest.findOne({ email: decoded.email }).select('+requirementsFile.data').lean()
      : undefined
    const progress = registrationProgress(account, decoded.role, { requirementsFile: extras?.requirementsFile, requestLocation: extras?.location })
    if (!progress.complete) {
      return res.status(403).json({ code: 'REGISTRATION_INCOMPLETE', error: 'Complete your registration to continue.', missing: progress.checklist.filter((item) => !item.done).map((item) => item.label) })
    }
    next()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
}

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

app.post('/api/signup', applicantSignupUpload.fields([
  { name: 'nsrpForm', maxCount: 1 },
  { name: 'birthCertificate', maxCount: 1 },
  { name: 'validId1Front', maxCount: 1 },
  { name: 'validId2Front', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
]), async (req, res) => {
  try {
    const { email, password, name, location, skills, traits, summary, consent, id1Type, id2Type } = req.body || {}
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Enter a valid email address' })
    if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'Missing password' })
    if (consent !== true && consent !== 'true') return res.status(400).json({ error: 'Data privacy consent is required (RA 10173)' })
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Full name is required' })
    if (!location || !String(location).trim()) return res.status(400).json({ error: 'Location is required' })
    if (!summary || !String(summary).trim()) return res.status(400).json({ error: 'Profile summary is required' })
    const parsedSkills = Array.isArray(skills) ? skills : String(skills || '').split(',')
    const profileSkills = parsedSkills.map((skill) => String(skill).trim()).filter(Boolean)
    if (profileSkills.length === 0) return res.status(400).json({ error: 'At least one skill is required' })
    const passwordError = passwordErrorMessage(password)
    if (passwordError) return res.status(400).json({ error: passwordError })

    const files = req.files || {}
    const fileFor = (key) => files[key]?.[0]
    const requiredFiles = ['nsrpForm', 'birthCertificate', 'validId1Front', 'resume']
    if (requiredFiles.some((key) => !fileFor(key))) {
      return res.status(400).json({ error: 'NSRP form, birth certificate, valid ID #1 front, and resume are required' })
    }
    const documentFiles = ['nsrpForm', 'birthCertificate', 'validId1Front', 'validId2Front']
    if (documentFiles.some((key) => fileFor(key) && fileFor(key).size > VERIFICATION_MAX_BYTES)) {
      return res.status(413).json({ error: 'Verification documents must be 5 MB or smaller' })
    }
    if (fileFor('resume').size > RESUME_MAX_BYTES) return res.status(413).json({ error: 'Resume must be 5 MB or smaller' })
    const id2Used = Boolean(fileFor('validId2Front') || fileFor('validId2Back') || id2Type)
    if (!VALID_ID_TYPES.includes(id1Type) || !fileFor('validId1Front')) return res.status(400).json({ error: 'Choose a valid type and upload the front of Valid ID #1' })
    if (id2Used && (!VALID_ID_TYPES.includes(id2Type) || !fileFor('validId2Front'))) return res.status(400).json({ error: 'Choose a valid type and upload the front of Valid ID #2 when uploading a second ID' })
    if (id2Used && id1Type === id2Type) return res.status(400).json({ error: 'Choose different types for the two IDs' })
    if ([...documentFiles, 'resume'].some((key) => fileFor(key) && !fileMatchesDeclaredType(fileFor(key)))) {
      return res.status(400).json({ error: 'One or more uploaded files do not match their declared file type' })
    }
    if (!RESUME_MIME_TYPES.includes(fileFor('resume').mimetype)) {
      return res.status(400).json({ error: 'Resume must be a PDF, DOCX, JPG, or PNG file' })
    }

    // Uniqueness is enforced on the normalized email across all role collections
    if (await emailTakenAcrossRoles(email)) return res.status(409).json({ error: 'Account exists' })

    const passwordHash = await bcrypt.hash(password, 10)
    const uploadedAt = new Date()
    const versionFor = (file) => ({
      originalName: file.originalname,
      storedName: crypto.randomBytes(16).toString('hex'),
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt,
      data: file.buffer,
      version: 1,
      status: 'pending',
    })
    const slotFor = (file, idType) => ({
      idType,
      uploads: 1,
      versions: [versionFor(file)],
    })
    const verificationDocuments = {
      nsrpForm: slotFor(fileFor('nsrpForm')),
      birthCertificate: slotFor(fileFor('birthCertificate')),
      validId1: slotFor(fileFor('validId1Front'), id1Type),
      resume: slotFor(fileFor('resume')),
    }
    if (fileFor('validId2Front')) {
      verificationDocuments.validId2 = slotFor(fileFor('validId2Front'), id2Type)
    }
    const user = await createUserInRole('Applicant', {
      email: email.trim(),
      passwordHash,
      profile: { name: String(name).trim(), location: String(location).trim(), skills: profileSkills, traits: String(traits || '').trim(), summary: String(summary).trim() },
      verificationDocuments,
      consentGivenAt: new Date(),
    })

    // Email verification is best-effort: registration succeeds even if sending fails (user can Resend)
    issueEmailVerification(user).catch((err) => console.error('Verification email failed:', err.message))

    const safe = { id: String(user._id), email: user.email, role: 'Applicant', emailVerified: false, registration: registrationProgress(user, 'Applicant'), profile: user.profile, verificationDocuments: summarizeVerificationDocuments(user), attentionCount: attentionCount(user), resumeFile: resumeMetadata(user) }
    const token = jwt.sign({ email: user.email, role: 'Applicant' }, jwtSecret, { expiresIn: '7d' })
    res.json({ user: safe, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Verify an email address. POST (not GET) so email scanners can't consume the token.
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token, role } = req.body || {}
    if (!token || !role) return res.status(400).json({ error: 'Missing token or role' })
    const Model = role === 'Employer' ? Employer : role === 'Applicant' ? Applicant : null
    if (!Model) return res.status(400).json({ error: 'Invalid role' })

    const tokenHash = hashVerifyToken(token)
    const user = await Model.findOne({ emailVerifyTokenHash: tokenHash, emailVerifyExpires: { $gt: new Date() } }).select('+emailVerifyTokenHash')
    if (!user) return res.status(400).json({ error: 'This verification link is invalid or has expired. Please request a new one.' })

    // Single-use: clear token fields after a successful verification
    user.emailVerified = true
    user.emailVerifyTokenHash = undefined
    user.emailVerifyExpires = undefined
    await user.save()
    res.json({ ok: true, email: user.email, role })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Resend the verification email (JWT required, 60-second cooldown, no-op if verified)
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (!['Applicant', 'Employer'].includes(decoded.role)) return res.status(400).json({ error: 'Only applicants and employers verify email' })
    const Model = decoded.role === 'Employer' ? Employer : Applicant
    const user = await Model.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ error: 'Account not found' })
    if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true })

    if (user.emailVerifySentAt) {
      const elapsed = Date.now() - new Date(user.emailVerifySentAt).getTime()
      if (elapsed < RESEND_COOLDOWN_MS) {
        return res.status(429).json({ error: 'Please wait before requesting another email', retryAfter: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000) })
      }
    }

    const result = await issueEmailVerification(user)
    res.json({ ok: true, delivered: result.delivered })
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
    let { user, type } = found
    const requirements = type === 'Employer' ? await EmployerRequest.findOne({ email: user.email }).select('+requirementsFile.data').lean() : null

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    if (type === 'Applicant') user = await loadApplicantWithCurrentResume(user.email)
    if (user.verificationStatus === 'restricted') return res.status(403).json({ error: 'Your account has been restricted. Please contact PESO support.' })

    const registration = ['Applicant', 'Employer'].includes(type) ? registrationProgress(user, type, { requirementsFile: requirements?.requirementsFile, requestLocation: requirements?.location }) : undefined
    const safe = { id: String(user._id), email: user.email, role: type, emailVerified: ['Applicant', 'Employer'].includes(type) ? Boolean(user.emailVerified) : undefined, registration, verificationDocuments: type === 'Applicant' ? summarizeVerificationDocuments(user) : undefined, attentionCount: type === 'Applicant' ? attentionCount(user) : undefined, companyName: type === 'Employer' ? (user.companyName || requirements?.companyName) : undefined, contactName: type === 'Employer' ? (user.contactName || requirements?.contactName) : undefined, phone: type === 'Employer' ? (user.phone || requirements?.phone) : undefined, profile: user.profile, verificationStatus: ['Employer', 'Applicant'].includes(type) ? (user.verificationStatus || 'approved') : undefined, verificationReason: ['Employer', 'Applicant'].includes(type) ? user.verificationReason : undefined, requirementsFile: requirements?.requirementsFile ? { originalName: requirements.requirementsFile.originalName, size: requirements.requirementsFile.size } : undefined, resumeFile: type === 'Applicant' ? resumeMetadata(user) : undefined, nsrpVerificationFile: type === 'Applicant' && user.nsrpVerificationFile?.originalName ? { originalName: user.nsrpVerificationFile.originalName, size: user.nsrpVerificationFile.size, uploadedAt: user.nsrpVerificationFile.uploadedAt } : undefined }
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
    let { user, type } = found
    if (type === 'Applicant') user = await loadApplicantWithCurrentResume(user.email)
    const requirements = type === 'Employer' ? await EmployerRequest.findOne({ email: user.email }).select('+requirementsFile.data').lean() : null
    const registration = ['Applicant', 'Employer'].includes(type) ? registrationProgress(user, type, { requirementsFile: requirements?.requirementsFile, requestLocation: requirements?.location }) : undefined
    res.json({ id: String(user._id), email: user.email, role: type, emailVerified: ['Applicant', 'Employer'].includes(type) ? Boolean(user.emailVerified) : undefined, registration, companyName: type === 'Employer' ? (user.companyName || requirements?.companyName) : undefined, contactName: type === 'Employer' ? (user.contactName || requirements?.contactName) : undefined, phone: type === 'Employer' ? (user.phone || requirements?.phone) : undefined, profile: user.profile, verificationStatus: ['Employer', 'Applicant'].includes(type) ? (user.verificationStatus || 'approved') : undefined, verificationReason: ['Employer', 'Applicant'].includes(type) ? user.verificationReason : undefined, verificationDocuments: type === 'Applicant' ? summarizeVerificationDocuments(user) : undefined, attentionCount: type === 'Applicant' ? attentionCount(user) : undefined, requirementsFile: requirements?.requirementsFile ? { originalName: requirements.requirementsFile.originalName, size: requirements.requirementsFile.size } : undefined, hasResume: type === 'Applicant' ? Boolean(resumeMetadata(user)) : undefined, resumeFile: type === 'Applicant' ? resumeMetadata(user) : undefined, nsrpVerificationFile: type === 'Applicant' && user.nsrpVerificationFile?.originalName ? { originalName: user.nsrpVerificationFile.originalName, size: user.nsrpVerificationFile.size, uploadedAt: user.nsrpVerificationFile.uploadedAt } : undefined })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

function appendVerificationVersion(applicant, docKey, file, idType = '') {
  applicant.verificationDocuments = applicant.verificationDocuments || {}
  const slot = applicant.verificationDocuments[docKey] || { uploads: 0, versions: [] }
  const current = latestVersion(slot)
  if (current?.status === 'approved') {
    const error = new Error(`${VERIFICATION_DOC_LABELS[docKey]} is already approved and locked.`)
    error.status = 409
    throw error
  }
  if ((slot.uploads || 0) >= MAX_UPLOADS_PER_DOC) {
    const error = new Error(`Upload limit reached for ${VERIFICATION_DOC_LABELS[docKey]} (${MAX_UPLOADS_PER_DOC} uploads). Please contact PESO support.`)
    error.status = 429
    throw error
  }
  if (current && ['pending', 'rejected'].includes(current.status)) current.status = 'superseded'
  const version = {
    originalName: file.originalname,
    storedName: crypto.randomBytes(16).toString('hex'),
    mimetype: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
    data: file.buffer,
    version: (slot.versions?.length || 0) + 1,
    status: 'pending',
  }
  slot.uploads = (slot.uploads || 0) + 1
  slot.versions = [...(slot.versions || []), version]
  if (idType) slot.idType = idType
  applicant.verificationDocuments[docKey] = slot
  recomputeVerificationStatus(applicant)
  return { slot, version }
}

// Compatibility endpoint; resumes are stored in the versioned verification document system.
app.post('/api/profile/resume', resumeUpload.single('resume'), async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Only applicants can upload a resume' })
    if (!req.file) return res.status(400).json({ error: 'A PDF, DOCX, JPG, or PNG resume is required' })
    if (!fileMatchesDeclaredType(req.file)) return res.status(400).json({ error: 'File content does not match the declared resume type' })
    const applicant = await Applicant.findOne({ email: decoded.email }).select('+resumeFile.data')
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    await migrateLegacyResume(applicant)
    const { version } = appendVerificationVersion(applicant, 'resume', req.file)
    await applicant.save()
    res.json({ ok: true, resumeFile: { originalName: version.originalName, size: version.size, uploadedAt: version.uploadedAt, status: version.status } })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
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

// Upload one verification document (nsrpForm | birthCertificate | validId1 | validId2)
app.post('/api/profile/verification-documents/:docKey', verificationUpload.single('document'), async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Only applicants can upload verification documents' })
    const { docKey } = req.params
    if (!VERIFICATION_DOC_KEYS.includes(docKey)) return res.status(400).json({ error: 'Unknown document type' })
    if (!req.file) return res.status(400).json({ error: docKey === 'resume' ? 'A PDF, DOCX, JPG, or PNG resume is required' : 'A JPG, PNG, or PDF file is required' })
    const allowedTypes = docKey === 'resume' ? RESUME_MIME_TYPES : VERIFICATION_DOC_TYPES
    if (!allowedTypes.includes(req.file.mimetype) || !fileMatchesDeclaredType(req.file)) {
      return res.status(400).json({ error: docKey === 'resume' ? 'Upload a genuine PDF, DOCX, JPG, or PNG resume' : 'Upload a genuine JPG, PNG, or PDF document' })
    }

    const idType = typeof req.body.idType === 'string' ? req.body.idType.trim() : ''
    if (docKey.startsWith('validId') && !idType) return res.status(400).json({ error: 'ID type is required' })

    const applicant = await Applicant.findOne({ email: decoded.email }).select('+resumeFile.data')
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })

    // Ownership + account state checks: restricted accounts cannot upload
    if (applicant.verificationStatus === 'restricted') return res.status(403).json({ error: 'This account is restricted. Please contact PESO support.' })

    if (docKey === 'resume') await migrateLegacyResume(applicant)
    const { slot, version } = appendVerificationVersion(applicant, docKey, req.file, idType)
    await applicant.save()

    res.json({ ok: true, docKey, version: version.version, status: 'pending', uploadsRemaining: MAX_UPLOADS_PER_DOC - slot.uploads, document: { originalName: version.originalName, size: version.size, uploadedAt: version.uploadedAt } })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// List an applicant's verification documents with signed, expiring URLs (admin or owner)
app.get('/api/applicants/:id/verification-documents', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (!['Admin', 'Applicant'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })
    const applicant = await Applicant.findById(req.params.id).select('+resumeFile.data')
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (decoded.role === 'Applicant' && applicant.email !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    if (await migrateLegacyResume(applicant)) {
      recomputeVerificationStatus(applicant)
      await applicant.save()
    }
    res.json({ documents: summarizeVerificationDocuments(applicant, { withUrls: true, includeHistory: decoded.role === 'Admin' }), verificationStatus: applicant.verificationStatus, verificationReason: applicant.verificationReason, attentionCount: attentionCount(applicant), consentGivenAt: applicant.consentGivenAt, documentsPurgedAt: applicant.documentsPurgedAt })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Stream a document via a signed, expiring token (no public URLs; token is the credential)
app.get('/api/documents/view/:token', async (req, res) => {
  try {
    let payload
    try {
      payload = jwt.verify(req.params.token, jwtSecret)
    } catch {
      return res.status(401).json({ error: 'Link expired or invalid' })
    }
    const { applicantId, docKey, versionIndex } = payload
    if (!VERIFICATION_DOC_KEYS.includes(docKey) || typeof versionIndex !== 'number') return res.status(400).json({ error: 'Unknown document' })
    const applicant = await Applicant.findById(applicantId).select(VERIFICATION_DATA_SELECT).lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    const doc = applicant.verificationDocuments?.[docKey]?.versions?.[versionIndex]
    if (!doc?.data) return res.status(404).json({ error: 'Document not found or has been purged' })
    const raw = doc.data
    const buffer = Buffer.isBuffer(raw) ? raw : (raw?.buffer ? Buffer.from(raw.buffer) : Buffer.from(raw))
    res.type(doc.mimetype || 'application/octet-stream')
    res.set('Content-Disposition', `inline; filename="${doc.originalName || 'document'}"`)
    res.set('Cache-Control', 'private, no-store')
    res.send(buffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin: approve or reject a single verification document (with optional reason on reject)
app.put('/api/applicants/:id/verification-documents/:docKey', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const { docKey } = req.params
    if (!VERIFICATION_DOC_KEYS.includes(docKey)) return res.status(400).json({ error: 'Unknown document type' })
    const { status, reason } = req.body || {}
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const applicant = await Applicant.findById(req.params.id)
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })

    const slot = applicant.verificationDocuments?.[docKey]
    const current = latestVersion(slot)
    if (!current || current.status === 'missing') return res.status(404).json({ error: 'No document uploaded for this requirement' })
    if (current.status === 'superseded') return res.status(409).json({ error: 'This version was replaced by a newer upload. Review the latest version.' })

    current.status = status
    current.reviewedAt = new Date()
    current.reviewedBy = decoded.email
    current.reviewReason = status === 'rejected' ? String(reason || '').trim() : undefined
    recomputeVerificationStatus(applicant)
    await applicant.save()

    const message = status === 'approved'
      ? `Your ${VERIFICATION_DOC_LABELS[docKey]} was approved.`
      : `Your ${VERIFICATION_DOC_LABELS[docKey]} was rejected${reason ? `: ${reason}` : ''}. Please re-upload it from your My Documents page.`
    await Notification.create({
      recipientEmail: applicant.email,
      title: `Verification document ${status}`,
      message,
      kind: 'applicant-verification',
      linkPath: '/documents',
    })
    // Email notification on decision (hook logs until a mailer is configured)
    sendEmail(applicant.email, `PESO Portal: ${VERIFICATION_DOC_LABELS[docKey]} ${status}`, message)

    res.json({ id: String(applicant._id), verificationStatus: applicant.verificationStatus, verificationReason: applicant.verificationReason, documents: summarizeVerificationDocuments(applicant) })
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

    const applicant = await Applicant.findById(req.params.id).select('+verificationDocuments.resume.versions.data +resumeFile.data').lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (decoded.role === 'Applicant' && applicant.email !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    const versioned = latestVersion(applicant.verificationDocuments?.resume)
    const resume = versioned?.data ? versioned : applicant.resumeFile
    if (!resume?.data) return res.status(404).json({ error: 'No resume uploaded' })

    const raw = resume.data
    const buffer = Buffer.isBuffer(raw) ? raw : (raw?.buffer ? Buffer.from(raw.buffer) : Buffer.from(raw))
    res.type(resume.mimetype || 'application/pdf')
    res.set('Content-Disposition', `inline; filename="${resume.originalName || 'resume.pdf'}"`)
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

const registrationSetupRoutes = [
  { method: 'POST', path: /^\/api\/employer-requests$/ },
  { method: 'POST', path: /^\/api\/profile\/(resume|nsrp-verification)$/ },
  { method: 'POST', path: /^\/api\/profile\/verification-documents\/[^/]+$/ },
  { method: 'GET', path: /^\/api\/applicants\/[^/]+\/(resume|nsrp-verification|verification-documents)$/ },
  { method: 'GET', path: /^\/api\/documents\/view\/[^/]+$/ },
  { method: 'POST', path: /^\/api\/employer-requirements$/ },
  { method: 'GET', path: /^\/api\/employer-requirements\/current\/view$/ },
]

app.use('/api', (req, res, next) => {
  const requestPath = req.originalUrl.split('?')[0]
  if (registrationSetupRoutes.some((route) => route.method === req.method && route.path.test(requestPath))) {
    return next()
  }
  return requireCompleteRegistration(req, res, next)
})

async function resolveJobTitle(title, customTitle) {
  if (typeof title !== 'string') return null
  const requestedTitle = title.trim()
  const requestedCustomTitle = typeof customTitle === 'string' ? customTitle.trim() : ''
  if (requestedTitle.toLowerCase() === 'other') {
    return requestedCustomTitle && requestedCustomTitle.length <= 80 ? requestedCustomTitle : null
  }
  if (!requestedTitle || requestedTitle.length > 80) return null
  const catalogTitle = await JobTitle.findOne({ name: new RegExp(`^${requestedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean()
  return catalogTitle?.name || requestedTitle
}

app.get('/api/job-titles', async (_req, res) => {
  try {
    const titles = await JobTitle.find().sort({ category: 1, name: 1 }).lean()
    const grouped = titles.reduce((categories, title) => {
      const category = categories.find((entry) => entry.category === title.category)
      if (category) category.titles.push({ id: String(title._id), name: title.name })
      else categories.push({ category: title.category, titles: [{ id: String(title._id), name: title.name }] })
      return categories
    }, [])
    res.json({ categories: grouped })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load job titles' })
  }
})

app.post('/api/admin/job-titles', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing or invalid token' })
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : ''
    if (!name || name.length > 80) return res.status(400).json({ error: 'Title is required and must be 80 characters or fewer' })
    if (!category || category.length > 60) return res.status(400).json({ error: 'Category is required and must be 60 characters or fewer' })
    const existing = await JobTitle.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean()
    if (existing) return res.status(409).json({ error: 'That job title already exists' })
    const title = await JobTitle.create({ name, category })
    res.status(201).json({ id: String(title._id), name: title.name, category: title.category })
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'That job title already exists' })
    console.error(err)
    res.status(500).json({ error: 'Could not add job title' })
  }
})

app.delete('/api/admin/job-titles/:id', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing or invalid token' })
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid job title ID' })
    const title = await JobTitle.findByIdAndDelete(req.params.id)
    if (!title) return res.status(404).json({ error: 'Job title not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not remove job title' })
  }
})

app.post('/api/jobs', requireVerifiedEmail, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!(await requireApprovedEmployer(decoded, res))) return
    const { title, customTitle, company, location, description, requirements, salary, skills, locationType, employmentType, slots, deadline } = req.body || {}
    const employer = await Employer.findOne({ email: decoded.email }).lean()
    const request = await EmployerRequest.findOne({ email: decoded.email }).lean()
    const resolvedCompany = company || employer?.companyName || employer?.profile?.companyName || request?.companyName || ''
    const resolvedLocation = location || employer?.profile?.location || request?.location || ''
    const resolvedTitle = await resolveJobTitle(title, customTitle)
    if (!resolvedTitle || !resolvedCompany || !description) return res.status(400).json({ error: 'A valid job title, company, and description are required. Custom titles must be 80 characters or fewer.' })
    if (!Array.isArray(skills) || skills.length === 0) return res.status(400).json({ error: 'Select at least one skill' })
    const normalizedSlots = slots === '' || slots === undefined || slots === null ? undefined : Number(slots)
    if (normalizedSlots !== undefined && (!Number.isInteger(normalizedSlots) || normalizedSlots < 1 || normalizedSlots > 10000)) return res.status(400).json({ error: 'Slots must be a whole number between 1 and 10,000' })
    if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(`${deadline}T00:00:00.000Z`)) || new Date(`${deadline}T00:00:00.000Z`).toISOString().slice(0, 10) !== deadline)) return res.status(400).json({ error: 'Enter a valid application deadline' })
    const normalizedSkills = skills.filter((skill) => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean)
    const job = new JobPosting({ title: resolvedTitle, company: resolvedCompany, location: resolvedLocation, description, requirements, salary, slots: normalizedSlots, deadline: deadline ? new Date(`${deadline}T00:00:00.000Z`) : undefined, skills: normalizedSkills, locationType: locationType || '', employmentType: employmentType || '', createdBy: decoded.email })
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

app.put('/api/jobs/:id', requireVerifiedEmail, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!(await requireApprovedEmployer(decoded, res))) return

    const { title, customTitle, company, location, description, requirements, salary, skills, locationType, employmentType, slots, deadline } = req.body || {}
    const resolvedTitle = await resolveJobTitle(title, customTitle)
    if (!resolvedTitle || !company || !description) return res.status(400).json({ error: 'A valid job title, company, and description are required. Custom titles must be 80 characters or fewer.' })
    if (!Array.isArray(skills) || skills.length === 0) return res.status(400).json({ error: 'Select at least one skill' })
    const normalizedSlots = slots === '' || slots === undefined || slots === null ? undefined : Number(slots)
    if (normalizedSlots !== undefined && (!Number.isInteger(normalizedSlots) || normalizedSlots < 1 || normalizedSlots > 10000)) return res.status(400).json({ error: 'Slots must be a whole number between 1 and 10,000' })
    if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(`${deadline}T00:00:00.000Z`)) || new Date(`${deadline}T00:00:00.000Z`).toISOString().slice(0, 10) !== deadline)) return res.status(400).json({ error: 'Enter a valid application deadline' })

    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.createdBy !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    if (job.status !== 'pending') return res.status(400).json({ error: 'Only pending job postings can be edited' })

    job.title = resolvedTitle
    job.company = company
    job.location = location || ''
    job.description = description
    job.requirements = requirements || ''
    job.salary = salary || ''
    job.slots = normalizedSlots
    job.deadline = deadline ? new Date(`${deadline}T00:00:00.000Z`) : undefined
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

app.get('/api/jobs', requireVerifiedEmail, async (req, res) => {
  try {
    const attachEmployerBranding = async (jobDocs) => {
      const emails = [...new Set(jobDocs.map((job) => job.createdBy).filter(Boolean))]
      if (emails.length === 0) {
        return jobDocs.map((job) => {
          const plain = typeof job.toObject === 'function' ? job.toObject() : job
          return { ...plain, employerBranding: null }
        })
      }
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
    const attachAdminReviewDetails = async (jobDocs) => {
      const brandedJobs = await attachEmployerBranding(jobDocs)
      const emails = [...new Set(brandedJobs.map((job) => job.createdBy).filter(Boolean))]
      const employers = await Employer.find({
        email: { $in: emails.map((email) => new RegExp(`^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
      }).select('email companyName contactName phone verificationStatus profile.location').lean()
      const employersByEmail = new Map(employers.map((employer) => [employer.email.toLowerCase(), employer]))
      const missingEmployerEmails = emails.filter((email) => !employersByEmail.has(email.toLowerCase()))
      const requests = await EmployerRequest.find({
        email: { $in: missingEmployerEmails.map((email) => new RegExp(`^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
      }).select('email companyName contactName phone location status').lean()
      const requestsByEmail = new Map(requests.map((request) => [request.email.toLowerCase(), request]))
      return brandedJobs.map((job) => {
        const employerEmail = (job.createdBy || '').toLowerCase()
        const employer = employersByEmail.get(employerEmail)
        const request = requestsByEmail.get(employerEmail)
        return {
          ...job,
          employerDetails: employer ? {
            email: employer.email,
            companyName: employer.companyName || job.company || '',
            contactName: employer.contactName || '',
            phone: employer.phone || '',
            location: employer.profile?.location || job.location || '',
            verificationStatus: employer.verificationStatus || 'unknown',
          } : {
            email: request?.email || job.createdBy || '',
            companyName: request?.companyName || job.company || '',
            contactName: request?.contactName || '',
            phone: request?.phone || '',
            location: request?.location || job.location || '',
            verificationStatus: request?.status || 'unknown',
          },
        }
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
      return res.json(await attachAdminReviewDetails(jobs))
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
      return res.json(await attachAdminReviewDetails(jobs))
    }
    const jobs = await JobPosting.find({ status: 'approved' }).sort({ createdAt: -1 })
    const auth = req.headers.authorization
    if (auth?.startsWith('Bearer ')) {
      const decoded = jwt.verify(auth.split(' ')[1], jwtSecret)
      if (decoded.role === 'Admin') return res.json(await attachAdminReviewDetails(jobs))
    }
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
    if (status === 'declined' && !reviewReason) return res.status(400).json({ error: 'A reason is required when declining a job posting.' })
    if (reviewReason.length > 500) return res.status(400).json({ error: 'The decline reason must be 500 characters or fewer.' })
    job.status = status
    if (status === 'approved') {
      job.approvedBy = decoded.email
      job.approvedAt = new Date()
      job.reviewReason = undefined
    } else {
      job.reviewReason = reviewReason
    }
    job.reviewHistory = job.reviewHistory || []
    job.reviewHistory.push({ status, reason: status === 'declined' ? reviewReason : '', reviewedBy: decoded.email, reviewedAt: new Date() })
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

  const continuationSections = [
    {
      title: 'III. Educational Background',
      rows: answers.education || [],
      columns: [
        ['Level', 'level'],
        ['School', 'school'],
        ['Course', 'course'],
        ['Year', 'year'],
      ],
    },
    {
      title: 'IV. Technical / Vocational Training',
      rows: answers.technicalTraining || [],
      columns: [
        ['Training', 'name'],
        ['Provider', 'provider'],
        ['Course', 'course'],
        ['Year', 'year'],
      ],
    },
    {
      title: 'V. Work Experience',
      rows: answers.workExperience || [],
      columns: [
        ['Company', 'company'],
        ['Position', 'position'],
        ['From', 'startDate'],
        ['To', 'endDate'],
      ],
    },
  ]
  const hasContinuation = continuationSections.some((section) => section.rows.length) || answers.skills?.length
  if (hasContinuation) {
    const pageWidth = page1.getSize().width
    const margin = 36
    const contentWidth = pageWidth - margin * 2
    const columnWidth = contentWidth / 4
    let continuationPage
    let cursorTop
    const startContinuationPage = () => {
      continuationPage = pdfDoc.addPage([pageWidth, H])
      continuationPage.drawText('NSRP FORM 1 — CONTINUATION', {
        x: margin,
        y: H - 38,
        size: 14,
        font: bold,
        color: ink,
      })
      cursorTop = 62
    }
    const wrapText = (value, maxWidth, fontSize) => {
      const words = String(value || '').split(/\s+/).filter(Boolean)
      const lines = []
      let line = ''
      for (const word of words) {
        const next = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
          line = next
          continue
        }
        if (line) lines.push(line)
        let chunk = ''
        for (const character of Array.from(word)) {
          if (chunk && font.widthOfTextAtSize(chunk + character, fontSize) > maxWidth) {
            lines.push(chunk)
            chunk = ''
          }
          chunk += character
        }
        line = chunk
      }
      if (line) lines.push(line)
      return lines.length ? lines : ['']
    }
    const drawSection = (section) => {
      const ensureSpace = (height) => {
        if (!continuationPage || cursorTop + height > H - margin) startContinuationPage()
      }
      ensureSpace(54)
      continuationPage.drawText(section.title, {
        x: margin,
        y: H - cursorTop - 14,
        size: 11,
        font: bold,
        color: ink,
      })
      cursorTop += 24
      if (!section.rows.length) {
        continuationPage.drawText('No entries provided.', {
          x: margin,
          y: H - cursorTop - 11,
          size: 9,
          font,
          color: ink,
        })
        cursorTop += 22
        return
      }
      for (const [label, key] of section.columns) {
        continuationPage.drawText(label, {
          x: margin + section.columns.findIndex((column) => column[1] === key) * columnWidth,
          y: H - cursorTop - 10,
          size: 8,
          font: bold,
          color: ink,
        })
      }
      cursorTop += 16
      for (const row of section.rows) {
        const values = section.columns.map(([, key]) => wrapText(row[key], columnWidth - 12, 8))
        const lineCount = Math.max(...values.map((lines) => lines.length))
        const rowHeight = Math.max(24, lineCount * 10 + 10)
        ensureSpace(rowHeight + 4)
        if (cursorTop === 62) {
          continuationPage.drawText(section.title, {
            x: margin,
            y: H - cursorTop - 14,
            size: 11,
            font: bold,
            color: ink,
          })
          cursorTop += 24
          for (let index = 0; index < section.columns.length; index += 1) {
            continuationPage.drawText(section.columns[index][0], {
              x: margin + index * columnWidth,
              y: H - cursorTop - 10,
              size: 8,
              font: bold,
              color: ink,
            })
          }
          cursorTop += 16
        }
        values.forEach((lines, columnIndex) => {
          lines.forEach((line, lineIndex) => {
            continuationPage.drawText(line, {
              x: margin + columnIndex * columnWidth,
              y: H - cursorTop - 10 - lineIndex * 10,
              size: 8,
              font,
              color: ink,
            })
          })
        })
        cursorTop += rowHeight
      }
      cursorTop += 12
    }

    for (const section of continuationSections) drawSection(section)
    const skills = answers.skills || []
    if (skills.length) {
      const skillLines = wrapText(skills.join(', '), contentWidth, 9)
      const lineHeight = 13
      const skillsTitleHeight = 20
      let skillsIndex = 0
      while (skillsIndex < skillLines.length) {
        if (!continuationPage) startContinuationPage()
        let availableLines = Math.floor((H - margin - cursorTop - skillsTitleHeight) / lineHeight)
        if (availableLines < 1) {
          startContinuationPage()
          availableLines = Math.floor((H - margin - cursorTop - skillsTitleHeight) / lineHeight)
        }
        continuationPage.drawText('VI. Skills', {
          x: margin,
          y: H - cursorTop - 14,
          size: 11,
          font: bold,
          color: ink,
        })
        cursorTop += skillsTitleHeight
        const linesOnPage = Math.min(availableLines, skillLines.length - skillsIndex)
        for (let lineIndex = 0; lineIndex < linesOnPage; lineIndex += 1) {
          continuationPage.drawText(skillLines[skillsIndex], {
            x: margin,
            y: H - cursorTop - 10,
            size: 9,
            font,
            color: ink,
          })
          cursorTop += lineHeight
          skillsIndex += 1
        }
        if (skillsIndex < skillLines.length) cursorTop = H
      }
    }
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

const NSRP_TEXT_LIMITS = {
  surname: 80,
  firstName: 80,
  middleName: 80,
  suffix: 20,
  dob: 10,
  placeOfBirth: 120,
  sex: 10,
  religion: 80,
  civilStatus: 20,
  height: 20,
  addressStreet: 120,
  addressBarangay: 80,
  addressCity: 80,
  addressProvince: 80,
  tin: 30,
  gsisSss: 30,
  pagibig: 30,
  philhealth: 30,
  email: 254,
  cellphone: 20,
  landline: 20,
  disability: 120,
  employmentStatus: 20,
  employmentTypeDetail: 120,
  activelyLooking: 5,
  lookingDuration: 40,
  willingImmediately: 5,
  willingWhen: 80,
  fourPs: 5,
  fourPsId: 40,
  occupation1: 80,
  occupation2: 80,
  occupation3: 80,
  occupation4: 80,
  localPref1: 80,
  localPref2: 80,
  localPref3: 80,
  overseasPref1: 80,
  overseasPref2: 80,
  overseasPref3: 80,
  expectedSalary: 40,
  passportNo: 30,
  passportExpiry: 10,
}
const NSRP_REQUIRED_FIELDS = [
  'surname', 'firstName', 'dob', 'placeOfBirth', 'sex', 'civilStatus',
  'addressStreet', 'addressBarangay', 'addressCity', 'addressProvince',
  'email', 'cellphone', 'employmentStatus', 'activelyLooking',
  'willingImmediately', 'fourPs', 'occupation1',
]
const NSRP_ALLOWED_VALUES = {
  sex: ['Male', 'Female'],
  civilStatus: ['Single', 'Married', 'Widowed', 'Separated', 'Live-in'],
  employmentStatus: ['Employed', 'Unemployed'],
  activelyLooking: ['Yes', 'No'],
  willingImmediately: ['Yes', 'No'],
  fourPs: ['Yes', 'No'],
}
const NSRP_ROW_LIMITS = {
  education: {
    level: 40,
    school: 120,
    course: 100,
    year: 20,
  },
  technicalTraining: {
    name: 120,
    provider: 120,
    course: 100,
    year: 20,
  },
  workExperience: {
    company: 120,
    position: 100,
    startDate: 20,
    endDate: 20,
  },
}
const NSRP_MAX_ROWS = 10
const NSRP_MAX_SKILLS = 30
const NSRP_MAX_SKILL_LENGTH = 50

function validateNsrpAnswers(input) {
  const fieldErrors = {}
  const answers = {}
  for (const [field, maxLength] of Object.entries(NSRP_TEXT_LIMITS)) {
    const value = input?.[field]
    if (value === undefined || value === null || value === '') {
      answers[field] = ''
      if (NSRP_REQUIRED_FIELDS.includes(field)) fieldErrors[field] = 'This field is required.'
      continue
    }
    if (typeof value !== 'string') {
      fieldErrors[field] = 'Enter text for this field.'
      continue
    }
    const trimmed = value.trim()
    answers[field] = trimmed
    if (!trimmed && NSRP_REQUIRED_FIELDS.includes(field)) fieldErrors[field] = 'This field is required.'
    else if (trimmed.length > maxLength) fieldErrors[field] = `Use ${maxLength} characters or fewer.`
  }
  for (const [field, allowed] of Object.entries(NSRP_ALLOWED_VALUES)) {
    if (answers[field] && !allowed.includes(answers[field])) fieldErrors[field] = 'Choose one of the listed options.'
  }
  for (const [section, limits] of Object.entries(NSRP_ROW_LIMITS)) {
    const rows = input?.[section] ?? []
    if (!Array.isArray(rows)) {
      fieldErrors[section] = 'Enter a list of rows.'
      answers[section] = []
      continue
    }
    if (rows.length > NSRP_MAX_ROWS) {
      fieldErrors[section] = `Enter no more than ${NSRP_MAX_ROWS} rows.`
      answers[section] = []
      continue
    }
    answers[section] = rows.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        fieldErrors[`${section}[${index}]`] = 'Enter a valid row.'
        return null
      }
      const normalizedRow = {}
      for (const [field, maxLength] of Object.entries(limits)) {
        const key = `${section}[${index}].${field}`
        const value = row?.[field] ?? ''
        if (typeof value !== 'string') {
          fieldErrors[key] = 'Enter text for this field.'
          normalizedRow[field] = ''
          continue
        }
        normalizedRow[field] = value.trim()
        const rowHasValue = Object.values(row).some((entry) => typeof entry === 'string' && entry.trim())
        if (rowHasValue && !normalizedRow[field]) {
          fieldErrors[key] = 'Complete this field or remove the row.'
        } else if (normalizedRow[field].length > maxLength) {
          fieldErrors[key] = `Use ${maxLength} characters or fewer.`
        }
      }
      return normalizedRow
    }).filter((row) => row && Object.values(row).some(Boolean))
  }
  const validateDate = (field, value, preventFuture = false) => {
    if (!value) return
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      fieldErrors[field] = 'Enter a valid date.'
    } else if (preventFuture && date > new Date()) {
      fieldErrors[field] = 'Date of birth cannot be in the future.'
    }
  }
  validateDate('dob', answers.dob, true)
  validateDate('passportExpiry', answers.passportExpiry)
  for (const [index, row] of answers.workExperience.entries()) {
    validateDate(`workExperience[${index}].startDate`, row.startDate)
    validateDate(`workExperience[${index}].endDate`, row.endDate)
    if (row.startDate && row.endDate && row.endDate < row.startDate) {
      fieldErrors[`workExperience[${index}].endDate`] = 'End date cannot be before the start date.'
    }
  }
  if (answers.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)) {
    fieldErrors.email = 'Enter a valid email address.'
  }
  if (answers.cellphone && !/^[+()\d\s-]{7,20}$/.test(answers.cellphone)) {
    fieldErrors.cellphone = 'Enter a valid phone number.'
  }
  const skills = input?.skills ?? []
  if (!Array.isArray(skills)) {
    fieldErrors.skills = 'Choose skills from the list.'
    answers.skills = []
  } else if (skills.length > NSRP_MAX_SKILLS) {
    fieldErrors.skills = `Choose no more than ${NSRP_MAX_SKILLS} skills.`
    answers.skills = []
  } else {
    answers.skills = [...new Set(skills.map((skill, index) => {
      if (typeof skill !== 'string') {
        fieldErrors[`skills[${index}]`] = 'Skill must be text.'
        return ''
      }
      const normalized = skill.trim()
      if (!normalized) fieldErrors[`skills[${index}]`] = 'Skill cannot be empty.'
      else if (normalized.length > NSRP_MAX_SKILL_LENGTH) fieldErrors[`skills[${index}]`] = `Use ${NSRP_MAX_SKILL_LENGTH} characters or fewer.`
      return normalized
    }).filter(Boolean))]
  }
  return { answers, fieldErrors }
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

// Generate a temporary NSRP PDF for the authenticated applicant's preview.
app.post('/api/nsrp/preview', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing or invalid token' })
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const { answers, fieldErrors } = validateNsrpAnswers({ ...req.body, email: req.body?.email || decoded.email })
    if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted NSRP fields.', fieldErrors })
    const applicant = await Applicant.findOne({ email: decoded.email }).select('email')
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    const pdfBuffer = await generateNsrpPdf(answers)
    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', 'inline; filename="NSRP-preview.pdf"')
    res.set('Cache-Control', 'no-store')
    res.send(pdfBuffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 'NSRP_GENERATION_FAILED', error: 'The NSRP PDF could not be generated. Please try again.' })
  }
})

// Keep the existing download endpoint, now with the same server-side validation.
app.post('/api/nsrp/generate', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing or invalid token' })
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const { answers, fieldErrors } = validateNsrpAnswers({ ...req.body, email: req.body?.email || decoded.email })
    if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted NSRP fields.', fieldErrors })
    const pdfBuffer = await generateNsrpPdf(answers)
    res.type('application/pdf')
    res.set('Content-Disposition', `attachment; filename="NSRP-${answers.surname.replace(/\s+/g, '_')}.pdf"`)
    res.send(pdfBuffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 'NSRP_GENERATION_FAILED', error: 'The NSRP PDF could not be generated. Please try again.' })
  }
})

app.post('/api/jobs/:id/apply', requireVerifiedEmail, applicationUpload.single('nsrp'), async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.status !== 'approved') return res.status(400).json({ error: 'Job is not available' })

    const applicant = await loadApplicantWithCurrentResume(decoded.email)
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (!latestVersion(applicant.verificationDocuments?.resume)) {
      return res.status(403).json({ code: 'RESUME_REQUIRED', error: 'Upload a resume before applying for jobs.' })
    }
    if (job.applicants.some((existingApplicant) => existingApplicant.email === decoded.email)) {
      return res.status(409).json({ error: 'You have already applied for this job' })
    }

    let nsrpFilePayload
    let nsrpVersionToSave
    if (req.body?.answers) {
      const { answers, fieldErrors } = validateNsrpAnswers({ ...req.body.answers, email: req.body.answers.email || decoded.email })
      if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted NSRP fields.', fieldErrors })
      let pdfBuffer
      try {
        pdfBuffer = await generateNsrpPdf(answers)
      } catch (err) {
        console.error('NSRP application PDF generation failed:', err)
        return res.status(500).json({ code: 'NSRP_GENERATION_FAILED', error: 'The NSRP PDF could not be generated. Please try again.' })
      }
      const nsrpFile = { originalname: `NSRP-${answers.surname.replace(/\s+/g, '_')}.pdf`, mimetype: 'application/pdf', size: pdfBuffer.length, buffer: pdfBuffer }
      const { version } = appendVerificationVersion(applicant, 'nsrpForm', nsrpFile)
      nsrpVersionToSave = version
      nsrpFilePayload = { originalName: nsrpFile.originalname, mimetype: nsrpFile.mimetype, size: nsrpFile.size, data: pdfBuffer }
      const existingSkills = Array.isArray(applicant.profile?.skills) ? applicant.profile.skills : []
      const mergedSkills = new Map(existingSkills.map((skill) => [skill.trim().toLocaleLowerCase(), skill.trim()]).filter(([key]) => key))
      for (const skill of answers.skills) mergedSkills.set(skill.toLocaleLowerCase(), skill)
      applicant.set('profile.education', answers.education)
      applicant.set('profile.technicalTraining', answers.technicalTraining)
      applicant.set('profile.workExperience', answers.workExperience)
      applicant.set('profile.skills', [...mergedSkills.values()])
    } else if (req.file) {
      nsrpFilePayload = { originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, data: req.file.buffer }
    } else {
      return res.status(400).json({ error: 'Complete and confirm the NSRP form before applying.' })
    }

    if (nsrpVersionToSave) await applicant.save()
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
    if (err.status) return res.status(err.status).json({ error: err.message })
    if (err.code === 11000) return res.status(409).json({ error: 'You have already applied for this job' })
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
      .populate({ path: 'applicantId', select: 'email profile resumeFile.originalName resumeFile.size resumeFile.uploadedAt verificationDocuments.resume.versions.originalName verificationDocuments.resume.versions.mimetype verificationDocuments.resume.versions.size verificationDocuments.resume.versions.uploadedAt verificationDocuments.resume.versions.status' })
      .populate({
        path: 'jobId',
        model: JobPosting,
        select: 'title company location description requirements salary locationType employmentType status createdBy createdAt',
      })

    res.json(referrals.map((referral) => {
      const result = referral.toObject()
      if (result.applicantId) result.applicantId.resumeFile = resumeMetadata(result.applicantId)
      return result
    }))
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

app.post('/api/employer-requests', requirementsUpload.single('requirements'), async (req, res) => {
  const discardUpload = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
  }
  let createdEmployer = null
  let requestSaved = false
  try {
    const { email, password, companyName, contactName, location, phone, message } = req.body || {}
    const hasText = (value) => typeof value === 'string' && value.trim().length > 0
    if (!hasText(email) || !hasText(password) || !hasText(companyName) || !hasText(contactName) || !hasText(location)) {
      discardUpload()
      return res.status(400).json({ error: 'Email, password, company name, contact name, and location are required' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      discardUpload()
      return res.status(400).json({ error: 'Enter a valid email address' })
    }
    if (!/^\d{11}$/.test(String(phone || ''))) {
      discardUpload()
      return res.status(400).json({ error: 'Phone number must contain exactly 11 digits' })
    }
    if (!req.file) return res.status(400).json({ error: 'An NSRP registration PDF is required' })
    if (!bufferMatchesDeclaredType(fs.readFileSync(req.file.path), 'application/pdf')) {
      discardUpload()
      return res.status(400).json({ error: 'The NSRP registration file is not a valid PDF' })
    }
    const passwordError = passwordErrorMessage(password)
    if (passwordError) {
      discardUpload()
      return res.status(400).json({ error: passwordError })
    }

    if (await emailTakenAcrossRoles(email)) {
      discardUpload()
      return res.status(409).json({ error: 'Email already in use' })
    }
    const existingRequest = await EmployerRequest.findOne({ email: email.trim() })
    if (existingRequest) {
      discardUpload()
      return res.status(409).json({ error: 'Employer request already submitted' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    // Roll back the employer account if request creation fails so no half-finished account remains
    try {
      createdEmployer = await createUserInRole('Employer', {
        email: email.trim(),
        passwordHash,
        verificationStatus: 'under_review',
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        phone,
        profile: { name: contactName.trim(), location: location.trim(), summary: companyName.trim() },
      })
    } catch (createErr) {
      discardUpload()
      return res.status(400).json({ error: 'Could not create the employer account. Please check the details and try again.' })
    }
    const request = new EmployerRequest({
      email: email.trim(),
      passwordHash,
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      location: location.trim(),
      phone,
      message,
      status: 'under_review',
      requirementsSubmittedAt: new Date(),
      requirementsFile: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    })
    try {
      await request.save()
      requestSaved = true
    } catch (saveErr) {
      await Employer.deleteOne({ _id: createdEmployer._id })
      discardUpload()
      return res.status(500).json({ error: 'Registration failed. Nothing was saved — please try again.' })
    }
    await Employer.updateOne({ email: email.trim() }, { $set: { requirementsSubmittedAt: request.requirementsSubmittedAt } })
    // Email verification is best-effort; the employer can resend after logging in
    issueEmailVerification(createdEmployer).catch((err) => console.error('Verification email failed:', err.message))
    res.json({ success: true, request: { email: request.email, companyName: request.companyName, contactName: request.contactName, location: request.location, phone: request.phone, message: request.message, status: request.status } })
  } catch (err) {
    if (!requestSaved) {
      if (createdEmployer) await Employer.deleteOne({ _id: createdEmployer._id })
      discardUpload()
    }
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

    // Only employers who verified their email appear in the admin review queue
    const verifiedEmails = new Set((await Employer.find({ emailVerified: true }).select('email').lean()).map((employer) => employer.email))
    const requests = await EmployerRequest.find({ status: { $in: ['pending', 'under_review'] }, email: { $in: [...verifiedEmails] } }).sort({ createdAt: -1 })
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
    // Admin queues only list accounts with a verified email
    const applicants = await Applicant.find({ emailVerified: true }).select('+resumeFile.data')
    for (const applicant of applicants) {
      const previousStatus = applicant.verificationStatus
      const previousReason = applicant.verificationReason
      const migrated = await migrateLegacyResume(applicant)
      recomputeVerificationStatus(applicant)
      if (migrated || applicant.verificationStatus !== previousStatus || applicant.verificationReason !== previousReason) {
        await applicant.save()
      }
    }
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
    const mapApplicant = applicants.map((u) => { const docs = summarizeVerificationDocuments(u); return { id: u._id, email: u.email, role: 'Applicant', phone: u.phone || u.profile?.phone, profile: u.profile, verificationStatus: u.verificationStatus || 'approved', verificationReason: u.verificationReason, verificationDocuments: docs, pendingDocCount: docs.filter((d) => d.status === 'pending').length, resubmittedDocCount: docs.filter((d) => d.resubmitted).length, hasResume: Boolean(resumeMetadata(u)), hasNsrpVerification: Boolean(u.nsrpVerificationFile?.data || u.nsrpVerificationFile?.originalName), createdAt: u.createdAt } })

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
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message })
  }
  if (err && ['/api/signup', '/api/employer-requests', '/api/employer-requirements'].includes(req.path)) {
    return res.status(400).json({ error: err.message || 'Invalid uploaded file' })
  }
  next(err)
})

// Retention: purge verification document files after a decision is DOC_RETENTION_DAYS old.
// Set VERIFICATION_DOC_RETENTION_DAYS=0 to disable. Metadata (labels/status) is kept for audit.
const DOC_RETENTION_DAYS = Number(process.env.VERIFICATION_DOC_RETENTION_DAYS ?? 30)
async function purgeExpiredVerificationDocuments() {
  if (!DOC_RETENTION_DAYS) return
  try {
    const cutoff = new Date(Date.now() - DOC_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const stale = await Applicant.find({
      verificationStatus: { $in: ['approved', 'declined'] },
      updatedAt: { $lt: cutoff },
      documentsPurgedAt: { $exists: false },
      'verificationDocuments.nsrpForm.versions.0': { $exists: true },
    })
    for (const applicant of stale) {
      applicant.verificationDocuments = undefined
      applicant.documentsPurgedAt = new Date()
      await applicant.save()
    }
    if (stale.length > 0) console.log(`Purged verification documents for ${stale.length} applicant(s)`)
  } catch (err) {
    console.error('Document purge job failed:', err.message)
  }
}
setInterval(purgeExpiredVerificationDocuments, 24 * 60 * 60 * 1000).unref()
purgeExpiredVerificationDocuments()

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
