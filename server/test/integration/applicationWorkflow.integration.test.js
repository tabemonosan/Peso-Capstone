// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { startTestDb, stopTestDb, clearDb, jobApplicationRequest } from './helpers.js'
vi.mock('node:dns/promises', () => ({ Resolver: class { async resolveMx() { return [{ exchange: 'mail.example.test', priority: 10 }] } } }))
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app, referralWorkflow, applicationWorkflow } = await import('../../index.js')
const { Applicant, Employer, Admin, Referral, HireReport, Notification } = await import('../../models/collections.js')
const { Interview, ApplicationReport } = await import('../../models/applicationWorkflow.js')
const { seedFullCycle, FULL_CYCLE_COUNTS } = await import('../../scripts/seed-approved-jobs.js')
const { publicApplication } = await import('../../services/applicationProgress.js')
const JobPosting = mongoose.model('JobPosting')
const DAY = 86400000
let applicant, employer, admin, job
const auth = (role, account) => ({ Authorization: `Bearer ${jwt.sign({ role, email: account.email }, process.env.JWT_SECRET || 'dev-secret')}` })
const api = (method, path, role = 'Admin', account = admin, body) => request(app)[method](`/api/workflow${path}`).set(auth(role, account)).send(body)
const apply = (account = applicant, posting = job) => jobApplicationRequest(request(app).post(`/api/jobs/${posting._id}/apply`).set(auth('Applicant', account)), { email: account.email })
const score = async (account = applicant) => Applicant.findById(account._id).select('+trustValue +trustEvents').lean()
async function makeApplicant(email = 'applicant@workflow.test') {
  return Applicant.create({ email, passwordHash: await bcrypt.hash('DemoPassword123!', 4), emailVerified: true, verificationStatus: 'approved', phone: '09171234567', profile: { firstName: 'Demo', lastName: 'Applicant', location: 'Albay', skills: ['Driving'], nsrp: { tin: 'PRIVATE-TIN' } }, verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map(key => [key, { uploads: 1, versions: [{ version: 1, status: 'approved', sourceType: key === 'nsrpForm' ? 'generated' : undefined, data: Buffer.from('%PDF-demo'), originalName: `${key}.pdf`, mimetype: 'application/pdf' }] }])) })
}
async function meetingFor(account = applicant) {
  const submission = await apply(account)
  expect(submission.status, JSON.stringify(submission.body)).toBe(200)
  const referral = await Referral.findOne({ applicantId: account._id })
  const result = await api('post', `/referrals/${referral._id}/interview`, 'Employer', employer, { scheduledAt: new Date(Date.now() + DAY).toISOString(), mode: 'In person', city: 'Manito', barangay: 'Nagotgot', province: 'Albay', landmark: 'Demo office', message: 'Bring your resume.' }).expect(200)
  return { referral, meeting: result.body }
}
async function reportNoShow(account = applicant) {
  const result = await meetingFor(account)
  await api('post', `/interviews/${result.meeting.id}/respond`, 'Applicant', account, { action: 'confirm' }).expect(200)
  await Interview.updateOne({ _id: result.meeting.id }, { scheduledAt: new Date(Date.now() - DAY) })
  const report = await request(app).post('/api/applications/reports').set(auth('Employer', employer)).send({ referralId: String(result.referral._id), type: 'no_show', reason: 'PRIVATE employer contact notes' }).expect(200)
  return { ...result, report: report.body }
}
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  applicant = await makeApplicant()
  employer = await Employer.create({ email: 'employer@workflow.test', passwordHash: 'test', emailVerified: true, verificationStatus: 'approved', companyName: 'Demo Company' })
  admin = await Admin.create({ email: 'admin@workflow.test', passwordHash: 'test' })
  job = await JobPosting.create({ title: 'Demo Driver', company: employer.companyName, createdBy: employer.email, status: 'approved', slots: 30, deadline: new Date(Date.now() + 30 * DAY), skills: ['Driving'] })
})

