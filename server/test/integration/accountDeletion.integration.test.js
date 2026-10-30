// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { startTestDb, stopTestDb, clearDb, signupUploadRequest } from './helpers.js'

vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }), sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Applicant, Admin, AccountDeletionRequest, Notification, Referral, HireReport, DocumentFile } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting')
const JobApplication = mongoose.model('JobApplication')
const email = 'returning@example.com'
const secret = process.env.JWT_SECRET || 'dev-secret'
const auth = (role = 'Applicant', extra = {}) => ({ Authorization: `Bearer ${jwt.sign({ role, email: role === 'Admin' ? 'admin@example.com' : email, ...extra }, secret)}` })
let applicant
const requestDeletion = () => request(app).post('/api/account-deletion/requests').set(auth()).send({ password: 'OldPass123!', reason: 'No longer using this account' })
const decide = (id, body) => request(app).put(`/api/account-deletion/requests/${id}`).set(auth('Admin')).send(body)

beforeAll(async () => { await startTestDb(); await AccountDeletionRequest.init() }, 60000)
afterAll(stopTestDb)
beforeEach(async () => {
  vi.restoreAllMocks()
  await clearDb()
  await Admin.create({ email: 'admin@example.com', passwordHash: 'unused' })
  applicant = await Applicant.create({ email, emailNormalized: email, passwordHash: await bcrypt.hash('OldPass123!', 4), emailVerified: true, verificationStatus: 'approved', profile: { firstName: 'Juan', lastName: 'Cruz', location: 'Legazpi City, Albay' }, verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map((key) => [key, { versions: [{ version: 1, status: 'approved' }] }])) })
})

