// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Applicant, Admin, HireReport } = await import('../../models/collections.js')
const { createActivityReportService } = await import('../../services/activityReport.js')
const { Interview, ApplicationReport } = await import('../../models/applicationWorkflow.js')
const { Employer, Referral } = await import('../../models/collections.js')
const JobPosting = mongoose.model('JobPosting'), JobApplication = mongoose.model('JobApplication')
const auth = (role = 'Admin', email = 'report-admin@example.test') => ({ Authorization: `Bearer ${jwt.sign({ role, email }, process.env.JWT_SECRET || 'dev-secret')}` })
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => { await clearDb(); await Admin.create({ email: 'report-admin@example.test', passwordHash: 'test' }) })
describe('admin report maker', () => {
  it('requires a real admin account', async () => {
    await request(app).get('/api/admin/reports').expect(401)
    await Applicant.create({ email: 'report-applicant@example.test', passwordHash: 'test', emailVerified: true, verificationStatus: 'approved' })
    await request(app).get('/api/admin/reports').set(auth('Applicant', 'report-applicant@example.test')).expect(403)
    await request(app).get('/api/admin/reports').set(auth('Admin', 'missing@example.test')).expect(403)
  })
  it('validates custom dates on the server and returns an empty report gracefully', async () => {
    await request(app).get('/api/admin/reports').query({ preset: 'custom', start: '2026-02-30', end: '2026-03-01' }).set(auth()).expect(422)
    const result = await request(app).get('/api/admin/reports').query({ preset: 'custom', start: '2026-01-01', end: '2026-01-01' }).set(auth()).expect(200)
    expect(result.headers['cache-control']).toBe('private, no-store')
    expect(result.body.metrics).toHaveLength(8)
    expect(result.body.metrics.every(metric => metric.count === 0)).toBe(true)
    expect(result.body.daily).toEqual([])
  })
  it('uses inclusive Philippine dates and excludes duplicate applicant hiring reports and private data', async () => {
    const since = new Date('2026-11-05T16:00:00Z'), last = new Date('2026-11-06T15:59:59.999Z'), until = new Date('2026-11-06T16:00:00Z')
    await Applicant.collection.insertMany([
      { email: 'PRIVATE1@example.test', createdAt: new Date(+since - 1) },
      { email: 'PRIVATE2@example.test', createdAt: since },
      { email: 'PRIVATE3@example.test', createdAt: last },
      { email: 'PRIVATE4@example.test', createdAt: until },
    ])
    await JobPosting.collection.insertOne({ createdAt: since, status: 'approved', title: 'PRIVATE job details' })
    await JobApplication.collection.insertMany([{ jobId: new mongoose.Types.ObjectId(), applicantEmail: 'first@example.test', submittedAt: since, deliveryStatus: 'delivered' }, { jobId: new mongoose.Types.ObjectId(), applicantEmail: 'second@example.test', submittedAt: since, deliveryStatus: 'processing' }])
    await HireReport.collection.insertMany([{ reportedAt: since, reportedByRole: 'Employer', status: 'hired' }, { reportedAt: since, reportedByRole: 'Applicant', status: 'hired' }])
    const makeReport = createActivityReportService({ Applicant, Employer, JobPosting, JobApplication, Referral, Interview, HireReport, ApplicationReport, now: () => new Date('2026-11-07T04:00:00Z') })
    const report = await makeReport({ preset: 'custom', start: '2026-11-06', end: '2026-11-06' })
    const counts = Object.fromEntries(report.metrics.map(metric => [metric.key, metric.count]))
    expect(counts).toMatchObject({ applicants: 2, jobs: 1, applications: 1, outcomes: 1 })
    expect(report.daily).toEqual([{ date: '2026-11-06', applicants: 2, jobs: 1, applications: 1, outcomes: 1 }])
    expect(report.metrics.find(metric => metric.key === 'outcomes').statuses).toEqual([{ status: 'hired', count: 1 }])
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|@example|password/)
  })
})
