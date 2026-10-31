import { matchLocation, getEmployerAddress } from '../shared/phLocations.js'
import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import multer from 'multer'
import rateLimit, { MemoryStore } from 'express-rate-limit'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { createReport } from 'docx-templates'
import { Applicant, Employer, Admin, JobTitle, Notification, Referral, HireReport, Rating, DocumentFile, EmailCode, EmailCodeSend, UsedEmailProof, findUserByEmail, emailTakenAcrossRoles, createUserInRole, updateUserProfileByEmail, applicantFullName, applicantDisplayName } from './models/collections.js'
import { sendEmail, sendVerificationEmail, initMailer } from './mailer.js'
import { EMAIL_CODE_TTL_MS, EMAIL_CODE_MAX_ATTEMPTS, EMAIL_CODE_RESEND_COOLDOWN_MS, EMAIL_CODE_HOURLY_LIMIT, EMAIL_CODE_IP_HOURLY_LIMIT, generateEmailCode, hashEmailCode, emailCodeMatches, signEmailProof, verifyEmailProof } from './utils/emailCode.js'
import { notify, notifyAdmins } from './services/notify.js'
import { startHireReportReminders } from './services/hireReminders.js'
import { createNotificationsRouter } from './routes/notifications.js'
import { createAccountDeletionRouter } from './routes/accountDeletion.js'
import { createEmploymentUpdatesHandler } from './routes/employmentUpdates.js'
import { createCsmRouter } from './routes/csm.js'
import { CsmResponse } from './models/collections.js'
import { applicantSessionGuard } from './utils/applicantSessions.js'
import { AccountDeletionRequest } from './models/collections.js'
import { generateNsrpPdf } from './nsrpPdf.js'
import { generateEmployerRegistrationPdf, normalizeEmployerRegistrationDetails } from './employerRegistrationPdf.js'
import { validMobile, normalizeMobile, MOBILE_ERROR } from '../shared/employerNumbers.js'
import { parseSignatureImage, resolveCertification, SignatureValidationError } from './nsrpSignature.js'
import { createDashboardService } from './services/dashboard.js'
import { normalizeEmail, generateVerifyToken, hashVerifyToken, VERIFY_TOKEN_TTL_MS, RESEND_COOLDOWN_MS } from './utils/emailVerification.js'
import { passwordErrorMessage } from './utils/passwordPolicy.js'
import { validateNameFields, sanitizeName } from '../shared/nameFields.js'
import { EMPLOYER_REVIEW_DECISIONS, EMPLOYER_VERIFICATION_STATUSES, EMPLOYER_VERIFICATION_STATUS, deriveEmployerVerificationStatus } from '../shared/employerVerification.js'
import {
  NSRP_TEXT_LIMITS, NSRP_REQUIRED_FIELDS, NSRP_ALLOWED_VALUES, NSRP_SECTION_MAX_ROWS,
  NSRP_NUMERIC_SPECS, NSRP_FIELD_VALIDATORS, EDUCATION_LEVELS, WORK_STATUS_OPTIONS,
  digitsOnly, trimCollapse, normalizePhMobile, normalizePassportNo,
  isValidCalendarDate, isValidYear, ageFromDob, validateNumericId, validateNsrpBasicInfo, validateNsrpLanguages,
  EMPLOYED_TYPES, UNEMPLOYED_TYPES, MIN_YEAR, todayInManila,
} from '../shared/nsrpValidation.js'
import { NSRP_SKILL_LABELS, normalizeSkillLabel } from '../shared/nsrpSkills.js'
import { NSRP_ROW_LIMITS } from '../shared/nsrpTableLimits.js'
import { LOCATION_TYPES, EMPLOYMENT_TYPES, LEGACY_EMPLOYMENT_TYPES, PAY_FREQUENCIES, EDUCATION_LEVELS as JOB_EDUCATION_LEVELS, EXPERIENCE_LEVELS, JOB_LIMITS, validateJobPosting, formatSalary, formatLocation, normalizeJobPosting } from '../shared/jobPosting.js'
import { registrationProgress } from './utils/registration.js'
import { validateReviewTransition } from './utils/docReview.js'
import { storeDocumentFile, loadDocumentFile, deleteApplicantDocumentFiles } from './utils/documentFiles.js'
import { redactPath, redactString } from './utils/redact.js'
// Document slot keys/labels are shared with the frontend; the resume is
// optional and not part of REQUIRED_DOC_KEYS.
import { VERIFICATION_DOC_KEYS, REQUIRED_DOC_KEYS, VERIFICATION_DOC_LABELS } from '../shared/verificationDocs.js'
import { baseApprovedJobFilter, buildJobFilter, countJobFacets } from './utils/jobFilters.js'
import { EMPLOYER_OUTCOMES, APPLICANT_OUTCOMES, employerApplicantSummary, outcomeLabel } from '../shared/employmentReporting.js'

const LOCATION_TYPE_OPTIONS = LOCATION_TYPES
const EMPLOYMENT_TYPE_OPTIONS = EMPLOYMENT_TYPES
import { parsePagination, paginateQuery, escapeRegex } from './utils/paginate.js'
import { resolveSort } from './utils/sort.js'

// --- Sort whitelists (never trust raw ?sortBy values) ---
const STATUS_PRIORITY = ['pending', 'under_review', 'approved', 'declined']
const APPLICANT_STATUS_PRIORITY = ['under_review', 'approved', 'restricted', 'declined']

const APPLICANT_SORTS = {
  name: { fields: (d) => ({ 'profile.lastName': d, 'profile.firstName': d }), collation: true, defaultOrder: 1 },
  createdAt: { fields: (d) => ({ createdAt: d }), defaultOrder: -1 },
  status: { fields: () => ({}), statusRank: { field: 'verificationStatus', values: APPLICANT_STATUS_PRIORITY }, defaultOrder: 1 },
  docsApproved: {
    fields: (d) => ({ __sortDocsApproved: d }),
    computed: {
      __sortDocsApproved: {
        $size: {
          $filter: {
            input: { $objectToArray: { $ifNull: ['$verificationDocuments', {}] } },
            as: 'slot',
            cond: { $eq: [{ $getField: { field: 'status', input: { $last: { $ifNull: ['$$slot.v.versions', [{}]] } } } }, 'approved'] },
          },
        },
      },
    },
    defaultOrder: -1,
  },
  location: { fields: (d) => ({ 'profile.location': d }), collation: true, nullsLast: ['profile.location'], defaultOrder: 1 },
}

const EMPLOYER_SORTS = {
  companyName: { fields: (d) => ({ companyName: d }), collation: true, defaultOrder: 1 },
  createdAt: { fields: (d) => ({ createdAt: d }), defaultOrder: -1 },
  status: { fields: () => ({}), statusRank: { field: 'verificationStatus', values: ['pending_verification', ...STATUS_PRIORITY] }, defaultOrder: 1 },
}

const EMPLOYER_REQUEST_SORTS = {
  createdAt: { fields: (d) => ({ createdAt: d }), defaultOrder: -1 },
  companyName: { fields: (d) => ({ companyName: d }), collation: true, defaultOrder: 1 },
  status: { fields: () => ({}), statusRank: { field: 'status', values: STATUS_PRIORITY }, defaultOrder: 1 },
}

// Salary sorting uses the structured minimum, with a numeric legacy fallback.
const jobSalarySortAmount = {
  $cond: [{ $eq: ['$negotiable', true] }, null, {
    $ifNull: ['$salaryMin', { $convert: {
      input: { $replaceAll: { input: { $replaceAll: { input: { $ifNull: ['$salary', ''] }, find: '\u20b1', replacement: '' } }, find: ',', replacement: '' } },
      to: 'double', onError: null, onNull: null,
    } }],
  }],
}

const JOB_SORTS = {
  createdAt: { fields: (d) => ({ createdAt: d }), defaultOrder: -1 },
  title: { fields: (d) => ({ title: d }), collation: true, defaultOrder: 1 },
  company: { fields: (d) => ({ company: d }), collation: true, defaultOrder: 1 },
  salary: {
    fields: (d) => ({ __sortSalaryEmpty: 1, __sortSalaryAmount: d }),
    computed: { __sortSalaryAmount: jobSalarySortAmount, __sortSalaryEmpty: { $eq: [jobSalarySortAmount, null] } },
    defaultOrder: -1,
  },
  deadline: { fields: (d) => ({ deadline: d }), nullsLast: ['deadline'], defaultOrder: 1 },
  status: { fields: () => ({}), statusRank: { field: 'status', values: STATUS_PRIORITY }, defaultOrder: 1 },
}

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: 'http://localhost:5173', exposedHeaders: ['X-NSRP-Layout-Warnings', 'Content-Disposition'] }))
// The unauthenticated sign-up preview gets a tighter body cap than the global
// parser so oversized payloads are rejected before any processing. This must be
// mounted before the global parser to take effect (a parsed body is not re-read).
app.use('/api/nsrp/preview-signup', express.json({ limit: '2mb' }))
app.use(express.json({ limit: '8mb' }))
// Request log: method + redacted path only (no query string, tokens, or bodies)
app.use((req, res, next) => {
  console.log('HTTP', req.method, redactPath(req.originalUrl))
  next()
})

app.use('/api', applicantSessionGuard({ Applicant, authenticate: authenticateRequest }))

app.get('/api/employer-requirements/current/versions/:version/view', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
    const versionNumber = Number(req.params.version)
    if (!Number.isInteger(versionNumber) || versionNumber < 1) return res.status(400).json({ error: 'Invalid document version' })
    const request = await EmployerRequest.findOne({ email: decoded.email }).lean()
    const version = request?.requirementsVersions?.find((item) => item.version === versionNumber)
    if (!version?.path || !fs.existsSync(version.path)) return res.status(404).json({ error: 'Document version not found' })
    res.type(version.mimetype || 'application/pdf')
    res.set('Content-Disposition', `inline; filename="${version.originalName || 'nsrp-form-2.pdf'}"`)
    res.set('Cache-Control', 'private, no-store')
    return res.sendFile(path.resolve(version.path))
  } catch (err) {
    console.error('Employer document version view failed:', redactString(String(err?.message || err)))
    return res.status(500).json({ error: 'Failed to view employer document version' })
  }
})

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
const jwtSecret = process.env.JWT_SECRET || 'dev-secret'
if (!mongoUri) {
  console.warn('Warning: MONGODB_URI not set. Connect by setting MONGODB_URI in .env')
}

// In tests (NODE_ENV=test) the test harness owns the mongoose connection and
// the HTTP listener, so importing this module must not connect or listen.
const isTestEnv = process.env.NODE_ENV === 'test'
if (!isTestEnv) {
  mongoose.connect(mongoUri || 'mongodb://localhost:27017/peso-portal')
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.warn('MongoDB connection error:', err.message))
}

const { Schema } = mongoose

const jobSchema = new Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: String,
  description: String,
  requirements: String,
  // Display string kept in sync with the structured salary fields; older postings only have this.
  salary: String,
  // Keep historical bounds on stored documents so reviewing old jobs still works.
  // New/edited requests enforce the stricter current bounds in validateJobPosting.
  salaryMin: { type: Number, min: 0, max: 10000000 },
  salaryMax: { type: Number, min: 0, max: 10000000 },
  payFrequency: { type: String, enum: ['', ...PAY_FREQUENCIES], default: '' },
  negotiable: { type: Boolean, default: false },
  slots: { type: Number, min: 1, max: 10000, validate: Number.isInteger },
  deadline: Date,
  locationType: { type: String, enum: ['', ...LOCATION_TYPES], default: '' },
  city: { type: String, trim: true, maxlength: JOB_LIMITS.placeMax },
  province: { type: String, trim: true, maxlength: JOB_LIMITS.placeMax },
  // Legacy values remain valid on save; normalizeJobPosting maps them on read.
  employmentType: { type: String, enum: ['', ...EMPLOYMENT_TYPES, ...Object.keys(LEGACY_EMPLOYMENT_TYPES)], default: '' },
  education: { type: String, enum: ['', ...JOB_EDUCATION_LEVELS], default: '' },
  experience: { type: String, enum: ['', ...EXPERIENCE_LEVELS], default: '' },
  notesToAdmin: { type: String, maxlength: JOB_LIMITS.notesMax },
  skills: [String],
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  reviewReason: String,
  reviewedBy: String,
  reviewedAt: Date,
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
jobSchema.index({ status: 1, createdAt: -1, _id: 1 })
jobSchema.index({ createdBy: 1, createdAt: -1, _id: 1 })
jobSchema.index({ 'applicants.email': 1, createdAt: -1 })
jobSchema.index({ status: 1, deadline: 1 })
jobSchema.index({ status: 1, location: 1 })
jobSchema.index({ status: 1, city: 1, province: 1 })
jobSchema.index({ status: 1, locationType: 1 })
jobSchema.index({ status: 1, employmentType: 1 })
const JobPosting = mongoose.model('JobPosting', jobSchema)

const jobApplicationSchema = new Schema({
  jobId: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  applicantEmail: { type: String, required: true },
  nsrpFile: {
    originalName: String,
    mimetype: String,
    size: Number,
    version: Number,
    sourceType: { type: String, enum: ['uploaded', 'generated'] },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'superseded'], default: 'pending' },
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
  registrationDetails: { type: Schema.Types.Mixed, default: {} },
  representativeName: String,
  consentAt: Date,
  status: { type: String, enum: ['pending', ...EMPLOYER_VERIFICATION_STATUSES], default: EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW },
  adminDecision: { type: String, enum: EMPLOYER_REVIEW_DECISIONS },
  reviewedBy: String,
  reviewedAt: Date,
  requirementsFile: {
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number,
    data: { type: Buffer, select: false },
    version: Number,
    sourceType: { type: String, enum: ['uploaded', 'generated'] },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'superseded'], default: 'pending' },
  },
  requirementsVersions: {
    type: [{
      version: { type: Number, required: true },
      originalName: String,
      filename: String,
      path: String,
      mimetype: String,
      size: Number,
      sourceType: { type: String, enum: ['uploaded', 'generated'] },
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'superseded'], default: 'pending' },
      uploadedAt: Date,
      reviewedAt: Date,
      reviewedBy: String,
      reviewReason: String,
    }],
    default: [],
  },
  requirementsSubmittedAt: Date,
  reviewReason: String,
  approvedBy: String,
  approvedAt: Date,
  reviewHistory: [{
    decision: { type: String, enum: EMPLOYER_REVIEW_DECISIONS, required: true },
    reason: String,
    by: String,
    at: { type: Date, default: Date.now },
  }],
  resubmittedAt: Date,
  createdAt: { type: Date, default: Date.now },
})
employerRequestSchema.index({ status: 1, createdAt: -1, _id: 1 })
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
// Generic upload filter: verification docs plus DOCX (employer requirements).
const UPLOAD_MIME_TYPES = [...VERIFICATION_DOC_TYPES, DOCX_MIME_TYPE]

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
    if (!UPLOAD_MIME_TYPES.includes(file.mimetype)) {
      return callback(new Error('Only JPG, PNG, PDF, or DOCX files are accepted'))
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
      const error = new Error('Upload a PDF, JPG, PNG, or DOCX file with a matching extension')
      error.field = file.fieldname
      return callback(error)
    }
    callback(null, true)
  },
})

const VALID_ID_TYPES = ['SSS', 'Passport', 'PRC', 'Pag-IBIG', "Voter's ID", 'Philippine Postal ID', 'UMID']
const MAX_UPLOADS_PER_DOC = 5
// Projection to re-include the select:false buffers when streaming
const VERIFICATION_DATA_SELECT = VERIFICATION_DOC_KEYS.flatMap((key) => [
  `+verificationDocuments.${key}.versions.data`,
  `+verificationDocuments.${key}.versions.back.data`,
]).join(' ')

function authenticateRequest(req) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return null
  try {
    return jwt.verify(auth.split(' ')[1], jwtSecret)
  } catch {
    return null
  }
}

function nsrpDownloadName(companyName) {
  const safe = String(companyName || 'employer').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
  return `NSRP-${safe || 'employer'}.pdf`
}

