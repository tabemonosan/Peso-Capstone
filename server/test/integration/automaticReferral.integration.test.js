// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
import { jobApplicationRequest } from './helpers.js'

// DNS is deterministic; no external mailbox or DNS service is contacted in tests.
vi.mock('node:dns/promises', () => ({ Resolver: class {
  async resolveMx(domain) {
    if (domain === 'gmail.comsds') throw Object.assign(new Error('Domain not found'), { code: 'ENOTFOUND' })
    return [{ priority: 10, exchange: 'mail.example.test' }]
  }
} }))
vi.mock('../../mailer.js', async (original) => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app, referralWorkflow } = await import('../../index.js')
const { Applicant, Employer, Admin, Referral, HireReport, Notification } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting'), JobApplication = mongoose.model('JobApplication')
let applicant, employer, admin, job
const auth = (role, email) => ({ Authorization: `Bearer ${jwt.sign({ role, email: email || `${role.toLowerCase()}@auto.test` }, process.env.JWT_SECRET || 'dev-secret')}` })
const apply = (target = job, account = applicant, consent = true) => request(app).post(`/api/jobs/${target._id}/apply`).set(auth('Applicant', account.email)).field('sharingConsent', String(consent)).field('applicationDetails', JSON.stringify({ email: account.email, mobile: '09171234567', bachelorDegree: 'No', hasExperience: 'No', experience: '' })).attach('resume', Buffer.from('%PDF-resume'), { filename: 'resume.pdf', contentType: 'application/pdf' })
const api = (method, path, body) => request(app)[method](`/api/admin/referral-workflow${path}`).set(auth('Admin', admin.email)).send(body)
async function makeApplicant(email = 'applicant@auto.test') {
  return Applicant.create({ email, passwordHash: 'test', emailVerified: true, verificationStatus: 'approved', phone: '09171234567',
    profile: { firstName: 'Test', lastName: 'Applicant', location: 'Albay', skills: ['Excel'], nsrp: { tin: 'PRIVATE-TIN', addressStreet: 'PRIVATE-STREET', dob: '1990-01-01', religion: 'PRIVATE-RELIGION' } },
    verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map((key) => [key, { uploads: 1, versions: [{ version: 1, status: 'approved', sourceType: key === 'nsrpForm' ? 'generated' : undefined, data: Buffer.from('%PDF-private'), originalName: `${key}.pdf`, mimetype: 'application/pdf' }] }])),
  })
}
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  applicant = await makeApplicant()
  employer = await Employer.create({ email: 'employer@auto.test', passwordHash: 'test', emailVerified: true, verificationStatus: 'approved', companyName: 'Company', phone: '09170000000' })
  admin = await Admin.create({ email: 'admin@auto.test', passwordHash: 'test' })
  job = await JobPosting.create({ title: 'Clerk', company: employer.companyName, createdBy: employer.email, status: 'approved', slots: 2, deadline: new Date(Date.now() + 86400000), skills: ['Excel'] })
})

