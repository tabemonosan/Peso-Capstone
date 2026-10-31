// @vitest-environment node
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startTestDb, stopTestDb, signupUploadRequest } from './helpers.js'
import { deadlineBounds, emptyJobPosting } from '../../../shared/jobPosting.js'
import { CSM_QUESTION_KEYS } from '../../../shared/csmQuestionnaire.js'

const sent = vi.hoisted(() => [])
vi.mock('../../mailer.js', () => ({
  sendEmail: vi.fn(async (to, subject, text) => { sent.push({ to, text }); return { delivered: true } }),
  sendVerificationEmail: vi.fn().mockResolvedValue({ delivered: true }), initMailer: vi.fn(),
}))
const { app } = await import('../../index.js')
const { Admin, Applicant, Employer, Referral, HireReport, CsmResponse } = await import('../../models/collections.js')
const EmployerRequest = mongoose.model('EmployerRequest')
const password = 'Password123!'
const applicantEmail = 'cycle-applicant@example.com'
const employerEmail = 'cycle-employer@example.com'
const auth = (token) => ({ Authorization: `Bearer ${token}` })
async function login(email) {
  const result = await request(app).post('/api/login').send({ email, password })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body.token
}
async function verify(email) {
  const send = await request(app).post('/api/signup/email-code').send({ email })
  expect(send.status).toBe(200)
  const code = sent.findLast((mail) => mail.to === email && /\b\d{6}\b/.test(mail.text))?.text.match(/\b(\d{6})\b/)[1]
  expect(code).toBeTruthy()
  const proof = await request(app).post('/api/signup/email-code/verify').send({ email, code })
  expect(proof.status, JSON.stringify(proof.body)).toBe(200)
  return proof.body.proofToken
}
beforeAll(async () => { await startTestDb(); await CsmResponse.init() }, 60000)
afterAll(stopTestDb)