// Lean queries return BSON Binary for Buffer fields; normalise before sending or the body becomes JSON.
function sendEmployerNsrpDocument(res, request, disposition) {
  const file = request?.requirementsFile
  let buffer = null
  const raw = file?.data
  if (raw) {
    buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer || raw)
  } else if (file?.path && fs.existsSync(file.path)) {
    buffer = fs.readFileSync(file.path)
  }
  if (!buffer) return res.status(404).json({ error: 'NSRP document not found' })
  if (!buffer.length || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    console.warn('NSRP document is not a valid PDF', { requestId: String(request._id), bytes: buffer.length })
    return res.status(422).json({ error: 'This document is unavailable or corrupted' })
  }
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposition}; filename="${nsrpDownloadName(request.companyName)}"`,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  return res.send(buffer)
}

// Signed, expiring URL so admins (and the owner) can view a doc without a public URL
function signDocumentUrl(applicantId, docKey, versionIndex, side = 'front') {
  const token = jwt.sign({ applicantId: String(applicantId), docKey, versionIndex, side }, jwtSecret, { expiresIn: '10m' })
  return `/api/documents/view/${token}`
}

const latestVersion = (slot) => (slot?.versions?.length ? slot.versions[slot.versions.length - 1] : null)
const currentDocStatus = (slot) => latestVersion(slot)?.status || 'missing'

async function migrateLegacyNsrp(applicant) {
  const slot = applicant.verificationDocuments?.nsrpForm
  const legacy = applicant.nsrpVerificationFile
  if (latestVersion(slot) || !legacy?.data || !legacy?.originalName) return false
  await storeDocumentFile(applicant._id, 'nsrpForm', 1, 'front', {
    mimetype: legacy.mimetype || 'application/pdf',
    size: legacy.size || legacy.data.length,
    buffer: legacy.data,
  })
  applicant.set('verificationDocuments.nsrpForm', {
    uploads: 1,
    versions: [{
      originalName: legacy.originalName,
      storedName: crypto.randomBytes(16).toString('hex'),
      mimetype: legacy.mimetype || 'application/pdf',
      size: legacy.size || legacy.data.length,
      uploadedAt: legacy.uploadedAt || applicant.updatedAt || new Date(),
      version: 1,
      status: 'pending',
    }],
  })
  return true
}

// Loads an applicant and migrates legacy embedded NSRP files into versioned
// slots. Legacy resume data is intentionally NOT migrated: resumes are no
// longer part of the applicant document system.
async function loadApplicantWithCurrentResume(email) {
  const applicant = await Applicant.findOne({ email }).select('+nsrpVerificationFile.data')
  if (!applicant) return null
  const migratedNsrp = await migrateLegacyNsrp(applicant)
  const previousStatus = applicant.verificationStatus
  recomputeVerificationStatus(applicant)
  if (migratedNsrp || applicant.verificationStatus !== previousStatus) await applicant.save()
  return applicant
}

function summarizeVerificationDocuments(applicant, { withUrls = false, includeHistory = false } = {}) {
  const docs = applicant?.verificationDocuments || {}
  return VERIFICATION_DOC_KEYS.map((key) => {
    const slot = docs[key]
    // Optional slots (Valid ID #2) are hidden when never used.
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
          back: key.startsWith('validId') && version.back ? {
            originalName: version.back.originalName,
            mimetype: version.back.mimetype,
            size: version.back.size,
            uploadedAt: version.back.uploadedAt,
            url: withUrls ? signDocumentUrl(applicant._id, key, index, 'back') : undefined,
          } : undefined,
        }))
      : undefined
    return {
      docKey: key,
      label: VERIFICATION_DOC_LABELS[key],
      required: REQUIRED_DOC_KEYS.includes(key),
      sourceType: key === 'nsrpForm' ? latest?.sourceType || undefined : undefined,
      idType: slot?.idType || undefined,
      status: currentDocStatus(slot), // missing | pending | approved | rejected
      correctionRequest: slot?.correctionRequest?.requestedAt ? slot.correctionRequest : undefined,
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
            back: key.startsWith('validId') && latest.back ? {
              originalName: latest.back.originalName,
              mimetype: latest.back.mimetype,
              size: latest.back.size,
              uploadedAt: latest.back.uploadedAt,
              url: withUrls ? signDocumentUrl(applicant._id, key, slot.versions.length - 1, 'back') : undefined,
            } : undefined,
          }
        : null,
      history,
      reviewLog: (slot?.history || []).map((entry) => ({
        action: entry.action,
        reason: entry.reason || undefined,
        by: entry.by,
        at: entry.at,
      })),
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
  // Document/profile reads must not silently lift an admin restriction.
  if (applicant.verificationStatus === 'restricted' || applicant.deletedAt) return
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
    const account = await Model.findOne({ email: decoded.email }).select('emailVerified verificationStatus').lean()
    if (!account) return res.status(404).json({ error: 'Account not found' })
    if (decoded.role === 'Applicant' && account.verificationStatus === 'restricted') {
      return res.status(403).json({ code: 'ACCOUNT_RESTRICTED', error: 'Your account is restricted. Please contact PESO support.' })
    }
    if (!account.emailVerified) {
      return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', error: 'Please verify your email address to continue.' })
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

async function loadEmployerVerification(email) {
  const [employer, request] = await Promise.all([
    Employer.findOne({ email }).lean(),
    EmployerRequest.findOne({ email }).lean(),
  ])
  if (!employer) return { employer: null, request, status: null, reason: '' }

  const latestVersion = request?.requirementsVersions?.at(-1)
  const documentStatus = request?.requirementsFile?.status || latestVersion?.status
    || (request?.status === EMPLOYER_VERIFICATION_STATUS.APPROVED ? 'approved' : undefined)
  const decision = request?.adminDecision
    || ([EMPLOYER_VERIFICATION_STATUS.APPROVED, EMPLOYER_VERIFICATION_STATUS.DECLINED, EMPLOYER_VERIFICATION_STATUS.NEEDS_RESUBMISSION].includes(request?.status)
      ? request.status
      : undefined)
  const status = deriveEmployerVerificationStatus({
    decision,
    documentStatus,
    fallbackStatus: employer.verificationStatus ?? request?.status,
    hasRequest: Boolean(request),
  })
  return {
    employer,
    request,
    status,
    reason: request?.reviewReason || employer.verificationReason || '',
  }
}

// --- Registration completeness (computed, never stored so it can't go stale) ---
// Lives in ./utils/registration.js so it can be unit-tested; the server is the
// source of truth for both the UI checklist and the REGISTRATION_INCOMPLETE gate.
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
    if (decoded.role === 'Applicant' && account.verificationStatus === 'restricted') return res.status(403).json({ code: 'ACCOUNT_RESTRICTED', error: 'Your account is restricted. Please contact PESO support.' })
    if (decoded.role === 'Employer') {
      const verification = await loadEmployerVerification(decoded.email)
      if (verification.status !== EMPLOYER_VERIFICATION_STATUS.APPROVED) {
        return res.status(403).json({
          code: 'EMPLOYER_NOT_VERIFIED',
          status: verification.status,
        })
      }
      return next()
    }
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

async function requireApprovedEmployer(req, res, next) {
  try {
    const decoded = req.user || authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Employer') return next()
    const verification = await loadEmployerVerification(decoded.email)
    if (!verification.employer) return res.status(404).json({ error: 'Employer not found' })
    if (verification.status !== EMPLOYER_VERIFICATION_STATUS.APPROVED) {
      return res.status(403).json({ code: 'EMPLOYER_NOT_VERIFIED', status: verification.status })
    }
    req.user = decoded
    req.employer = verification.employer
    return next()
  } catch (err) {
    console.error('Employer verification gate failed:', redactString(String(err?.message || err)))
    return res.status(500).json({ error: 'Could not verify employer access' })
  }
}

app.get('/', (req, res) => res.json({ ok: true }))
app.get('/ping', (req, res) => {
  console.log('PING received')
  res.json({ ok: true })
})

// --- Signup email verification codes (6-digit) ---
// Public endpoints; defined before the complete-registration gate. Never log
// the code, proof token, or recipient email.

// Per-IP hourly limit (per-email limits are enforced via EmailCodeSend below).
// The store is exported so tests can reset the bucket between cases.
export const emailCodeIpStore = new MemoryStore()
const emailCodeIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: EMAIL_CODE_IP_HOURLY_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: emailCodeIpStore,
  handler: (req, res) => {
    const resetAt = req.rateLimit?.resetTime
    const retryAfter = resetAt ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) : 3600
    console.log('[email-code] skipped (IP rate limit)')
    res.set('Retry-After', String(retryAfter))
    res.status(429).json({ code: 'EMAIL_CODE_RATE_LIMITED', error: 'Too many requests. Please try again later.', retryAfter })
  },
})

app.post('/api/signup/email-code', emailCodeIpLimiter, async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(422).json({ error: 'Enter a valid email address.', fieldErrors: { email: 'Enter a valid email address.' } })
    }
    const normalized = normalizeEmail(email)
    // Never reveal whether the email is registered: identical generic response.
    // Outcome logs are redacted: never the email address, the code, or credentials.
    if (await emailTakenAcrossRoles(normalized)) {
      console.log('[email-code] skipped (existing account)')
      return res.json({ ok: true })
    }

    const existing = await EmailCode.findOne({ email: normalized }).lean()
    if (existing) {
      const elapsed = Date.now() - new Date(existing.sentAt).getTime()
      if (elapsed < EMAIL_CODE_RESEND_COOLDOWN_MS) {
        const retryAfter = Math.max(1, Math.ceil((EMAIL_CODE_RESEND_COOLDOWN_MS - elapsed) / 1000))
        console.log('[email-code] skipped (cooldown)')
        res.set('Retry-After', String(retryAfter))
        return res.status(429).json({ code: 'EMAIL_CODE_COOLDOWN', error: 'Please wait before requesting another code.', retryAfter })
      }
    }
    const sentLastHour = await EmailCodeSend.countDocuments({ key: `email:${normalized}` })
    if (sentLastHour >= EMAIL_CODE_HOURLY_LIMIT) {
      console.log('[email-code] skipped (hourly limit)')
      res.set('Retry-After', '3600')
      return res.status(429).json({ code: 'EMAIL_CODE_RATE_LIMITED', error: 'Too many codes requested for this email. Please try again later.', retryAfter: 3600 })
    }

    const code = generateEmailCode()
    // A new request invalidates the previous code for this email.
    await EmailCode.deleteMany({ email: normalized })
    await EmailCode.create({ email: normalized, codeHash: hashEmailCode(normalized, code), sentAt: new Date(), createdAt: new Date() })
    await EmailCodeSend.create({ key: `email:${normalized}` })
    // Best-effort delivery; in Ethereal dev mode the mailer prints a [DEV ONLY] preview URL.
    const result = await sendEmail(
      normalized,
      'Your PESO Portal verification code',
      `Your PESO Portal verification code is:\n\n${code}\n\nIt expires in 10 minutes. If you did not request this code, you can ignore this message.`,
    )
    console.log(result.delivered ? '[email-code] sent' : `[email-code] send failed (${redactString(String(result.error || 'not configured'))})`)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/signup/email-code/verify', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : ''
    const code = typeof req.body?.code === 'string' ? req.body.code : ''
    const normalized = normalizeEmail(email)
    const record = await EmailCode.findOne({ email: normalized })
    if (!record) {
      return res.status(400).json({ code: 'EMAIL_CODE_EXPIRED', error: 'This code has expired or was replaced. Request a new code.' })
    }
    if (Date.now() - new Date(record.createdAt).getTime() > EMAIL_CODE_TTL_MS) {
      await record.deleteOne()
      return res.status(400).json({ code: 'EMAIL_CODE_EXPIRED', error: 'This code has expired. Request a new code.' })
    }
    if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS || !/^\d{6}$/.test(code) || !emailCodeMatches(normalized, code, record.codeHash)) {
      record.attempts += 1
      if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        // Too many wrong attempts: invalidate the code.
        await record.deleteOne()
        return res.status(400).json({ code: 'EMAIL_CODE_LOCKED', error: 'Too many wrong attempts. The code was invalidated — request a new one.' })
      }
      await record.save()
      const attemptsLeft = EMAIL_CODE_MAX_ATTEMPTS - record.attempts
      return res.status(400).json({ code: 'EMAIL_CODE_INVALID', error: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`, attemptsLeft })
    }
    await record.deleteOne()
    res.json({ ok: true, proofToken: signEmailProof(normalized) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/signup', applicantSignupUpload.fields([
  { name: 'nsrpAnswers', maxCount: 1 },
  { name: 'nsrpFile', maxCount: 1 },
  { name: 'birthCertificate', maxCount: 1 },
  { name: 'validId1Front', maxCount: 1 },
  { name: 'validId1Back', maxCount: 1 },
  { name: 'validId2Front', maxCount: 1 },
  { name: 'validId2Back', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
]), async (req, res) => {
  let stage = 'validation'
  try {
    const { email, password, consent, id1Type, id2Type } = req.body || {}
    const fieldErrors = {}
    // Two NSRP paths: fill out online (structured answers, generated PDF) or
    // upload a pre-filled form. Anything else is rejected.
    const nsrpMode = req.body?.nsrpMode || 'online'
    if (!['online', 'upload'].includes(nsrpMode)) {
      return res.status(422).json({ error: 'Check the highlighted fields.', fieldErrors: { nsrpMode: 'Choose how you want to provide your NSRP.' } })
    }
    const validAccountEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!validAccountEmail) fieldErrors.accountEmail = 'Enter a valid email address.'
    if (typeof password !== 'string' || !password) fieldErrors.password = 'Password is required.'
    if (consent !== true && consent !== 'true') fieldErrors.consent = 'Data privacy consent is required (RA 10173).'

    let answers = null
    let basicInfo = null
    let submittedAnswers = null
    if (nsrpMode === 'online') {
      try {
        submittedAnswers = typeof req.body?.nsrpAnswers === 'string'
          ? JSON.parse(req.body.nsrpAnswers)
          : req.body?.nsrpAnswers
      } catch {
        submittedAnswers = null
        fieldErrors.nsrpAnswers = 'The NSRP answers could not be read.'
      }
      if (!submittedAnswers || typeof submittedAnswers !== 'object' || Array.isArray(submittedAnswers)) {
        fieldErrors.nsrpAnswers = 'Complete the NSRP form before creating your account.'
        submittedAnswers = {}
      }
      submittedAnswers.email = typeof email === 'string' ? email.trim() : ''
      const validated = validateNsrpAnswers(submittedAnswers)
      answers = validated.answers
      if (!validAccountEmail && validated.fieldErrors.email) delete validated.fieldErrors.email
      Object.assign(fieldErrors, validated.fieldErrors)
    } else {
      // Upload path: nsrpAnswers are not required and ignored if sent.
      const basicRaw = {
        firstName: req.body?.firstName,
        middleName: req.body?.middleName,
        noMiddleName: req.body?.noMiddleName,
        lastName: req.body?.lastName,
        suffix: req.body?.suffix,
        dob: req.body?.dob,
        cellphone: req.body?.cellphone,
        addressCity: req.body?.addressCity,
        addressProvince: req.body?.addressProvince,
      }
      const validated = validateNsrpBasicInfo(basicRaw)
      basicInfo = validated.values
      Object.assign(fieldErrors, validated.fieldErrors)
    }
    const passwordError = passwordErrorMessage(password)
    if (passwordError) fieldErrors.password = passwordError

    const files = req.files || {}
    const fileFor = (key) => files[key]?.[0]
    if (!fileFor('birthCertificate')) fieldErrors.birthCertificate = 'Birth certificate is required.'
    if (!VALID_ID_TYPES.includes(id1Type) || !fileFor('validId1Front')) fieldErrors.validId1 = 'Choose a valid type and upload the front of Valid ID #1.'
    if (nsrpMode === 'upload') {
      if (!fileFor('nsrpFile')) fieldErrors.nsrpFile = 'Upload your filled NSRP form (PDF, JPG, or PNG).'
      else if (fileFor('nsrpFile').size > VERIFICATION_MAX_BYTES) fieldErrors.nsrpFile = 'The NSRP form must be 5 MB or smaller.'
      else if (!['application/pdf', 'image/jpeg', 'image/png'].includes(fileFor('nsrpFile').mimetype) || !fileMatchesDeclaredType(fileFor('nsrpFile'))) {
        fieldErrors.nsrpFile = 'The NSRP form must be a PDF, JPG, or PNG file.'
      }
    }
    // The resume is no longer part of the application — reject it explicitly.
    if (fileFor('resume')) fieldErrors.resume = 'The resume is no longer collected. Remove it and try again.'
    const documentFiles = ['birthCertificate', 'validId1Front', 'validId1Back', 'validId2Front', 'validId2Back']
    if (documentFiles.some((key) => fileFor(key) && fileFor(key).size > VERIFICATION_MAX_BYTES)) {
      fieldErrors.verificationDocuments = 'Verification documents must be 5 MB or smaller.'
    }
    const id2Used = Boolean(fileFor('validId2Front') || fileFor('validId2Back') || id2Type)
    if (id2Used && (!VALID_ID_TYPES.includes(id2Type) || !fileFor('validId2Front'))) fieldErrors.validId2 = 'Choose a valid type and upload the front of Valid ID #2.'
    if (id2Used && id1Type === id2Type) fieldErrors.validId2 = 'Choose a different type for Valid ID #2.'
    if (documentFiles.some((key) => fileFor(key) && !fileMatchesDeclaredType(fileFor(key)))) {
      fieldErrors.verificationDocuments = 'One or more uploaded files do not match their declared file type.'
    }
    if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted fields.', fieldErrors })

    // The 6-digit email code must have been verified: the proof token must be
    // valid, bound to this (normalized) email, unexpired, and unused.
    const signupEmailProofError = () => res.status(400).json({
      code: 'EMAIL_NOT_VERIFIED',
      error: 'Verify your email address with the 6-digit code before creating the account.',
      fieldErrors: { accountEmail: 'Email verification is required. Go back to step 1 and verify your email.' },
    })
    const emailProof = verifyEmailProof(req.body?.emailProof)
    if (!emailProof || emailProof.email !== normalizeEmail(email)) return signupEmailProofError()
    if (await UsedEmailProof.findOne({ jti: emailProof.jti }).select('_id').lean()) return signupEmailProofError()

    // Uniqueness is enforced on the normalized email across all role collections
    if (await emailTakenAcrossRoles(email)) return res.status(409).json({ error: 'Account exists', fieldErrors: { accountEmail: 'An account already uses this email address.' } })

    // Certification/signature and PDF generation apply only to the online path.
    let signatureImage = null
    let certification = { certified: false, certificationDate: '' }
    let pdfBuffer = null
    if (nsrpMode === 'online') {
      try {
        signatureImage = parseSignatureImage(submittedAnswers.signatureDataUrl)
        certification = resolveCertification({ certified: submittedAnswers.certified, signature: signatureImage })
      } catch (err) {
        if (err instanceof SignatureValidationError) {
          return res.status(422).json({ error: err.message, fieldErrors: { certified: err.message } })
        }
        throw err
      }
      stage = 'nsrp-pdf'
      try {
        pdfBuffer = await generateNsrpPdf(answers, {
          signatureImage,
          certificationDate: certification.certificationDate,
        })
      } catch (err) {
        console.error('Signup NSRP PDF generation failed:', redactString(String(err?.message || err)))
        return res.status(500).json({ code: 'NSRP_GENERATION_FAILED', error: 'The NSRP PDF could not be generated. Please try again.' })
      }
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const uploadedAt = new Date()
    // File bytes are stored in the document_files collection after the applicant
    // is created; the applicant document holds metadata only (16 MB BSON limit).
    const filesToStore = []
    const versionFor = (slot, sourceType) => (file) => {
      filesToStore.push({ slot, version: 1, side: 'front', file })
      return {
        originalName: file.originalname,
        storedName: crypto.randomBytes(16).toString('hex'),
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt,
        version: 1,
        status: 'pending',
        sourceType,
      }
    }
    const slotFor = (slot, sourceType) => (file, idType) => ({
      idType,
      uploads: 1,
      versions: [versionFor(slot, sourceType)(file)],
    })
    // Exactly one NSRP document per account, from the chosen path.
    const nsrpFileMeta = nsrpMode === 'online'
      ? {
          originalname: `NSRP-${answers.surname.replace(/\s+/g, '_')}.pdf`,
          mimetype: 'application/pdf',
          size: pdfBuffer.length,
          buffer: pdfBuffer,
        }
      : fileFor('nsrpFile')
    const verificationDocuments = {
      nsrpForm: slotFor('nsrpForm', nsrpMode === 'online' ? 'generated' : 'uploaded')(nsrpFileMeta),
      birthCertificate: slotFor('birthCertificate')(fileFor('birthCertificate')),
      validId1: slotFor('validId1')(fileFor('validId1Front'), id1Type),
    }
    const setBackFile = (slotName, file) => {
      if (!file) return
      const slot = verificationDocuments[slotName]
      filesToStore.push({ slot: slotName, version: 1, side: 'back', file })
      slot.versions[0].back = {
        originalName: file.originalname,
        storedName: crypto.randomBytes(16).toString('hex'),
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt,
      }
    }
    setBackFile('validId1', fileFor('validId1Back'))
    if (fileFor('validId2Front')) {
      verificationDocuments.validId2 = slotFor('validId2')(fileFor('validId2Front'), id2Type)
      setBackFile('validId2', fileFor('validId2Back'))
    }
    // Display name and location come from the NSRP answers (online) or the
    // basic-information step (upload).
    const fullName = nsrpMode === 'online'
      ? [answers.firstName, answers.middleName, answers.surname, answers.suffix].filter(Boolean).join(' ')
      : [basicInfo.firstName, basicInfo.middleName, basicInfo.lastName, basicInfo.suffix].filter(Boolean).join(' ')
    const profileLocation = nsrpMode === 'online'
      ? [answers.addressStreet, answers.addressBarangay, answers.addressCity, answers.addressProvince].filter(Boolean).join(', ')
      : [basicInfo.addressCity, basicInfo.addressProvince].filter(Boolean).join(', ')
    const profile = nsrpMode === 'online'
      ? (() => {
          const storedAnswers = { ...answers, certified: Boolean(submittedAnswers.certified) }
          delete storedAnswers.signatureDataUrl
          return {
            name: fullName,
            firstName: answers.firstName,
            middleName: answers.middleName,
            lastName: answers.surname,
            suffix: answers.suffix,
            dob: answers.dob,
            location: profileLocation,
            phone: answers.cellphone,
            addressCity: answers.addressCity,
            addressProvince: answers.addressProvince,
            skills: answers.skills || [],
            education: answers.education || [],
            technicalTraining: answers.technicalTraining || [],
            workExperience: answers.workExperience || [],
            summary: [answers.occupation1, ...(answers.skills || [])].filter(Boolean).join(' · '),
            nsrp: storedAnswers,
          }
        })()
      : {
          name: fullName,
          firstName: basicInfo.firstName,
          middleName: basicInfo.middleName,
          lastName: basicInfo.lastName,
          suffix: basicInfo.suffix,
          dob: basicInfo.dob,
          location: profileLocation,
          phone: basicInfo.cellphone,
          addressCity: basicInfo.addressCity,
          addressProvince: basicInfo.addressProvince,
          skills: [],
          summary: '',
        }
    stage = 'create-account'
    let user
    try {
      user = await createUserInRole('Applicant', {
        sessionVersion: 1,
        email: email.trim(),
        passwordHash,
        emailVerified: true, // proven by the 6-digit code before account creation
        phone: nsrpMode === 'online' ? answers.cellphone : basicInfo.cellphone,
        profile,
        verificationDocuments,
        consentGivenAt: new Date(),
        ...(signatureImage && certification.certified ? {
          nsrpSignature: {
            mimetype: signatureImage.mimetype,
            size: signatureImage.bytes.length,
            uploadedAt,
            certifiedAt: certification.certifiedAt,
            data: signatureImage.bytes,
          },
        } : {}),
      })
      stage = 'store-files'
      for (const { slot, version, side, file } of filesToStore) {
        await storeDocumentFile(user._id, slot, version, side, file)
      }
    } catch (err) {
      // Roll back so no half-created account or orphaned files remain
      if (user?._id) await Applicant.deleteOne({ _id: user._id }).catch(() => {})
      if (user?._id) await deleteApplicantDocumentFiles(user._id).catch(() => {})
      throw err
    }

    // Consume the single-use proof token only after the account exists.
    await UsedEmailProof.create({ jti: emailProof.jti, expiresAt: new Date(emailProof.exp * 1000) })

    // No link-verification email is sent: these accounts are verified by code.
    // The link-based flow (verify-email / resend) stays for older accounts.

    notify({
      recipient: { id: user._id, role: 'Applicant', email: user.email },
      type: 'registration_submitted',
      title: 'Registration submitted',
      message: 'Your registration and documents were submitted and are awaiting PESO review.',
      link: '/profile',
      email: true,
    })
    notifyAdmins({
      type: 'applicant_registration_pending',
      title: 'New applicant registration',
      message: `${fullName} registered and is awaiting document review.`,
      link: '/applicants',
      metadata: { applicantId: String(user._id) },
    })

    const safe = { id: String(user._id), email: user.email, role: 'Applicant', emailVerified: true, registration: registrationProgress(user, 'Applicant'), profile: user.profile, verificationDocuments: summarizeVerificationDocuments(user), attentionCount: attentionCount(user) }
    const token = jwt.sign({ sub: String(user._id), sessionVersion: user.sessionVersion, email: user.email, role: 'Applicant' }, jwtSecret, { expiresIn: '7d' })
    res.json({ user: safe, token })
  } catch (err) {
    // One redacted line, matchable by the client-visible errorId. Never log the
    // email, password, code, token, or file contents.
    const errorId = crypto.randomBytes(6).toString('hex')
    console.error(`signup: failed at ${stage} (errorId=${errorId}) ${err?.name || 'Error'}: ${redactString(String(err?.message || err))}`)
    res.status(500).json({ error: 'Server error', errorId })
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
    notify({
      recipient: { id: user._id, role, email: user.email },
      type: 'email_verified',
      title: 'Email verified',
      message: 'Your email address has been verified.',
      link: '/profile',
    })
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

async function hydrateEmployerAddress(employer, request) {
  const address = getEmployerAddress(employer, request)
  if (!address.city) return
  if (employer.establishmentAddress?.city !== address.city || employer.establishmentAddress?.province !== address.province) {
    await Employer.updateOne({ _id: employer._id }, { $set: { establishmentAddress: address } })
  }
  employer.establishmentAddress = address
}

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' })

    const found = await findUserByEmail(email)
    if (!found) return res.status(401).json({ error: 'Invalid credentials' })
    let { user, type } = found
    const requirements = type === 'Employer' ? await EmployerRequest.findOne({ email: user.email }).select('+requirementsFile.data').lean() : null
    const employerVerification = type === 'Employer' ? await loadEmployerVerification(user.email) : null

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    if (type === 'Applicant' && user.deletedAt) return res.status(403).json({ error: 'This account is closed. You may register a new account.' })
    if (type === 'Applicant') user = await loadApplicantWithCurrentResume(user.email)
    if (user.verificationStatus === 'restricted') return res.status(403).json({ error: 'Your account has been restricted. Please contact PESO support.' })

    if (type === 'Employer') await hydrateEmployerAddress(user, requirements)
    const registration = ['Applicant', 'Employer'].includes(type) ? registrationProgress(user, type, { requirementsFile: requirements?.requirementsFile, requestLocation: requirements?.location }) : undefined
    const safe = { id: String(user._id), email: user.email, role: type, emailVerified: ['Applicant', 'Employer'].includes(type) ? Boolean(user.emailVerified) : undefined, needsNameConfirmation: type === 'Applicant' ? Boolean(user.needsNameConfirmation) : undefined, registration, verificationDocuments: type === 'Applicant' ? summarizeVerificationDocuments(user) : undefined, attentionCount: type === 'Applicant' ? attentionCount(user) : undefined, establishmentAddress: type === 'Employer' ? user.establishmentAddress : undefined, companyName: type === 'Employer' ? (user.companyName || requirements?.companyName) : undefined, contactName: type === 'Employer' ? (user.contactName || requirements?.contactName) : undefined, phone: type === 'Employer' ? (user.phone || requirements?.phone) : undefined, profile: user.profile, verificationStatus: type === 'Employer' ? employerVerification.status : type === 'Applicant' ? (user.verificationStatus || 'approved') : undefined, verificationReason: type === 'Employer' ? employerVerification.reason : type === 'Applicant' ? user.verificationReason : undefined, approvalNoticePending: type === 'Employer' ? Boolean(user.approvalNoticePending) : undefined, requirementsFile: requirements?.requirementsFile ? { originalName: requirements.requirementsFile.originalName, size: requirements.requirementsFile.size, status: requirements.requirementsFile.status, sourceType: requirements.requirementsFile.sourceType, version: requirements.requirementsFile.version } : undefined, requirementsSubmittedAt: type === 'Employer' ? (requirements?.requirementsSubmittedAt || user.requirementsSubmittedAt) : undefined, nsrpVerificationFile: type === 'Applicant' && user.nsrpVerificationFile?.originalName ? { originalName: user.nsrpVerificationFile.originalName, size: user.nsrpVerificationFile.size, uploadedAt: user.nsrpVerificationFile.uploadedAt } : undefined }
    const token = jwt.sign({ email: user.email, role: type, ...(type === 'Applicant' ? { sub: String(user._id), sessionVersion: user.sessionVersion || 0 } : {}) }, jwtSecret, { expiresIn: '7d' })
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
    if (type === 'Employer') await hydrateEmployerAddress(user, requirements)
    const employerVerification = type === 'Employer' ? await loadEmployerVerification(user.email) : null
    const registration = ['Applicant', 'Employer'].includes(type) ? registrationProgress(user, type, { requirementsFile: requirements?.requirementsFile, requestLocation: requirements?.location }) : undefined
    res.json({ id: String(user._id), email: user.email, role: type, emailVerified: ['Applicant', 'Employer'].includes(type) ? Boolean(user.emailVerified) : undefined, needsNameConfirmation: type === 'Applicant' ? Boolean(user.needsNameConfirmation) : undefined, registration, establishmentAddress: type === 'Employer' ? user.establishmentAddress : undefined, companyName: type === 'Employer' ? (user.companyName || requirements?.companyName) : undefined, contactName: type === 'Employer' ? (user.contactName || requirements?.contactName) : undefined, phone: type === 'Employer' ? (user.phone || requirements?.phone) : undefined, profile: user.profile, verificationStatus: type === 'Employer' ? employerVerification.status : type === 'Applicant' ? (user.verificationStatus || 'approved') : undefined, verificationReason: type === 'Employer' ? employerVerification.reason : type === 'Applicant' ? user.verificationReason : undefined, approvalNoticePending: type === 'Employer' ? Boolean(user.approvalNoticePending) : undefined, verificationDocuments: type === 'Applicant' ? summarizeVerificationDocuments(user) : undefined, attentionCount: type === 'Applicant' ? attentionCount(user) : undefined, requirementsFile: requirements?.requirementsFile ? { originalName: requirements.requirementsFile.originalName, size: requirements.requirementsFile.size, status: requirements.requirementsFile.status, sourceType: requirements.requirementsFile.sourceType, version: requirements.requirementsFile.version } : undefined, requirementsSubmittedAt: type === 'Employer' ? (requirements?.requirementsSubmittedAt || user.requirementsSubmittedAt) : undefined, nsrpVerificationFile: type === 'Applicant' && user.nsrpVerificationFile?.originalName ? { originalName: user.nsrpVerificationFile.originalName, size: user.nsrpVerificationFile.size, uploadedAt: user.nsrpVerificationFile.uploadedAt } : undefined })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Adds a new pending version to a document slot. The file bytes are stored in
// the document_files collection (see utils/documentFiles.js); only metadata is
// embedded. Returns a `cleanup` that removes the stored bytes if the caller's
// save fails, so a failed write never leaves orphaned files behind.
async function appendVerificationVersion(applicant, docKey, file, idType = '', sourceType) {
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
  const versionNumber = (slot.versions?.length || 0) + 1
  await storeDocumentFile(applicant._id, docKey, versionNumber, 'front', file)
  const cleanup = () => DocumentFile.deleteOne({ applicant: applicant._id, slot: docKey, version: versionNumber, side: 'front' }).catch(() => {})
  if (current && ['pending', 'rejected'].includes(current.status)) current.status = 'superseded'
  const version = {
    originalName: file.originalname,
    storedName: crypto.randomBytes(16).toString('hex'),
    mimetype: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
    version: versionNumber,
    status: 'pending',
    sourceType,
  }
  slot.uploads = (slot.uploads || 0) + 1
  slot.versions = [...(slot.versions || []), version]
  if (idType) slot.idType = idType
  applicant.verificationDocuments[docKey] = slot
  recomputeVerificationStatus(applicant)
  return { slot, version, cleanup }
}

// Resumes are no longer part of the applicant document system. Stored legacy
// resume data is kept in the database but unreachable; see
// server/scripts/cleanup-resumes.js for optional removal.
app.post('/api/profile/resume', (_req, res) => {
  res.status(410).json({ code: 'RESUME_REMOVED', error: 'Resumes are no longer part of this system.' })
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

    await notifyAdmins({
      type: 'applicant_registration_pending',
      title: 'Applicant NSRP verification submitted',
      message: `${decoded.email} submitted an NSRP verification document for account approval.`,
      link: '/applicants',
      metadata: { applicantId: String(applicant._id) },
    })

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

// Read an applicant's stored NSRP signature — owner or admin only.
app.get('/api/applicants/:id/nsrp-signature', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const decoded = jwt.verify(auth.split(' ')[1], jwtSecret)
    if (!['Admin', 'Applicant'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })
    const applicant = await Applicant.findById(req.params.id).select('+nsrpSignature.data').lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (decoded.role === 'Applicant' && applicant.email !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    if (!applicant.nsrpSignature?.data) return res.status(404).json({ error: 'No signature stored' })
    const raw = applicant.nsrpSignature.data
    const buffer = Buffer.isBuffer(raw) ? raw : (raw?.buffer ? Buffer.from(raw.buffer) : Buffer.from(raw))
    res.type(applicant.nsrpSignature.mimetype || 'image/png')
    res.set('Cache-Control', 'no-store')
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
    if (!req.file) return res.status(400).json({ error: 'A JPG, PNG, or PDF file is required' })
    if (!VERIFICATION_DOC_TYPES.includes(req.file.mimetype) || !fileMatchesDeclaredType(req.file)) {
      return res.status(400).json({ error: 'Upload a genuine JPG, PNG, or PDF document' })
    }

    const idType = typeof req.body.idType === 'string' ? req.body.idType.trim() : ''
    if (docKey.startsWith('validId') && !idType) return res.status(400).json({ error: 'ID type is required' })

    const applicant = await Applicant.findOne({ email: decoded.email })
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })

    // Ownership + account state checks: restricted accounts cannot upload
    if (applicant.verificationStatus === 'restricted') return res.status(403).json({ error: 'This account is restricted. Please contact PESO support.' })

    const { slot, version, cleanup } = await appendVerificationVersion(applicant, docKey, req.file, idType, docKey === 'nsrpForm' ? 'uploaded' : undefined)
    try {
      await applicant.save()
    } catch (err) {
      await cleanup()
      throw err
    }

    await notifyAdmins({
      type: 'document_resubmitted',
      title: 'Document awaiting review',
      message: `${applicantFullName(applicant)} uploaded ${VERIFICATION_DOC_LABELS[docKey]} for review.`,
      link: '/applicants',
      metadata: { applicantId: String(applicant._id), docKey },
    })

    res.json({ ok: true, docKey, version: version.version, status: 'pending', uploadsRemaining: MAX_UPLOADS_PER_DOC - slot.uploads, document: { originalName: version.originalName, size: version.size, uploadedAt: version.uploadedAt } })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/profile/verification-documents/:docKey/correction-request', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Only applicants can request corrections' })
    const { docKey } = req.params
    if (!VERIFICATION_DOC_KEYS.includes(docKey)) return res.status(400).json({ error: 'Unknown document type' })
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
    if (reason.length < 5 || reason.length > 1000) return res.status(400).json({ error: 'Describe the correction in 5 to 1,000 characters.' })
    // Match and update atomically so duplicate requests cannot send duplicate notices.
    const applicant = await Applicant.findOne({ email: decoded.email })
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    const slot = applicant.verificationDocuments?.[docKey]
    const version = latestVersion(slot)
    if (version?.status !== 'approved') return res.status(409).json({ error: 'Only approved documents need a correction request. Use the upload options for missing or rejected documents.' })
    const requestedAt = new Date()
    const result = await Applicant.updateOne({
      _id: applicant._id,
      [`verificationDocuments.${docKey}.correctionRequest.requestedAt`]: { $exists: false },
      [`verificationDocuments.${docKey}.versions.${slot.versions.length - 1}.status`]: 'approved',
    }, { $set: { [`verificationDocuments.${docKey}.correctionRequest`]: { reason, requestedAt } } })
    if (!result.modifiedCount) return res.status(409).json({ error: 'A correction is already pending or the document status changed. Refresh your documents.' })
    await notifyAdmins({
      type: 'document_correction_requested', title: 'Document correction requested',
      message: `${applicantFullName(applicant)} requested a correction to ${VERIFICATION_DOC_LABELS[docKey]}: ${reason}`,
      link: '/applicants', metadata: { applicantId: String(applicant._id), docKey },
    })
    res.json({ ok: true, correctionRequest: { reason, requestedAt } })
  } catch (err) {
    console.error('Document correction request failed:', redactString(err?.message || String(err)))
    res.status(500).json({ error: 'Unable to send correction request' })
  }
})