describe('automatic applications and referral oversight', () => {
  it('keeps admin reasons private when the employer responds, while retaining the admin audit history', async () => {
    const reason = 'PRIVATE: identity review reference 123456789'
    await request(app).post('/api/referrals').set(auth('Admin', admin.email)).send({ jobId: String(job._id), applicantIds: [String(applicant._id)], reason }).expect(200)
    const referral = await Referral.findOne()
    const response = await request(app).put(`/api/referrals/${referral._id}/respond`).set(auth('Employer', employer.email)).send({ status: 'accepted' })
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('accepted')
    expect(response.body.history.some((entry) => entry.action === 'manual_referral')).toBe(true)
    expect(JSON.stringify(response.body)).not.toContain(reason)
    expect(JSON.stringify(response.body)).not.toContain(admin.email)
    const mine = await request(app).get('/api/applications/mine').set(auth('Applicant', applicant.email))
    expect(JSON.stringify(mine.body)).not.toContain(reason)
    const detail = await api('get', `/applications/${referral.applicationId}`)
    expect(detail.body.history.some((entry) => entry.reason === reason)).toBe(true)
  })
  it.each(['expired', 'employer_suspended'])('rolls back a submission when %s changes during delivery', async (change) => {
    const create = Referral.create.bind(Referral)
    const pause = vi.spyOn(Referral, 'create').mockImplementationOnce(async (...args) => {
      const record = await create(...args)
      if (change === 'expired') await JobPosting.updateOne({ _id: job._id }, { deadline: new Date('2000-01-01') })
      else await Employer.updateOne({ _id: employer._id }, { receivingApplicantsSuspendedAt: new Date() })
      return record
    })
    try {
      const response = await apply()
      expect(response.status).toBe(change === 'expired' ? 409 : 403)
      expect(response.body.code).toBe(change === 'expired' ? 'APPLICATION_CLOSED' : 'EMPLOYER_APPLICATIONS_SUSPENDED')
      expect(await JobApplication.countDocuments()).toBe(0)
      expect(await Referral.countDocuments()).toBe(0)
      expect((await JobPosting.findById(job._id)).applicants).toHaveLength(0)
      expect(await Notification.countDocuments({ type: 'referral_received' })).toBe(0)
    } finally { pause.mockRestore() }
  })
  it('fully restores a queued application if manual referral finalization fails, then permits retry', async () => {
    await api('put', '/settings', { automaticReferral: false }).expect(200)
    await apply()
    const queued = await JobApplication.findOne().lean()
    const failure = vi.spyOn(Referral, 'updateOne').mockRejectedValueOnce(new Error('simulated finalization failure'))
    const payload = { jobId: String(job._id), applicantIds: [String(applicant._id)], reason: 'Failed manual delivery' }
    try {
      await request(app).post('/api/referrals').set(auth('Admin', admin.email)).send(payload).expect(409)
      const restored = await JobApplication.findById(queued._id).lean()
      expect(restored.deliveryStatus).toBe('pending_admin')
      expect(restored.source).toBe(queued.source)
      expect(restored.referralId).toBeUndefined()
      expect(restored.history).toEqual(queued.history)
      expect(await Referral.countDocuments()).toBe(0)
    } finally { failure.mockRestore() }
    await request(app).post('/api/referrals').set(auth('Admin', admin.email)).send(payload).expect(200)
    expect(await JobApplication.countDocuments()).toBe(1)
    expect(await Referral.countDocuments()).toBe(1)
  })
  it('rejects a nonexistent email domain both at the contact step and direct submission', async () => {
    const email = 'akoyuki95@gmail.comsds'
    const check = await request(app).post('/api/applications/validate-email').set(auth('Applicant', applicant.email)).send({ email })
    expect(check.status).toBe(403)
    expect(check.body).toMatchObject({ valid: false, code: 'INVALID_APPLICATION_EMAIL' })
    const submit = await jobApplicationRequest(request(app).post(`/api/jobs/${job._id}/apply`).set(auth('Applicant', applicant.email)), { email })
    expect(submit.status).toBe(403)
    expect(submit.body.fieldErrors.email).toBeTruthy()
    expect(await JobApplication.countDocuments()).toBe(0)
    expect(await Referral.countDocuments()).toBe(0)
  })
  it('stores the four-step answers and resume, shares only with the job employer, and revokes resume access on pullback', async () => {
    const result = await jobApplicationRequest(request(app).post(`/api/jobs/${job._id}/apply`).set(auth('Applicant', applicant.email)), { email: 'contact@auto.test', bachelorDegree: 'Yes', hasExperience: 'Yes', experience: 'Delivery driver' })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    const application = await JobApplication.findOne().lean()
    expect(application.applicationDetails).toMatchObject({ email: 'contact@auto.test', mobile: '09171234567', bachelorDegree: 'Yes', hasExperience: 'Yes', experience: 'Delivery driver' })
    expect(application.resumeFile.originalName).toBe('resume.pdf')
    expect(application.resumeFile).not.toHaveProperty('data')
    const path = `/api/applications/${application._id}/resume`
    await request(app).get(path).set(auth('Applicant', applicant.email)).expect(200)
    await request(app).get(path).set(auth('Employer', employer.email)).expect(200)
    await request(app).get(path).set(auth('Admin', admin.email)).expect(200)
    const other = await makeApplicant('other@auto.test')
    await request(app).get(path).set(auth('Applicant', other.email)).expect(403)
    const competitor = await Employer.create({ email: 'competitor@auto.test', passwordHash: 'unused', verificationStatus: 'approved', emailVerified: true })
    await request(app).get(path).set(auth('Employer', competitor.email)).expect(403)
    const list = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', employer.email))
    expect(list.body[0].application.details.experience).toBe('Delivery driver')
    expect(list.body[0].applicantId.email).toBe('contact@auto.test')
    expect(JSON.stringify(list.body)).not.toMatch(/%PDF|PRIVATE-|nsrpFile/)
    await api('post', `/applications/${application._id}/pull-back`, { reason: 'Review required' }).expect(200)
    await request(app).get(path).set(auth('Employer', employer.email)).expect(403)
    const revoked = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', employer.email))
    expect(revoked.body[0]).not.toHaveProperty('application')
  })
  it.each([
    [{ email: 'invalid' }, 'email'], [{ mobile: '0917123456' }, 'mobile'], [{ mobile: '091712345678' }, 'mobile'],
    [{ mobile: '0917abc4567' }, 'mobile'], [{ bachelorDegree: '' }, 'bachelorDegree'], [{ hasExperience: 'Yes', experience: 'a'.repeat(21) }, 'experience'],
  ])('rejects invalid four-step answers %j without saving records', async (change, field) => {
    const result = await jobApplicationRequest(request(app).post(`/api/jobs/${job._id}/apply`).set(auth('Applicant', applicant.email)), { email: applicant.email, ...change })
    expect(result.status).toBe(403)
    expect(result.body.fieldErrors[field]).toBeTruthy()
    expect(await JobApplication.countDocuments()).toBe(0)
    expect(await Referral.countDocuments()).toBe(0)
  })
  it('rejects a missing or disguised resume and keeps resumes private while waiting in the manual queue', async () => {
    const missing = await request(app).post(`/api/jobs/${job._id}/apply`).set(auth('Applicant', applicant.email)).send({ sharingConsent: true })
    expect(missing.status).toBe(403)
    expect(missing.body.fieldErrors.resume).toBeTruthy()
    const disguised = await jobApplicationRequest(request(app).post(`/api/jobs/${job._id}/apply`).set(auth('Applicant', applicant.email)), { resume: Buffer.from('this is not a PDF') })
    expect(disguised.status).toBe(403)
    expect(disguised.body.code).toBe('INVALID_RESUME')
    expect(await JobApplication.countDocuments()).toBe(0)
    await api('put', '/settings', { automaticReferral: false }).expect(200)
    await apply()
    const application = await JobApplication.findOne()
    await request(app).get(`/api/applications/${application._id}/resume`).set(auth('Employer', employer.email)).expect(403)
    await request(app).post('/api/referrals').set(auth('Admin', admin.email)).send({ jobId: String(job._id), applicantIds: [String(applicant._id)], reason: 'Reviewed' }).expect(200)
    await request(app).get(`/api/applications/${application._id}/resume`).set(auth('Employer', employer.email)).expect(200)
  })
  it('creates application + auto referral immediately, notifies both parties, and keeps employer data private', async () => {
    const result = await apply()
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ success: true, deliveryStatus: 'delivered' })
    expect(await JobApplication.countDocuments()).toBe(1)
    expect(await Referral.countDocuments()).toBe(1)
    const referral = await Referral.findOne()
    expect(referral.source).toBe('auto')
    expect(referral.status).toBe('pending')
    expect(referral.history[0].action).toBe('application_submitted')
    const list = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', employer.email))
    expect(list.body).toHaveLength(1)
    expect(list.body[0].applicantId.email).toBe(applicant.email)
    expect(JSON.stringify(list.body)).not.toMatch(/PRIVATE-|nsrpFile|verificationDocuments/)
    expect(await Notification.countDocuments({ type: 'application_submitted' })).toBe(1)
    expect(await Notification.countDocuments({ type: 'referral_received', 'recipient.role': 'Employer' })).toBe(1)
    expect(await Notification.countDocuments({ type: 'new_application' })).toBe(0)
    expect(await Notification.countDocuments({ type: 'application_referral_digest' })).toBe(1)
    const mine = await request(app).get('/api/applications/mine').set(auth('Applicant', applicant.email))
    expect(mine.body[0]).toMatchObject({ source: 'auto', status: 'pending' })
  })
  it.each([
    ['unverified', 'EMAIL_NOT_VERIFIED', 403], ['restricted', 'ACCOUNT_RESTRICTED', 403],
    ['not_approved', 'APPLICANT_NOT_VERIFIED', 403], ['employer_unapproved', 'EMPLOYER_NOT_APPROVED', 403],
    ['employer_suspended', 'EMPLOYER_APPLICATIONS_SUSPENDED', 403], ['job_pending', 'JOB_UNAVAILABLE', 409],
    ['closed', 'APPLICATION_CLOSED', 409], ['expired', 'APPLICATION_CLOSED', 409], ['filled', 'JOB_FILLED', 409],
    ['consent', 'SHARING_CONSENT_REQUIRED', 403],
  ])('rejects %s before creating application or referral records', async (scenario, code, status) => {
    if (scenario === 'unverified') await Applicant.updateOne({ _id: applicant._id }, { emailVerified: false })
    if (scenario === 'restricted') await Applicant.updateOne({ _id: applicant._id }, { verificationStatus: 'restricted' })
    if (scenario === 'not_approved') await Applicant.updateOne({ _id: applicant._id }, { 'verificationDocuments.validId1.versions.0.status': 'pending' })
    if (scenario === 'employer_unapproved') await Employer.updateOne({ _id: employer._id }, { verificationStatus: 'under_review' })
    if (scenario === 'employer_suspended') await Employer.updateOne({ _id: employer._id }, { receivingApplicantsSuspendedAt: new Date() })
    if (scenario === 'job_pending') await JobPosting.updateOne({ _id: job._id }, { status: 'pending' })
    if (scenario === 'closed') await JobPosting.updateOne({ _id: job._id }, { acceptingApplications: false })
    if (scenario === 'expired') await JobPosting.updateOne({ _id: job._id }, { deadline: new Date('2000-01-01') })
    if (scenario === 'filled') await JobPosting.updateOne({ _id: job._id }, { slots: 1, hiredApplicantIds: [new mongoose.Types.ObjectId()] })
    const result = await apply(job, applicant, scenario !== 'consent')
    expect(result.status, JSON.stringify(result.body)).toBe(status)
    expect(result.body.code).toBe(code)
    expect(await JobApplication.countDocuments()).toBe(0)
    expect(await Referral.countDocuments()).toBe(0)
  })
  it('creates one pair under simultaneous duplicate requests and one entry in the job', async () => {
    const results = await Promise.all([apply(), apply()])
    expect(results.map((entry) => entry.status).sort()).toEqual([200, 409])
    expect(await JobApplication.countDocuments()).toBe(1)
    expect(await Referral.countDocuments()).toBe(1)
    expect((await JobPosting.findById(job._id)).applicants).toHaveLength(1)
    expect((await apply()).body.code).toBe('ALREADY_APPLIED')
  })
  it('rolls back an application and quota when referral delivery fails, and allows retry', async () => {
    const failure = vi.spyOn(Referral, 'create').mockRejectedValueOnce(new Error('simulated delivery failure'))
    try {
      const result = await apply()
      expect(result.status).toBe(409)
      expect(result.body.code).toBe('APPLICATION_UNAVAILABLE')
      expect(await JobApplication.countDocuments()).toBe(0)
      expect(await Referral.countDocuments()).toBe(0)
      expect((await JobPosting.findById(job._id)).applicants).toHaveLength(0)
    } finally { failure.mockRestore() }
    expect((await apply()).status).toBe(200)
  })
  it('lets only the owner withdraw, keeps neutral history, and blocks further employer action', async () => {
    await apply()
    const application = await JobApplication.findOne()
    const other = await makeApplicant('not-owner@auto.test')
    const path = `/api/applications/${application._id}/withdraw`
    await request(app).post(path).set(auth('Applicant', other.email)).expect(409)
    await request(app).post(path).set(auth('Applicant', applicant.email)).expect(200)
    const list = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', employer.email))
    expect(list.body[0]).toMatchObject({ status: 'withdrawn', applicantId: null })
    await request(app).put(`/api/referrals/${application.referralId}/respond`).set(auth('Employer', employer.email)).send({ status: 'accepted' }).expect(409)
    const history = await request(app).get('/api/applications/mine').set(auth('Applicant', applicant.email))
    expect(history.body[0].message).toMatch(/remains in your history/)
    expect(await Notification.countDocuments({ type: 'application_withdrawn' })).toBe(1)
  })
  it('enforces 10 daily applications and records an info burst without an automatic penalty', async () => {
    const jobs = await JobPosting.create(Array.from({ length: 11 }, (_, index) => ({ title: `Job ${index}`, company: employer.companyName, createdBy: employer.email, status: 'approved', slots: 20 })))
    const results = await Promise.all(jobs.map((entry) => apply(entry)))
    expect(results.filter((entry) => entry.status === 200)).toHaveLength(10)
    expect(results.find((entry) => entry.status !== 200).body.code).toBe('DAILY_APPLICATION_LIMIT')
    expect(await JobApplication.countDocuments()).toBe(10)
    expect(await Referral.countDocuments()).toBe(10)
    expect(await Notification.countDocuments({ type: 'application_referral_digest' })).toBe(1)
    expect((await Notification.findOne({ type: 'application_referral_digest' })).metadata).toMatchObject({ applications: 10, referrals: 10 })
    expect(await JobApplication.countDocuments({ 'findings.code': 'APPLICATION_BURST' })).toBeGreaterThan(0)
    expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('approved')
    const counters = await mongoose.connection.db.collection('application_rate_limits').find().toArray()
    expect(JSON.stringify(counters)).not.toMatch(/127\.0\.0\.1|::ffff/)
  })
  it('retains the manual queue when off and automatically shares new applications again when on', async () => {
    await api('put', '/settings', { automaticReferral: false }).expect(200)
    const queued = await apply()
    expect(queued.body.deliveryStatus).toBe('pending_admin')
    expect(await Referral.countDocuments()).toBe(0)
    expect(await Notification.countDocuments({ 'recipient.role': 'Employer' })).toBe(0)
    const employerList = await request(app).get('/api/jobs?status=mine').set(auth('Employer', employer.email))
    expect(employerList.body[0].applicants).toEqual([])
    const manual = await request(app).post('/api/referrals').set(auth('Admin', admin.email)).send({ jobId: String(job._id), applicantIds: [String(applicant._id)], reason: 'PESO review completed' })
    expect(manual.status, JSON.stringify(manual.body)).toBe(200)
    expect((await Referral.findOne()).source).toBe('admin')
    expect(await JobApplication.countDocuments()).toBe(1)
    await api('put', '/settings', { automaticReferral: true }).expect(200)
    expect((await apply(job, await makeApplicant('next@auto.test'))).body.deliveryStatus).toBe('delivered')
    expect((await referralWorkflow.getSettings()).history).toHaveLength(2)
  })
  it('limits applying from a hashed IP and rolls back the rejected application', async () => {
    await apply()
    const counters = mongoose.connection.db.collection('application_rate_limits')
    const ip = await counters.findOne({ _id: /^ip:/ })
    await counters.updateOne({ _id: ip._id }, { $set: { reservations: Array.from({ length: 60 }, (_, index) => ({ id: `sample-${index}`, at: new Date() })) } })
    const next = await makeApplicant('blocked@auto.test')
    const result = await apply(job, next)
    expect(result.status).toBe(409)
    expect(result.body.code).toBe('APPLICATION_RATE_LIMITED')
    expect(await JobApplication.countDocuments()).toBe(1)
    expect(await Referral.countDocuments()).toBe(1)
  })
  it('requires reasons for manual control and pullback, keeps a timeline, and revokes employer profile access', async () => {
    await apply()
    const application = await JobApplication.findOne()
    await api('post', `/applications/${application._id}/pull-back`, {}).expect(403)
    await api('post', `/applications/${application._id}/pull-back`, { reason: 'PESO needs to review the record' }).expect(200)
    expect((await Referral.findOne()).status).toBe('withdrawn_by_admin')
    const list = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', employer.email))
    expect(list.body[0].applicantId).toBeNull()
    expect(JSON.stringify(list.body)).not.toContain(applicant.email)
    expect(list.body[0]).not.toHaveProperty('suitability')
    const jobs = await request(app).get('/api/jobs?status=mine').set(auth('Employer', employer.email))
    expect(jobs.body[0].applicants).toEqual([])
    const history = await request(app).get('/api/applications/mine').set(auth('Applicant', applicant.email))
    expect(history.body[0].status).toBe('withdrawn_by_admin')
    expect(history.body[0].message).toMatch(/remains in your history/)
    const detail = await api('get', `/applications/${application._id}`)
    expect(detail.body.history.some((entry) => entry.reason === 'PESO needs to review the record')).toBe(true)
    expect(await Notification.countDocuments({ type: 'application_review_update' })).toBe(1)
  })
  it('suspends and resumes receiving new applications while flagging existing ones', async () => {
    await apply()
    await api('post', `/employers/${employer._id}/suspension`, { suspended: true }).expect(403)
    await api('post', `/employers/${employer._id}/suspension`, { suspended: true, reason: 'PESO review' }).expect(200)
    const other = await makeApplicant('other@auto.test')
    expect((await apply(job, other)).body.code).toBe('EMPLOYER_APPLICATIONS_SUSPENDED')
    const list = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', employer.email))
    expect(list.body[0].employerSuspended).toBe(true)
    expect(list.body[0].applicantId.email).toBe(applicant.email)
    const board = await request(app).get('/api/jobs?status=approved').set(auth('Applicant', applicant.email))
    expect(board.body[0].employerBranding.receivingApplicationsSuspended).toBe(true)
    await api('post', `/employers/${employer._id}/suspension`, { suspended: false, reason: 'Review complete' }).expect(200)
    expect((await apply(job, other)).status).toBe(200)
    expect((await Employer.findById(employer._id)).applicationAccessHistory).toHaveLength(2)
  })
  it('creates an admin referral for a verified applicant without a prior application', async () => {
    const payload = { jobId: String(job._id), applicantIds: [String(applicant._id)] }
    await request(app).post('/api/referrals').set(auth('Admin', admin.email)).send(payload).expect(403)
    await request(app).post('/api/referrals').set(auth('Admin', admin.email)).send({ ...payload, reason: 'Applicant requested PESO assistance' }).expect(200)
    expect((await Referral.findOne()).source).toBe('admin')
    expect((await Referral.findOne()).referredBy).toEqual(admin._id)
    expect(await JobApplication.countDocuments()).toBe(1)
  })
  it('does not exceed hiring slots when two applicants are hired simultaneously', async () => {
    await JobPosting.updateOne({ _id: job._id }, { slots: 1 })
    const other = await makeApplicant('other@auto.test')
    await apply(); await apply(job, other)
    const referrals = await Referral.find()
    const results = await Promise.all(referrals.map((referral) => request(app).post('/api/hire-reports').set(auth('Employer', employer.email)).send({ applicantId: String(referral.applicantId), jobId: String(job._id), referralId: String(referral._id), status: 'hired' })))
    expect(results.map((entry) => entry.status).sort()).toEqual([200, 409])
    expect(await HireReport.countDocuments({ status: 'hired' })).toBe(1)
    expect((await JobPosting.findById(job._id)).hiredApplicantIds).toHaveLength(1)
  })
  it('protects admin oversight and settings and handles malformed IDs without 500s', async () => {
    for (const role of ['Applicant', 'Employer']) {
      const owner = role === 'Applicant' ? applicant : employer
      await request(app).get('/api/admin/referral-workflow/applications').set(auth(role, owner.email)).expect(403)
      await request(app).get('/api/admin/referral-workflow/settings').set(auth(role, owner.email)).expect(403)
      await request(app).put('/api/admin/referral-workflow/settings').set(auth(role, owner.email)).send({ automaticReferral: false }).expect(403)
    }
    expect((await request(app).post('/api/jobs/not-an-id/apply').set(auth('Applicant', applicant.email)).send({ sharingConsent: true })).status).toBe(409)
    expect((await api('get', '/applications/not-an-id')).status).toBe(403)
    expect((await api('get', '/applications?from=2026-02-31')).status).toBe(403)
    expect((await api('get', '/applications?page=1.8&limit=1.5')).status).toBe(200)
  })
  it('filters oversight, paginates, and immediately notifies admins for problem and no-show reports', async () => {
    await apply()
    const referral = await Referral.findOne()
    const list = await api('get', '/applications?source=auto&status=pending&limit=1')
    expect(list.body.total).toBe(1)
    expect(list.body.items[0].source).toBe('auto')
    const { Interview } = await import('../../models/applicationWorkflow.js')
    await Interview.create({ referralId: referral._id, applicationId: referral.applicationId, applicantId: applicant._id, employerId: employer._id, jobId: job._id, scheduledAt: new Date(Date.now() - 3600000), mode: 'In person', location: 'Demo office', status: 'confirmed' })
    for (const type of ['problem', 'no_show']) await request(app).post('/api/applications/reports').set(auth(type === 'no_show' ? 'Employer' : 'Applicant', type === 'no_show' ? employer.email : applicant.email)).send({ referralId: String(referral._id), type, reason: 'Please investigate this application.' }).expect(200)
    expect(await Notification.countDocuments({ type: 'application_problem', 'recipient.role': 'Admin' })).toBe(1)
    expect(await Notification.countDocuments({ type: 'application_no_show', 'recipient.role': 'Admin' })).toBe(1)
  })
})