describe('connected portal lifecycle', () => {
  it('runs verified signup through approvals, applications, referral acceptance, both hiring reports, feedback, closure and fresh registration', async () => {
    await Admin.create({ email: 'cycle-admin@example.com', passwordHash: await bcrypt.hash(password, 4) })
    const adminToken = await login('cycle-admin@example.com')
    const applicantProof = await verify(applicantEmail)
    const signup = await signupUploadRequest(request(app).post('/api/signup'), { email: applicantEmail, emailProof: applicantProof })
    expect(signup.status).toBe(200)
    const applicantToken = await login(applicantEmail)
    const applicant = await Applicant.findOne({ email: applicantEmail })

    const employerProof = await verify(employerEmail)
    const employerSignup = await request(app).post('/api/employer-requests')
      .field('email', employerEmail).field('emailProof', employerProof).field('password', password)
      .field('consent', 'true').field('mode', 'upload').field('companyName', 'Lifecycle Works')
      .field('contactName', 'Jamie Cruz').field('location', 'Legazpi City, Albay').field('phone', '+639171234567')
      .field('city', 'Legazpi City').field('province', 'Albay')
      .attach('requirements', await fs.readFile('public/NSRP-Form-2-Employer-Reg-Form.pdf'), { filename: 'Form2.pdf', contentType: 'application/pdf' })
    expect(employerSignup.status, JSON.stringify(employerSignup.body)).toBe(200)
    const employerToken = await login(employerEmail)
    expect((await request(app).post('/api/jobs').set(auth(employerToken)).send({})).status).toBe(403)
    const employerRequest = await EmployerRequest.findOne({ email: employerEmail })
    expect((await request(app).put(`/api/employer-requests/${employerRequest._id}/status`).set(auth(adminToken)).send({ status: 'approved' })).status).toBe(200)
    const employer = await Employer.findOne({ email: employerEmail })
    expect(employer.phone).toBe('09171234567')
    const posting = { ...emptyJobPosting(), title: 'Other', customTitle: 'Lifecycle Clerk', description: 'Assist clients', skills: ['Excel'], city: 'Legazpi City', province: 'Albay', salaryMin: 15000, salaryMax: 20000, slots: 2, deadline: deadlineBounds().min }
    const created = await request(app).post('/api/jobs').set(auth(employerToken)).send(posting)
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    const jobId = created.body._id
    expect((await request(app).put(`/api/jobs/${jobId}/status`).set(auth(adminToken)).send({ status: 'approved' })).status).toBe(200)
    // A complete registration still awaits PESO approval until its documents are reviewed.
    expect((await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(applicantToken)).send({})).status).toBe(403)
    for (const key of ['nsrpForm', 'birthCertificate', 'validId1']) {
      const review = await request(app).put(`/api/applicants/${applicant._id}/verification-documents/${key}`).set(auth(adminToken)).send({ status: 'approved' })
      expect(review.status, JSON.stringify(review.body)).toBe(200)
    }
    await mongoose.model('JobPosting').updateOne({ _id: jobId }, { deadline: new Date('2000-01-01') })
    expect((await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(applicantToken)).send({})).status).toBe(410)
    await mongoose.model('JobPosting').updateOne({ _id: jobId }, { deadline: new Date(deadlineBounds().min) })
    const application = await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(applicantToken)).send({})
    expect(application.status, JSON.stringify(application.body)).toBe(200)
    expect((await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(applicantToken)).send({})).status).toBe(409)
    expect((await request(app).get(`/api/job-applications/view?jobId=${jobId}&email=${applicantEmail}`).set(auth(employerToken))).status).toBe(403)
    const referred = await request(app).post('/api/referrals').set(auth(adminToken)).send({ jobId, applicantIds: [String(applicant._id)] })
    expect(referred.status, JSON.stringify(referred.body)).toBe(200)
    const referral = await Referral.findOne({ jobId, applicantId: applicant._id })
    const report = { applicantId: String(applicant._id), referralId: String(referral._id), jobId, status: 'hired', employmentDate: '2026-01-01', notes: 'Contract signed' }
    expect((await request(app).post('/api/hire-reports').set(auth(applicantToken)).send(report)).status).toBe(403)
    expect((await request(app).put(`/api/referrals/${referral._id}/respond`).set(auth(employerToken)).send({ status: 'accepted' })).status).toBe(200)
    for (const token of [employerToken, applicantToken]) {
      expect((await request(app).post('/api/hire-reports').set(auth(token)).send(report)).status).toBe(200)
    }
    expect((await request(app).post('/api/hire-reports').set(auth(employerToken)).send({ ...report, status: 'deployed', employmentDate: '2026-01-02' })).status).toBe(200)
    const tracking = await request(app).get('/api/admin/employment-updates').set(auth(adminToken))
    expect(tracking.body.items[0]).toMatchObject({ applicant: { name: 'Juan Santos Cruz' }, employer: { name: 'Lifecycle Works' }, job: { title: 'Lifecycle Clerk' }, applicantReport: { status: 'hired' }, employerReport: { status: 'deployed', history: [{ status: 'hired' }] } })
    for (const [token, language] of [[applicantToken, 'en'], [employerToken, 'tl']]) {
      const feedback = { language, date: '2026-01-02', age: 25, sex: 'male', clientType: 'citizen', cc1: '4', ratings: Object.fromEntries(CSM_QUESTION_KEYS.map((key) => [key, 'agree'])) }
      const key = randomUUID()
      expect((await request(app).post('/api/csm/responses').set(auth(token)).set('Idempotency-Key', key).send(feedback)).status).toBe(201)
      expect((await request(app).post('/api/csm/responses').set(auth(token)).set('Idempotency-Key', key).send(feedback)).status).toBe(200)
    }
    expect((await request(app).get('/api/csm/responses').set(auth(adminToken))).body.total).toBe(2)
    const deletion = await request(app).post('/api/account-deletion/requests').set(auth(applicantToken)).send({ password, reason: 'Retiring this account' })
    expect(deletion.status).toBe(201)
    expect((await request(app).put(`/api/account-deletion/requests/${deletion.body._id}`).set(auth(adminToken)).send({ status: 'approved' })).status).toBe(200)
    expect((await request(app).get('/api/profile').set(auth(applicantToken))).status).toBe(401)
    expect(await HireReport.countDocuments({ applicantId: applicant._id })).toBe(2)
    const freshSignup = await signupUploadRequest(request(app).post('/api/signup'), { email: applicantEmail, emailProof: await verify(applicantEmail) })
    expect(freshSignup.status).toBe(200)
    const freshToken = await login(applicantEmail)
    const fresh = await Applicant.findOne({ email: applicantEmail })
    expect(String(fresh._id)).not.toBe(String(applicant._id))
    expect((await request(app).get('/api/hire-reports').set(auth(freshToken))).body).toEqual([])
    expect((await request(app).get('/api/profile').set(auth(applicantToken))).status).toBe(401)
  }, 60000)
})