describe('applicant account deletion requests', () => {
  it('requires the owner password, prevents duplicate requests, and lets the owner cancel', async () => {
    expect((await request(app).post('/api/account-deletion/requests').send({ password: 'OldPass123!' })).status).toBe(401)
    expect((await request(app).post('/api/account-deletion/requests').set(auth('Employer')).send({ password: 'OldPass123!' })).status).toBe(403)
    expect((await request(app).post('/api/account-deletion/requests').set(auth()).send({ password: 'wrong' })).status).toBe(403)
    const sent = await requestDeletion()
    expect(sent.status).toBe(201)
    expect((await requestDeletion()).status).toBe(409)
    expect((await request(app).get('/api/account-deletion/current').set(auth())).body.status).toBe('pending')
    expect(await Notification.exists({ type: 'account_deletion_requested', 'recipient.role': 'Admin' })).toBeTruthy()
    const other = await Applicant.create({ email: 'other@example.com', passwordHash: 'unused' })
    expect((await request(app).delete(`/api/account-deletion/requests/${sent.body._id}`).set(auth('Applicant', { email: other.email }))).status).toBe(409)
    const cancelled = await request(app).delete(`/api/account-deletion/requests/${sent.body._id}`).set(auth())
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.status).toBe('cancelled')
    expect((await decide(sent.body._id, { status: 'approved' })).status).toBe(409)
    expect((await requestDeletion()).status).toBe(201)
  })

  it('requires an admin and a decline reason, keeps the account active, and records feedback', async () => {
    const sent = await requestDeletion()
    expect((await request(app).get('/api/account-deletion/requests').set(auth())).status).toBe(403)
    expect((await request(app).put(`/api/account-deletion/requests/${sent.body._id}`).set(auth()).send({ status: 'approved' })).status).toBe(403)
    expect((await decide(sent.body._id, { status: 'declined' })).status).toBe(400)
    const declined = await decide(sent.body._id, { status: 'declined', reason: 'Please visit PESO to clarify your request.' })
    expect(declined.status).toBe(200)
    expect(declined.body.reviewedBy).toBe('admin@example.com')
    expect((await request(app).get('/api/profile').set(auth())).status).toBe(200)
    expect(await Notification.exists({ type: 'account_deletion_declined', 'recipient.id': applicant._id })).toBeTruthy()
    expect((await requestDeletion()).status).toBe(201)
  })

  it('releases the email for a new signup while retaining separate records and invalidating old sessions', async () => {
    const oldBoundAuth = auth('Applicant', { sub: String(applicant._id), sessionVersion: 0 })
    const job = await JobPosting.create({ title: 'Clerk', company: 'Example', status: 'approved', applicants: [{ email }] })
    await JobApplication.create({ jobId: job._id, applicantEmail: email, nsrpFile: { originalName: 'old.pdf', mimetype: 'application/pdf', data: Buffer.from('%PDF-old') } })
    const employerId = new mongoose.Types.ObjectId()
    const referral = await Referral.create({ jobId: job._id, applicantId: applicant._id, employerId, referredBy: (await Admin.findOne())._id })
    await HireReport.create({ jobId: job._id, applicantId: applicant._id, employerId, referralId: referral._id, status: 'hired' })
    await DocumentFile.create({ applicant: applicant._id, slot: 'nsrpForm', version: 1, side: 'front', data: Buffer.from('%PDF-old') })
    await Notification.create({ recipientEmail: email, title: 'Private old notification', message: 'Previous employment record' })
    const sent = await requestDeletion()
    const approved = await decide(sent.body._id, { status: 'approved' })
    expect(approved.status).toBe(200)
    expect(approved.body.status).toBe('approved')
    const archived = await Applicant.findById(applicant._id).select('+retainedEmail')
    expect(archived.deletedAt).toBeTruthy()
    expect(archived.retainedEmail).toBe(email)
    expect(archived.email).not.toBe(email)
    expect(await Referral.exists({ applicantId: applicant._id })).toBeTruthy()
    expect(await HireReport.exists({ applicantId: applicant._id })).toBeTruthy()
    expect(await DocumentFile.exists({ applicant: applicant._id })).toBeTruthy()
    expect((await JobApplication.findOne()).applicantEmail).toBe(archived.email)
    expect((await JobPosting.findById(job._id)).applicants[0].email).toBe(archived.email)
    for (const oldAuth of [auth(), oldBoundAuth]) expect((await request(app).get('/api/profile').set(oldAuth)).status).toBe(401)

    const signup = await signupUploadRequest(request(app).post('/api/signup'), { email })
    expect(signup.status).toBe(200)
    expect(signup.body.user.id).not.toBe(String(applicant._id))
    const newAuth = { Authorization: `Bearer ${signup.body.token}` }
    expect(jwt.verify(signup.body.token, secret).sub).toBe(signup.body.user.id)
    expect((await request(app).get('/api/profile').set(newAuth)).status).toBe(200)
    for (const oldAuth of [auth(), oldBoundAuth]) expect((await request(app).get('/api/profile').set(oldAuth)).status).toBe(401)
    expect((await request(app).post('/api/login').send({ email, password: 'OldPass123!' })).status).toBe(401)
    expect((await request(app).get('/api/jobs?status=applied&page=1').set(newAuth)).body.total).toBe(0)
    expect((await request(app).get('/api/employment-opportunities/mine').set(newAuth)).body).toEqual([])
    const notifications = await request(app).get('/api/notifications').set(newAuth)
    expect(notifications.body.items.some((item) => item.title === 'Private old notification')).toBe(false)
    const activeApplicants = await request(app).get('/api/admin/users?role=Applicant&page=1').set(auth('Admin'))
    expect(activeApplicants.body.items.map((item) => String(item.id))).not.toContain(String(applicant._id))
    expect((await request(app).get(`/api/applicants/${applicant._id}/verification-documents`).set(auth('Admin'))).status).toBe(200)
  })

  it('keeps an interrupted approval retryable and does not release the email prematurely', async () => {
    const sent = await requestDeletion()
    const failure = vi.spyOn(JobApplication, 'updateMany').mockRejectedValueOnce(new Error('Simulated interruption'))
    expect((await decide(sent.body._id, { status: 'approved' })).status).toBe(500)
    expect((await AccountDeletionRequest.findById(sent.body._id)).status).toBe('processing')
    expect((await Applicant.findById(applicant._id)).email).toBe(email)
    expect((await request(app).get('/api/profile').set(auth())).status).toBe(401)
    const queue = await request(app).get('/api/account-deletion/requests?status=pending').set(auth('Admin'))
    expect(queue.body.items[0].status).toBe('processing')
    failure.mockRestore()
    expect((await decide(sent.body._id, { status: 'approved' })).status).toBe(200)
    expect((await Applicant.findById(applicant._id)).email).not.toBe(email)
    expect((await AccountDeletionRequest.findById(sent.body._id)).status).toBe('approved')
  })

  it('does not touch a new account when retrying after the old email has already been released', async () => {
    const sent = await requestDeletion()
    const original = AccountDeletionRequest.findOneAndUpdate.bind(AccountDeletionRequest)
    let interrupted = false
    const failure = vi.spyOn(AccountDeletionRequest, 'findOneAndUpdate').mockImplementation((filter, update, options) => {
      if (update.$set?.status === 'approved' && !interrupted) { interrupted = true; return Promise.reject(new Error('Interrupted completion')) }
      return original(filter, update, options)
    })
    expect((await decide(sent.body._id, { status: 'approved' })).status).toBe(500)
    expect((await Applicant.findById(applicant._id)).email).not.toBe(email)
    const signup = await signupUploadRequest(request(app).post('/api/signup'), { email })
    expect(signup.status).toBe(200)
    const newJob = await JobPosting.create({ title: 'New job', company: 'Example', applicants: [{ email }] })
    await JobApplication.create({ jobId: newJob._id, applicantEmail: email, nsrpFile: { data: Buffer.from('%PDF-new') } })
    failure.mockRestore()
    expect((await decide(sent.body._id, { status: 'approved' })).status).toBe(200)
    expect((await JobPosting.findById(newJob._id)).applicants[0].email).toBe(email)
    expect((await JobApplication.findOne({ jobId: newJob._id })).applicantEmail).toBe(email)
  })
})
