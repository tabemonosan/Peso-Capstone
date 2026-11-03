// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
vi.mock('../../mailer.js', async (original) => ({ ...await original(), sendEmail: vi.fn(), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Applicant, Employer } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting')
const email = 'skills-board@example.com'
const auth = (role = 'Applicant') => ({ Authorization: `Bearer ${jwt.sign({ role, email }, process.env.JWT_SECRET || 'dev-secret')}` })

beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  await Applicant.create({ email, passwordHash: 'test', emailVerified: true, verificationStatus: 'approved',
    profile: { firstName: 'Juan', lastName: 'Cruz', location: 'Manito, Albay', skills: ['Driver'] },
    verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map((key) => [key, { versions: [{ version: 1, status: 'approved' }] }])),
  })
  await Employer.create({ email: 'employer@example.com', passwordHash: 'test', emailVerified: true, verificationStatus: 'approved', companyName: 'Test Company' })
  const base = { company: 'Test Company', createdBy: 'employer@example.com', status: 'approved', createdAt: new Date(), location: 'Manito, Albay', locationType: 'On-site', employmentType: 'Full-time', salaryMin: 15000 }
  await JobPosting.create([
    { ...base, title: 'Delivery Driver', skills: ['Driver'] },
    { ...base, title: 'Logistics Assistant', skills: ['Driver', 'Time Management'] },
    { ...base, title: 'Office Clerk', skills: ['Excel'], applicants: [{ email }] },
    { ...base, title: 'Unspecified Skills', skills: [] },
    { ...base, title: 'Declined Driver', status: 'declined', skills: ['Driver'] },
    { ...base, title: 'Expired Driver', deadline: new Date('2000-01-01'), skills: ['Driver'] },
  ])
})

const list = (query = '') => request(app).get(`/api/jobs?status=approved&page=1&limit=10${query}`).set(auth())
describe('strict applicant skill visibility', () => {
  it.each(['relevant', 'createdAt', 'salary', 'deadline', 'title'])('restricts results and accurate counts when sorted by %s', async (sort) => {
    const response = await list(`&sortBy=${sort}`)
    expect(response.status).toBe(200)
    expect(response.body.total).toBe(2)
    expect(response.body.items.map((job) => job.title).sort()).toEqual(['Delivery Driver', 'Logistics Assistant'])
    expect(response.body.items.every((job) => job.skillMatch === 1)).toBe(true)
    expect(response.body.facets.skills.some((entry) => entry.value === 'Excel')).toBe(false)
  })
  it('cannot find an unrelated posting by searching its exact title or selecting an unrelated skill', async () => {
    expect((await list('&search=Office%20Clerk')).body.total).toBe(0)
    const filtered = await list('&skills=Excel')
    expect(filtered.body.items.some((job) => job.title === 'Office Clerk')).toBe(false)
    expect((await list('&skills=Time%20Management')).body.items.map((job) => job.title)).toEqual(['Logistics Assistant'])
  })
  it('applies keyword searches and pagination inside the matching set', async () => {
    expect((await list('&search=Delivery')).body.items.map((job) => job.title)).toEqual(['Delivery Driver'])
    const first = await request(app).get('/api/jobs?page=1&limit=1').set(auth())
    const second = await request(app).get('/api/jobs?page=2&limit=1').set(auth())
    expect(first.body.total).toBe(2)
    expect(first.body.totalPages).toBe(2)
    expect(first.body.items[0]._id).not.toBe(second.body.items[0]._id)
  })
  it('also restricts unpaginated requests and invalid status fallbacks', async () => {
    const legacy = await request(app).get('/api/jobs').set(auth())
    expect(legacy.body.map((job) => job.title).sort()).toEqual(['Delivery Driver', 'Logistics Assistant'])
    const fallback = await request(app).get('/api/jobs?status=anything&page=1').set(auth())
    expect(fallback.body.total).toBe(2)
  })
  it('returns no results or facets when saved skills are empty, even when searching', async () => {
    await Applicant.updateOne({ email }, { $set: { 'profile.skills': [] } })
    const response = await list('&search=Driver&skills=Driver')
    expect(response.body.total).toBe(0)
    expect(response.body.items).toEqual([])
    expect(response.body.facets.skills).toEqual([])
    expect((await request(app).get('/api/jobs').set(auth())).body).toEqual([])
  })
  it('normalizes case and spacing and honors explicit skill coverage in the correct direction', async () => {
    await Applicant.updateOne({ email }, { $set: { 'profile.skills': [' full stack developer '] } })
    await JobPosting.create({ title: 'Frontend Position', company: 'Test Company', skills: [' Frontend   Developer '], status: 'approved' })
    expect((await list()).body.items.map((job) => job.title)).toEqual(['Frontend Position'])
    await Applicant.updateOne({ email }, { $set: { 'profile.skills': ['Frontend Developer'] } })
    await JobPosting.create({ title: 'Full Stack Position', company: 'Test Company', skills: ['Full-Stack Developer'], status: 'approved' })
    expect((await list()).body.items.map((job) => job.title)).toEqual(['Frontend Position'])
  })
  it('does not allow partial-word matches or client-supplied saved skills to bypass the restriction', async () => {
    await Applicant.updateOne({ email }, { $set: { 'profile.skills': ['Java'] } })
    await JobPosting.create({ title: 'JavaScript Position', company: 'Test Company', skills: ['JavaScript'], status: 'approved' })
    expect((await list('&applicantSkills=JavaScript&mySkills=JavaScript')).body.total).toBe(0)
  })
  it('keeps application history and the admin review directory available', async () => {
    const history = await request(app).get('/api/jobs?status=applied&page=1').set(auth())
    expect(history.body.items.map((job) => job.title)).toEqual(['Office Clerk'])
    const admin = await request(app).get('/api/jobs?status=approved&page=1').set(auth('Admin'))
    expect(admin.body.items.some((job) => job.title === 'Office Clerk')).toBe(true)
  })
})
