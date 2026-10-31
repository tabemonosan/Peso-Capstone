// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'

vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }), sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }), initMailer: vi.fn() }))
const { app, purgeExpiredVerificationDocuments } = await import('../../index.js')
const { Applicant, Employer, Admin, Referral, HireReport, Notification, DocumentFile } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting')
const secret = process.env.JWT_SECRET || 'dev-secret'
const auth = (role, email = `${role.toLowerCase()}@example.com`) => ({ Authorization: `Bearer ${jwt.sign({ role, email }, secret)}` })
let applicant, employer, job, referral
const payload = (extra = {}) => ({ applicantId: String(applicant._id), jobId: String(job._id), referralId: String(referral._id), status: 'hired', ...extra })

beforeAll(startTestDb, 60000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  await Admin.create({ email: 'admin@example.com', passwordHash: 'unused' })
  employer = await Employer.create({ email: 'employer@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', companyName: 'Example Works', phone: '09171234567' })
  applicant = await Applicant.create({
    email: 'applicant@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', phone: '09179876543',
    profile: { firstName: 'Juan', lastName: 'Cruz', location: 'Private Street, Legazpi City, Albay', addressCity: 'Legazpi City', addressProvince: 'Albay', skills: ['Excel'], education: [{ level: 'Tertiary', course: 'Computing' }], nsrp: { dob: '1990-01-01', sssNo: 'private-government-id', cellphone: '09179876543', addressStreet: 'Private Street' } },
    verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map((key) => [key, { versions: [{ version: 1, status: 'approved', data: Buffer.from('%PDF-original') }] }])),
  })
  job = await JobPosting.create({ title: 'Office Clerk', company: 'Example Works', createdBy: employer.email, status: 'approved', applicants: [{ email: applicant.email }] })
  referral = await Referral.create({ jobId: job._id, applicantId: applicant._id, employerId: employer._id, referredBy: (await Admin.findOne())._id, status: 'accepted' })
})

