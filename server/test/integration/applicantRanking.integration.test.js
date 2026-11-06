// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
vi.mock('../../mailer.js', async (original) => ({ ...await original(), sendEmail: vi.fn(), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Applicant, Employer, Admin, Referral } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting')
const auth = (role = 'Employer', email = 'ranking-employer@example.com') => ({ Authorization: `Bearer ${jwt.sign({ role, email }, process.env.JWT_SECRET || 'dev-secret')}` })
let employer, job, strong, weak, admin
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  admin = await Admin.create({ email: 'ranking-admin@example.com', passwordHash: 'test' })
  employer = await Employer.create({ email: 'ranking-employer@example.com', passwordHash: 'test', emailVerified: true, verificationStatus: 'approved', companyName: 'Ranking Company' })
  const docs = Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map((key) => [key, { versions: [{ version: 1, status: 'approved' }] }]))
  const base = { passwordHash: 'test', emailVerified: true, verificationStatus: 'approved', verificationDocuments: docs }
  strong = await Applicant.create({ ...base, email: 'strong@example.com', profile: { firstName: 'Strong', lastName: 'Candidate', location: 'Private Street', skills: ['React', 'SQL'], nsrp: {
    tin: 'PRIVATE-ID', dob: '1990-01-01', addressStreet: 'PRIVATE-ADDRESS', religion: 'PRIVATE-RELIGION',
    technicalTraining: [{ course: 'React development', certificate: 'React', institution: 'Training Center', toDate: '2020-01-01' }],
    eligibility: [{ eligibility: 'React certification', license: 'PRIVATE-LICENSE', validUntil: '2099-01-01' }],
    languages: [{ name: 'English', read: true, write: true, speak: true, understand: true }],
    workExperience: [{ position: 'Full-Stack Developer', company: 'Prior Company', address: 'PRIVATE-WORK-ADDRESS', fromDate: '2020-01-01', toDate: 'Present' }],
    willingImmediately: 'Yes',
  } } })
  weak = await Applicant.create({ ...base, email: 'weak@example.com', profile: { firstName: 'New', lastName: 'Candidate', location: 'Albay', skills: ['React'], nsrp: { willingImmediately: 'No' } } })
  job = await JobPosting.create({ title: 'Full-Stack Developer', company: employer.companyName, createdBy: employer.email, status: 'approved', skills: ['React', 'SQL'], experience: '1–3 years', requirements: 'React certification and English proficiency.' })
  await Referral.create([
    { applicantId: strong._id, employerId: employer._id, jobId: job._id, referredBy: admin._id, status: 'pending', createdAt: new Date('2025-01-01') },
    { applicantId: weak._id, employerId: employer._id, jobId: job._id, referredBy: admin._id, status: 'pending', createdAt: new Date() },
  ])
})

