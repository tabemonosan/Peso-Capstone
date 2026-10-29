import bcrypt from 'bcryptjs'
// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
import { emptyJobPosting, deadlineBounds } from '../../../shared/jobPosting.js'
vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }), sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }), initMailer: vi.fn().mockResolvedValue(undefined) }))
const { app } = await import('../../index.js')
const { Employer, Admin, Applicant, JobTitle, Notification } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting')
const auth = (role, email = `${role.toLowerCase()}@example.com`) => ({ Authorization: `Bearer ${jwt.sign({ role, email }, process.env.JWT_SECRET || 'dev-secret')}` })
const payload = (extra = {}) => ({ ...emptyJobPosting(), title: 'Other', customTitle: 'New Clerk', description: 'Assist clients', city: ' Legazpi   City ', province: ' Albay ', skills: ['Excel', 'excel'], salaryMin: '15000', salaryMax: '20000', slots: 3, deadline: deadlineBounds().min, education: 'College Level', experience: '1–3 years', employmentType: 'Project-based', notesToAdmin: 'Please verify our schedule.', ...extra })
beforeAll(startTestDb)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  await Employer.create({ email: 'employer@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', companyName: 'Example Works' })
  await Admin.create({ email: 'admin@example.com', passwordHash: 'unused' })
})
describe('job request and review API', () => {
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
    await Applicant.create({ email: 'applicant@example.com', passwordHash: 'unused', emailVerified: true, profile: { firstName: 'Juan', lastName: 'Cruz', location: 'Legazpi' }, verificationDocuments: { nsrpForm: { versions: [{ version: 1 }] }, birthCertificate: { versions: [{ version: 1 }] }, validId1: { versions: [{ version: 1 }] } } })
    for (const url of ['/api/jobs', '/api/jobs?status=approved&page=1']) {
      const publicJobs = await request(app).get(url).set(auth('Applicant'))
      expect(publicJobs.status).toBe(200)
      const jobs = publicJobs.body.items || publicJobs.body
      expect(jobs[0].education).toBe('College Level')
      expect(jobs[0]).not.toHaveProperty('notesToAdmin')
    }
    const editApproved = await request(app).put(`/api/jobs/${id}`).set(auth('Employer')).send(payload({ company: 'Example Works' }))
    expect(editApproved.status).toBe(400)
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
    expect(profile.body.establishmentAddress).toEqual({ city: 'Manito', province: 'Albay' })
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