app.put('/api/profile/nsrp', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Only applicants can update an NSRP form.' })
    const { answers, fieldErrors } = validateNsrpAnswers(req.body?.answers || {})
    if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted NSRP fields.', fieldErrors })
    const applicant = await Applicant.findOne({ email: decoded.email })
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    const currentNsrp = latestVersion(applicant.verificationDocuments?.nsrpForm)
    if (currentNsrp?.status === 'approved') {
      return res.status(409).json({ code: 'NSRP_LOCKED', error: 'Your approved NSRP form is locked.' })
    }

    let signatureImage = null
    let certification
    try {
      signatureImage = parseSignatureImage(req.body?.answers?.signatureDataUrl)
      certification = resolveCertification({ certified: req.body?.answers?.certified, signature: signatureImage })
    } catch (err) {
      if (err instanceof SignatureValidationError) {
        return res.status(422).json({ error: err.message, fieldErrors: { certified: err.message } })
      }
      throw err
    }
    let pdfBuffer
    try {
      pdfBuffer = await generateNsrpPdf(answers, { signatureImage, certificationDate: certification.certificationDate })
    } catch (err) {
      console.error('NSRP update PDF generation failed:', err)
      return res.status(500).json({ code: 'NSRP_GENERATION_FAILED', error: 'The NSRP PDF could not be generated. Please try again.' })
    }

    const storedAnswers = { ...answers, certified: Boolean(req.body?.answers?.certified) }
    delete storedAnswers.signatureDataUrl
    const fullName = [answers.firstName, answers.middleName, answers.surname, answers.suffix].filter(Boolean).join(' ')
    applicant.set('profile.nsrp', storedAnswers)
    applicant.set('profile.firstName', answers.firstName)
    applicant.set('profile.middleName', answers.middleName)
    applicant.set('profile.lastName', answers.surname)
    applicant.set('profile.suffix', answers.suffix)
    applicant.set('profile.name', fullName)
    applicant.set('profile.dob', answers.dob)
    applicant.set('profile.location', [answers.addressStreet, answers.addressBarangay, answers.addressCity, answers.addressProvince].filter(Boolean).join(', '))
    applicant.set('profile.phone', answers.cellphone)
    applicant.set('profile.addressCity', answers.addressCity)
    applicant.set('profile.addressProvince', answers.addressProvince)
    applicant.set('phone', answers.cellphone)
    applicant.set('profile.summary', [answers.occupation1, ...(answers.skills || [])].filter(Boolean).join(' · '))
    applicant.set('profile.skills', answers.skills || [])
    applicant.set('profile.education', answers.education || [])
    applicant.set('profile.technicalTraining', answers.technicalTraining || [])
    applicant.set('profile.workExperience', answers.workExperience || [])
    applicant.markModified('profile.nsrp')
    if (signatureImage && certification.certified) {
      applicant.set('nsrpSignature', {
        mimetype: signatureImage.mimetype,
        size: signatureImage.bytes.length,
        uploadedAt: new Date(),
        certifiedAt: certification.certifiedAt,
        data: signatureImage.bytes,
      })
    }
    const nsrpFile = {
      originalname: `NSRP-${answers.surname.replace(/\s+/g, '_')}.pdf`,
      mimetype: 'application/pdf',
      size: pdfBuffer.length,
      buffer: pdfBuffer,
    }
    const { version, cleanup } = await appendVerificationVersion(applicant, 'nsrpForm', nsrpFile, '', 'generated')
    try {
      await applicant.save()
    } catch (err) {
      await cleanup()
      throw err
    }
    await notifyAdmins({
      type: 'applicant_registration_pending',
      title: 'Applicant NSRP updated',
      message: `${applicantFullName(applicant)} updated their NSRP form for review.`,
      link: '/applicants',
      metadata: { applicantId: String(applicant._id), nsrpVersion: version.version },
    })
    return res.json({ ok: true, version: version.version, status: version.status })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    return res.status(500).json({ error: 'The NSRP form could not be updated.' })
  }
})