describe('ranked employer referrals', () => {
  it('uses live reputation for ranking while keeping the private ledger and notes hidden', async () => {
    await Applicant.collection.updateOne({ _id: strong._id }, { $set: { trustValue: 100, trustEvents: [{ key: 'private-penalty', type: 'confirmed_no_show', points: -20, at: new Date(), reason: 'PRIVATE penalty evidence', by: 'PRIVATE reviewer' }] } })
    const response = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth()).expect(200)
    const candidate = response.body.find(entry => String(entry.applicantId._id) === String(strong._id))
    expect(candidate.suitability.reputation).toEqual({ points: 80, maximumPoints: 100 })
    expect(candidate.suitability.components[0]).toMatchObject({ key: 'reputation', points: 8, maximum: 10 })
    expect(candidate.suitability.components.some(component => component.key === 'eligibility')).toBe(false)
    expect(JSON.stringify(response.body)).not.toMatch(/trustValue|trustEvents|PRIVATE penalty|PRIVATE reviewer|private-penalty/)
    const directory = await request(app).get('/api/admin/users').set(auth('Admin', admin.email)).expect(200)
    expect(directory.body.find(user => String(user.id) === String(strong._id)).reputation).toEqual({ points: 80, maximumPoints: 100 })
    await Referral.updateOne({ applicantId: strong._id, employerId: employer._id }, { status: 'withdrawn' })
    const withdrawn = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth()).expect(200)
    expect(withdrawn.body.find(entry => entry.status === 'withdrawn').applicantId).toBeNull()
    expect(withdrawn.body.find(entry => entry.status === 'withdrawn').suitability).toBeUndefined()
  })

  it('shares profile resume metadata and downloads only with employers holding an active referral', async () => {
    await Applicant.updateOne({ _id: strong._id }, { $set: { resumeFile: { originalName: 'resume.pdf', mimetype: 'application/pdf', size: 8, data: Buffer.from('%PDFtest') } } })
    const response = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth()).expect(200)
    const candidate = response.body.find(entry => String(entry.applicantId._id) === String(strong._id)).applicantId
    expect(candidate.resumeFile.originalName).toBe('resume.pdf')
    expect(candidate.resumeFile).not.toHaveProperty('data')
    const download = await request(app).get(`/api/applicants/${strong._id}/resume`).set(auth()).expect(200)
    expect(download.body).toEqual(Buffer.from('%PDFtest'))
    const ownDownload = await request(app).get(`/api/applicants/${strong._id}/resume`).set(auth('Applicant', strong.email)).expect(200)
    expect(ownDownload.body).toEqual(Buffer.from('%PDFtest'))
    expect(ownDownload.headers['content-length']).toBe('8')
    await Employer.create({ email: 'unrelated@example.com', passwordHash: 'test', emailVerified: true, verificationStatus: 'approved' })
    await request(app).get(`/api/applicants/${strong._id}/resume`).set(auth('Employer', 'unrelated@example.com')).expect(403)
    await Referral.updateOne({ employerId: employer._id, applicantId: strong._id }, { $set: { status: 'withdrawn' } })
    await request(app).get(`/api/applicants/${strong._id}/resume`).set(auth()).expect(403)
    await request(app).get(`/api/applicants/${strong._id}/resume`).expect(401)
  })

  it('includes applicant portfolio links in the employer profile summary', async () => {
    const links = [{ label: 'My portfolio', url: 'https://example.com/work' }]
    await Applicant.updateOne({ _id: strong._id }, { $set: { 'profile.portfolioLinks': links } })
    const response = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth()).expect(200)
    expect(response.body.find(entry => String(entry.applicantId._id) === String(strong._id)).applicantId.profile.portfolioLinks).toEqual(links)
  })

  it.each(['', '?page=1&limit=1'])('puts the strongest candidate first before pagination (%s)', async (suffix) => {
    const response = await request(app).get(`/api/referrals/employer/${employer._id}${suffix}`).set(auth())
    expect(response.status).toBe(200)
    const entries = response.body.items || response.body
    expect(String(entries[0].applicantId._id)).toBe(String(strong._id))
    expect(entries[0].suitability).toMatchObject({ rank: 1, score: 100, qualifications: { immediatelyAvailable: true } })
    expect(entries[0].suitability.qualifications.technicalTraining[0].course).toBe('React development')
    expect(entries[0].suitability.qualifications.languages[0].name).toBe('English')
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE-|Private Street/)
    expect(entries[0].applicantId.profile).not.toHaveProperty('nsrp')
    if (suffix) {
      expect(response.body.total).toBe(2)
      expect(response.body.totalPages).toBe(2)
    }
  })
  it('keeps the second page ordered and shows no positive availability claim for No', async () => {
    const response = await request(app).get(`/api/referrals/employer/${employer._id}?page=2&limit=1`).set(auth())
    expect(String(response.body.items[0].applicantId._id)).toBe(String(weak._id))
    expect(response.body.items[0].suitability.rank).toBe(2)
    expect(response.body.items[0].suitability.qualifications).not.toHaveProperty('immediatelyAvailable')
  })
  it('computes separate ranks for each job', async () => {
    const transport = await Applicant.create({ email: 'driver@example.com', passwordHash: 'test', profile: { skills: ['Driver'], nsrp: { technicalTraining: [{ course: 'Driver safety' }], workExperience: [{ position: 'Delivery Driver', fromDate: '2020-01-01', toDate: 'Present' }], willingImmediately: 'Yes' } } })
    const driverJob = await JobPosting.create({ title: 'Delivery Driver', company: employer.companyName, createdBy: employer.email, status: 'approved', skills: ['Driver'], experience: '1–3 years' })
    await Referral.create([
      { applicantId: strong._id, employerId: employer._id, jobId: driverJob._id, referredBy: admin._id },
      { applicantId: transport._id, employerId: employer._id, jobId: driverJob._id, referredBy: admin._id },
    ])
    const response = await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth())
    const drivers = response.body.filter((entry) => String(entry.jobId._id) === String(driverJob._id))
    expect(String(drivers[0].applicantId._id)).toBe(String(transport._id))
    expect(drivers.map((entry) => entry.suitability.rank)).toEqual([1, 2])
  })
  it('does not allow another employer or an applicant to access ranked candidates', async () => {
    await Employer.create({ email: 'other@example.com', passwordHash: 'test', emailVerified: true, verificationStatus: 'approved', companyName: 'Other' })
    await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Employer', 'other@example.com')).expect(403)
    await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Applicant', weak.email)).expect(403)
    await request(app).get(`/api/referrals/employer/${employer._id}`).set(auth('Admin', admin.email)).expect(200)
  })
})
