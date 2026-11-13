import bcrypt from 'bcryptjs'
// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
import { emptyJobPosting, deadlineBounds } from '../../../shared/jobPosting.js'
import { createJobModeration } from '../../services/jobModeration.js'
vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }), sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }), initMailer: vi.fn().mockResolvedValue(undefined) }))
const { app } = await import('../../index.js')
const { Employer, Admin, Applicant, JobTitle, Notification } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting')
const createViewer = () => Applicant.create({ email: 'applicant@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', profile: { firstName: 'Demo', lastName: 'Applicant', skills: ['Excel'], location: 'Legazpi City, Albay' }, verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map(key => [key, { versions: [{ version: 1, status: 'approved' }] }])) })
const auth = (role, email = `${role.toLowerCase()}@example.com`) => ({ Authorization: `Bearer ${jwt.sign({ role, email }, process.env.JWT_SECRET || 'dev-secret')}` })
const payload = (extra = {}) => ({ ...emptyJobPosting(), title: 'Other', customTitle: 'New Clerk', description: 'Assist clients', city: ' Legazpi   City ', province: ' Albay ', skills: ['Excel', 'excel'], salaryMin: '15000', salaryMax: '20000', slots: 3, deadline: deadlineBounds().min, education: 'College Level', experience: '1–3 years', employmentType: 'Project-based', notesToAdmin: 'Please verify our schedule.', ...extra })
beforeAll(startTestDb)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  await Employer.create({ email: 'employer@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', companyName: 'Example Works' })
  await Admin.create({ adminLevel: 'super_admin', email: 'admin@example.com', passwordHash: 'unused' })
})
describe('job request and review API', () => {
  it('shares company rating averages with job viewers without exposing individual reviews', async () => {
    await createViewer()
    const employer = await Employer.findOne({ email: 'employer@example.com' })
    await JobPosting.create({ title: 'Welder', company: 'Example Works', createdBy: employer.email, status: 'approved', skills: ['Excel'] })
    const Rating = mongoose.model('Rating')
    await Rating.collection.insertMany([
      ...[3, 4].map(score => ({ toUserId: employer._id, toRole: 'employer', fromRole: 'applicant', fromUserId: new mongoose.Types.ObjectId(), hireReportId: new mongoose.Types.ObjectId(), score, comment: 'PRIVATE employee review' })),
      { toUserId: new mongoose.Types.ObjectId(), toRole: 'employer', fromRole: 'applicant', score: 5 },
      { toUserId: employer._id, toRole: 'applicant', fromRole: 'employer', score: 1 },
      { toUserId: employer._id, toRole: 'employer', fromRole: 'applicant', score: 6 },
    ])
    for (const query of ['?status=approved', '?status=approved&page=1', '?status=mine', '?status=mine&page=1']) {
      const response = await request(app).get(`/api/jobs${query}`).set(auth(query.includes('mine') ? 'Employer' : 'Applicant')).expect(200)
      const jobs = response.body.items || response.body
      expect(jobs[0].employerBranding.rating).toEqual({ averageScore: 3.5, totalRatings: 2 })
      expect(JSON.stringify(response.body)).not.toContain('PRIVATE employee review')
    }
    await Rating.deleteMany({})
    const response = await request(app).get('/api/jobs?status=approved&page=1').set(auth('Applicant')).expect(200)
    expect(response.body.items[0].employerBranding.rating).toEqual({ averageScore: 0, totalRatings: 0 })
  })
  it.each(['pending', 'approved', 'declined'])('blocks edits to archived %s postings, including deadline extensions', async (status) => {
    const deadline = new Date(Date.now() - 86400000)
    const job = await JobPosting.create({ title: 'Expired position', company: 'Example Works', createdBy: 'employer@example.com', status, deadline, applicants: [{ email: 'existing@example.test' }] })
    const response = await request(app).put(`/api/jobs/${job._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', deadline: deadlineBounds().min })).expect(409)
    expect(response.body).toMatchObject({ code: 'JOB_ARCHIVED' })
    const saved = await JobPosting.findById(job._id)
    expect(saved.title).toBe('Expired position')
    expect(saved.status).toBe(status)
    expect(saved.deadline).toEqual(deadline)
    expect(saved.applicants).toHaveLength(1)
  })

  it('shows employers only their own anonymous employee reviews with pagination', async () => {
    await createViewer()
    const employer = await Employer.findOne({ email: 'employer@example.com' })
    const Rating = mongoose.model('Rating')
    await Rating.collection.insertMany([
      ...Array.from({ length: 12 }, (_, index) => ({ toUserId: employer._id, toRole: 'employer', fromRole: 'applicant', fromUserId: new mongoose.Types.ObjectId(), hireReportId: new mongoose.Types.ObjectId(), score: index % 2 ? 4 : 3, comment: 'Helpful workplace', createdAt: new Date(2026, 0, index + 1) })),
      { toUserId: new mongoose.Types.ObjectId(), toRole: 'employer', fromRole: 'applicant', score: 1, comment: 'OTHER COMPANY PRIVATE' },
    ])
    const response = await request(app).get('/api/employer/ratings').set(auth('Employer')).expect(200)
    expect(response.body).toMatchObject({ averageScore: 3.5, totalRatings: 12, page: 1, pageSize: 10 })
    expect(response.body.ratings).toHaveLength(10)
    for (const rating of response.body.ratings) expect(Object.keys(rating).sort()).toEqual(['comment', 'score'])
    expect(JSON.stringify(response.body)).not.toContain('OTHER COMPANY PRIVATE')
    const next = await request(app).get('/api/employer/ratings?page=2').set(auth('Employer')).expect(200)
    expect(next.body.ratings).toHaveLength(2)
    const job = await JobPosting.create({ title: 'Clerk', company: 'Example Works', createdBy: employer.email, status: 'approved' })
    const publicReviews = await request(app).get(`/api/jobs/${job._id}/company-profile?reviewPage=2`).set(auth('Applicant')).expect(200)
    expect(publicReviews.body.reviews).toHaveLength(2)
    expect(publicReviews.body.rating).toEqual({ averageScore: 3.5, totalRatings: 12 })
    for (const review of publicReviews.body.reviews) expect(Object.keys(review).sort()).toEqual(['comment', 'score'])
    const legacy = await request(app).get(`/api/ratings/${employer._id}`).set(auth('Employer')).expect(200)
    for (const rating of legacy.body.ratings) expect(Object.keys(rating).sort()).toEqual(['comment', 'score'])
    await request(app).get('/api/employer/ratings').set(auth('Applicant')).expect(403)
    await request(app).get('/api/employer/ratings').expect(401)
  })

  it('lets applicants view company profile information and rating without exposing private records', async () => {
    await createViewer()
    const employer = await Employer.findOneAndUpdate({ email: 'employer@example.com' }, { $set: { contactName: 'Company Contact', phone: '123', profile: { summary: 'We build software.', website: 'example.com', location: 'Manito, Albay' }, verificationReason: 'PRIVATE verification note' } }, { new: true })
    const job = await JobPosting.create({ title: 'Clerk', company: 'Example Works', createdBy: employer.email, status: 'approved', description: 'Assist clients', notesToAdmin: 'PRIVATE admin note', applicants: [{ email: 'private@example.test' }] })
    await mongoose.model('Rating').collection.insertOne({ toUserId: employer._id, toRole: 'employer', fromRole: 'applicant', fromUserId: new mongoose.Types.ObjectId(), hireReportId: new mongoose.Types.ObjectId(), score: 4, comment: 'Helpful workplace' })
    const url = `/api/jobs/${job._id}/company-profile`
    const response = await request(app).get(url).set(auth('Applicant')).expect(200)
    expect(response.body).toMatchObject({ companyName: 'Example Works', summary: 'We build software.', website: 'example.com', contactName: 'Company Contact', location: 'Manito, Albay', rating: { averageScore: 4, totalRatings: 1 } })
    for (const field of ['email', 'passwordHash', 'verificationReason', '_id', 'verificationDocuments', 'ratings']) expect(response.body).not.toHaveProperty(field)
    expect(response.body.reviews).toEqual([{ score: 4, comment: 'Helpful workplace' }])
    expect(response.body).toMatchObject({ reviewPage: 1, reviewPageSize: 10 })
    expect(response.body.job).toMatchObject({ _id: String(job._id), title: 'Clerk', description: 'Assist clients' })
    for (const field of ['createdBy', 'applicants', 'notesToAdmin', 'moderation', 'moderationHistory']) expect(response.body.job).not.toHaveProperty(field)
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE')
    expect(JSON.stringify(response.body)).not.toContain('private@example.test')
    await request(app).get(url).expect(401)
    await request(app).get(url).set(auth('Employer')).expect(403)
    await JobPosting.updateOne({ _id: job._id }, { status: 'pending' })
    await request(app).get(url).set(auth('Applicant')).expect(404)
  })

  it('presents automatic archives without changing approval or deleting applications', async () => {
    const deadline = new Date(Date.now() - 4 * 86400000)
    const old = await JobPosting.create({ title: 'Expired position', company: 'Example Works', createdBy: 'employer@example.com', status: 'approved', deadline, applicants: [{ email: 'existing@example.test' }] })
    const mine = await request(app).get('/api/jobs?status=mine').set(auth('Employer')).expect(200)
    const archived = mine.body.find(job => job._id === String(old._id))
    expect(archived).toMatchObject({ isArchived: true, status: 'approved', archivedAt: new Date(+deadline + 1).toISOString() })
    expect(archived.applicants).toEqual([]) // Existing referral privacy rules still apply.
    const stored = await JobPosting.findById(old._id).lean()
    expect(stored.status).toBe('approved')
    expect(stored.applicants).toHaveLength(1)
    await JobPosting.updateOne({ _id: old._id }, { deadline: new Date(Date.now() + 86400000) })
    const updated = await request(app).get('/api/jobs?status=mine').set(auth('Employer')).expect(200)
    expect(updated.body.find(job => job._id === String(old._id))).toMatchObject({ isArchived: false, archivedAt: null })
  })

  it('filters whole municipalities across barangays and returns no jobs for a supported empty municipality', async () => {
    await JobPosting.create([
      { title: 'Oas structured', company: 'Example', status: 'approved', city: 'Oas', province: 'Albay', barangay: 'Calpi', location: 'Calpi, Oas, Albay', skills: ['Excel'] },
      { title: 'Oas legacy', company: 'Example', status: 'approved', location: 'Balogo, Oas, Albay', skills: ['Excel'] },
      { title: 'Manito job', company: 'Example', status: 'approved', city: 'Manito', location: 'Nagotgot, Manito, Albay', skills: ['Excel'] },
    ])
    await createViewer()
    const matches = await request(app).get('/api/jobs').query({ status: 'approved', page: 1, locations: 'Oas' }).set(auth('Applicant')).expect(200)
    expect(matches.body.items.map(job => job.title).sort()).toEqual(['Oas legacy', 'Oas structured'])
    const legacy = await request(app).get('/api/jobs').query({ status: 'approved', page: 1, locations: 'Calpi, Oas, Albay' }).set(auth('Applicant')).expect(200)
    expect(legacy.body.items.map(job => job.title).sort()).toEqual(['Oas legacy', 'Oas structured'])
    expect(legacy.body.applied.locations).toEqual(['Oas'])
    expect(legacy.body.facets.locations).toContainEqual({ value: 'Oas', count: 2 })
    const empty = await request(app).get('/api/jobs').query({ status: 'approved', page: 1, locations: 'Tiwi' }).set(auth('Applicant')).expect(200)
    expect(empty.body.total).toBe(0)
    expect(empty.body.items).toEqual([])
  })

  it.each([
    ['fck you peso', 'abusive_language'],
    ['Kill all Muslims.', 'hateful_content'],
    ['Pay a registration fee to apply.', 'applicant_payment'],
  ])('re-screens published edits containing %s and removes them from applicant listings', async (description, code) => {
    await Employer.updateOne({ email: 'employer@example.com' }, { createdAt: new Date(Date.now() - 8 * 86400000) }, { timestamps: false, overwriteImmutable: true })
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload()).expect(200)
    expect(created.body.status).toBe('approved')
    await JobPosting.updateOne({ _id: created.body._id }, { $push: { applicants: { email: 'existing@example.test', appliedAt: new Date() } } })
    const edited = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', description, status: 'approved', approvedBy: 'forged', moderation: { decision: 'auto_approved', findings: [] }, applicants: [] })).expect(200)
    expect(edited.body.status).toBe('pending')
    expect(edited.body.moderation.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code })]))
    expect(edited.body.approvedBy).toBeUndefined()
    expect(edited.body.approvedAt).toBeUndefined()
    expect(edited.body.moderationHistory).toHaveLength(2)
    expect(edited.body.reviewHistory).toHaveLength(1)
    expect((await JobPosting.findById(created.body._id)).applicants[0].email).toBe('existing@example.test')
    await createViewer()
    expect((await request(app).get('/api/jobs?status=approved').set(auth('Applicant')).expect(200)).body).toHaveLength(0)
    const corrected = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', description: 'Assist clients and maintain accurate office records.' })).expect(200)
    expect(corrected.body.status).toBe('approved')
    expect(corrected.body.moderationHistory).toHaveLength(3)
  })
  it('lets the owner revise a declined posting and screens it again', async () => {
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload()).expect(200)
    await request(app).put(`/api/jobs/${created.body._id}/status`).set(auth('Admin')).send({ status: 'declined', reason: 'Clarify duties.' }).expect(200)
    const edited = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', description: 'Maintain office records and assist customers.' })).expect(200)
    expect(edited.body.status).toBe('pending')
    expect(edited.body.reviewReason).toBeUndefined()
    expect(edited.body.reviewHistory[0]).toMatchObject({ status: 'declined', reason: 'Clarify duties.' })
    await Employer.create({ email: 'other@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved' })
    await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer', 'other@example.com')).send(payload({ company: 'Example Works' })).expect(403)
  })
  it('saves, loads and edits language proficiency requirements', async () => {
    const languageRequirements = [{ name: 'English', read: true, write: false, speak: true, understand: true }]
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ languageRequirements })).expect(200)
    expect(created.body.languageRequirements).toEqual(languageRequirements)
    const stored = await JobPosting.findById(created.body._id).lean()
    expect(stored.languageRequirements).toEqual(languageRequirements)
    for (const name of ['Englishsdasd', 'Korean', 'Tagalog']) {
      const invalidLanguage = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', languageRequirements: [{ name, speak: true }] })).expect(422)
      expect(invalidLanguage.body.fieldErrors.languageRequirements).toBeTruthy()
    }
    expect((await JobPosting.findById(created.body._id).lean()).languageRequirements).toEqual(languageRequirements)
    const mine = await request(app).get('/api/jobs?status=mine').set(auth('Employer')).expect(200)
    expect(mine.body.find(posting => posting._id === created.body._id).languageRequirements).toEqual(languageRequirements)
    const invalid = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', languageRequirements: [{ name: 'English' }] })).expect(422)
    expect(invalid.body.fieldErrors.languageRequirements).toBeTruthy()
    const edited = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', languageRequirements: [] })).expect(200)
    expect(edited.body.languageRequirements).toEqual([])
  })

  it.each([
    ['No placement fee, pay a registration fee to apply.', 'applicant_payment'],
    ['Applicants must be at least 25 years old.', 'age_restriction'],
  ])('keeps the audited screening bypass pending: %s', async (description, code) => {
    await Employer.updateOne({ email: 'employer@example.com' }, { createdAt: new Date(Date.now() - 8 * 86400000) }, { timestamps: false, overwriteImmutable: true })
    const response = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ description })).expect(200)
    expect(response.body.status).toBe('pending')
    expect(response.body.moderation.findings).toContainEqual(expect.objectContaining({ code }))
    await createViewer()
    const visible = await request(app).get('/api/jobs?status=approved').set(auth('Applicant')).expect(200)
    expect(visible.body).toHaveLength(0)
  })

  it('automatically publishes eligible posts, records the decision, notifies the owner, and hides screening from applicants', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { createdAt: new Date(Date.now() - 8 * 86400000) }, { timestamps: false, overwriteImmutable: true })
    const result = await request(app).post('/api/jobs').set(auth('Employer')).send(payload()).expect(200)
    expect(result.body).toMatchObject({ status: 'approved', approvedBy: 'System (job safety screening)', moderation: { decision: 'auto_approved', findings: [] } })
    expect(result.body.reviewHistory).toHaveLength(1)
    expect(result.body.moderationHistory).toHaveLength(1)
    expect(await Notification.findOne({ recipientEmail: 'employer@example.com', type: 'job_approved' })).toBeTruthy()
    await createViewer()
    const jobs = await request(app).get('/api/jobs?status=approved').set(auth('Applicant')).expect(200)
    expect(jobs.body[0]).not.toHaveProperty('moderation')
    expect(jobs.body[0]).not.toHaveProperty('moderationHistory')
  })
  it('keeps prohibited and discriminatory posts private until PESO reviews them and rechecks edits', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { createdAt: new Date(Date.now() - 8 * 86400000) }, { timestamps: false, overwriteImmutable: true })
    const result = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ description: 'Female only. Pay a registration fee to join our MLM.' })).expect(200)
    expect(result.body.status).toBe('pending')
    expect(result.body.moderation.findings.map(f => f.code)).toEqual(expect.arrayContaining(['gender_restriction', 'applicant_payment', 'prohibited_mlm']))
    await createViewer()
    const visible = await request(app).get('/api/jobs?status=approved').set(auth('Applicant')).expect(200)
    expect(visible.body).toHaveLength(0)
    const queue = await request(app).get('/api/jobs?status=pending').set(auth('Admin')).expect(200)
    expect(queue.body[0].moderation.decision).toBe('manual_review')
    const edited = await request(app).put(`/api/jobs/${result.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works' })).expect(200)
    expect(edited.body.status).toBe('approved')
    expect(edited.body.moderationHistory).toHaveLength(2)
    expect(edited.body.moderationHistory[0].decision).toBe('manual_review')
  })
  it('protects and audits the automatic approval switch', async () => {
    const url = '/api/admin/job-moderation/settings'
    await request(app).get(url).set(auth('Employer')).expect(403)
    await request(app).put(url).set(auth('Employer')).send({ enabled: false, reason: 'Unauthorized' }).expect(403)
    await request(app).get(url).expect(401)
    await request(app).put(url).set(auth('Admin')).send({ enabled: false }).expect(400)
    const settings = await request(app).put(url).set(auth('Admin')).send({ enabled: false, reason: 'Manual review during rollout' }).expect(200)
    expect(settings.body.history[0]).toMatchObject({ by: 'admin@example.com', enabled: false })
    await Employer.updateOne({ email: 'employer@example.com' }, { createdAt: new Date(Date.now() - 8 * 86400000) }, { timestamps: false, overwriteImmutable: true })
    const result = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ status: 'approved', moderation: { decision: 'auto_approved' } })).expect(200)
    expect(result.body.status).toBe('pending')
    expect(result.body.moderation.findings[0].code).toBe('automation_disabled')
  })
  it('counts simultaneous submissions atomically and keeps excess volume under review', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { createdAt: new Date(Date.now() - 8 * 86400000) }, { timestamps: false, overwriteImmutable: true })
    const results = await Promise.all(Array.from({ length: 5 }, (_, index) => request(app).post('/api/jobs').set(auth('Employer')).send(payload({ description: `Assist clients and maintain office records for department ${index}.` }))))
    expect(results.every(r => r.status === 200)).toBe(true)
    expect(results.filter(r => r.body.status === 'approved')).toHaveLength(3)
    expect(results.filter(r => r.body.moderation.findings.some(f => f.code === 'posting_volume'))).toHaveLength(2)
  })
  it('fails closed when screening dependencies fail', async () => {
    const service = createJobModeration({ Employer, JobPosting: { exists: async () => { throw new Error('PRIVATE database failure') } } })
    const result = await service.assess(payload(), 'employer@example.com')
    expect(result).toMatchObject({ decision: 'manual_review', findings: [{ code: 'screening_unavailable' }] })
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })
  it('sends duplicate postings to review even for an established verified account', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { createdAt: new Date(Date.now() - 8 * 86400000) }, { timestamps: false, overwriteImmutable: true })
    const first = await request(app).post('/api/jobs').set(auth('Employer')).send(payload()).expect(200)
    expect(first.body.status).toBe('approved')
    const second = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ status: 'approved', approvedBy: 'admin@example.com', moderation: { decision: 'auto_approved', findings: [] } })).expect(200)
    expect(second.body.status).toBe('pending')
    expect(second.body.moderation.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'duplicate_posting' })]))
    expect(second.body.approvedBy).toBeUndefined()
  })
  it('rejects fabricated skills and redundant combinations on create and update', async () => {
    for (const skills of [['sadsa'], ['Full-Stack Developer', 'Frontend Developer'], ['Microsoft Office', 'Excel']]) {
      const response = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ skills }))
      expect(response.status).toBe(422)
      expect(response.body.fieldErrors.skills).toBeTruthy()
    }
    expect(await JobPosting.countDocuments()).toBe(0)
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ skills: ['Full-Stack Developer', 'React'] }))
    expect(created.status).toBe(200)
    const update = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', skills: ['Full-Stack Developer', 'Backend Developer'] }))
    expect(update.status).toBe(422)
    expect((await JobPosting.findById(created.body._id)).skills).toEqual(['Full-Stack Developer', 'React'])
  })
  it('stores barangays, includes them in the job address, and rejects mismatched municipalities', async () => {
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ city: 'Manito', province: 'Albay', barangay: 'Nagotgot' }))
    expect(created.status).toBe(200)
    expect(created.body).toMatchObject({ barangay: 'Nagotgot', location: 'Nagotgot, Manito, Albay' })
    const stored = await JobPosting.findById(created.body._id)
    expect(stored.barangay).toBe('Nagotgot')
    const invalid = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', city: 'Daraga', barangay: 'Nagotgot' }))
    expect(invalid.status).toBe(422)
    expect(invalid.body.fieldErrors.barangay).toBeTruthy()
    expect((await JobPosting.findById(created.body._id)).barangay).toBe('Nagotgot')
  })
  it('returns field errors without writing or notifying', async () => {
    const response = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ title: '', description: '', skills: [], city: '', province: '', salaryMin: -1, salaryMax: 'bad', slots: 1.5, deadline: '2000-01-01', notesToAdmin: 'x'.repeat(501) }))
    expect(response.status).toBe(422)
    for (const key of ['title', 'description', 'skills', 'city', 'province', 'salaryMin', 'salaryMax', 'slots', 'deadline', 'notesToAdmin']) expect(response.body.fieldErrors[key]).toBeTruthy()
    expect(await JobPosting.countDocuments()).toBe(0)
    expect(await Notification.countDocuments()).toBe(0)
  })
  it('persists fields, allows edits, approves with notification, and hides private notes from seekers', async () => {
    let response = await request(app).post('/api/jobs').set(auth('Employer')).send(payload())
    expect(response.status).toBe(200)
    const id = response.body._id
    expect(response.body).toMatchObject({ status: 'pending', title: 'New Clerk', city: 'Legazpi City', province: 'Albay', location: 'Legazpi City, Albay', salaryMin: 15000, salaryMax: 20000, payFrequency: 'Monthly', negotiable: false, skills: ['Excel'], notesToAdmin: 'Please verify our schedule.' })
    expect(await Notification.findOne({ recipientEmail: 'admin@example.com', type: 'job_pending_review' })).toBeTruthy()
    response = await request(app).put(`/api/jobs/${id}`).set(auth('Employer')).send(payload({ company: 'Example Works', notesToAdmin: 'Updated private note', employmentType: 'Probationary' }))
    expect(response.status).toBe(200)
    expect(response.body.notesToAdmin).toBe('Updated private note')
    const queue = await request(app).get('/api/jobs?status=pending&page=1').set(auth('Admin'))
    expect(queue.body.items[0]).toMatchObject({ notesToAdmin: 'Updated private note', education: 'College Level', experience: '1–3 years', employmentType: 'Probationary', slots: 3 })
    response = await request(app).put(`/api/jobs/${id}/status`).set(auth('Admin')).send({ status: 'approved' })
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('approved')
    expect(response.body.reviewHistory[0].status).toBe('approved')
    expect(await Notification.findOne({ recipientEmail: 'employer@example.com', type: 'job_approved' })).toBeTruthy()
    await Applicant.create({ email: 'applicant@example.com', passwordHash: 'unused', emailVerified: true, profile: { firstName: 'Juan', lastName: 'Cruz', location: 'Legazpi', skills: ['Excel'] }, verificationDocuments: { nsrpForm: { versions: [{ version: 1 }] }, birthCertificate: { versions: [{ version: 1 }] }, validId1: { versions: [{ version: 1 }] } } })
    for (const url of ['/api/jobs', '/api/jobs?status=approved&page=1']) {
      const publicJobs = await request(app).get(url).set(auth('Applicant'))
      expect(publicJobs.status).toBe(200)
      const jobs = publicJobs.body.items || publicJobs.body
      expect(jobs[0].education).toBe('College Level')
      expect(jobs[0]).not.toHaveProperty('notesToAdmin')
    }
    const editApproved = await request(app).put(`/api/jobs/${id}`).set(auth('Employer')).send(payload({ company: 'Example Works' }))
    expect(editApproved.status).toBe(200)
    expect(editApproved.body.status).toBe('pending')
    expect(editApproved.body.moderation.decision).toBe('manual_review')
  })
  it('rejects invalid edits and preserves stored fields', async () => {
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload())
    const response = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', salaryMax: 100 }))
    expect(response.status).toBe(422)
    expect(response.body.fieldErrors.salaryMax).toBeTruthy()
    expect((await JobPosting.findById(created.body._id)).salaryMax).toBe(20000)
  })
  it('clears remote and negotiable fields and keeps decline reason/history/notification', async () => {
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ locationType: 'Remote', negotiable: true, salaryMin: '', salaryMax: '', notesToAdmin: '' }))
    expect(created.status).toBe(200)
    expect(created.body).toMatchObject({ city: '', province: '', location: 'Remote', salaryMin: null, salaryMax: null, salary: 'Negotiable' })
    const url = `/api/jobs/${created.body._id}/status`
    expect((await request(app).put(url).set(auth('Admin')).send({ status: 'declined' })).status).toBe(400)
    const rejected = await request(app).put(url).set(auth('Admin')).send({ status: 'declined', reason: 'Confirm work schedule' })
    expect(rejected.status).toBe(200)
    expect(rejected.body.reviewHistory[0].reason).toBe('Confirm work schedule')
    expect((await Notification.findOne({ type: 'job_declined' })).message).toContain('Confirm work schedule')
  })
  it('derives legacy fields on reads and approves old postings without requiring new fields', async () => {
    const old = await JobPosting.create({ title: 'Old Role', company: 'Example Works', salary: '₱25,000', location: 'Old address', employmentType: 'Contract', status: 'pending', createdBy: 'employer@example.com' })
    const queue = await request(app).get('/api/jobs?status=pending').set(auth('Admin'))
    expect(queue.body[0]).toMatchObject({ salaryMin: 25000, salaryMax: 25000, payFrequency: 'Monthly', employmentType: 'Contractual', location: 'Old address' })
    expect((await request(app).put(`/api/jobs/${old._id}/status`).set(auth('Admin')).send({ status: 'approved' })).status).toBe(200)
    const filtered = await request(app).get('/api/jobs?status=approved&page=1&employmentTypes=Contractual').set(auth('Admin'))
    expect(filtered.body.items[0]._id).toBe(String(old._id))
  })
  it('uses existing catalog casing for exact titles', async () => {
    await JobTitle.create({ name: 'Office Clerk', category: 'Office' })
    const result = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ title: 'office clerk', customTitle: '' }))
    expect(result.body.title).toBe('Office Clerk')
  })
  it('sorts new ranges and legacy salaries numerically, with negotiable last', async () => {
    await JobPosting.create([
      { title: 'Range', company: 'Example', salaryMin: 20000, salaryMax: 30000, salary: '\u20b120,000 - \u20b130,000 / month', status: 'approved' },
      { title: 'Legacy', company: 'Example', salary: '\u20b125,000', status: 'approved' },
      { title: 'Negotiable', company: 'Example', negotiable: true, status: 'approved' },
    ])
    for (const [order, expected] of [['asc', ['Range', 'Legacy', 'Negotiable']], ['desc', ['Legacy', 'Range', 'Negotiable']]]) {
      const response = await request(app).get(`/api/jobs?page=1&sortBy=salary&order=${order}`).set(auth('Admin'))
      expect(response.status).toBe(200)
      expect(response.body.items.map((job) => job.title)).toEqual(expected)
    }
  })
  it.each([
    [{ salaryMin: '150abc' }, 'salaryMin', 'Enter the salary as numbers only.'],
    [{ salaryMin: -1 }, 'salaryMin', "Minimum salary can't be negative."],
    [{ salaryMax: '-1' }, 'salaryMax', "Maximum salary can't be negative."],
    [{ salaryMin: '1.5' }, 'salaryMin', 'Enter the salary as numbers only.'],
    [{ slots: 1.5 }, 'slots', 'Slots must be a whole number from 1 to 999.'],
    [{ slots: '1e2' }, 'slots', 'Slots must be a whole number from 1 to 999.'],
    [{ slots: { toString: 'invalid' } }, 'slots', 'Slots must be a whole number from 1 to 999.'],
    [{ salaryMax: 100 }, 'salaryMax', 'Maximum salary must be at least the minimum.'],
    [{ city: 'Legazpi City', province: 'Cebu' }, 'province', 'Province must match the selected city/municipality.'],
    [{ city: {}, province: 'Albay' }, 'city', 'Enter the city or municipality.'],
  ])('rejects %j with a field error on %s', async (extra, field, message) => {
    const result = await request(app).post('/api/jobs').set(auth('Employer')).send(payload(extra))
    expect(result.status).toBe(422)
    expect(result.body.fieldErrors[field]).toBe(message)
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload())
    const edited = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ ...extra, company: 'Example Works' }))
    expect(edited.status).toBe(422)
    expect(edited.body.fieldErrors[field]).toBe(message)
  })
  it('stores salary boundaries and slots as numbers, accepts today, and preserves location filters', async () => {
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ salaryMin: '0', salaryMax: '9999999', slots: '999', city: 'legazpi city', province: 'albay' }))
    expect(created.status).toBe(200)
    expect(created.body).toMatchObject({ salaryMin: 0, salaryMax: 9999999, slots: 999, city: 'Legazpi City', province: 'Albay' })
    await request(app).put(`/api/jobs/${created.body._id}/status`).set(auth('Admin')).send({ status: 'approved' })
    await JobPosting.create({ title: 'Different branch', company: 'Example', location: 'Daraga, Albay', city: 'Daraga', province: 'Albay', status: 'approved' })
    const filtered = await request(app).get('/api/jobs?page=1&locations=Legazpi%20City%2C%20Albay').set(auth('Admin'))
    expect(filtered.body.items.map((job) => job._id)).toEqual([created.body._id])
    const multi = await request(app).get('/api/jobs').query({ page: 1, locations: JSON.stringify(['Legazpi City, Albay', 'Daraga, Albay']) }).set(auth('Admin'))
    expect(multi.body.items).toHaveLength(2)
  })
  it('returns structured employer addresses and backfills only recoverable Form 2 answers', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { $set: { establishmentAddress: { city: 'Daraga', province: 'Albay' } } })
    let profile = await request(app).get('/api/profile').set(auth('Employer'))
    expect(profile.body.establishmentAddress).toEqual({ city: 'Daraga', province: 'Albay' })
    await Employer.updateOne({ email: 'employer@example.com' }, { $unset: { establishmentAddress: 1 } })
    profile = await request(app).get('/api/profile').set(auth('Employer'))
    expect(profile.status).toBe(200)
    expect(profile.body.establishmentAddress?.city).toBeUndefined()
    await mongoose.model('EmployerRequest').create({ email: 'employer@example.com', passwordHash: 'unused', companyName: 'Example', contactName: 'Contact', registrationDetails: { cityMunicipality: 'Daraga', province: 'Albay' } })
    profile = await request(app).get('/api/profile').set(auth('Employer'))
    expect(profile.body.establishmentAddress).toEqual({ city: 'Daraga', province: 'Albay' })
    expect((await Employer.findOne({ email: 'employer@example.com' })).establishmentAddress.city).toBe('Daraga')
  })
  it('recovers and persists the Form 2 address during login without requiring a profile visit', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { $set: { passwordHash: await bcrypt.hash('Password123!', 4) } })
    await mongoose.model('EmployerRequest').create({ email: 'employer@example.com', passwordHash: 'unused', companyName: 'Example', contactName: 'Contact', registrationDetails: { cityMunicipality: 'Oas', province: 'Albay' } })
    const login = await request(app).post('/api/login').send({ email: 'employer@example.com', password: 'Password123!' })
    expect(login.status).toBe(200)
    expect(login.body.user.establishmentAddress).toEqual({ city: 'Oas', province: 'Albay' })
    expect((await Employer.findOne({ email: 'employer@example.com' })).establishmentAddress.city).toBe('Oas')
  })
  it('recovers uploaded legacy registration addresses from the exact stored city/province suffix', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { $set: { 'profile.location': 'Brgy. Nagotgot, Manito, Albay, Landmark: near Barangay Hall' } })
    const profile = await request(app).get('/api/profile').set(auth('Employer'))
    expect(profile.body.establishmentAddress).toEqual({ city: 'Manito', province: 'Albay', barangay: 'Nagotgot' })
    expect((await Employer.findOne({ email: 'employer@example.com' })).establishmentAddress.city).toBe('Manito')
  })
  it.each([
    [{ salaryMin: '', salaryMax: '' }, ['salaryMin', 'salaryMax']],
    [{ salaryMin: '', salaryMax: 20000 }, ['salaryMin']],
    [{ salaryMin: 15000, salaryMax: '' }, ['salaryMax']],
  ])('requires non-negotiable salary amounts on create and edit: %j', async (extra, fields) => {
    const invalid = await request(app).post('/api/jobs').set(auth('Employer')).send(payload({ ...extra, negotiable: false }))
    expect(invalid.status).toBe(422)
    for (const key of fields) expect(invalid.body.fieldErrors[key]).toContain('is required when salary is not negotiable.')
    const created = await request(app).post('/api/jobs').set(auth('Employer')).send(payload())
    const edited = await request(app).put(`/api/jobs/${created.body._id}`).set(auth('Employer')).send(payload({ ...extra, negotiable: false, company: 'Example Works' }))
    expect(edited.status).toBe(422)
    for (const key of fields) expect(edited.body.fieldErrors[key]).toContain('is required when salary is not negotiable.')
    expect((await JobPosting.findById(created.body._id)).salaryMin).toBe(15000)
  })
  it('returns legacy branch city/province to admin and employer, and persists them when edited', async () => {
    const old = await JobPosting.create({ title: 'Office Clerk', company: 'Example Works', locationType: 'On-site', location: 'rawis 119, Relocation, Brgy. Calpi, Oas, Albay, Landmark: Big Mac near Church', createdBy: 'employer@example.com', status: 'pending' })
    for (const [role, url] of [['Admin', '/api/jobs?status=pending'], ['Admin', '/api/jobs?status=pending&page=1'], ['Employer', '/api/jobs?status=mine']]) {
      const response = await request(app).get(url).set(auth(role))
      expect(response.status).toBe(200)
      expect((response.body.items || response.body)[0]).toMatchObject({ city: 'Oas', province: 'Albay' })
    }
    const edited = await request(app).put(`/api/jobs/${old._id}`).set(auth('Employer')).send(payload({ company: 'Example Works', city: 'Manito', province: 'Albay' }))
    expect(edited.status).toBe(200)
    expect((await JobPosting.findById(old._id)).toObject()).toMatchObject({ city: 'Manito', province: 'Albay', location: 'Manito, Albay' })
    const admin = await request(app).get('/api/jobs?status=pending&page=1').set(auth('Admin'))
    expect(admin.body.items[0]).toMatchObject({ city: 'Manito', province: 'Albay' })
  })
  it('keeps employer verification and email gates', async () => {
    await Employer.updateOne({ email: 'employer@example.com' }, { $set: { verificationStatus: 'under_review' } })
    expect((await request(app).post('/api/jobs').set(auth('Employer')).send(payload())).status).toBe(403)
    await Employer.updateOne({ email: 'employer@example.com' }, { $set: { verificationStatus: 'approved', emailVerified: false } })
    expect((await request(app).post('/api/jobs').set(auth('Employer')).send(payload())).status).toBe(403)
  })
})