describe('applications, interviews and admin-confirmed events', () => {
  it('removes a declined invitation from active applications, returns the open job, and allows a fresh application', async () => {
    const { meeting, referral } = await meetingFor()
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'decline', reason: 'Schedule conflict' }).expect(200)
    const mine = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(mine.body.total).toBe(0)
    const legacy = await request(app).get('/api/applications/mine').set(auth('Applicant', applicant)).expect(200)
    expect(legacy.body).toHaveLength(0)
    const applied = await request(app).get('/api/jobs?status=applied').set(auth('Applicant', applicant)).expect(200)
    expect(applied.body).toHaveLength(0)
    const jobs = await request(app).get('/api/jobs?status=approved&page=1&limit=10').set(auth('Applicant', applicant)).expect(200)
    expect(jobs.body.items.some(posting => posting._id === String(job._id))).toBe(true)
    expect(jobs.body.items.find(posting => posting._id === String(job._id)).applicants).toHaveLength(0)
    expect((await score()).trustValue).toBe(100)
    const reapplied = await apply()
    expect(reapplied.status, JSON.stringify(reapplied.body)).toBe(200)
    expect(reapplied.body.deliveryStatus).toBe('delivered')
    expect(await Referral.countDocuments()).toBe(1)
    expect(await Interview.countDocuments()).toBe(0)
    const current = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(current.body.total).toBe(1)
    expect(current.body.items[0]).toMatchObject({ status: 'pending', interview: null })
    expect(await mongoose.connection.db.collection('application_attempts').countDocuments({ applicationId: referral.applicationId })).toBe(1)
    expect((await mongoose.model('JobApplication').findById(referral.applicationId).select('+resumeFile.data')).resumeFile.data).toBeTruthy()
    await apply().expect(409)
    await api('post', `/referrals/${referral._id}/interview`, 'Employer', employer, { scheduledAt: new Date(Date.now() + DAY).toISOString(), mode: 'In person', city: 'Manito', barangay: 'Nagotgot', province: 'Albay' }).expect(200)
  })
  it('does not allow reapplying to closed jobs after declining an invitation', async () => {
    const { meeting } = await meetingFor()
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'decline', reason: 'Unavailable' }).expect(200)
    await JobPosting.updateOne({ _id: job._id }, { acceptingApplications: false })
    await apply().expect(409)
    expect(await mongoose.connection.db.collection('application_attempts').countDocuments()).toBe(0)
  })
  it('allows only one concurrent reapplication and charges a new quota reservation', async () => {
    const { meeting } = await meetingFor()
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'decline', reason: 'Schedule conflict' }).expect(200)
    const results = await Promise.all([apply(), apply()])
    expect(results.map(response => response.status).sort()).toEqual([200, 409])
    expect(await mongoose.connection.db.collection('application_attempts').countDocuments()).toBe(1)
    const quota = await mongoose.connection.db.collection('application_rate_limits').findOne({ _id: { $regex: `^account:${applicant._id}:` } })
    expect(quota.reservations).toHaveLength(2)
  })
  it('honors applicant suspension and the daily quota when reapplying after declining', async () => {
    const { meeting } = await meetingFor()
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'decline', reason: 'Schedule conflict' }).expect(200)
    await Applicant.updateOne({ _id: applicant._id }, { applyingSuspendedAt: new Date() })
    await apply().expect(403)
    await Applicant.updateOne({ _id: applicant._id }, { $unset: { applyingSuspendedAt: '' } })
    await mongoose.connection.db.collection('application_rate_limits').updateOne({ _id: { $regex: `^account:${applicant._id}:` } }, { $set: { reservations: Array.from({ length: 10 }, (_, index) => ({ id: `demo-${index}`, at: new Date() })) } })
    const response = await apply().expect(409)
    expect(response.body.code).toBe('DAILY_APPLICATION_LIMIT')
    expect(await mongoose.connection.db.collection('application_attempts').countDocuments()).toBe(0)
  })
  it('keeps manual review routing working when an applicant reapplies after declining', async () => {
    const { meeting, referral } = await meetingFor()
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'decline', reason: 'Need a later interview' }).expect(200)
    await referralWorkflow.setAutomatic(false, admin.email)
    const result = await apply()
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.deliveryStatus).toBe('pending_admin')
    expect((await Referral.findById(referral._id)).status).toBe('withdrawn')
    await request(app).post('/api/referrals').set(auth('Admin', admin)).send({ jobId: String(job._id), applicantIds: [String(applicant._id)], reason: 'Reviewed new application' }).expect(200)
    expect((await Referral.findById(referral._id)).status).toBe('pending')
    expect((await api('get', '/mine', 'Applicant', applicant)).body.items[0].status).toBe('pending')
  })
  it('restores the declined attempt if reapplication fails during publication', async () => {
    const { meeting, referral } = await meetingFor()
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'decline', reason: 'Schedule conflict' }).expect(200)
    const update = Referral.updateOne.bind(Referral)
    const failure = vi.spyOn(Referral, 'updateOne').mockImplementation((filter, ...args) => filter.deliveryState === 'processing' ? Promise.reject(new Error('Publication failure')) : update(filter, ...args))
    try { await apply().expect(409) } finally { failure.mockRestore() }
    expect((await Referral.findById(referral._id)).status).toBe('withdrawn')
    expect((await Interview.findById(meeting.id)).status).toBe('declined')
    expect((await mongoose.model('JobApplication').findById(referral.applicationId)).invitationDeclinedAt).toBeTruthy()
    expect((await JobPosting.findById(job._id)).applicants).toHaveLength(0)
    expect(await mongoose.connection.db.collection('application_attempts').countDocuments()).toBe(0)
    await apply().expect(200)
  })
  it.each(['reschedule', 'decline'])('rejects %s reasons over 50 characters and accepts the boundary', async action => {
    const { meeting } = await meetingFor()
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action, reason: 'a'.repeat(51) }).expect(403)
    expect((await Interview.findById(meeting.id)).status).toBe('invited')
    const response = await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action, reason: 'a'.repeat(50) }).expect(200)
    expect(response.body.responseMessage).toHaveLength(50)
  })
  it('validates future interview times and the complete municipality/barangay/province address on the server', async () => {
    const { referral } = await meetingFor()
    const valid = { scheduledAt: new Date(Date.now() + DAY).toISOString(), mode: 'In person', city: 'Manito', barangay: 'Nagotgot', province: 'Albay' }
    for (const change of [{ scheduledAt: new Date(Date.now() - DAY).toISOString() }, { scheduledAt: 'invalid' }, { scheduledAt: new Date(Date.now() + 366 * DAY).toISOString() }, { city: '' }, { barangay: '' }, { province: '' }, { province: 'Other' }, { message: 'a'.repeat(51) }, { city: 'Oas', barangay: 'Nagotgot' }]) {
      await api('post', `/referrals/${referral._id}/interview`, 'Employer', employer, { ...valid, ...change }).expect(403)
    }
    const updated = await api('post', `/referrals/${referral._id}/interview`, 'Employer', employer, { ...valid, landmark: '', message: 'a'.repeat(50), location: 'Ignore forged free text' }).expect(200)
    expect(updated.body).toMatchObject({ city: 'Manito', barangay: 'Nagotgot', province: 'Albay', landmark: '', location: 'Nagotgot, Manito, Albay' })
    const stored = await Interview.findOne({ referralId: referral._id }).lean()
    expect(stored.city).toBe('Manito')
    await api('post', `/referrals/${referral._id}/interview`, 'Employer', employer, { ...valid, mode: 'Online', meetingLink: '' }).expect(403)
    await api('post', `/referrals/${referral._id}/interview`, 'Employer', employer, { ...valid, mode: 'Online', meetingLink: 'https://example.invalid/demo', landmark: 'Demo office' }).expect(200)
  })
  it('derives actions for every status and strips private fields for every public response', async () => {
    const statuses = ['pending_admin', 'pending', 'accepted', 'declined', 'declined_by_admin', 'withdrawn', 'withdrawn_by_admin', 'hired', 'deployed', 'not_hired']
    for (const status of statuses) {
      const result = publicApplication({ _id: 'a', jobId: 'j', referralId: 'r', deliveryStatus: status === 'pending' || status === 'accepted' || status === 'declined' ? 'delivered' : status, referral: { status, history: [{ action: 'reviewed', status, by: 'PRIVATE-admin', reason: 'PRIVATE-reason', at: new Date() }] }, trustValue: 1, reviewQueue: 'low_trust', adminNotes: 'PRIVATE-notes', employerContactNotes: 'PRIVATE-contact' })
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE|trustValue|reviewQueue|adminNotes|employerContactNotes/)
      expect(result.actions.includes('withdraw')).toBe(['pending_admin', 'pending', 'accepted'].includes(status))
    }
    const { referral, meeting } = await meetingFor()
    let mine = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(mine.body.items[0].actions).toEqual(expect.arrayContaining(['confirm', 'reschedule', 'decline', 'withdraw', 'report_problem']))
    await Referral.updateOne({ _id: referral._id }, { $push: { history: { action: 'review', status: 'pending', by: 'PRIVATE-admin', reason: 'PRIVATE-reason' } } })
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'reschedule', reason: 'Please use tomorrow afternoon.' }).expect(200)
    for (const path of ['/api/workflow/mine', '/api/applications/mine', '/api/profile']) {
      const response = await request(app).get(path).set(auth('Applicant', applicant)).expect(200)
      expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE-admin|PRIVATE-reason|trustValue|trustEvents|reviewQueue|reviewReason/)
    }
    mine = await api('get', '/mine?limit=1&order=asc', 'Applicant', applicant).expect(200)
    expect(mine.body).toMatchObject({ total: 1, page: 1, limit: 1 })
    expect(mine.body.items[0].status).toBe('reschedule_requested')
    expect(mine.body.items[0].history.filter(entry => entry.action === 'interview_invited')).toHaveLength(1)
    expect(mine.body.items[0].history.filter(entry => entry.action === 'interview_reschedule_requested')).toHaveLength(1)
    await api('get', '/admin/applicants', 'Applicant', applicant).expect(403)
  })

  it('allows login and data access during suspension, blocks applying and confirming, and lifting restores both', async () => {
    const { meeting } = await meetingFor()
    await api('post', `/admin/applicants/${applicant._id}/suspension`, 'Admin', admin, { suspended: true, reason: '' }).expect(403)
    await api('post', `/admin/applicants/${applicant._id}/suspension`, 'Admin', admin, { suspended: true, reason: 'Demo review required' }).expect(200)
    const second = await JobPosting.create({ title: 'Other Driver', company: employer.companyName, createdBy: employer.email, status: 'approved', skills: ['Driving'] })
    await apply(applicant, second).expect(403)
    await expect(referralWorkflow.checkEligibility({ email: applicant.email, jobId: second._id, manual: true })).rejects.toMatchObject({ code: 'APPLICANT_SUSPENDED' })
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'confirm' }).expect(403)
    await request(app).post('/api/login').send({ email: applicant.email, password: 'DemoPassword123!' }).expect(200)
    const mine = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(mine.body.account).toMatchObject({ applyingSuspended: true, suspensionReason: 'Demo review required' })
    expect(mine.body.items[0].actions).not.toContain('confirm')
    await api('post', '/appeals', 'Applicant', applicant, { reason: 'Please reconsider this suspension.' }).expect(200)
    const notification = await Notification.findOne({ type: 'application_suspension_changed' }).lean()
    expect(notification.message).toContain('Demo review required')
    expect(notification.link).toBe('/my-applications')
    await api('post', `/admin/applicants/${applicant._id}/suspension`, 'Admin', admin, { suspended: false, reason: 'Review completed' }).expect(200)
    await api('post', `/interviews/${meeting.id}/respond`, 'Applicant', applicant, { action: 'confirm' }).expect(200)
    await apply(applicant, second).expect(200)
    expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('approved')
    expect(await mongoose.connection.db.collection('referral_audit').countDocuments({ applicantId: applicant._id, action: /applicant_application/ })).toBe(2)
  })

  it.each([false, true])('routes low-trust applicants only when the optional setting is %s', async enabled => {
    const normal = await makeApplicant('normal@workflow.test')
    await applicationWorkflow.confirmEvent({ email: admin.email }, { applicantId: applicant._id, type: 'manual_adjustment', delta: -60, eventKey: 'routing-fixture', reason: 'Demo adjustment' })
    if (enabled) await referralWorkflow.setLowTrustRouting(true, admin.email)
    expect((await referralWorkflow.getSettings()).lowTrustRouting).toBe(enabled)
    const low = await apply(), regular = await apply(normal)
    expect(low.status, JSON.stringify(low.body)).toBe(200)
    expect(regular.status, JSON.stringify(regular.body)).toBe(200)
    expect(low.body.deliveryStatus).toBe(enabled ? 'pending_admin' : 'delivered')
    expect(regular.body.deliveryStatus).toBe('delivered')
    const mine = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(JSON.stringify(mine.body)).not.toMatch(/trust|reviewQueue|Demo adjustment/i)
    if (enabled) {
      expect(mine.body.items[0].message).toBe('Your application is being reviewed.')
      const received = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', employer)).expect(200)
      expect(received.body).toHaveLength(1)
      await api('post', `/admin/applications/${low.body.applicationId}/review`, 'Admin', admin, { decision: 'approved', reason: 'PRIVATE clearance notes' }).expect(200)
      expect(await Referral.countDocuments({ applicantId: applicant._id })).toBe(1)
      const updated = await api('get', '/mine', 'Applicant', applicant).expect(200)
      expect(JSON.stringify(updated.body)).not.toContain('PRIVATE')
      expect(await mongoose.connection.db.collection('referral_audit').countDocuments({ action: 'application_routed_for_review' })).toBe(1)
    }
  })

  it('requires a reason to decline queued applications and keeps the reason private', async () => {
    await referralWorkflow.setLowTrustRouting(true, admin.email)
    await Applicant.collection.updateOne({ _id: applicant._id }, { $set: { trustValue: 10 } })
    const result = await apply().expect(200)
    await api('post', `/admin/applications/${result.body.applicationId}/review`, 'Admin', admin, { decision: 'declined', reason: '' }).expect(403)
    await api('post', `/admin/applications/${result.body.applicationId}/review`, 'Admin', admin, { decision: 'declined', reason: 'PRIVATE admin decision' }).expect(200)
    const mine = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(mine.body.items[0].status).toBe('declined_by_admin')
    expect(mine.body.items[0].actions).toEqual(['view_outcome'])
    expect(JSON.stringify(mine.body)).not.toMatch(/PRIVATE|trustValue|reviewQueue/)
  })

  it.each(['confirmed', 'dismissed'])('keeps no-show reports separate from ratings and changes trust only if admin %s', async decision => {
    const { report } = await reportNoShow()
    expect((await score()).trustValue).toBe(100)
    if (decision === 'confirmed') await api('post', `/admin/reports/${encodeURIComponent(report.id)}/review`, 'Admin', admin, { decision, reason: 'Premature' }).expect(409)
    let mine = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(mine.body.items[0].actions).toContain('respond_no_show')
    expect(+new Date(report.responseDeadline) - +new Date(mine.body.items[0].noShowReport.reportedAt)).toBe(7 * DAY)
    await api('post', `/reports/${encodeURIComponent(report.id)}/respond`, 'Applicant', applicant, { response: 'My factual explanation' }).expect(200)
    expect((await score()).trustValue).toBe(100)
    await api('post', `/admin/reports/${encodeURIComponent(report.id)}/review`, 'Admin', admin, { decision, reason: 'PRIVATE admin evidence review' }).expect(200)
    await api('post', `/admin/reports/${encodeURIComponent(report.id)}/review`, 'Admin', admin, { decision, reason: 'Retry same decision' }).expect(200)
    const account = await score()
    expect(account.trustValue).toBe(decision === 'confirmed' ? 80 : 100)
    expect(account.trustEvents).toHaveLength(decision === 'confirmed' ? 1 : 0)
    mine = await api('get', '/mine', 'Applicant', applicant).expect(200)
    expect(mine.body.items[0].actions).toContain('view_outcome')
    expect(JSON.stringify(mine.body)).not.toMatch(/PRIVATE|trustValue|trustEvents|reviewReason|reviewedBy/)
  })

  it('rejects expired no-show responses and applicant-authored no-show reports', async () => {
    const { report, referral } = await reportNoShow()
    await ApplicationReport.updateOne({ _id: report.id }, { responseDeadline: new Date(Date.now() - DAY) })
    await api('post', `/reports/${encodeURIComponent(report.id)}/respond`, 'Applicant', applicant, { response: 'Late response' }).expect(409)
    await request(app).post('/api/applications/reports').set(auth('Applicant', applicant)).send({ referralId: String(referral._id), type: 'no_show', reason: 'Applicant report' }).expect(403)
    await api('post', `/admin/reports/${encodeURIComponent(report.id)}/review`, 'Admin', admin, { decision: 'confirmed', reason: 'Window closed, evidence reviewed' }).expect(200)
    expect((await score()).trustValue).toBe(80)
  })

  it('preserves reciprocal ratings and recipient visibility without allowing ratings to change trust', async () => {
    const { referral, meeting } = await meetingFor()
    const hire = await HireReport.create({ referralId: referral._id, jobId: job._id, employerId: employer._id, applicantId: applicant._id, status: 'hired' })
    for (const rating of [{ role: 'Employer', account: employer, to: applicant, toRole: 'applicant', score: 1 }, { role: 'Applicant', account: applicant, to: employer, toRole: 'employer', score: 5 }]) {
      await request(app).post('/api/ratings').set(auth(rating.role, rating.account)).send({ toUserId: String(rating.to._id), toRole: rating.toRole, hireReportId: String(hire._id), score: rating.score, comment: 'Demo review' }).expect(200)
      expect((await score()).trustValue).toBe(100)
    }
    for (const [role, account] of [['Applicant', applicant], ['Admin', admin], ['Employer', employer]]) {
      const response = await request(app).get(`/api/ratings/${applicant._id}`).set(auth(role, account)).expect(200)
      expect(response.body.totalRatings).toBe(1)
    }
    await Applicant.collection.updateOne({ _id: applicant._id }, { $set: { trustValue: 50 } })
    await Interview.updateOne({ _id: meeting.id }, { status: 'held' })
    const event = { applicantId: String(applicant._id), type: 'attended_interview', referenceId: meeting.id, reason: 'Admin confirms attendance' }
    await api('post', '/admin/events/confirm', 'Employer', employer, event).expect(403)
    await api('post', '/admin/events/confirm', 'Admin', admin, event).expect(200)
    await api('post', '/admin/events/confirm', 'Admin', admin, event).expect(200)
    expect((await score()).trustValue).toBe(55)
    await api('post', '/admin/events/confirm', 'Admin', admin, { ...event, type: 'hired', referenceId: String(hire._id) }).expect(200)
    expect((await score()).trustValue).toBe(65)
    expect((await Referral.findById(referral._id)).history.filter(event => event.action === 'peso_confirmed_interview_attendance')).toHaveLength(1)
  })

  it('permits withdrawal before an interview and requires admin confirmation for a late-cancellation event', async () => {
    const { referral, meeting } = await meetingFor()
    await Interview.updateOne({ _id: meeting.id }, { scheduledAt: new Date(Date.now() + 3600000) })
    await request(app).post(`/api/applications/${referral.applicationId}/withdraw`).set(auth('Applicant', applicant)).expect(200)
    expect((await score()).trustValue).toBe(100)
    await api('post', '/admin/events/confirm', 'Admin', admin, { applicantId: String(applicant._id), type: 'late_cancellation', referenceId: meeting.id, reason: 'Admin confirms late cancellation' }).expect(200)
    expect((await score()).trustValue).toBe(90)
  })

  it('aggregates dashboard/report counts from the full-cycle seed', async () => {
    await clearDb()
    const fixture = await seedFullCycle({ tag: 'integration' })
    const response = await request(app).get('/api/dashboard').set(auth('Admin', fixture.admin)).expect(200)
    expect(response.body.stats.workflow).toMatchObject(FULL_CYCLE_COUNTS)
    expect(response.body.stats).toMatchObject({ applicants: 7, employers: 1, applications: 7, hires: 1, referrals: { total: 6, bySource: { auto: 5, admin: 1 } } })
    for (const account of fixture.applicants) {
      for (const path of ['/api/workflow/mine', '/api/applications/mine']) {
        const result = await request(app).get(path).set(auth('Applicant', account)).expect(200)
        expect(JSON.stringify(result.body)).not.toMatch(/trustValue|trustEvents|reviewQueue|reviewReason|reviewedBy|Demo private employer note|Low-trust|internal routing/)
      }
    }
    const missed = await score(fixture.applicants[2])
    expect(missed.trustValue).toBe(80)
    expect(missed.trustEvents).toHaveLength(1)
    expect((await score(fixture.applicants[1])).trustValue).toBe(100)
    expect((await referralWorkflow.getSettings()).lowTrustRouting).toBe(false)
    const employerCounts = await request(app).get('/api/dashboard').set(auth('Employer', fixture.employer)).expect(200)
    expect(employerCounts.body.stats.applicants).toBe(6)
  })
})
