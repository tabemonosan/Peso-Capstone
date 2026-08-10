import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import { Applicant, Employer, Admin, Notification, findUserByEmail, createUserInRole, updateUserProfileByEmail } from './models/collections.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: 'http://localhost:5173' }))
// Capture raw request body for debugging JSON parse issues
app.use(express.json({
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
  skills: [String],
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  approvedBy: String,
  approvedAt: Date,
  createdBy: String,
  applicants: [{ email: String, appliedAt: Date }],
  createdAt: { type: Date, default: Date.now },
})
const JobPosting = mongoose.model('JobPosting', jobSchema)

const employerRequestSchema = new Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  companyName: { type: String, required: true },
  contactName: { type: String, required: true },
  location: String,
  phone: String,
  message: String,
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  approvedBy: String,
  approvedAt: Date,
  createdAt: { type: Date, default: Date.now },
})
const EmployerRequest = mongoose.model('EmployerRequest', employerRequestSchema)

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

    const safe = { email: user.email, role: 'Applicant', profile: user.profile }
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

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    const safe = { email: user.email, role: type, profile: user.profile }
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
    res.json({ email: user.email, role: type, profile: user.profile })
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
    const { profile } = req.body
    if (!profile) return res.status(400).json({ error: 'Missing profile' })
    const updated = await updateUserProfileByEmail(decoded.email, profile)
    if (!updated) return res.status(404).json({ error: 'Not found' })
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
    if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
    const { title, company, location, description, requirements, salary, skills } = req.body || {}
    if (!title || !company || !description) return res.status(400).json({ error: 'Missing required fields' })
    if (!Array.isArray(skills) || skills.length === 0) return res.status(400).json({ error: 'Select at least one skill' })
    const normalizedSkills = skills.filter((skill) => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean)
    const job = new JobPosting({ title, company, location, description, requirements, salary, skills: normalizedSkills, createdBy: decoded.email })
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

app.get('/api/jobs', async (req, res) => {
  try {
    const { status } = req.query
    if (status === 'pending') {
      const auth = req.headers.authorization
      if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
      const token = auth.split(' ')[1]
      const decoded = jwt.verify(token, jwtSecret)
      if (!['Admin', 'Employer'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })
      const jobs = await JobPosting.find({ status: 'pending' }).sort({ createdAt: -1 })
      return res.json(jobs)
    }
    if (status === 'mine') {
      const auth = req.headers.authorization
      if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
      const token = auth.split(' ')[1]
      const decoded = jwt.verify(token, jwtSecret)
      if (decoded.role !== 'Employer') return res.status(403).json({ error: 'Forbidden' })
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
      return res.json(jobs)
    }
    const jobs = await JobPosting.find({ status: 'approved' }).sort({ createdAt: -1 })
    res.json(jobs)
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
    if (!['Admin', 'Employer'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' })
    const { status } = req.body || {}
    if (!['approved', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    job.status = status
    if (status === 'approved') {
      job.approvedBy = decoded.email
      job.approvedAt = new Date()
    }
    await job.save()

    if (job.createdBy) {
      const reviewTitle = status === 'approved' ? 'Posting approved' : 'Posting declined'
      const reviewMessage = status === 'approved'
        ? `Your job posting “${job.title}” was approved by the admin.`
        : `Your job posting “${job.title}” was declined by the admin.`
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

app.post('/api/jobs/:id/apply', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
    const token = auth.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret)
    if (decoded.role !== 'Applicant') return res.status(403).json({ error: 'Forbidden' })
    const job = await JobPosting.findById(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    if (job.status !== 'approved') return res.status(400).json({ error: 'Job is not available' })
    if (job.applicants.some((applicant) => applicant.email === decoded.email)) {
      return res.status(400).json({ error: 'Already applied' })
    }
    job.applicants.push({ email: decoded.email, appliedAt: new Date() })
    await job.save()
    res.json({ success: true, job })
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

    const merged = [...storedNotifications, ...derivedNotifications]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    res.json(merged)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/employer-requests', async (req, res) => {
  try {
    const { email, password, companyName, contactName, location, phone, message } = req.body || {}
    if (!email || !password || !companyName || !contactName) return res.status(400).json({ error: 'Missing required fields' })

    const existingUser = await findUserByEmail(email)
    if (existingUser) return res.status(409).json({ error: 'Email already in use' })
    const existingRequest = await EmployerRequest.findOne({ email })
    if (existingRequest) return res.status(409).json({ error: 'Employer request already submitted' })

    const passwordHash = await bcrypt.hash(password, 10)
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

    const requests = await EmployerRequest.find({ status: 'pending' }).sort({ createdAt: -1 })
    res.json(requests)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
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
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already processed' })

    request.status = status
    if (status === 'approved') {
      request.approvedBy = decoded.email
      request.approvedAt = new Date()
    }
    await request.save()

    if (status === 'approved') {
      const existingUser2 = await findUserByEmail(request.email)
      if (!existingUser2) {
        await createUserInRole('Employer', {
          email: request.email,
          passwordHash: request.passwordHash,
          companyName: request.companyName,
          contactName: request.contactName,
          profile: { name: request.contactName, location: request.location, summary: request.companyName },
        })
      }
    }

    res.json(request)
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

    const mapAdmin = admins.map((u) => ({ id: u._id, email: u.email, role: 'Admin', profile: u.profile, createdAt: u.createdAt }))
    const mapEmployer = employers.map((u) => ({ id: u._id, email: u.email, role: 'Employer', companyName: u.companyName, contactName: u.contactName, phone: u.phone, website: u.website, profile: u.profile, createdAt: u.createdAt }))
    const mapApplicant = applicants.map((u) => ({ id: u._id, email: u.email, role: 'Applicant', profile: u.profile, createdAt: u.createdAt }))

    const combined = [...mapAdmin, ...mapEmployer, ...mapApplicant]
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
