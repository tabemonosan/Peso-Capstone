// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb, signupUploadRequest, pdfBuffer, validNsrpAnswers } from './helpers.js'
import { drainVerificationJobs } from '../../services/verificationJobs.js'
import { documentReviewMessage } from '../../services/applicantReview.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app, nsrpAutomation } = await import('../../index.js')
const { Applicant } = await import('../../models/collections.js')
let account, token
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  await nsrpAutomation.updateSettings({ automaticApproval: false }, 'test-admin')
  const result = await signupUploadRequest(request(app).post('/api/signup'), { email: 'review-owner@example.test' }).expect(200)
  token = result.body.token
  await drainVerificationJobs()
  account = await Applicant.findOne({ email: 'review-owner@example.test' })
})
const own = req => req.set('Authorization', `Bearer ${token}`)
describe('applicant review explanations and pending corrections', () => {
  it('shows safe reasons for each unverified required document and pending edit availability', async () => {
    const result = await own(request(app).get('/api/profile/review-status')).expect(200)
    expect(result.headers['cache-control']).toBe('private, no-store')
    expect(result.body.status).toBe('under_review')
    expect(result.body.documents).toHaveLength(3)
    expect(result.body.documents.find(doc => doc.docKey === 'nsrpForm')).toMatchObject({ canUpdate: true, uploadsRemaining: 4, reason: expect.stringMatching(/uploaded NSRP.*staff review/i) })
    expect(result.body.documents.every(doc => doc.reason && doc.canUpdate)).toBe(true)
    const documents = await own(request(app).get(`/api/applicants/${account._id}/verification-documents`)).expect(200)
    expect(documents.body.review.documents).toEqual(result.body.documents)
  })
  it('never exposes audit sampling, private findings, extracted values or unknown internal errors', async () => {
    await Applicant.updateOne({ _id: account._id }, { $set: { 'verificationDocuments.validId1.versions.0.reviewReasons': ['Audit sample', 'PRIVATE provider error with value 1992-02-03'], 'verificationDocuments.validId1.versions.0.findings': [{ ruleId: 'cross_private_rule', severity: 'critical', evidence: 'independent' }] } })
    const result = await own(request(app).get('/api/profile/review-status')).expect(200)
    expect(JSON.stringify(result.body)).not.toMatch(/Audit sample|PRIVATE|1992-02-03|cross_private_rule|sampleDraw|fraud|threshold/i)
  })
  it('allows a pending document replacement and an NSRP correction without an admin rejection first', async () => {
    await own(request(app).post('/api/profile/verification-documents/birthCertificate')).field('verificationDetails', JSON.stringify({ copyType: 'PSA copy on security paper' })).attach('document', pdfBuffer(), { filename: 'corrected.pdf', contentType: 'application/pdf' }).expect(200)
    await own(request(app).put('/api/profile/nsrp')).send({ answers: validNsrpAnswers({ email: account.email }) }).expect(200)
    await drainVerificationJobs()
    const saved = await Applicant.findById(account._id)
    expect(saved.verificationDocuments.birthCertificate.versions).toHaveLength(2)
    expect(saved.verificationDocuments.nsrpForm.versions).toHaveLength(2)
    expect(saved.verificationStatus).toBe('under_review')
  })
  it('keeps approved documents locked and enforces the five-upload cap for pending documents', async () => {
    await Applicant.updateOne({ _id: account._id }, { $set: { 'verificationDocuments.birthCertificate.versions.0.status': 'approved', 'verificationDocuments.validId1.uploads': 5 } })
    await own(request(app).post('/api/profile/verification-documents/birthCertificate')).field('verificationDetails', JSON.stringify({ copyType: 'PSA copy on security paper' })).attach('document', pdfBuffer(), { filename: 'locked.pdf', contentType: 'application/pdf' }).expect(409)
    await own(request(app).post('/api/profile/verification-documents/validId1')).field('idType', 'SSS').field('verificationDetails', JSON.stringify({ number: '1234567890' })).attach('document', pdfBuffer(), { filename: 'capped.pdf', contentType: 'application/pdf' }).expect(429)
    const result = await own(request(app).get('/api/profile/review-status')).expect(200)
    expect(result.body.documents.some(doc => doc.docKey === 'birthCertificate')).toBe(false)
    expect(result.body.documents.find(doc => doc.docKey === 'validId1')).toMatchObject({ canUpdate: false, uploadsRemaining: 0 })
  })
  it('keeps review reasons owner-scoped and accessible to waitlisted applicants without enabling employment access', async () => {
    await request(app).get('/api/profile/review-status').expect(403)
    const employer = jwt.sign({ role: 'Employer', email: 'employer@example.test' }, process.env.JWT_SECRET || 'dev-secret')
    await request(app).get('/api/profile/review-status').set('Authorization', `Bearer ${employer}`).expect(403)
    await Applicant.updateOne({ _id: account._id }, { $set: { verificationStatus: 'waitlisted', consistencyState: { token: 'sample', status: 'finished', issues: [{ docKey: 'birthCertificate', reasonCode: 'cross_check_mismatch', fieldGroup: 'birth date' }] } } })
    expect((await own(request(app).get('/api/profile/review-status?email=another@example.test')).expect(200)).body.status).toBe('waitlisted')
    expect((await own(request(app).get('/api/jobs')).expect(403)).body.code).toBe('APPLICANT_WAITLISTED')
  })
  it.each(['Could not be read', 'Not independent', 'Quality warning', 'Retake requested'])('gives actionable clearer-copy guidance for %s', reason => {
    expect(documentReviewMessage('validId1', { status: 'pending', reviewReasons: [reason] })).toMatch(/clearer copy/)
  })
})