// List an applicant's verification documents with signed, expiring URLs (admin or owner)
app.get('/api/applicants/:id/verification-documents', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (!['Admin', 'Applicant'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })
    const applicant = await Applicant.findById(req.params.id).select('+nsrpVerificationFile.data')
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (decoded.role === 'Applicant' && applicant.email !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    const migratedNsrp = await migrateLegacyNsrp(applicant)
    if (migratedNsrp) {
      recomputeVerificationStatus(applicant)
      await applicant.save()
    }
    const nsrp = applicant.profile?.nsrp || {}
    res.json({
      documents: summarizeVerificationDocuments(applicant, { withUrls: true, includeHistory: decoded.role === 'Admin' }),
      verificationStatus: applicant.verificationStatus,
      verificationReason: applicant.verificationReason,
      attentionCount: attentionCount(applicant),
      consentGivenAt: applicant.consentGivenAt,
      documentsPurgedAt: applicant.documentsPurgedAt,
      nsrpData: Object.keys(nsrp).length ? nsrp : null,
      basic: {
        firstName: applicant.profile?.firstName || nsrp.firstName || '',
        middleName: applicant.profile?.middleName || nsrp.middleName || '',
        lastName: applicant.profile?.lastName || nsrp.surname || '',
        suffix: applicant.profile?.suffix || nsrp.suffix || '',
        dob: applicant.profile?.dob || nsrp.dob || '',
        phone: applicant.phone || applicant.profile?.phone || nsrp.cellphone || '',
        cellphone: applicant.phone || applicant.profile?.phone || nsrp.cellphone || '',
        addressCity: applicant.profile?.addressCity || nsrp.addressCity || '',
        addressProvince: applicant.profile?.addressProvince || nsrp.addressProvince || '',
        location: applicant.profile?.location || [
          nsrp.addressStreet,
          nsrp.addressBarangay,
          applicant.profile?.addressCity || nsrp.addressCity,
          applicant.profile?.addressProvince || nsrp.addressProvince,
        ].filter(Boolean).join(', '),
      },
    })
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
    const { applicantId, docKey, versionIndex, side = 'front' } = payload
    if (!VERIFICATION_DOC_KEYS.includes(docKey) || typeof versionIndex !== 'number') return res.status(400).json({ error: 'Unknown document' })
    const applicant = await Applicant.findById(applicantId).select(VERIFICATION_DATA_SELECT).lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    const version = applicant.verificationDocuments?.[docKey]?.versions?.[versionIndex]
    const doc = side === 'back' ? version?.back : version
    if (!doc) return res.status(404).json({ error: 'Document not found or has been purged' })
    // Bytes live in document_files; pre-migration records may still embed them.
    const stored = version?.version
      ? await loadDocumentFile(applicantId, docKey, version.version, side)
      : null
    const rawData = stored?.data ?? doc.data
    if (!rawData) return res.status(404).json({ error: 'Document not found or has been purged' })
    const buffer = Buffer.isBuffer(rawData) ? rawData : (rawData?.buffer ? Buffer.from(rawData.buffer) : Buffer.from(rawData))
    res.type(stored?.mimetype || doc.mimetype || 'application/octet-stream')
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
    const { status, reason, action } = req.body || {}
    const isRevert = action === 'revert'
    if (!isRevert && !['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const applicant = await Applicant.findById(req.params.id)
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (applicant.deletedAt) return res.status(409).json({ error: 'This account is closed. Its retained record is read-only.' })

    const slot = applicant.verificationDocuments?.[docKey]
    const current = latestVersion(slot)
    if (!current || current.status === 'missing') return res.status(404).json({ error: 'No document uploaded for this requirement' })
    if (current.status === 'superseded') return res.status(409).json({ code: 'SUPERSEDED', error: 'This version was replaced by a newer upload. Review the latest version.' })

    // Guards: approve/reject only from pending; revert only from approved with a reason
    const guard = validateReviewTransition({
      action: isRevert ? 'revert' : status,
      currentStatus: current.status,
      reason,
    })
    if (guard) return res.status(guard.status).json({ code: guard.code, error: guard.message })

    if (isRevert) {
      slot.correctionRequest = undefined
      current.status = 'pending'
      current.reviewedAt = undefined
      current.reviewedBy = undefined
      current.reviewReason = undefined
      slot.history = [...(slot.history || []), { action: 'revert', reason: String(reason).trim(), by: decoded.email, at: new Date() }]
      recomputeVerificationStatus(applicant)
      await applicant.save()
      await notify({
        recipient: { id: applicant._id, role: 'Applicant', email: applicant.email },
        type: 'document_reverted',
        title: 'Document needs review again',
        message: `Your ${VERIFICATION_DOC_LABELS[docKey]} was moved back to pending: ${String(reason).trim()}. You do not need to re-upload it.`,
        link: '/profile?documents=1',
        email: true,
        metadata: { docKey, action: 'revert' },
      })
      return res.json({ id: String(applicant._id), verificationStatus: applicant.verificationStatus, verificationReason: applicant.verificationReason, documents: summarizeVerificationDocuments(applicant) })
    }

    current.status = status
    current.reviewedAt = new Date()
    current.reviewedBy = decoded.email
    current.reviewReason = status === 'rejected' ? String(reason || '').trim() : undefined
    slot.history = [...(slot.history || []), { action: status, reason: status === 'rejected' ? String(reason || '').trim() : undefined, by: decoded.email, at: new Date() }]
    recomputeVerificationStatus(applicant)
    await applicant.save()

    const message = status === 'approved'
      ? `Your ${VERIFICATION_DOC_LABELS[docKey]} was approved.`
      : `Your ${VERIFICATION_DOC_LABELS[docKey]} was rejected${reason ? `: ${reason}` : ''}. Please re-upload it from your My Documents page.`
    await notify({
      recipient: { id: applicant._id, role: 'Applicant', email: applicant.email },
      type: status === 'approved' ? 'document_approved' : 'document_rejected',
      title: `Verification document ${status}`,
      message,
      link: '/profile?documents=1',
      email: true,
      metadata: { docKey, status, reason: status === 'rejected' ? String(reason || '').trim() : undefined },
    })
    if (applicant.verificationStatus === 'approved') {
      await notify({
        recipient: { id: applicant._id, role: 'Applicant', email: applicant.email },
        type: 'account_verified',
        title: 'Account verified',
        message: 'All your documents were approved. Your account is now verified.',
        link: '/jobs',
        email: true,
      })
    }
    res.json({ id: String(applicant._id), verificationStatus: applicant.verificationStatus, verificationReason: applicant.verificationReason, documents: summarizeVerificationDocuments(applicant) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Resumes were removed from the applicant document system; stored legacy data
// is kept but unreachable (see server/scripts/cleanup-resumes.js).
app.get('/api/applicants/:id/resume', (_req, res) => {
  res.status(410).json({ code: 'RESUME_REMOVED', error: 'Resumes are no longer part of this system.' })
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
    // Applicants edit structured name parts; validate them server-side too
    if (decoded.role === 'Applicant' && (profile.firstName !== undefined || profile.lastName !== undefined || profile.middleName !== undefined || profile.suffix !== undefined)) {
      const { values: nameValues, fieldErrors: nameErrors } = validateNameFields(profile, { noMiddleName: profile.noMiddleName === true || !sanitizeName(profile.middleName) })
      if (Object.keys(nameErrors).length > 0) {
        return res.status(400).json({ error: Object.values(nameErrors)[0], fieldErrors: nameErrors })
      }
      profile.firstName = nameValues.firstName
      profile.middleName = nameValues.middleName
      profile.lastName = nameValues.lastName
      profile.suffix = nameValues.suffix
      profile.name = [nameValues.firstName, nameValues.middleName, nameValues.lastName, nameValues.suffix].filter(Boolean).join(' ')
      delete profile.noMiddleName
      // Editing (and thereby confirming) the name clears the migration flag
      await Applicant.updateOne({ email: decoded.email }, { $set: { needsNameConfirmation: false } })
    }
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

app.use('/api/account-deletion', createAccountDeletionRouter({ Applicant, AccountDeletionRequest, JobPosting, JobApplication, Notification, authenticate: authenticateRequest, notify, notifyAdmins, mail: sendEmail }))

const registrationSetupRoutes = [
  // Pre-account NSRP endpoints used by the sign-up wizard (rate-limited)
  { method: 'POST', path: /^\/api\/nsrp\/(preview-signup|validate-signup)$/ },
  { method: 'POST', path: /^\/api\/employer-registration\/preview\/?$/ },
  { method: 'GET', path: /^\/api\/employer\/verification\/?$/ },
  { method: 'POST', path: /^\/api\/employer\/verification\/approval-notice\/seen\/?$/ },
  { method: 'GET', path: /^\/api\/profile\/?$/ },
  { method: 'GET', path: /^\/api\/notifications\/?$/ },
  { method: 'PATCH', path: /^\/api\/notifications\/(?:read-all|[^/]+\/read)\/?$/ },
  { method: 'POST', path: /^\/api\/auth\/resend-verification\/?$/ },
  // Public signup email-code endpoints (also defined before this gate)
  { method: 'POST', path: /^\/api\/signup\/email-code(\/verify)?$/ },
  { method: 'POST', path: /^\/api\/employer-requests$/ },
  { method: 'POST', path: /^\/api\/profile\/nsrp-verification$/ },
  { method: 'POST', path: /^\/api\/profile\/verification-documents\/[^/]+$/ },
  { method: 'GET', path: /^\/api\/applicants\/[^/]+\/(nsrp-verification|verification-documents)$/ },
  { method: 'GET', path: /^\/api\/documents\/view\/[^/]+$/ },
  { method: 'POST', path: /^\/api\/employer-requirements\/?$/ },
  { method: 'GET', path: /^\/api\/employer-requirements\/current\/(?:versions\/\d+\/)?view\/?$/ },
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

const JOB_FIELD_ERRORS_MESSAGE = 'Check the highlighted job posting fields.'

async function prepareJobPosting(input, options = {}) {
  const { errors, value } = validateJobPosting(input, options)
  if (Object.keys(errors).length) return { errors }
  const title = await resolveJobTitle(value.title, value.customTitle)
  if (!title) return { errors: { title: 'Select or enter a valid job title.' } }
  const { customTitle: _customTitle, ...fields } = value
  fields.title = title
  fields.salary = formatSalary(fields)
  fields.location = formatLocation(fields)
  // Accept applications through the end of the selected Philippine calendar day.
  fields.deadline = value.deadline ? new Date(`${value.deadline}T23:59:59.999+08:00`) : undefined
  return { errors, fields }
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

app.post('/api/jobs', requireVerifiedEmail, requireApprovedEmployer, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    const body = req.body || {}
    const employer = await Employer.findOne({ email: decoded.email }).lean()
    const request = await EmployerRequest.findOne({ email: decoded.email }).lean()
    const resolvedCompany = body.company || employer?.companyName || employer?.profile?.companyName || request?.companyName || ''
    const { errors, fields } = await prepareJobPosting(body)
    if (!resolvedCompany) return res.status(400).json({ error: 'A company name is required.' })
    if (Object.keys(errors).length) return res.status(422).json({ error: JOB_FIELD_ERRORS_MESSAGE, fieldErrors: errors })
    const job = new JobPosting({ ...fields, company: resolvedCompany, createdBy: decoded.email })
    await job.save()

    await notifyAdmins({
      type: 'job_pending_review',
      title: 'New job posting pending review',
      message: `${decoded.email} submitted “${job.title}” for approval.`,
      link: '/jobs',
      metadata: { jobId: String(job._id), jobTitle: job.title },
    })

    res.json(job)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.put('/api/jobs/:id', requireVerifiedEmail, requireApprovedEmployer, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)

    const body = req.body || {}
    const { company } = body
    if (!company) return res.status(400).json({ error: 'A company name is required.' })

    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.createdBy !== decoded.email) return res.status(403).json({ error: 'Forbidden' })
    if (job.status !== 'pending') return res.status(400).json({ error: 'Only pending job postings can be edited' })

    const keepDeadline = job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : ''
    const { errors, fields } = await prepareJobPosting(body, { keepDeadline })
    if (Object.keys(errors).length) return res.status(422).json({ error: JOB_FIELD_ERRORS_MESSAGE, fieldErrors: errors })

    job.set({ ...fields, company })
    await job.save()

    res.json(job)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/jobs', requireVerifiedEmail, requireApprovedEmployer, async (req, res) => {
  try {
    const viewer = authenticateRequest(req)
    const present = (doc) => {
      const job = normalizeJobPosting(typeof doc.toObject === 'function' ? doc.toObject() : doc)
      if (viewer?.role !== 'Admin' && viewer?.email !== job.createdBy) delete job.notesToAdmin
      return job
    }
    const attachEmployerBranding = async (jobDocs) => {
      const emails = [...new Set(jobDocs.map((job) => job.createdBy).filter(Boolean))]
      if (emails.length === 0) {
        return jobDocs.map((job) => {
          const plain = present(job)
          return { ...plain, employerBranding: null }
        })
      }
      const employers = await Employer.find({ email: { $in: emails.map((email) => new RegExp(`^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } }).select('email profile.profileImage profile.bannerImage').lean()
      const brandingByEmail = new Map(employers.map((employer) => [employer.email.toLowerCase(), {
        profileImage: employer.profile?.profileImage || '',
        bannerImage: employer.profile?.bannerImage || '',
      }]))
      return jobDocs.map((job) => {
        const plain = present(job)
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
    // Paginated mode: ?page=1&limit=10&status=approved&search=...&sortBy=...&order=... -> { items, total, page, limit, totalPages }
    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const { page, limit } = parsePagination(req.query)
      const status = String(req.query.status || 'approved')
      const auth = req.headers.authorization
      const decoded = auth?.startsWith('Bearer ') ? jwt.verify(auth.split(' ')[1], jwtSecret) : null
      const filter = {}
      if (status === 'pending' || status === 'declined') {
        if (!decoded) return res.status(401).json({ error: 'Missing token' })
        if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
        filter.status = status
      } else if (status === 'mine') {
        if (!decoded) return res.status(401).json({ error: 'Missing token' })
        filter.createdBy = decoded.email
      } else if (status === 'applied') {
        if (!decoded) return res.status(401).json({ error: 'Missing token' })
        if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
        filter.applicants = { $elemMatch: { email: decoded.email } }
      } else {
        filter.status = 'approved'
      }
      const search = String(req.query.search || '').trim()
      if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i')
        filter.$or = [{ title: pattern }, { company: pattern }, { description: pattern }, { location: pattern }]
      }

      // Applicant job board: filters + facets + relevance sort
      if (status === 'approved') {
        const base = baseApprovedJobFilter()
        const facetDocs = await JobPosting.find(base).select('skills location locationType employmentType').lean()
        const facets = countJobFacets(facetDocs)
        const allowedTypes = {
          skills: facets.skills.map((entry) => entry.value),
          locations: facets.locations.map((entry) => entry.value),
          locationTypes: [...new Set([...LOCATION_TYPE_OPTIONS, ...facets.locationTypes.map((entry) => entry.value)])],
          employmentTypes: [...new Set([...EMPLOYMENT_TYPE_OPTIONS, ...facets.employmentTypes.map((entry) => entry.value)])],
        }
        const { groups, applied } = buildJobFilter({ ...req.query, search: search || undefined }, allowedTypes)
        const finalFilter = { ...base, ...(groups.length ? { $and: groups } : {}) }

        // "Most relevant" ranks by how many of the applicant's saved skills each job requires
        const sortBy = String(req.query.sortBy || 'relevant')
        let applicantSkills = []
        if (decoded?.role === 'Applicant') {
          const applicant = await Applicant.findOne({ email: decoded.email }).select('profile.skills').lean()
          applicantSkills = (applicant?.profile?.skills || []).filter((skill) => typeof skill === 'string' && skill.trim())
        }
        if (sortBy === 'relevant' && applicantSkills.length > 0) {
          const lowerSkills = applicantSkills.map((skill) => skill.trim().toLowerCase())
          const result = await paginateQuery(JobPosting, finalFilter, {
            page,
            limit,
            sortSpec: {
              computed: {
                __skillMatch: {
                  $size: {
                    $setIntersection: [
                      { $map: { input: { $ifNull: ['$skills', []] }, as: 'skill', in: { $toLower: '$$skill' } } },
                      { $literal: lowerSkills },
                    ],
                  },
                },
              },
              fields: () => ({ __skillMatch: -1, createdAt: -1 }),
            },
            sortDir: 1,
          })
          result.items = result.items.map((doc) => {
            const { __skillMatch, ...rest } = doc
            return { ...rest, skillMatch: __skillMatch ?? 0, skillTotal: (rest.skills || []).length }
          })
          result.items = await attachEmployerBranding(result.items)
          return res.json({ ...result, facets, applied })
        }

        const { order: approvedSortOrder, spec: approvedSortSpec } = resolveSort(req.query, JOB_SORTS, 'createdAt')
        const result = await paginateQuery(JobPosting, finalFilter, {
          page,
          limit,
          sort: approvedSortSpec.fields(approvedSortOrder),
          sortSpec: approvedSortSpec,
          sortDir: approvedSortOrder,
        })
        result.items = decoded?.role === 'Admin' ? await attachAdminReviewDetails(result.items) : await attachEmployerBranding(result.items)
        return res.json({ ...result, facets, applied })
      }

      const { order: jobSortOrder, spec: jobSortSpec } = resolveSort(req.query, JOB_SORTS, 'createdAt')
      const result = await paginateQuery(JobPosting, filter, {
        page,
        limit,
        sort: jobSortSpec.fields(jobSortOrder),
        sortSpec: jobSortSpec,
        sortDir: jobSortOrder,
      })
      if (['pending', 'declined'].includes(status) || (status === 'approved' && decoded?.role === 'Admin')) {
        result.items = await attachAdminReviewDetails(result.items)
      } else if (status === 'approved') {
        result.items = await attachEmployerBranding(result.items)
      }
      result.items = result.items.map(present)
      return res.json(result)
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
      const jobs = await JobPosting.find({ createdBy: decoded.email }).sort({ createdAt: -1 })
      return res.json(jobs.map(present))
    }
    if (status === 'applied') {
      const auth = req.headers.authorization
      if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
      const token = auth.split(' ')[1]
      const decoded = jwt.verify(token, jwtSecret)
      if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
      if (!decoded.email) return res.status(401).json({ error: 'Invalid token payload' })
      const jobs = await JobPosting.find({ applicants: { $elemMatch: { email: decoded.email } } }).sort({ createdAt: -1 })
      return res.json(jobs.map(present))
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
      await notify({
        recipient: { role: 'Employer', email: job.createdBy },
        type: status === 'approved' ? 'job_approved' : 'job_declined',
        title: reviewTitle,
        message: reviewMessage,
        link: '/jobs',
        email: true,
        metadata: { jobId: String(job._id), jobTitle: job.title, reason: status === 'declined' ? reviewReason : undefined },
      })
    }

    res.json(job)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

const nsrpTemplatePath = path.join(process.cwd(), 'server', 'nsrp-template.docx')
const nsrpOfficialPdfPath = path.join(process.cwd(), 'public', 'NSRP-Form-1-Jobseeker-Reg-Form.pdf')

// The NSRP overlay generator now lives in ./nsrpPdf.js with coordinates
// centralized in ./nsrpLayout.js. Debug overlay: NSRP_DEBUG=1 or ?debug=1.

// NSRP limits, allowed values, sanitizers, and per-field validators live in
// shared/nsrpValidation.js so the wizard, this validator, and the Mongoose
// schema share one source of truth.
const NSRP_MAX_ROWS = 10
const NSRP_MAX_SKILLS = 18
const NSRP_MAX_SKILL_LENGTH = 60
const NSRP_SKILL_OPTIONS = new Set(NSRP_SKILL_LABELS.map((label) => normalizeSkillLabel(label)))

// Exported for unit tests (conditional clears are not observable via the API).
export function validateNsrpAnswers(input) {
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
    // Sanitize the same way the wizard does (typing and paste share one path):
    // digits-only fields are stripped, phones normalized, emails lowercased.
    const trimmed = trimCollapse(value)
    let cleaned = trimmed
    if (NSRP_NUMERIC_SPECS[field]) cleaned = digitsOnly(cleaned).slice(0, NSRP_NUMERIC_SPECS[field].maxDigits || 20)
    else if (field === 'cellphone') cleaned = normalizePhMobile(cleaned)
    else if (field === 'landline') cleaned = digitsOnly(cleaned)
    else if (field === 'passportNo') cleaned = normalizePassportNo(cleaned)
    else if (field === 'email') cleaned = cleaned.replace(/\s+/g, '').toLowerCase()
    else if (field === 'height' || field === 'expectedSalary') cleaned = digitsOnly(cleaned)
    answers[field] = cleaned
    if (!cleaned && NSRP_REQUIRED_FIELDS.includes(field)) fieldErrors[field] = 'This field is required.'
    else if (trimmed && !cleaned) fieldErrors[field] = NSRP_FIELD_VALIDATORS[field]?.('x') || 'Enter digits only.'
    else if (cleaned.length > maxLength) fieldErrors[field] = `Use ${maxLength} characters or fewer.`
  }
  for (const [field, allowed] of Object.entries(NSRP_ALLOWED_VALUES)) {
    if (answers[field] && !allowed.includes(answers[field])) fieldErrors[field] = 'Choose one of the listed options.'
  }
  // Shared per-field rules (names, addresses, height, salary, phones, passport)
  for (const [field, validate] of Object.entries(NSRP_FIELD_VALIDATORS)) {
    if (!fieldErrors[field]) {
      const problem = validate(answers[field])
      if (problem) fieldErrors[field] = problem
    }
  }
  for (const field of Object.keys(NSRP_NUMERIC_SPECS)) {
    if (!fieldErrors[field]) {
      const problem = validateNumericId(field, answers[field])
      if (problem) fieldErrors[field] = problem
    }
  }
  for (const [section, limits] of Object.entries(NSRP_ROW_LIMITS)) {
    if (section === 'languages') continue // handled separately (boolean checkboxes)
    const rows = input?.[section] ?? []
    if (!Array.isArray(rows)) {
      fieldErrors[section] = 'Enter a list of rows.'
      answers[section] = []
      continue
    }
    const maxRows = NSRP_SECTION_MAX_ROWS[section] || NSRP_MAX_ROWS
    if (rows.length > maxRows) {
      // Reject extra rows with a field error — never silently drop them.
      fieldErrors[section] = `Maximum of ${maxRows} entries.`
    }
    answers[section] = rows.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        fieldErrors[`${section}[${index}]`] = 'Enter a valid row.'
        return null
      }
      // Migrate legacy draft field names saved before the section redesign
      const legacyMap = section === 'workExperience'
        ? { startDate: 'fromDate', endDate: 'toDate' }
        : section === 'technicalTraining'
          ? { name: 'course', provider: 'institution' }
          : {}
      const source = { ...row }
      for (const [legacy, current] of Object.entries(legacyMap)) {
        if (!source[current] && source[legacy]) source[current] = source[legacy]
      }
      const normalizedRow = {}
      for (const [field, maxLength] of Object.entries(limits)) {
        const key = `${section}[${index}].${field}`
        const value = source?.[field] ?? ''
        if (typeof value !== 'string') {
          fieldErrors[key] = 'Enter text for this field.'
          normalizedRow[field] = ''
          continue
        }
        normalizedRow[field] = trimCollapse(value)
        if (normalizedRow[field] && !/[\p{L}\p{N}]/u.test(normalizedRow[field])) {
          fieldErrors[key] = 'Enter letters or numbers, not only spaces or symbols.'
        } else if (normalizedRow[field].length > maxLength) {
          fieldErrors[key] = `Use ${maxLength} characters or fewer.`
        }
      }
      return normalizedRow
    }).filter((row) => row && Object.values(row).some((entry) => typeof entry === 'string' && entry))

    // Section-specific rules
    if (section === 'education') {
      // The wizard sends one fixed row per level; rows with only a level and no
      // content are dropped, and never validated.
      const EDUCATION_CONTENT_FIELDS = ['school', 'course', 'year', 'undergradLevel', 'yearLastAttended', 'awards']
      const hasContent = (row) => EDUCATION_CONTENT_FIELDS.some((field) => row[field])
      answers.education = answers.education.filter((row) => row.level && hasContent(row))
      const seenLevels = new Set()
      answers.education.forEach((row) => {
        // Keys are level-based (education[Tertiary].course) so the wizard can
        // map them to its fixed per-level rows regardless of array position.
        const key = `education[${row.level || '?'}]`
        if (!row.level) return // a level-less partial row is allowed (form has fixed rows)
        if (!EDUCATION_LEVELS.includes(row.level)) fieldErrors[`${key}.level`] = 'Choose one of the listed options.'
        else if (seenLevels.has(row.level)) fieldErrors[`${key}.level`] = 'Only one entry per level.'
        seenLevels.add(row.level)
        // Courses apply only to Tertiary and Graduate Studies. For Elementary
        // and Secondary the value is rejected (never saved or printed).
        if (['Elementary', 'Secondary'].includes(row.level)) {
          if (row.course) fieldErrors[`${key}.course`] = 'Course applies only to Tertiary and Graduate Studies.'
          row.course = ''
        } else if (row.school && !row.course) {
          // Course is required only when the Tertiary/Graduate row has a school
          fieldErrors[`${key}.course`] = 'Course is required for this level.'
        }
        for (const yearField of ['year', 'yearLastAttended']) {
          if (row[yearField] && !isValidYear(row[yearField])) {
            fieldErrors[`${key}.${yearField}`] = `Enter a 4-digit year between ${MIN_YEAR} and the current year.`
          }
        }
        // "If undergraduate" fields apply only when the level was not finished
        if (row.year) {
          row.undergradLevel = ''
          row.yearLastAttended = ''
        }
      })
    }
    if (section === 'workExperience') {
      answers.workExperience.forEach((row, index) => {
        if (row.status && !WORK_STATUS_OPTIONS.includes(row.status)) {
          fieldErrors[`workExperience[${index}].status`] = 'Choose one of the listed options.'
        }
      })
    }
  }
  // Calendar-date comparisons in Asia/Manila; today is always valid.
  const today = todayInManila()
  const validateDate = (field, value, { preventFuture = false, notPast = false } = {}) => {
    if (!value) return
    if (!isValidCalendarDate(value)) {
      fieldErrors[field] = 'Enter a valid date.'
    } else if (value.slice(0, 4) < String(MIN_YEAR)) {
      fieldErrors[field] = `Enter a year of ${MIN_YEAR} or later.`
    } else if (preventFuture && value > today) {
      fieldErrors[field] = 'Enter a date that is not in the future.'
    } else if (notPast && value < today) {
      fieldErrors[field] = 'Enter a date that is today or later.'
    }
  }
  validateDate('dob', answers.dob, { preventFuture: true })
  if (!fieldErrors.dob && answers.dob) {
    const age = ageFromDob(answers.dob)
    if (age !== null && (age < 15 || age > 100)) fieldErrors.dob = 'Applicants must be 15 to 100 years old.'
  }
  // Passport expiry is required when a passport number is given, and must be valid
  if (answers.passportNo && !answers.passportExpiry) fieldErrors.passportExpiry = 'Enter the passport expiry date.'
  validateDate('passportExpiry', answers.passportExpiry, { notPast: true })
  for (const [index, row] of answers.workExperience.entries()) {
    validateDate(`workExperience[${index}].fromDate`, row.fromDate, { preventFuture: true })
    const present = row.toDate === 'Present'
    if (!present) validateDate(`workExperience[${index}].toDate`, row.toDate, { preventFuture: true })
    if (row.fromDate && row.toDate && !present && row.toDate < row.fromDate) {
      fieldErrors[`workExperience[${index}].toDate`] = 'End date cannot be before the start date.'
    }
  }
  for (const [index, row] of (answers.technicalTraining || []).entries()) {
    validateDate(`technicalTraining[${index}].fromDate`, row.fromDate, { preventFuture: true })
    validateDate(`technicalTraining[${index}].toDate`, row.toDate, { preventFuture: true })
    if (row.fromDate && row.toDate && row.toDate < row.fromDate) {
      fieldErrors[`technicalTraining[${index}].toDate`] = 'End date cannot be before the start date.'
    }
  }
  for (const [index, row] of (answers.eligibility || []).entries()) {
    validateDate(`eligibility[${index}].examDate`, row.examDate, { preventFuture: true })
    validateDate(`eligibility[${index}].validUntil`, row.validUntil)
  }
  if (answers.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)) {
    fieldErrors.email = 'Enter a valid email address.'
  }
  // Employment sub-type must match the chosen status
  if (answers.employmentTypeDetail) {
    const valid = answers.employmentStatus === 'Employed' ? EMPLOYED_TYPES : answers.employmentStatus === 'Unemployed' ? UNEMPLOYED_TYPES : []
    if (!valid.includes(answers.employmentTypeDetail)) fieldErrors.employmentTypeDetail = 'Choose a type that matches the employment status.'
  }
  if (!/abroad/i.test(answers.employmentTypeDetail || '')) answers.terminatedAbroadCountry = ''
  if (!/^Others/i.test(answers.employmentTypeDetail || '')) answers.employmentTypeOther = ''
  if (answers.disability !== 'Others') answers.disabilityOthers = ''
  const skills = input?.skills ?? []
  if (!Array.isArray(skills)) {
    fieldErrors.skills = 'Choose skills from the list.'
    answers.skills = []
  } else {
    // Legacy profiles may hold more than the new limit. Fixed form options are
    // kept first so a ticked checkbox can never be dropped by truncation;
    // unknown free-text leftovers fill the remaining slots.
    const cleaned = skills.map((skill, index) => {
      if (typeof skill !== 'string') {
        fieldErrors[`skills[${index}]`] = 'Skill must be text.'
        return ''
      }
      const normalized = skill.trim().replace(/\s+/g, ' ')
      if (!normalized) fieldErrors[`skills[${index}]`] = 'Skill cannot be empty.'
      else if (normalized.length > NSRP_MAX_SKILL_LENGTH) fieldErrors[`skills[${index}]`] = `Use ${NSRP_MAX_SKILL_LENGTH} characters or fewer.`
      return normalized
    }).filter(Boolean)
    const seen = new Set()
    const unique = cleaned.filter((skill) => {
      const key = normalizeSkillLabel(skill)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const fixedOptions = unique.filter((skill) => NSRP_SKILL_OPTIONS.has(normalizeSkillLabel(skill)))
    const leftovers = unique.filter((skill) => !NSRP_SKILL_OPTIONS.has(normalizeSkillLabel(skill)))
    answers.skills = [...fixedOptions, ...leftovers].slice(0, NSRP_MAX_SKILLS)
    // Others text only valid when Others is selected
    if (answers.othersText && !answers.skills.some((skill) => skill.toLowerCase() === 'others')) {
      answers.othersText = ''
    }
    // Conditional clears: never print contradictory answers
    if (answers.activelyLooking !== 'Yes') answers.lookingDuration = ''
    if (answers.willingImmediately !== 'No') answers.willingWhen = ''
    if (answers.fourPs !== 'Yes') answers.fourPsId = ''
  }
  // Languages: fixed rows with boolean read/write/speak/understand
  const languages = input?.languages ?? []
  if (!Array.isArray(languages)) {
    answers.languages = []
  } else {
    answers.languages = languages.slice(0, 3).map((row, index) => {
      if (!row || typeof row !== 'object') return null
      const name = String(row.name || '').trim()
      const otherName = String(row.otherName || '').trim().slice(0, 40)
      return {
        name: ['English', 'Filipino', 'Others'].includes(name) ? name : 'Others',
        otherName,
        read: Boolean(row.read),
        write: Boolean(row.write),
        speak: Boolean(row.speak),
        understand: Boolean(row.understand),
      }
    }).filter(Boolean).filter((row) => row.name !== 'Others' || row.otherName || row.read || row.write || row.speak || row.understand)
    Object.assign(fieldErrors, validateNsrpLanguages(answers.languages))
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
const NSRP_WIZARD_STEP_FIELDS = [
  ['surname', 'firstName', 'middleName', 'suffix', 'dob', 'placeOfBirth', 'sex', 'religion', 'civilStatus', 'height'],
  ['addressStreet', 'addressBarangay', 'addressCity', 'addressProvince', 'tin', 'gsisSss', 'pagibig', 'philhealth', 'email', 'cellphone', 'landline', 'disability', 'disabilityOthers'],
  ['education', 'technicalTraining', 'eligibility'],
  ['workExperience', 'skills', 'othersText', 'languages'],
  ['employmentStatus', 'employmentTypeDetail', 'terminatedAbroadCountry', 'employmentTypeOther', 'activelyLooking', 'lookingDuration', 'willingImmediately', 'willingWhen', 'fourPs', 'fourPsId', 'occupation1', 'occupation2', 'occupation3', 'occupation4', 'localPref1', 'localPref2', 'localPref3', 'overseasPref1', 'overseasPref2', 'overseasPref3', 'expectedSalary', 'passportNo', 'passportExpiry'],
  ['certified'],
]

app.post('/api/nsrp/validate-signup', (req, res) => {
  // Upload path: the basic-information step is validated on its own.
  if (req.body?.mode === 'upload' && req.body?.step === 'basic') {
    const { fieldErrors } = validateNsrpBasicInfo(req.body?.basic || {})
    return res.status(Object.keys(fieldErrors).length ? 422 : 200).json({
      ok: Object.keys(fieldErrors).length === 0,
      error: Object.keys(fieldErrors).length ? 'Check the highlighted fields.' : undefined,
      fieldErrors,
    })
  }
  const step = Number(req.body?.step)
  if (!Number.isInteger(step) || step < 0 || step >= NSRP_WIZARD_STEP_FIELDS.length) {
    return res.status(400).json({ error: 'Invalid NSRP step.' })
  }
  const { fieldErrors } = validateNsrpAnswers(req.body?.answers || {})
  const relevantFields = NSRP_WIZARD_STEP_FIELDS[step]
  const errors = Object.fromEntries(Object.entries(fieldErrors).filter(([field]) =>
    relevantFields.some((key) => field === key || field.startsWith(`${key}[`)),
  ))
  if (step === 5 && !req.body?.answers?.certified) {
    errors.certified = 'Please certify that your information is true and correct.'
  }
  res.status(Object.keys(errors).length ? 422 : 200).json({
    ok: Object.keys(errors).length === 0,
    error: Object.keys(errors).length ? 'Check the highlighted fields.' : undefined,
    fieldErrors: errors,
  })
})

// Abuse protection for the UNAUTHENTICATED sign-up preview: 10 previews per IP
// per 10 minutes. The store is exported so tests can reset the bucket.
const NSRP_PREVIEW_RATE_WINDOW_MS = 10 * 60 * 1000
const NSRP_PREVIEW_RATE_LIMIT = 10
const nsrpPreviewStore = new MemoryStore()
const nsrpPreviewLimiter = rateLimit({
  windowMs: NSRP_PREVIEW_RATE_WINDOW_MS,
  limit: NSRP_PREVIEW_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: nsrpPreviewStore,
  handler: (req, res) => {
    const resetAt = req.rateLimit?.resetTime
    const retryAfterSeconds = resetAt ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) : Math.ceil(NSRP_PREVIEW_RATE_WINDOW_MS / 1000)
    res.set('Retry-After', String(retryAfterSeconds))
    res.status(429).json({ code: 'PREVIEW_RATE_LIMITED', error: 'Too many previews. Please wait a few minutes.' })
  },
})
// One slow generation must not tie up a request forever.
const NSRP_PREVIEW_TIMEOUT_MS = Number(process.env.NSRP_PREVIEW_TIMEOUT_MS ?? 30000)

app.post('/api/nsrp/preview-signup', nsrpPreviewLimiter, async (req, res) => {
  let timeoutHandle
  try {
    // Validate with the same NSRP validator before generating anything.
    const { answers, fieldErrors } = validateNsrpAnswers(req.body?.answers || {})
    if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted NSRP fields.', fieldErrors })
    let signatureImage = null
    let certification
    try {
      signatureImage = parseSignatureImage(req.body?.answers?.signatureDataUrl)
      certification = resolveCertification({ certified: req.body?.answers?.certified, signature: signatureImage })
    } catch (err) {
      if (err instanceof SignatureValidationError) {
        return res.status(422).json({ error: err.message, fieldErrors: { certified: err.message } })
      }
      throw err
    }
    const layoutWarnings = []
    const timedOut = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new Error('NSRP preview generation timed out')
        error.code = 'NSRP_PREVIEW_TIMEOUT'
        reject(error)
      }, NSRP_PREVIEW_TIMEOUT_MS)
    })
    // The preview is streamed back and never stored.
    const pdfBuffer = await Promise.race([
      generateNsrpPdf(answers, {
        signatureImage,
        certificationDate: certification.certificationDate,
        onLayoutWarning: ({ field, reason, size, length, limit }) => layoutWarnings.push({ field, reason, size, length, limit }),
      }),
      timedOut,
    ])
    clearTimeout(timeoutHandle)
    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', 'inline; filename="NSRP-preview.pdf"')
    res.set('Cache-Control', 'no-store')
    res.set('X-NSRP-Layout-Warnings', JSON.stringify(layoutWarnings))
    res.send(pdfBuffer)
  } catch (err) {
    clearTimeout(timeoutHandle)
    if (err.code === 'NSRP_PREVIEW_TIMEOUT') {
      console.error('Signup NSRP preview timed out')
      return res.status(504).json({ code: 'NSRP_PREVIEW_TIMEOUT', error: 'The preview took too long to generate. Please try again.' })
    }
    // Never log request data: the payload contains personal information.
    console.error('Signup NSRP preview generation failed:', err.message)
    res.status(500).json({ code: 'NSRP_GENERATION_FAILED', error: 'The NSRP PDF could not be generated. Please try again.' })
  }
})

app.post('/api/nsrp/preview', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing or invalid token' })
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const { answers, fieldErrors } = validateNsrpAnswers({ ...req.body, email: req.body?.email || decoded.email })
    if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted NSRP fields.', fieldErrors })
    let signatureImage = null
    let certification = { certified: false, certificationDate: '' }
    try {
      signatureImage = parseSignatureImage(req.body?.signatureDataUrl)
      certification = resolveCertification({ certified: req.body?.certified, signature: signatureImage })
    } catch (err) {
      if (err instanceof SignatureValidationError) {
        return res.status(422).json({ error: err.message, fieldErrors: { certified: err.message } })
      }
      throw err
    }
    const applicant = await Applicant.findOne({ email: decoded.email }).select('email')
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    const layoutWarnings = []
    const pdfBuffer = await generateNsrpPdf(answers, {
      debug: req.query.debug === '1',
      signatureImage,
      certificationDate: certification.certificationDate,
      onLayoutWarning: ({ field, reason, size, length, limit }) => layoutWarnings.push({ field, reason, size, length, limit }),
    })
    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', 'inline; filename="NSRP-preview.pdf"')
    res.set('Cache-Control', 'no-store')
    res.set('X-NSRP-Layout-Warnings', JSON.stringify(layoutWarnings))
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
    let signatureImage = null
    let certification = { certified: false, certificationDate: '' }
    try {
      signatureImage = parseSignatureImage(req.body?.signatureDataUrl)
      certification = resolveCertification({ certified: req.body?.certified, signature: signatureImage })
    } catch (err) {
      if (err instanceof SignatureValidationError) {
        return res.status(422).json({ error: err.message, fieldErrors: { certified: err.message } })
      }
      throw err
    }
    const pdfBuffer = await generateNsrpPdf(answers, { signatureImage, certificationDate: certification.certificationDate })
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
    if (job.deadline && job.deadline.toISOString().slice(0, 10) < todayInManila()) {
      return res.status(410).json({ code: 'APPLICATION_CLOSED', error: 'The application deadline for this job has passed.' })
    }

    const applicant = await loadApplicantWithCurrentResume(decoded.email)
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (applicant.verificationStatus !== 'approved') {
      return res.status(403).json({ code: 'APPLICANT_NOT_VERIFIED', error: 'PESO must approve your registration and documents before you apply for a job.' })
    }
    // A resume is optional and never blocks applying.
    if (job.applicants.some((existingApplicant) => existingApplicant.email === decoded.email)) {
      return res.status(409).json({ error: 'You have already applied for this job' })
    }

    let nsrpFilePayload
    let nsrpVersionToSave
    let nsrpVersionCleanup
    if (req.body?.answers) {
      const { answers, fieldErrors } = validateNsrpAnswers({ ...req.body.answers, email: req.body.answers.email || decoded.email })
      if (Object.keys(fieldErrors).length) return res.status(422).json({ error: 'Check the highlighted NSRP fields.', fieldErrors })
      let signatureImage = null
      let certification = { certified: false, certificationDate: '' }
      try {
        signatureImage = parseSignatureImage(req.body.answers.signatureDataUrl)
        certification = resolveCertification({ certified: req.body.answers.certified, signature: signatureImage })
      } catch (err) {
        if (err instanceof SignatureValidationError) {
          return res.status(422).json({ error: err.message, fieldErrors: { certified: err.message } })
        }
        throw err
      }
      let pdfBuffer
      try {
        pdfBuffer = await generateNsrpPdf(answers, { signatureImage, certificationDate: certification.certificationDate })
      } catch (err) {
        console.error('NSRP application PDF generation failed:', err)
        return res.status(500).json({ code: 'NSRP_GENERATION_FAILED', error: 'The NSRP PDF could not be generated. Please try again.' })
      }
      if (signatureImage && certification.certified) {
        applicant.set('nsrpSignature', {
          mimetype: signatureImage.mimetype,
          size: signatureImage.bytes.length,
          uploadedAt: new Date(),
          certifiedAt: certification.certifiedAt,
          data: signatureImage.bytes,
        })
      }
      const nsrpFile = { originalname: `NSRP-${answers.surname.replace(/\s+/g, '_')}.pdf`, mimetype: 'application/pdf', size: pdfBuffer.length, buffer: pdfBuffer }
      const { version, cleanup } = await appendVerificationVersion(applicant, 'nsrpForm', nsrpFile, '', 'generated')
      nsrpVersionToSave = version
      nsrpVersionCleanup = cleanup
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
      const savedApplicant = await Applicant.findOne({ email: decoded.email })
        .select('+verificationDocuments.nsrpForm.versions.data +nsrpVerificationFile.data')
      const savedVersion = latestVersion(savedApplicant?.verificationDocuments?.nsrpForm)
      const storedNsrp = savedVersion?.version
        ? await loadDocumentFile(savedApplicant._id, 'nsrpForm', savedVersion.version, 'front')
        : null
      const savedVersionData = storedNsrp?.data ?? savedVersion?.data
      const savedNsrp = savedVersionData ? { ...savedVersion, data: savedVersionData } : savedApplicant?.nsrpVerificationFile
      if (savedNsrp?.data) {
        const raw = savedNsrp.data
        const buffer = Buffer.isBuffer(raw) ? raw : (raw?.buffer ? Buffer.from(raw.buffer) : Buffer.from(raw))
        nsrpFilePayload = {
          originalName: savedNsrp.originalName || 'NSRP-Registration-Form.pdf',
          mimetype: savedNsrp.mimetype || 'application/pdf',
          size: savedNsrp.size || buffer.length,
          data: buffer,
        }
      } else {
        return res.status(400).json({ error: 'Complete your NSRP form online before applying.' })
      }
    }

    if (nsrpVersionToSave) {
      try {
        await applicant.save()
      } catch (err) {
        if (nsrpVersionCleanup) await nsrpVersionCleanup()
        throw err
      }
    }
    await JobApplication.create({
      jobId: job._id,
      applicantEmail: decoded.email,
      nsrpFile: nsrpFilePayload,
    })

    job.applicants.push({ email: decoded.email, appliedAt: new Date() })
    await job.save()

    const employer = await Employer.findOne({ email: job.createdBy }).lean()
    const applicantName = applicantFullName(applicant) || applicant.email
    const employerName = employer?.companyName || job.company || job.createdBy || 'Unknown employer'
    const applicationMeta = {
      applicantId: String(applicant._id),
      jobId: String(job._id),
      employerId: employer?._id ? String(employer._id) : undefined,
      applicantName,
      jobTitle: job.title,
      employerName,
    }

    await notify({
      recipient: { id: applicant._id, role: 'Applicant', email: applicant.email },
      type: 'application_submitted',
      title: 'Application submitted',
      message: `Your application for "${job.title}" at ${employerName} was submitted.`,
      link: '/jobs',
      email: true,
      metadata: applicationMeta,
    })
    if (employer) {
      await notify({
        recipient: { id: employer._id, role: 'Employer', email: employer.email },
        type: 'new_applicant',
        title: 'New applicant',
        message: `${applicantName} applied to "${job.title}".`,
        link: '/jobs',
        email: true,
        metadata: applicationMeta,
      })
    }
    await notifyAdmins({
      type: 'new_application',
      title: 'New applicant needs referral review',
      message: `${applicantName} applied to "${job.title}" at ${employerName}. Review and decide whether to refer.`,
      link: '/peso-referrals',
      metadata: applicationMeta,
    })

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
    if (job.status !== 'approved') return res.status(409).json({ error: 'PESO must approve the job posting before creating referrals.' })

    const admin = await Admin.findOne({ email: decoded.email }).lean()
    if (!admin) return res.status(404).json({ error: 'Admin not found' })

    const normalizedApplicantIds = applicantIds
      .filter((id) => typeof id === 'string' || typeof id === 'number' || (id && typeof id === 'object'))
      .map((id) => String(id))

    if (normalizedApplicantIds.length === 0) {
      return res.status(400).json({ error: 'No valid applicantIds provided' })
    }

    const existingApplicants = await Applicant.find({ _id: { $in: normalizedApplicantIds } }).select('_id verificationStatus deletedAt').lean()
    if (existingApplicants.some((applicant) => applicant.deletedAt || applicant.verificationStatus !== 'approved')) {
      return res.status(403).json({ error: 'Only approved applicants with active accounts can be referred. Review the selected applicants before continuing.' })
    }
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

    await Promise.all(created.map((referral) => notify({
      recipient: { id: referral.applicantId, role: 'Applicant' },
      type: 'referral_received',
      title: 'You were referred to a job',
      message: `PESO referred you to "${job.title}" at ${employer.companyName || job.company || 'an employer'}.`,
      link: '/jobs',
      email: true,
      metadata: { referralId: String(referral._id), jobId: String(job._id) },
    })))
    await notify({
      recipient: { id: employer._id, role: 'Employer', email: employer.email },
      type: 'referral_received',
      title: 'New referral received',
      message: `PESO referred ${created.length} applicant(s) to "${job.title}".`,
      link: '/referrals',
      email: true,
      metadata: { jobId: String(job._id), count: created.length },
    })
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

    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const { page, limit } = parsePagination(req.query)
      const result = await paginateQuery(Referral, {}, { page, limit, sort: { createdAt: -1 } })
      return res.json(result)
    }
    const referrals = await Referral.find().select('jobId applicantId status').lean()
    res.json(referrals)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/employment-opportunities/mine', requireVerifiedEmail, async (req, res) => {
  try {
    if (req.user.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const applicant = await Applicant.findOne({ email: req.user.email }).select('_id').lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    const referrals = await Referral.find({ applicantId: applicant._id, status: 'accepted' }).sort({ createdAt: -1 })
      .populate({ path: 'jobId', model: JobPosting, select: 'title company' })
      .populate({ path: 'employerId', select: 'companyName contactName email phone' }).lean()
    res.json(referrals.map((item) => ({ ...item, referralId: item._id })))
  } catch (err) {
    console.error('Applicant referrals failed:', redactString(err?.message || String(err)))
    res.status(500).json({ error: 'Failed to load referrals' })
  }
})

app.get('/api/referrals/employer/:employerId', requireApprovedEmployer, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!['Admin', 'Employer'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })

    if (decoded.role === 'Employer') {
      const employer = await Employer.findOne({ email: decoded.email }).lean()
      if (!employer) return res.status(404).json({ error: 'Employer not found' })
      if (String(employer._id) !== String(req.params.employerId)) return res.status(403).json({ error: 'Forbidden' })
    }

    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const { page, limit } = parsePagination(req.query)
      const result = await paginateQuery(Referral, { employerId: req.params.employerId }, { page, limit, sort: { createdAt: -1 } })
      await Referral.populate(result.items, [
        { path: 'applicantId', select: 'email phone profile' },
        { path: 'jobId', model: JobPosting, select: 'title company location description requirements salary locationType employmentType status createdBy createdAt' },
      ])
      result.items = result.items.map((item) => ({ ...item, applicantId: employerApplicantSummary(item.applicantId) }))
      return res.json(result)
    }
    const referrals = await Referral.find({ employerId: req.params.employerId })
      .sort({ createdAt: -1 })
      .populate({ path: 'applicantId', select: 'email phone profile' })
      .populate({
        path: 'jobId',
        model: JobPosting,
        select: 'title company location description requirements salary locationType employmentType status createdBy createdAt',
      })

    res.json(referrals.map((referral) => ({ ...referral.toObject(), applicantId: employerApplicantSummary(referral.applicantId) })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.put('/api/referrals/:id/respond', requireApprovedEmployer, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)

    const { status } = req.body || {}
    if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const employer = await Employer.findOne({ email: decoded.email }).lean()
    if (!employer) return res.status(404).json({ error: 'Employer not found' })

    const referral = await Referral.findById(req.params.id)
    if (!referral) return res.status(404).json({ error: 'Referral not found' })
    if (String(referral.employerId) !== String(employer._id)) return res.status(403).json({ error: 'Forbidden' })

    referral.status = status
    await referral.save()

    const respondedJob = await JobPosting.findById(referral.jobId).select('title').lean()
    const respondedTitle = respondedJob?.title || 'a job'
    await notify({
      recipient: { id: referral.applicantId, role: 'Applicant' },
      type: 'application_status_changed',
      title: `Application ${status}`,
      message: `${employer.companyName || 'The employer'} ${status} your referral for "${respondedTitle}".${status === 'accepted' ? ' You can now report to PESO once you are officially hired or deployed.' : ''}`,
      link: status === 'accepted' ? '/employment-reports' : '/jobs',
      email: true,
      metadata: { referralId: String(referral._id), jobId: String(referral.jobId), status },
    })
    await notifyAdmins({
      type: 'referral_response',
      title: 'Referral response received',
      message: `${employer.companyName || 'An employer'} ${status} a referral for "${respondedTitle}".`,
      link: '/peso-referrals',
      metadata: { referralId: String(referral._id), jobId: String(referral.jobId), status },
    })

    res.json(referral)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/hire-reports', requireVerifiedEmail, requireApprovedEmployer, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (!['Employer', 'Applicant'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })

    const { applicantId, jobId, status, referralId, employmentDate = '', notes = '' } = req.body || {}
    if (!applicantId || !jobId || !status) {
      return res.status(400).json({ error: 'applicantId, jobId, and status are required' })
    }
    const allowed = decoded.role === 'Employer' ? EMPLOYER_OUTCOMES : APPLICANT_OUTCOMES
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' })
    if (![applicantId, jobId, ...(referralId ? [referralId] : [])].every((id) => typeof id === 'string' && mongoose.isValidObjectId(id))) {
      return res.status(400).json({ error: 'Invalid applicant, job, or referral ID' })
    }
    if (typeof notes !== 'string' || notes.length > 1000) return res.status(400).json({ error: 'Notes must be at most 1,000 characters' })
    if (typeof employmentDate !== 'string' || (employmentDate && (!/^\d{4}-\d{2}-\d{2}$/.test(employmentDate) || !isValidCalendarDate(employmentDate) || employmentDate > todayInManila()))) {
      return res.status(400).json({ error: 'Enter a valid date on or before today for an official hire or deployment' })
    }

    const job = await JobPosting.findById(jobId)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    const employer = await Employer.findOne({ email: job.createdBy }).lean()
    if (!employer) return res.status(404).json({ error: 'Employer not found' })
    if (decoded.role === 'Employer' && job.createdBy !== decoded.email) return res.status(403).json({ error: 'Forbidden' })

    const applicant = await Applicant.findById(applicantId).lean()
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (decoded.role === 'Applicant' && applicant.email !== decoded.email) return res.status(403).json({ error: 'Forbidden' })

    let referral = null
    if (referralId) {
      referral = await Referral.findById(referralId)
      if (!referral) return res.status(404).json({ error: 'Referral not found' })
      if (String(referral.employerId) !== String(employer._id)) return res.status(403).json({ error: 'Forbidden' })
      if (String(referral.applicantId) !== String(applicantId) || String(referral.jobId) !== String(jobId)) {
        return res.status(400).json({ error: 'Referral does not match applicant/job' })
      }
    }
    if (decoded.role === 'Applicant') {
      if (!referral) referral = await Referral.findOne({ applicantId: applicant._id, jobId: job._id, employerId: employer._id, status: 'accepted' })
      if (!referral || referral.status !== 'accepted') return res.status(403).json({ code: 'REFERRAL_NOT_ACCEPTED', error: 'You can report employment to PESO after the employer accepts your referral.' })
    }
    if (!referral && !job.applicants.some((entry) => entry.email === applicant.email)) {
      return res.status(403).json({ error: 'A referral or application for this job is required' })
    }

    // Each party maintains its own report. An applicant update never overwrites
    // the employer's statement, and prior outcomes remain available to PESO.
    const roleFilter = decoded.role === 'Employer'
      ? { $or: [{ reportedByRole: 'Employer' }, { reportedByRole: { $exists: false } }] }
      : { reportedByRole: 'Applicant' }
    let hireReport = await HireReport.findOne({ applicantId, jobId, employerId: employer._id, ...roleFilter })
    if (!hireReport) hireReport = new HireReport({ applicantId, jobId, employerId: employer._id })
    if (hireReport.status) {
      hireReport.history.push({ status: hireReport.status, employmentDate: hireReport.employmentDate, notes: hireReport.notes, reportedAt: hireReport.reportedAt })
    }
    Object.assign(hireReport, {
      referralId: referral ? referral._id : hireReport.referralId,
      applicantId,
      employerId: employer._id,
      jobId,
      status,
      reportedByRole: decoded.role,
      employmentDate: status === 'not_hired' ? '' : employmentDate,
      notes: notes.trim(),
      reportedAt: new Date(),
    })
    await hireReport.save()

    await notifyAdmins({
      type: 'hire_report_submitted',
      title: 'Employment update received',
      message: `${decoded.role === 'Applicant' ? applicantFullName(applicant) || applicant.email : employer.companyName || decoded.email} reported ${outcomeLabel(status).toLowerCase()} for "${job.title}" (${decoded.role.toLowerCase()} report).`,
      link: '/peso-referrals',
      metadata: { hireReportId: String(hireReport._id), jobId: String(job._id), applicantId: String(applicantId), status, reportedByRole: decoded.role },
    })
    if (decoded.role === 'Employer' && status !== 'not_hired') {
      await notify({
        recipient: { id: applicant._id, role: 'Applicant', email: applicant.email },
        type: 'employment_update', title: 'Please update PESO',
        message: `${employer.companyName || 'Your employer'} reported you as ${status} for "${job.title}". Please submit your own update to PESO once official. Coordinate hiring and deployment directly with the employer.`,
        link: '/employment-reports', email: true,
        metadata: { jobId: String(job._id), status },
      })
    }

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
    if (!['Admin', 'Employer', 'Applicant'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })

    const { employerId, status, from, to } = req.query || {}
    const filter = {}

    if (decoded.role === 'Admin') {
      if (employerId) {
        if (!mongoose.isValidObjectId(employerId)) return res.status(400).json({ error: 'Invalid employer ID' })
        filter.employerId = employerId
      }
    } else {
      const Model = decoded.role === 'Employer' ? Employer : Applicant
      const account = await Model.findOne({ email: decoded.email }).select('_id').lean()
      if (!account) return res.status(404).json({ error: 'Account not found' })
      filter[decoded.role === 'Employer' ? 'employerId' : 'applicantId'] = account._id
      if (decoded.role === 'Employer') filter.$or = [{ reportedByRole: 'Employer' }, { reportedByRole: { $exists: false } }]
      else filter.reportedByRole = 'Applicant'
    }
    if (status) {
      if (!EMPLOYER_OUTCOMES.includes(status)) return res.status(400).json({ error: 'Invalid status' })
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

    const attachDetails = async (reports) => {
      if (decoded.role !== 'Admin' || !reports.length) return reports
      const [applicants, employers, jobs] = await Promise.all([
        Applicant.find({ _id: { $in: reports.map((report) => report.applicantId) } }).select('email profile.firstName profile.middleName profile.lastName profile.suffix profile.name').lean(),
        Employer.find({ _id: { $in: reports.map((report) => report.employerId) } }).select('companyName email').lean(),
        JobPosting.find({ _id: { $in: reports.map((report) => report.jobId) } }).select('title').lean(),
      ])
      const index = (items) => new Map(items.map((item) => [String(item._id), item]))
      const a = index(applicants), e = index(employers), j = index(jobs)
      return reports.map((report) => {
        const applicant = a.get(String(report.applicantId)), employer = e.get(String(report.employerId)), job = j.get(String(report.jobId))
        return { ...report, applicant: applicant ? { name: applicantFullName(applicant), email: applicant.email } : null, employer: employer ? { name: employer.companyName, email: employer.email } : null, job: job ? { title: job.title } : null }
      })
    }
    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const { page, limit } = parsePagination(req.query)
      const result = await paginateQuery(HireReport, filter, { page, limit, sort: { reportedAt: -1 } })
      result.items = await attachDetails(result.items)
      return res.json(result)
    }
    const hireReports = await HireReport.find(filter).sort({ reportedAt: -1 }).lean()
    res.json(await attachDetails(hireReports))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/admin/employment-updates', createEmploymentUpdatesHandler({ HireReport, Applicant, Employer, JobPosting, authenticate: authenticateRequest }))
app.use('/api/csm', requireVerifiedEmail, requireApprovedEmployer, createCsmRouter({ CsmResponse, Applicant, Employer, authenticate: authenticateRequest, notifyAdmins }))

app.post('/api/ratings', requireApprovedEmployer, async (req, res) => {
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
    if (hireReport.status === 'not_hired') return res.status(400).json({ error: 'Ratings require a hired or deployed outcome' })

    let fromUser = null
    let fromRole = null
    if (decoded.role === 'Employer') {
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
    const decoded = authenticateRequest(req)
    if (decoded?.role === 'Employer') {
      const verification = await loadEmployerVerification(decoded.email)
      if (!verification.employer) return res.status(404).json({ error: 'Employer not found' })
      if (verification.status !== EMPLOYER_VERIFICATION_STATUS.APPROVED) {
        return res.status(403).json({ code: 'EMPLOYER_NOT_VERIFIED', status: verification.status })
      }
    }
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

const dashboardService = createDashboardService({ Applicant, Employer, JobPosting, JobApplication, Referral, HireReport, Notification })

// Read-only, role-scoped aggregates; the role always comes from the verified token
app.get('/api/dashboard', requireApprovedEmployer, async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded?.email) return res.status(401).json({ error: 'Missing token' })
    const found = await findUserByEmail(decoded.email)
    if (!found || found.type !== decoded.role) return res.status(401).json({ error: 'Unauthorized' })
    const data = await dashboardService.getDashboard({
      id: String(found.user._id),
      objectId: found.user._id,
      role: found.type,
      email: String(found.user.email || decoded.email),
      verificationStatus: found.user.verificationStatus,
    })
    res.json(data)
  } catch (err) {
    console.error('Dashboard error:', err)
    res.status(500).json({ error: 'Failed to load dashboard' })
  }
})

app.use('/api/notifications', createNotificationsRouter({
  NotificationModel: Notification,
  authenticate: authenticateRequest,
  resolveUser: async (decoded) => {
    const found = await findUserByEmail(decoded?.email)
    if (!found || found.type !== decoded.role) return null
    return { id: String(found.user._id), role: found.type, email: String(found.user.email || decoded.email).toLowerCase() }
  },
}))

app.post('/api/employer-registration/preview', async (req, res) => {
  try {
    const { companyName, contactName, email, phone: rawPhone, representativeName, certified, signatureDataUrl } = req.body || {}
    const phone = normalizeMobile(rawPhone)
    const normalized = normalizeEmployerRegistrationDetails(req.body?.registrationDetails)
    if (normalized.error) return res.status(422).json({ error: normalized.error, fieldErrors: normalized.fieldErrors })
    if (![companyName, contactName, representativeName].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(422).json({ error: 'Complete the establishment, contact, and representative names.' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()) || !validMobile(rawPhone)) {
      return res.status(422).json({ error: 'Enter a valid email and 11-digit mobile number.' })
    }
    let signatureImage
    try {
      signatureImage = parseSignatureImage(signatureDataUrl)
      resolveCertification({ certified, signature: signatureImage })
    } catch (signatureError) {
      if (signatureError instanceof SignatureValidationError) return res.status(422).json({ error: signatureError.message })
      throw signatureError
    }
    if (!certified || !signatureImage) return res.status(422).json({ error: 'Certification and an authorized signature are required.' })
    const { buffer, warnings } = await generateEmployerRegistrationPdf({
      companyName: companyName.trim(),
      email: email.trim(),
      phone,
      contactName: contactName.trim(),
      representativeName: representativeName.trim(),
      certified: true,
      signatureImage,
      details: normalized.details,
    })
    res.set('X-NSRP-Layout-Warnings', JSON.stringify(warnings))
    res.type('application/pdf')
    res.set('Content-Disposition', 'inline; filename="NSRP-Form-2-Employer-Reg-Form.pdf"')
    res.send(buffer)
  } catch (err) {
    console.error('Employer Form 2 preview failed:', redactString(String(err?.message || err)))
    res.status(500).json({ error: 'Could not generate the employer Form 2 preview.' })
  }
})

app.post('/api/employer-requests', requirementsUpload.single('requirements'), async (req, res) => {
  let documentPath = null
  let createdEmployer = null
  let requestSaved = false
  const discardFiles = () => {
    for (const filePath of [req.file?.path, documentPath]) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
  }
  const reject = (status, body) => {
    discardFiles()
    return res.status(status).json(body)
  }
  try {
    const {
      email, emailProof: proofToken, password, consent, mode, companyName, contactName,
      location, phone: rawPhone, registrationDetails: rawDetails, representativeName, certified, signatureDataUrl,
    } = req.body || {}
    const phone = normalizeMobile(rawPhone)
    const hasText = (value) => typeof value === 'string' && value.trim().length > 0
    if (!hasText(email) || !hasText(password) || !hasText(companyName) || !hasText(contactName) || !hasText(location)) {
      return reject(400, { error: 'Email, password, establishment name, contact name, and address are required' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return reject(400, { error: 'Enter a valid email address' })
    if (!validMobile(rawPhone)) return reject(400, { error: MOBILE_ERROR, fieldErrors: { phone: MOBILE_ERROR } })
    if (consent !== 'true') return reject(400, { error: 'Data privacy consent is required' })
    if (!['online', 'upload'].includes(mode)) return reject(400, { error: 'Choose how to provide Form 2' })
    const emailProof = verifyEmailProof(proofToken)
    if (!emailProof || emailProof.email !== normalizeEmail(email)
      || await UsedEmailProof.findOne({ jti: emailProof.jti }).select('_id').lean()) {
      return reject(400, {
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Verify your email address with the 6-digit code before creating the account.',
        fieldErrors: { email: 'Verify your email address before creating the account.' },
      })
    }
    if (await emailTakenAcrossRoles(email)) return reject(409, { error: 'Email already in use' })
    if (await EmployerRequest.findOne({ email: email.trim() })) return reject(409, { error: 'Employer request already submitted' })
    const passwordError = passwordErrorMessage(password)
    if (passwordError) return reject(400, { error: passwordError })

    let details = {}
    let pdfBuffer
    let originalName
    if (mode === 'upload') {
      if (!req.file) return reject(400, { error: 'Upload your completed NSRP Form 2 PDF' })
      pdfBuffer = fs.readFileSync(req.file.path)
      if (!bufferMatchesDeclaredType(pdfBuffer, 'application/pdf')) return reject(400, { error: 'The NSRP Form 2 file is not a valid PDF' })
      documentPath = req.file.path
      originalName = req.file.originalname
    } else {
      let parsedDetails = rawDetails
      if (typeof rawDetails === 'string') {
        try {
          parsedDetails = JSON.parse(rawDetails)
        } catch {
          return reject(400, { error: 'Employer registration details are invalid' })
        }
      }
      const normalized = normalizeEmployerRegistrationDetails(parsedDetails)
      if (normalized.error) return reject(422, { error: normalized.error, fieldErrors: normalized.fieldErrors })
      details = normalized.details
      let signatureImage
      try {
        signatureImage = parseSignatureImage(signatureDataUrl)
        resolveCertification({ certified, signature: signatureImage })
      } catch (signatureError) {
        if (signatureError instanceof SignatureValidationError) {
          return reject(422, { error: signatureError.message, fieldErrors: { signature: signatureError.message } })
        }
        throw signatureError
      }
      if (certified !== 'true' || !hasText(representativeName) || !signatureImage) {
        return reject(422, { error: 'Representative name, certification, and signature are required' })
      }
      const generated = await generateEmployerRegistrationPdf({
        companyName: companyName.trim(),
        email: email.trim(),
        phone,
        contactName: contactName.trim(),
        representativeName: representativeName.trim(),
        certified: true,
        signatureImage,
        details,
      })
      pdfBuffer = generated.buffer
      originalName = 'NSRP-Form-2-Employer-Reg-Form.pdf'
      documentPath = path.join(requirementsDirectory, `${crypto.randomUUID()}-nsrp-form-2-employer-registration.pdf`)
      fs.writeFileSync(documentPath, pdfBuffer)
    }

    const establishmentAddress = mode === 'online'
      ? matchLocation(details.cityMunicipality, details.province)
      : matchLocation(req.body.city, req.body.province)
    if (!establishmentAddress) return reject(422, {
      error: 'Choose the establishment city/municipality from the location list.',
      fieldErrors: { city: 'Choose a city/municipality from the location list.', province: 'Province must match the selected city/municipality.' },
    })
    const passwordHash = await bcrypt.hash(password, 10)
    try {
      createdEmployer = await createUserInRole('Employer', {
        email: email.trim(),
        passwordHash,
        emailVerified: true,
        verificationStatus: EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW,
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        phone,
        establishmentAddress,
        profile: { name: contactName.trim(), location: location.trim(), summary: companyName.trim() },
        verificationHistory: [{ status: EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW, by: 'system', at: new Date() }],
      })
    } catch {
      return reject(400, { error: 'Could not create the employer account. Please check the details and try again.' })
    }
    const submittedAt = new Date()
    const version = {
      version: 1,
      originalName,
      filename: path.basename(documentPath),
      path: documentPath,
      mimetype: 'application/pdf',
      size: pdfBuffer.length,
      sourceType: mode === 'upload' ? 'uploaded' : 'generated',
      status: 'pending',
      uploadedAt: submittedAt,
    }
    const request = new EmployerRequest({
      email: email.trim(),
      passwordHash,
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      location: location.trim(),
      phone,
      registrationDetails: { ...details, cityMunicipality: establishmentAddress.city, province: establishmentAddress.province },
      representativeName: mode === 'online' ? representativeName.trim() : '',
      consentAt: new Date(),
      status: EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW,
      requirementsSubmittedAt: submittedAt,
      requirementsVersions: [version],
      requirementsFile: {
        filename: path.basename(documentPath),
        originalName,
        path: documentPath,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
        version: 1,
        sourceType: version.sourceType,
        status: 'pending',
      },
    })
    try {
      await request.save()
      requestSaved = true
    } catch {
      await Employer.deleteOne({ _id: createdEmployer._id })
      createdEmployer = null
      return reject(500, { error: 'Registration failed. Nothing was saved — please try again.' })
    }
    await UsedEmailProof.create({ jti: emailProof.jti, expiresAt: new Date(emailProof.exp * 1000) })
    await Employer.updateOne({ email: email.trim() }, { $set: { requirementsSubmittedAt: request.requirementsSubmittedAt } })
    await notify({
      recipient: { id: createdEmployer._id, role: 'Employer', email: createdEmployer.email },
      type: 'employer_registration_review',
      title: 'Account received, waiting for admin review',
      message: 'Your employer account and NSRP Form 2 were received and are waiting for admin review.',
      link: '/verification',
      email: true,
    })
    await notifyAdmins({
      type: 'employer_request',
      title: 'New employer awaiting review',
      message: `${request.companyName} (${request.email}) is awaiting employer verification.`,
      link: '/requests',
      metadata: { requestId: String(request._id) },
    })
    res.json({ success: true, request: { email: request.email, companyName: request.companyName, contactName: request.contactName, location: request.location, phone: request.phone, status: request.status, requirementsSubmittedAt: request.requirementsSubmittedAt } })
  } catch (err) {
    if (!requestSaved && createdEmployer) await Employer.deleteOne({ _id: createdEmployer._id })
    if (!requestSaved) discardFiles()
    console.error('Employer registration failed:', redactString(String(err?.message || err)))
    res.status(500).json({ error: 'Employer registration could not be completed' })
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
    const filter = {
      status: { $in: ['pending', EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW] },
      email: { $in: [...verifiedEmails] },
    }
    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const { page, limit } = parsePagination(req.query)
      const { order: reqSortOrder, spec: reqSortSpec } = resolveSort(req.query, EMPLOYER_REQUEST_SORTS, 'createdAt')
      return res.json(await paginateQuery(EmployerRequest, filter, {
        page,
        limit,
        sort: { resubmittedAt: -1, ...reqSortSpec.fields(reqSortOrder) },
        sortDir: reqSortOrder,
        select: '-requirementsFile.data',
      }))
    }
    const requests = await EmployerRequest.find(filter).sort({ resubmittedAt: -1, createdAt: -1 })
    res.json(requests)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/employer/verification', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
    const verification = await loadEmployerVerification(decoded.email)
    if (!verification.employer) return res.status(404).json({ error: 'Employer not found' })
    const current = verification.request?.requirementsFile
    const latestVersion = verification.request?.requirementsVersions?.at(-1)
    const documentStatus = current?.status || latestVersion?.status
      || (verification.status === EMPLOYER_VERIFICATION_STATUS.APPROVED ? 'approved' : 'pending')
    return res.json({
      verificationStatus: verification.status,
      verificationReason: verification.reason,
      emailVerified: Boolean(verification.employer.emailVerified),
      email: verification.employer.email,
      approvalNoticePending: Boolean(verification.employer.approvalNoticePending),
      companyName: verification.employer.companyName || verification.request?.companyName || '',
      contactName: verification.employer.contactName || verification.request?.contactName || '',
      phone: verification.employer.phone || verification.request?.phone || '',
      location: verification.employer.profile?.location || verification.request?.location || '',
      registrationDetails: verification.request?.registrationDetails || {},
      representativeName: verification.request?.representativeName || '',
      submittedAt: verification.request?.requirementsSubmittedAt || verification.employer.requirementsSubmittedAt || verification.request?.createdAt,
      document: current ? {
        version: current.version || latestVersion?.version || 1,
        originalName: current.originalName,
        size: current.size,
        status: documentStatus,
        sourceType: current.sourceType || latestVersion?.sourceType || 'uploaded',
        viewUrl: '/api/employer-requirements/current/view',
      } : null,
      versions: (verification.request?.requirementsVersions || []).map(({ version, originalName, size, sourceType, status, uploadedAt, reviewedAt, reviewReason }) => ({
        version, originalName, size, sourceType, status, uploadedAt, reviewedAt, reviewReason,
      })),
    })
  } catch (err) {
    console.error('Employer verification status failed:', redactString(String(err?.message || err)))
    return res.status(500).json({ error: 'Could not load employer verification status' })
  }
})

app.post('/api/employer/verification/approval-notice/seen', async (req, res) => {
  try {
    const decoded = authenticateRequest(req)
    if (!decoded) return res.status(401).json({ error: 'Missing token' })
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
    await Employer.updateOne({ email: decoded.email }, { $set: { approvalNoticePending: false } })
    return res.json({ ok: true })
  } catch (err) {
    console.error('Employer approval notice update failed:', redactString(String(err?.message || err)))
    return res.status(500).json({ error: 'Could not update approval notice' })
  }
})

app.post('/api/employer-requirements', requirementsUpload.single('requirements'), async (req, res) => {
  let uploadedPath = req.file?.path
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
    if (!req.file) return res.status(400).json({ error: 'An NSRP registration PDF is required' })

    const request = await EmployerRequest.findOne({ email: decoded.email })
    if (!request) return res.status(404).json({ error: 'Employer request not found' })
    const verification = await loadEmployerVerification(decoded.email)
    if (verification.status !== EMPLOYER_VERIFICATION_STATUS.NEEDS_RESUBMISSION) {
      return res.status(409).json({
        code: 'EMPLOYER_RESUBMISSION_NOT_REQUESTED',
        error: 'An administrator must request a new document before you can update NSRP Form 2.',
      })
    }
    const pdfBuffer = fs.readFileSync(req.file.path)
    if (!bufferMatchesDeclaredType(pdfBuffer, 'application/pdf')) {
      return res.status(422).json({ error: 'The NSRP Form 2 file is not a valid PDF' })
    }
    const sourceType = req.body?.sourceType === 'generated' ? 'generated' : 'uploaded'
    let updatedDetails = request.registrationDetails || {}
    if (typeof req.body?.registrationDetails === 'string') {
      let rawDetails
      try {
        rawDetails = JSON.parse(req.body.registrationDetails)
      } catch {
        return res.status(400).json({ error: 'Employer registration details are invalid' })
      }
      const normalized = normalizeEmployerRegistrationDetails(rawDetails)
      if (normalized.error) return res.status(422).json({ error: normalized.error, fieldErrors: normalized.fieldErrors })
      updatedDetails = normalized.details
    }
    const companyName = typeof req.body?.companyName === 'string' && req.body.companyName.trim()
      ? req.body.companyName.trim()
      : request.companyName
    const contactName = typeof req.body?.contactName === 'string' && req.body.contactName.trim()
      ? req.body.contactName.trim()
      : request.contactName
    const phone = typeof req.body?.phone === 'string' && req.body.phone.trim()
      ? normalizeMobile(req.body.phone.trim())
      : request.phone
    if (!validMobile(phone)) return res.status(422).json({ error: MOBILE_ERROR, fieldErrors: { phone: MOBILE_ERROR } })
    const location = typeof req.body?.location === 'string' && req.body.location.trim()
      ? req.body.location.trim()
      : request.location

    const previousVersion = request.requirementsVersions?.at(-1)
    const versionNumber = Math.max(0, ...(request.requirementsVersions || []).map((item) => Number(item.version) || 0)) + 1
    if (previousVersion && previousVersion.status !== 'superseded') {
      previousVersion.status = 'superseded'
      if (request.requirementsFile) request.requirementsFile.status = 'superseded'
    }
    const submittedAt = new Date()
    const version = {
      version: versionNumber,
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: pdfBuffer.length,
      sourceType,
      status: 'pending',
      uploadedAt: submittedAt,
    }
    request.requirementsVersions = [...(request.requirementsVersions || []), version]

    request.requirementsFile = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: pdfBuffer.length,
      version: versionNumber,
      sourceType,
      status: 'pending',
    }
    request.registrationDetails = updatedDetails
    request.companyName = companyName
    request.contactName = contactName
    request.phone = phone
    request.location = location
    if (typeof req.body?.representativeName === 'string') request.representativeName = req.body.representativeName.trim()
    request.requirementsSubmittedAt = submittedAt
    request.status = EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW
    request.adminDecision = undefined
    request.reviewReason = undefined
    request.reviewedAt = undefined
    request.reviewedBy = undefined
    if (versionNumber > 1) request.resubmittedAt = submittedAt
    await request.save()
    uploadedPath = null
    await Employer.updateOne({ email: decoded.email }, {
      $set: {
        ...(matchLocation(updatedDetails.cityMunicipality, updatedDetails.province) ? { establishmentAddress: matchLocation(updatedDetails.cityMunicipality, updatedDetails.province) } : {}),
        verificationStatus: EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW,
        requirementsSubmittedAt: request.requirementsSubmittedAt,
        companyName,
        contactName,
        phone,
        'profile.location': location,
        approvalNoticePending: false,
      },
      $unset: { verificationReason: 1 },
      $push: { verificationHistory: { status: EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW, by: 'employer', at: submittedAt } },
    })

    await notifyAdmins({
      type: versionNumber > 1 ? 'employer_resubmitted' : 'employer_requirements',
      title: versionNumber > 1 ? 'Employer resubmitted' : 'New employer awaiting review',
      message: versionNumber > 1
        ? `${request.companyName} resubmitted NSRP Form 2 for review.`
        : `${request.companyName} submitted NSRP Form 2 for review.`,
      link: '/requests',
      metadata: { requestId: String(request._id), resubmitted: versionNumber > 1 },
    })

    res.json({ success: true, status: request.status, submittedAt: request.requirementsSubmittedAt, version: versionNumber })
  } catch (err) {
    console.error(err)
    res.status(err?.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: err?.message || 'Failed to submit requirements' })
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath)
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
    return sendEmployerNsrpDocument(res, request, 'inline')
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to view requirements' })
  }
})

// Admin NSRP document access. The /nsrp paths are canonical; /employer-requirements/:id/* are kept for older clients.
for (const [suffix, disposition] of [['view', 'inline'], ['download', 'attachment']]) {
  app.get([`/api/employers/:id/nsrp/${suffix}`, `/api/employer-requirements/:id/${suffix}`], async (req, res) => {
    try {
      const decoded = authenticateRequest(req)
      if (!decoded) return res.status(401).json({ error: 'Missing token' })
      if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'NSRP document not found' })
      const request = await EmployerRequest.findById(req.params.id).select('+requirementsFile.data').lean()
      return sendEmployerNsrpDocument(res, request, disposition)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: `Failed to ${suffix} NSRP document` })
    }
  })
}

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
    if (!EMPLOYER_REVIEW_DECISIONS.includes(status)) return res.status(400).json({ error: 'Invalid status' })

    const request = await EmployerRequest.findById(req.params.id)
    if (!request) return res.status(404).json({ error: 'Request not found' })
    const reviewReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
    if (status !== EMPLOYER_VERIFICATION_STATUS.APPROVED && !reviewReason) {
      return res.status(400).json({ error: 'A reason is required when declining or requesting a new document.' })
    }
    if (reviewReason.length > 500) return res.status(400).json({ error: 'The review reason must be 500 characters or fewer.' })
    const verification = await loadEmployerVerification(request.email)
    if (![EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW, 'pending'].includes(verification.status)) {
      return res.status(400).json({ error: 'Request already processed' })
    }
    const reviewedAt = new Date()
    request.status = status
    request.adminDecision = status
    request.reviewReason = reviewReason || undefined
    request.reviewedBy = decoded.email
    request.reviewedAt = reviewedAt
    request.reviewHistory = [...(request.reviewHistory || []), { decision: status, reason: reviewReason || undefined, by: decoded.email, at: reviewedAt }]
    if (status === EMPLOYER_VERIFICATION_STATUS.APPROVED) {
      request.approvedBy = decoded.email
      request.approvedAt = reviewedAt
      if (request.requirementsFile) request.requirementsFile.status = 'approved'
    } else {
      request.approvedBy = undefined
      request.approvedAt = undefined
      if (request.requirementsFile) request.requirementsFile.status = 'rejected'
    }
    const latestVersion = request.requirementsVersions?.at(-1)
    if (latestVersion) {
      latestVersion.status = status === EMPLOYER_VERIFICATION_STATUS.APPROVED ? 'approved' : 'rejected'
      latestVersion.reviewedAt = reviewedAt
      latestVersion.reviewedBy = decoded.email
      latestVersion.reviewReason = reviewReason || undefined
    }
    if (status === EMPLOYER_VERIFICATION_STATUS.APPROVED
      && !request.requirementsFile?.data
      && request.requirementsFile?.path
      && fs.existsSync(request.requirementsFile.path)) {
      request.requirementsFile.data = fs.readFileSync(request.requirementsFile.path)
    }
    await request.save()
    await Employer.updateOne(
      { email: request.email },
      {
        $set: {
          verificationStatus: status,
          verificationReason: reviewReason || undefined,
          approvalNoticePending: status === EMPLOYER_VERIFICATION_STATUS.APPROVED,
        },
        $push: { verificationHistory: { status, reason: reviewReason || undefined, by: decoded.email, at: reviewedAt } },
      },
    )

    const employerAccount = await Employer.findOne({ email: request.email }).select('_id email').lean()
    if (employerAccount) {
      const approved = status === EMPLOYER_VERIFICATION_STATUS.APPROVED
      const needsResubmission = status === EMPLOYER_VERIFICATION_STATUS.NEEDS_RESUBMISSION
      await notify({
        recipient: { id: employerAccount._id, role: 'Employer', email: employerAccount.email },
        type: approved ? 'employer_approved' : needsResubmission ? 'employer_resubmission_requested' : 'employer_declined',
        title: approved ? 'Account approved' : needsResubmission ? 'Document needs resubmission' : `Account declined: ${reviewReason}`,
        message: approved
          ? 'Your employer account is approved. You can now post jobs.'
          : needsResubmission
            ? `Please submit a new NSRP Form 2. Reason: ${reviewReason}`
            : `Your employer account was declined. Reason: ${reviewReason}`,
        link: '/verification',
        email: true,
        metadata: { status, reason: reviewReason || undefined },
      })
    }

    const responseRequest = request.toObject()
    if (responseRequest.requirementsFile) delete responseRequest.requirementsFile.data
    res.json({ ...responseRequest, status, verificationStatus: status, verificationReason: reviewReason || '' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin: review an applicant's NSRP for account verification
app.put('/api/applicants/:id/verification', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' })
    const { status, reason, action } = req.body || {}
    const unrestrict = action === 'unrestrict'
    if (!unrestrict && !['approved', 'declined', 'restricted'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid applicant ID' })

    const applicant = await Applicant.findById(req.params.id)
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' })
    if (applicant.deletedAt) return res.status(409).json({ error: 'This account is closed. A new registration is required.' })

    const reviewReason = typeof reason === 'string' ? reason.trim() : ''
    if (unrestrict) {
      if (applicant.verificationStatus !== 'restricted') return res.status(409).json({ error: 'This applicant is not restricted. Refresh the applicant list.' })
      applicant.verificationStatus = 'under_review'
      recomputeVerificationStatus(applicant)
    } else {
      if (applicant.verificationStatus === 'restricted' && status !== 'restricted') return res.status(409).json({ error: 'Unrestrict the applicant before changing their verification status.' })
      applicant.verificationStatus = status
      applicant.verificationReason = reviewReason || undefined
    }
    await applicant.save()

    await notify({
      recipient: { id: applicant._id, role: 'Applicant', email: applicant.email },
      type: !unrestrict && status === 'approved' ? 'account_verified' : 'account_verification_update',
      title: unrestrict ? 'Account restriction removed' : status === 'approved' ? 'Account verified' : `Account ${status}`,
      message: unrestrict
        ? `PESO removed your account restriction. Your verification status is ${applicant.verificationStatus.replaceAll('_', ' ')}.`
        : status === 'approved'
        ? 'Your account has been verified by PESO.'
        : `Your account verification was ${status}.${reviewReason ? ` Reason: ${reviewReason}` : ''}`,
      link: '/profile',
      email: true,
      metadata: { status: applicant.verificationStatus, action: unrestrict ? 'unrestrict' : undefined, reason: applicant.verificationReason || undefined },
    })

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

    // Paginated applicants mode: ?role=Applicant&page=1&limit=10&search=...
    // Returns { items, total, page, limit, totalPages }; sorted by last name.
    if (req.query.role === 'Applicant') {
      const { page, limit } = parsePagination(req.query)
      const search = String(req.query.search || '').trim()
      const filter = { deletedAt: { $exists: false } }
      if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i')
        filter.$or = [
          { 'profile.firstName': pattern },
          { 'profile.middleName': pattern },
          { 'profile.lastName': pattern },
          { 'profile.name': pattern },
          { email: pattern },
        ]
      }
      const { order: applicantSortOrder, spec: applicantSortSpec } = resolveSort(req.query, APPLICANT_SORTS, 'name')
      const { items, total, totalPages } = await paginateQuery(Applicant, filter, {
        page,
        limit,
        sort: applicantSortSpec.fields(applicantSortOrder),
        sortSpec: applicantSortSpec,
        sortDir: applicantSortOrder,
        select: '-resumeFile.data -nsrpVerificationFile.data -verificationDocuments.nsrpForm.versions.data -verificationDocuments.birthCertificate.versions.data -verificationDocuments.validId1.versions.data -verificationDocuments.validId2.versions.data -verificationDocuments.resume.versions.data',
      })
      const mapped = items.map((u) => {
        const docs = summarizeVerificationDocuments(u)
        return {
          id: u._id,
          email: u.email,
          role: 'Applicant',
          emailVerified: Boolean(u.emailVerified),
          phone: u.phone || u.profile?.phone || u.profile?.nsrp?.cellphone || '',
          profile: {
            ...u.profile,
            location: u.profile?.location || [
              u.profile?.nsrp?.addressStreet,
              u.profile?.nsrp?.addressBarangay,
              u.profile?.addressCity || u.profile?.nsrp?.addressCity,
              u.profile?.addressProvince || u.profile?.nsrp?.addressProvince,
            ].filter(Boolean).join(', '),
          },
          displayName: applicantDisplayName(u),
          needsNameConfirmation: Boolean(u.needsNameConfirmation),
          verificationStatus: u.verificationStatus || 'approved',
          verificationReason: u.verificationReason,
          verificationDocuments: docs,
          pendingDocCount: docs.filter((d) => d.status === 'pending').length,
          resubmittedDocCount: docs.filter((d) => d.resubmitted).length,
          hasNsrpForm: Boolean(latestVersion(u.verificationDocuments?.nsrpForm)),
          hasNsrpVerification: Boolean(u.nsrpVerificationFile?.originalName),
          createdAt: u.createdAt,
        }
      })
      return res.json({ items: mapped, total, page, limit, totalPages, sortBy: resolveSort(req.query, APPLICANT_SORTS, 'name').key, order: applicantSortOrder === 1 ? 'asc' : 'desc' })
    }

    // Paginated employers mode: ?role=Employer&page=1&limit=10&search=...&sortBy=...&order=...
    if (req.query.role === 'Employer') {
      const { page, limit } = parsePagination(req.query)
      const search = String(req.query.search || '').trim()
      const statusFilter = String(req.query.status || '').trim()
      const filter = {}
      if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i')
        filter.$or = [{ companyName: pattern }, { email: pattern }, { contactName: pattern }, { phone: pattern }]
      }
      const { order: employerSortOrder, spec: employerSortSpec } = resolveSort(req.query, EMPLOYER_SORTS, 'companyName')
      const { items, total, totalPages } = await paginateQuery(Employer, filter, {
        page,
        limit,
        sort: employerSortSpec.fields(employerSortOrder),
        sortSpec: employerSortSpec,
        sortDir: employerSortOrder,
      })
      // Join each page's employer requests for phone/approval status
      const pageEmails = items.map((u) => u.email.toLowerCase())
      const pageRequests = await EmployerRequest.find({ email: { $in: pageEmails.map((email) => new RegExp(`^${escapeRegex(email)}$`, 'i')) } }).lean()
      const pageRequestByEmail = new Map(pageRequests.map((request) => [request.email.toLowerCase(), request]))
      let mapped = items.map((u) => {
        const request = pageRequestByEmail.get(u.email.toLowerCase())
        return {
          id: u._id,
          email: u.email,
          role: 'Employer',
          companyName: u.companyName,
          contactName: u.contactName,
          phone: u.phone || request?.phone,
          website: u.website,
          profile: u.profile,
          approvalStatus: request?.status || u.verificationStatus || EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW,
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
      if (statusFilter && statusFilter !== 'all') mapped = mapped.filter((u) => u.approvalStatus === statusFilter)
      return res.json({ items: mapped, total, page, limit, totalPages, sortBy: resolveSort(req.query, EMPLOYER_SORTS, 'companyName').key, order: employerSortOrder === 1 ? 'asc' : 'desc' })
    }

    const admins = await Admin.find().lean()
    const employers = await Employer.find().lean()
    // Admin queues list all applicants; unverified emails are badged in the UI
    const applicants = await Applicant.find({ deletedAt: { $exists: false } })
    for (const applicant of applicants) {
      const previousStatus = applicant.verificationStatus
      const previousReason = applicant.verificationReason
      const migrated = await migrateLegacyNsrp(applicant)
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
        approvalStatus: request?.status || u.verificationStatus || EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW,
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
    const mapApplicant = applicants.map((u) => {
      const docs = summarizeVerificationDocuments(u)
      const profile = u.profile?.toObject?.() || u.profile || {}
      const nsrp = profile.nsrp || {}
      return {
        id: u._id,
        email: u.email,
        role: 'Applicant',
        emailVerified: Boolean(u.emailVerified),
        phone: u.phone || profile.phone || nsrp.cellphone || '',
        profile: {
          ...profile,
          location: profile.location || [
            nsrp.addressStreet,
            nsrp.addressBarangay,
            profile.addressCity || nsrp.addressCity,
            profile.addressProvince || nsrp.addressProvince,
          ].filter(Boolean).join(', '),
        },
        displayName: applicantDisplayName(u),
        needsNameConfirmation: Boolean(u.needsNameConfirmation),
        verificationStatus: u.verificationStatus || 'approved',
        verificationReason: u.verificationReason,
        verificationDocuments: docs,
        pendingDocCount: docs.filter((d) => d.status === 'pending').length,
        resubmittedDocCount: docs.filter((d) => d.resubmitted).length,
        hasNsrpVerification: Boolean(u.nsrpVerificationFile?.data || u.nsrpVerificationFile?.originalName),
        createdAt: u.createdAt,
      }
    })

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
    // Safe log: route, method, status, and error message only — never the body,
    // which may contain passwords, tokens, NSRP answers, or signature data.
    console.error(`JSON parse error: ${req.method} ${redactPath(req.originalUrl)} -> 400 (${err.message})`)
    return res.status(400).json({ error: 'Invalid JSON payload' })
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large.' })
  }
  if (err instanceof multer.MulterError) {
    if (req.path === '/api/signup') {
      const field = {
        birthCertificate: 'birthCertificate',
        validId1Front: 'validId1',
        validId1Back: 'validId1',
        validId2Front: 'validId2',
        validId2Back: 'validId2',
        resume: 'resume',
      }[err.field] || 'verificationDocuments'
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: err.message,
        fieldErrors: { [field]: err.message },
      })
    }
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message })
  }
  if (err && ['/api/signup', '/api/employer-requests', '/api/employer-requirements'].includes(req.path)) {
    if (req.path === '/api/signup') {
      const field = {
        birthCertificate: 'birthCertificate',
        validId1Front: 'validId1',
        validId1Back: 'validId1',
        validId2Front: 'validId2',
        validId2Back: 'validId2',
        resume: 'resume',
      }[err.field] || 'verificationDocuments'
      return res.status(400).json({ error: err.message || 'Invalid uploaded file', fieldErrors: { [field]: err.message || 'Invalid uploaded file' } })
    }
    return res.status(400).json({ error: err.message || 'Invalid uploaded file' })
  }
  next(err)
})

// PESO retains the NSRP form. Only supporting document binaries expire.
// Set VERIFICATION_DOC_RETENTION_DAYS=0 to disable. Metadata (labels/status) is kept for audit.
const DOC_RETENTION_DAYS = Number(process.env.VERIFICATION_DOC_RETENTION_DAYS ?? 30)
export async function purgeExpiredVerificationDocuments() {
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
      const unset = {}
      for (const key of ['birthCertificate', 'validId1', 'validId2', 'resume']) {
        const versions = applicant.verificationDocuments?.[key]?.versions || []
        versions.forEach((_, index) => {
          unset[`verificationDocuments.${key}.versions.${index}.data`] = 1
          unset[`verificationDocuments.${key}.versions.${index}.back.data`] = 1
        })
      }
      if (Object.keys(unset).length) await Applicant.updateOne({ _id: applicant._id }, { $unset: unset })
      applicant.documentsPurgedAt = new Date()
      await applicant.save()
      await DocumentFile.deleteMany({ applicant: applicant._id, slot: { $ne: 'nsrpForm' } })
    }
    if (stale.length > 0) console.log(`Purged verification documents for ${stale.length} applicant(s)`)
  } catch (err) {
    console.error('Document purge job failed:', err.message)
  }
}
if (!isTestEnv) {
  setInterval(purgeExpiredVerificationDocuments, 24 * 60 * 60 * 1000).unref()
  purgeExpiredVerificationDocuments()

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    startHireReportReminders()
    initMailer().catch(() => {}) // startup check is non-fatal
  })
}

export { app, nsrpPreviewStore }