describe('PESO employment reporting', () => {
  it('rejects referrals to unapproved jobs or restricted applicants before creating records', async () => {
    await JobPosting.updateOne({ _id: job._id }, { status: 'pending' })
    const url = '/api/referrals'
    const body = { jobId: String(job._id), applicantIds: [String(applicant._id)] }
    expect((await request(app).post(url).set(auth('Admin')).send(body)).status).toBe(409)
    await JobPosting.updateOne({ _id: job._id }, { status: 'approved' })
    await Applicant.updateOne({ _id: applicant._id }, { verificationStatus: 'restricted' })
    expect((await request(app).post(url).set(auth('Admin')).send(body)).status).toBe(403)
    expect(await Referral.countDocuments()).toBe(1)
  })
  it('resolves admin tracking details without depending on a separately loaded user or jobs page', async () => {
    await HireReport.create({ applicantId: applicant._id, employerId: employer._id, jobId: job._id, status: 'hired', reportedByRole: 'Employer' })
    for (const suffix of ['', '?page=1&limit=1']) {
      const result = await request(app).get(`/api/hire-reports${suffix}`).set(auth('Admin'))
      expect(result.status).toBe(200)
      const record = suffix ? result.body.items[0] : result.body[0]
      expect(record).toMatchObject({ applicant: { name: 'Juan Cruz', email: applicant.email }, employer: { name: 'Example Works', email: employer.email }, job: { title: 'Office Clerk' } })
      expect(JSON.stringify(record)).not.toContain('private-government-id')
    }
    const own = await request(app).get('/api/hire-reports').set(auth('Employer'))
    expect(own.body[0]).not.toHaveProperty('applicant')
  })

  it('does not allow an employer to open an applicant NSRP document', async () => {
    const result = await request(app).get(`/api/job-applications/view?jobId=${job._id}&email=${applicant.email}`).set(auth('Employer'))
    expect(result.status).toBe(403)
  })
  it('pairs employer and applicant statements for the admin window, with names and history', async () => {
    await HireReport.create({ applicantId: applicant._id, employerId: employer._id, jobId: job._id, status: 'deployed', reportedByRole: 'Employer', employmentDate: '2026-02-01', notes: 'Started work', history: [{ status: 'hired', employmentDate: '2026-01-01', reportedAt: new Date('2026-01-01') }] })
    await HireReport.create({ applicantId: applicant._id, employerId: employer._id, jobId: job._id, status: 'hired', reportedByRole: 'Applicant', employmentDate: '2026-01-01', notes: 'I accepted the offer' })
    const result = await request(app).get('/api/admin/employment-updates?page=1&limit=1').set(auth('Admin'))
    expect(result.status).toBe(200)
    expect(result.body.total).toBe(1)
    expect(result.body.items[0]).toMatchObject({ applicant: { name: 'Juan Cruz', email: applicant.email }, employer: { name: 'Example Works', email: employer.email }, job: { title: 'Office Clerk' }, applicantReport: { status: 'hired', notes: 'I accepted the offer' }, employerReport: { status: 'deployed', notes: 'Started work', history: [{ status: 'hired' }] } })
    expect(JSON.stringify(result.body)).not.toContain('private-government-id')
    expect(JSON.stringify(result.body)).not.toContain('passwordHash')
  })

  it('paginates employment groups, filters notification context, and supports one-sided legacy reports', async () => {
    await HireReport.collection.insertOne({ applicantId: applicant._id, employerId: employer._id, jobId: job._id, status: 'hired', reportedAt: new Date('2026-01-01') })
    const otherJob = await JobPosting.create({ title: 'Another position', company: 'Example Works', createdBy: employer.email })
    await HireReport.create({ applicantId: applicant._id, employerId: employer._id, jobId: otherJob._id, status: 'hired', reportedByRole: 'Applicant' })
    const first = await request(app).get('/api/admin/employment-updates?page=1&limit=1').set(auth('Admin'))
    expect(first.body.total).toBe(2)
    expect(first.body.totalPages).toBe(2)
    expect(first.body.items).toHaveLength(1)
    expect(first.body.items[0].applicantReport.status).toBe('hired')
    expect(first.body.items[0].employerReport).toBeNull()
    const scoped = await request(app).get(`/api/admin/employment-updates?jobId=${job._id}&applicantId=${applicant._id}`).set(auth('Admin'))
    expect(scoped.body.total).toBe(1)
    expect(scoped.body.items[0].employerReport.status).toBe('hired')
    expect(scoped.body.items[0].applicantReport).toBeNull()
  })

  it('restricts the hiring updates window to admins and validates its filters', async () => {
    expect((await request(app).get('/api/admin/employment-updates')).status).toBe(401)
    for (const role of ['Applicant', 'Employer']) expect((await request(app).get('/api/admin/employment-updates').set(auth(role))).status).toBe(403)
    expect((await request(app).get('/api/admin/employment-updates?jobId=invalid').set(auth('Admin'))).status).toBe(400)
    expect((await request(app).get('/api/admin/employment-updates').set(auth('Admin'))).body).toMatchObject({ items: [], total: 0 })
  })

  it('preserves restrictions through profile/document reads, blocks existing sessions, and explicitly unrestricts', async () => {
    const bcrypt = (await import('bcryptjs')).default
    await Applicant.updateOne({ _id: applicant._id }, { passwordHash: await bcrypt.hash('Password123!', 4) })
    const url = `/api/applicants/${applicant._id}/verification`
    expect((await request(app).put(url).set(auth('Admin')).send({ status: 'restricted' })).status).toBe(200)
    const profile = await request(app).get('/api/profile').set(auth('Applicant'))
    expect(profile.body.verificationStatus).toBe('restricted')
    const documents = await request(app).get(`/api/applicants/${applicant._id}/verification-documents`).set(auth('Admin'))
    expect(documents.body.verificationStatus).toBe('restricted')
    expect((await request(app).get('/api/dashboard').set(auth('Applicant'))).status).toBe(403)
    expect((await request(app).get('/api/jobs').set(auth('Applicant'))).status).toBe(403)
    expect((await request(app).post('/api/login').send({ email: applicant.email, password: 'Password123!' })).status).toBe(403)
    expect((await request(app).put(url).set(auth('Applicant')).send({ action: 'unrestrict' })).status).toBe(403)
    const restored = await request(app).put(url).set(auth('Admin')).send({ action: 'unrestrict' })
    expect(restored.status).toBe(200)
    expect(restored.body.verificationStatus).toBe('approved')
    expect((await request(app).get('/api/dashboard').set(auth('Applicant'))).status).toBe(200)
    expect((await request(app).post('/api/login').send({ email: applicant.email, password: 'Password123!' })).status).toBe(200)
    expect(await Notification.exists({ 'recipient.id': applicant._id, title: 'Account restriction removed' })).toBeTruthy()
    expect((await request(app).put(url).set(auth('Admin')).send({ action: 'unrestrict' })).status).toBe(409)
  })

  it.each(['pending', 'rejected'])('unrestricts without approving documents that are %s', async (documentStatus) => {
    const url = `/api/applicants/${applicant._id}/verification`
    await Applicant.updateOne({ _id: applicant._id }, { verificationStatus: 'restricted', 'verificationDocuments.validId1.versions.0.status': documentStatus })
    const result = await request(app).put(url).set(auth('Admin')).send({ action: 'unrestrict' })
    expect(result.status).toBe(200)
    expect(result.body.verificationStatus).toBe(documentStatus === 'pending' ? 'under_review' : 'declined')
    expect((await Applicant.findById(applicant._id)).verificationDocuments.validId1.versions[0].status).toBe(documentStatus)
  })

  it('accepts one correction request from the owner, preserves approval, and exposes it to PESO', async () => {
    const url = '/api/profile/verification-documents/nsrpForm/correction-request'
    expect((await request(app).post(url).send({ reason: 'My contact details changed' })).status).toBe(401)
    expect((await request(app).post(url).set(auth('Employer')).send({ reason: 'My contact details changed' })).status).toBe(403)
    expect((await request(app).post(url).set(auth('Applicant')).send({ reason: 'Hi' })).status).toBe(400)
    const sent = await request(app).post(url).set(auth('Applicant')).send({ reason: 'My contact details changed' })
    expect(sent.status).toBe(200)
    expect((await request(app).post(url).set(auth('Applicant')).send({ reason: 'My contact details changed' })).status).toBe(409)
    const stored = await Applicant.findById(applicant._id).lean()
    expect(stored.verificationDocuments.nsrpForm.versions[0].status).toBe('approved')
    expect(await Notification.countDocuments({ type: 'document_correction_requested', 'recipient.role': 'Admin' })).toBe(1)
    const review = await request(app).get(`/api/applicants/${applicant._id}/verification-documents`).set(auth('Admin'))
    expect(review.body.documents.find((doc) => doc.docKey === 'nsrpForm').correctionRequest.reason).toBe('My contact details changed')
    const reopened = await request(app).put(`/api/applicants/${applicant._id}/verification-documents/nsrpForm`).set(auth('Admin')).send({ action: 'revert', reason: 'Applicant requested an updated contact number' })
    expect(reopened.status).toBe(200)
    expect((await Applicant.findById(applicant._id)).verificationDocuments.nsrpForm.correctionRequest?.requestedAt).toBeUndefined()
    expect((await request(app).post(url).set(auth('Applicant')).send({ reason: 'My contact details changed' })).status).toBe(409)
  })
  it('shares only contact details and job qualifications in both employer referral response formats', async () => {
    for (const suffix of ['', '?page=1&limit=10']) {
      const response = await request(app).get(`/api/referrals/employer/${employer._id}${suffix}`).set(auth('Employer'))
      expect(response.status).toBe(200)
      const summary = (response.body.items || response.body)[0].applicantId
      expect(summary).toMatchObject({ email: applicant.email, phone: applicant.phone, profile: { firstName: 'Juan', skills: ['Excel'], location: 'Legazpi City, Albay' } })
      expect(summary.profile.education[0].course).toBe('Computing')
      expect(summary.profile).not.toHaveProperty('nsrp')
      expect(summary.profile).not.toHaveProperty('dob')
      expect(JSON.stringify(summary)).not.toContain('Private Street')
      expect(summary).not.toHaveProperty('verificationDocuments')
    }
    for (const path of [`/api/applicants/${applicant._id}/nsrp-verification`, `/api/applicants/${applicant._id}/nsrp-signature`, `/api/applicants/${applicant._id}/verification-documents`, `/api/job-applications/view?jobId=${job._id}&email=${applicant.email}`]) {
      expect((await request(app).get(path).set(auth('Employer'))).status).toBe(403)
    }
  })

  it('keeps employer and applicant reports separate, persists updates, and notifies PESO', async () => {
    const employerReport = await request(app).post('/api/hire-reports').set(auth('Employer')).send(payload({ employmentDate: '2026-01-02', notes: 'Confirmed by HR' }))
    expect(employerReport.status).toBe(200)
    expect(employerReport.body.reportedByRole).toBe('Employer')
    const applicantReport = await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ notes: 'I accepted the offer' }))
    expect(applicantReport.status).toBe(200)
    expect(applicantReport.body.reportedByRole).toBe('Applicant')
    expect(applicantReport.body._id).not.toBe(employerReport.body._id)
    const deployed = await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ status: 'deployed', employmentDate: '2026-02-01' }))
    expect(deployed.status).toBe(200)
    expect(deployed.body._id).toBe(applicantReport.body._id)
    expect(deployed.body.history[0]).toMatchObject({ status: 'hired', notes: 'I accepted the offer' })
    expect(await HireReport.countDocuments()).toBe(2)
    expect((await HireReport.findById(employerReport.body._id)).status).toBe('hired')
    const adminReports = await request(app).get('/api/hire-reports').set(auth('Admin'))
    expect(adminReports.body).toHaveLength(2)
    expect(await Notification.countDocuments({ 'recipient.role': 'Admin', type: 'hire_report_submitted' })).toBe(3)
    expect(await Notification.exists({ 'recipient.id': applicant._id, type: 'employment_update' })).toBeTruthy()
    const dashboard = await request(app).get('/api/dashboard').set(auth('Admin'))
    expect(dashboard.body.stats.hires).toBe(1)
  })

  it('allows employers to report not hired without counting it as a hire or allowing a rating', async () => {
    const result = await request(app).post('/api/hire-reports').set(auth('Employer')).send(payload({ status: 'not_hired', notes: 'Position filled' }))
    expect(result.status).toBe(200)
    const dashboard = await request(app).get('/api/dashboard').set(auth('Admin'))
    expect(dashboard.body.stats.hires).toBe(0)
    expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ status: 'not_hired' }))).status).toBe(400)
    expect((await request(app).post('/api/ratings').set(auth('Employer')).send({ toUserId: String(applicant._id), toRole: 'applicant', hireReportId: result.body._id, score: 5 })).status).toBe(400)
  })

  it('rejects another applicant or employer and mismatched referrals', async () => {
    const otherApplicant = await Applicant.create({ email: 'other@example.com', passwordHash: 'unused', profile: { firstName: 'Other', lastName: 'User', location: 'Albay' }, emailVerified: true, verificationDocuments: applicant.verificationDocuments })
    expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ applicantId: String(otherApplicant._id) }))).status).toBe(403)
    await Employer.create({ email: 'other-employer@example.com', passwordHash: 'unused', verificationStatus: 'approved', emailVerified: true })
    expect((await request(app).post('/api/hire-reports').set(auth('Employer', 'other-employer@example.com')).send(payload())).status).toBe(403)
    const otherJob = await JobPosting.create({ title: 'Different', company: 'Example', createdBy: employer.email })
    expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ jobId: String(otherJob._id) }))).status).toBe(400)
    expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ jobId: String(otherJob._id), referralId: undefined }))).status).toBe(403)
  })

  it('validates official dates, identifiers and notes, and requires verified email', async () => {
    for (const extra of [{ employmentDate: '2026-02-30' }, { employmentDate: '9999-01-01' }, { employmentDate: 1 }, { notes: 'x'.repeat(1001) }, { jobId: 'invalid' }]) {
      expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload(extra))).status).toBe(400)
    }
    await Applicant.updateOne({ _id: applicant._id }, { emailVerified: false })
    expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload())).status).toBe(403)
  })

  it('scopes report reads to the authenticated reporter, even when filters request another employer', async () => {
    await request(app).post('/api/hire-reports').set(auth('Employer')).send(payload())
    await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload())
    for (const role of ['Employer', 'Applicant']) {
      for (const suffix of ['', '?page=1&employerId=000000000000000000000001']) {
        const response = await request(app).get(`/api/hire-reports${suffix}`).set(auth(role))
        expect(response.status).toBe(200)
        const reports = response.body.items || response.body
        expect(reports).toHaveLength(1)
        expect(reports[0].reportedByRole).toBe(role)
      }
    }
  })

  it('requires employer acceptance before showing or submitting applicant employment reports', async () => {
    for (const status of ['pending', 'declined']) {
      await Referral.updateOne({ _id: referral._id }, { status })
      expect((await request(app).get('/api/employment-opportunities/mine').set(auth('Applicant'))).body).toEqual([])
      for (const extra of [{}, { referralId: undefined }]) {
        const denied = await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload(extra))
        expect(denied.status).toBe(403)
        expect(denied.body.code).toBe('REFERRAL_NOT_ACCEPTED')
      }
    }
    const accepted = await request(app).put(`/api/referrals/${referral._id}/respond`).set(auth('Employer')).send({ status: 'accepted' })
    expect(accepted.status).toBe(200)
    const opportunities = await request(app).get('/api/employment-opportunities/mine').set(auth('Applicant'))
    expect(opportunities.body[0]).toMatchObject({ referralId: String(referral._id), status: 'accepted', employerId: { email: employer.email, phone: employer.phone } })
    expect(opportunities.body[0].employerId).not.toHaveProperty('passwordHash')
    expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ referralId: undefined }))).status).toBe(200)
    await Referral.deleteMany({})
    expect((await request(app).get('/api/employment-opportunities/mine').set(auth('Applicant'))).body).toEqual([])
    expect((await request(app).post('/api/hire-reports').set(auth('Applicant')).send(payload({ referralId: undefined }))).status).toBe(403)
  })

  it('updates legacy employer reports without creating a second report', async () => {
    const legacy = await HireReport.collection.insertOne({ applicantId: applicant._id, employerId: employer._id, jobId: job._id, referralId: referral._id, status: 'hired', reportedAt: new Date('2026-01-01') })
    const response = await request(app).post('/api/hire-reports').set(auth('Employer')).send(payload({ status: 'deployed' }))
    expect(response.status).toBe(200)
    expect(response.body._id).toBe(String(legacy.insertedId))
    expect(response.body.history[0].status).toBe('hired')
  })

  it('retains NSRP binaries and answers while supporting document binaries expire', async () => {
    for (const slot of ['nsrpForm', 'birthCertificate']) {
      await DocumentFile.create({ applicant: applicant._id, slot, version: 1, side: 'front', mimetype: 'application/pdf', size: 8, data: Buffer.from('%PDF-data') })
    }
    // Bypass timestamps only for this isolated test fixture.
    await Applicant.collection.updateOne({ _id: applicant._id }, { $set: { updatedAt: new Date('2020-01-01') } })
    await purgeExpiredVerificationDocuments()
    const stored = await Applicant.findById(applicant._id).select('+verificationDocuments.nsrpForm.versions.data +verificationDocuments.birthCertificate.versions.data').lean()
    expect(stored.profile.nsrp.sssNo).toBe('private-government-id')
    expect(stored.verificationDocuments.nsrpForm.versions[0].data).toBeTruthy()
    expect(stored.verificationDocuments.birthCertificate.versions[0].data).toBeUndefined()
    expect(stored.verificationDocuments.birthCertificate.versions[0].status).toBe('approved')
    expect(await DocumentFile.exists({ applicant: applicant._id, slot: 'nsrpForm' })).toBeTruthy()
    expect(await DocumentFile.exists({ applicant: applicant._id, slot: 'birthCertificate' })).toBeNull()
  })
})
