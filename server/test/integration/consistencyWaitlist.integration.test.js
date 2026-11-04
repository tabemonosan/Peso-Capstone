// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { startTestDb, stopTestDb, clearDb, validNsrpAnswers } from './helpers.js'
import { drainVerificationJobs } from '../../services/verificationJobs.js'
import { storeDocumentFile } from '../../utils/documentFiles.js'
import { createConsistencyWaitlist } from '../../services/consistencyWaitlist.js'
const reading = vi.hoisted(() => ({ text: '', confidence: 95, fail: false }))
vi.mock('../../services/localImageReading.js', () => ({
  readQr: vi.fn(async () => ({ found: false })),
  readOcr: vi.fn(async (_buffer, compare) => { if (reading.fail) throw new Error('Reader unavailable'); return compare(reading.text, reading.confidence) }),
}))
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app, consistencyWaitlist, nsrpAutomation } = await import('../../index.js')
const { Applicant, Admin, Notification } = await import('../../models/collections.js')
const auth = (role, account) => ({ Authorization: `Bearer ${jwt.sign({ role, email: account.email }, process.env.JWT_SECRET || 'dev-secret')}` })
const sampleText = dob => `SAMPLE — FICTIONAL DATA\nSurname: Example\nFirst name: Sample\nDate of birth: ${dob}\nID number: 1234567890`
let applicant, admin, image
beforeAll(async () => {
  await startTestDb()
  image = await sharp(Buffer.from('<svg width="900" height="600"><rect width="900" height="600" fill="white"/><text x="60" y="180" font-size="72">SAMPLE</text><text x="60" y="280" font-size="30">FICTIONAL DATA ONLY</text></svg>')).png().toBuffer()
}, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  reading.text = sampleText('1992-02-03'); reading.confidence = 95; reading.fail = false
  admin = await Admin.create({ email: 'waitlist-admin@example.test', passwordHash: 'unused' })
  applicant = await Applicant.create({ email: 'waitlist-sample@example.test', passwordHash: await bcrypt.hash('SamplePassword123!', 4), emailVerified: true, profile: { firstName: 'Sample', lastName: 'Example', dob: '1990-01-01', location: 'Albay', nsrp: validNsrpAnswers({ firstName: 'Sample', surname: 'Example', dob: '1990-01-01', gsisSss: '1234567890' }) }, verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map(key => [key, { uploads: 1, versions: [{ version: 1, status: 'pending', mimetype: key === 'nsrpForm' ? 'application/pdf' : 'image/png', originalName: 'SAMPLE.png', uploadedAt: new Date(), quality: { passed: true }, declaredDetails: { idType: 'SSS', number: '1234567890', copyType: 'PSA copy on security paper' } }] }])) })
  for (const slot of ['birthCertificate', 'validId1']) await storeDocumentFile(applicant._id, slot, 1, 'front', { mimetype: 'image/png', buffer: image, size: image.length })
  await nsrpAutomation.updateSettings({ automaticApproval: false }, admin.email)
})
const check = async () => { await consistencyWaitlist.begin(applicant._id, 'signup'); await drainVerificationJobs(); return consistencyWaitlist.publicState(applicant._id) }
const action = body => request(app).post(`/api/admin/document-verification/waitlist/${applicant._id}/action`).set(auth('Admin', admin)).send(body)
describe('consistency waitlist', () => {
  it('waitlists significant independent differences, reuses the flagged queue, and redacts applicant responses', async () => {
    const state = await check()
    expect(state).toMatchObject({ status: 'waitlisted', waitlisted: true, checking: false })
    expect(state.issues).toEqual(expect.arrayContaining([expect.objectContaining({ fieldGroup: 'birth date', chancesLeft: 3 })]))
    const queue = await request(app).get('/api/admin/document-verification/queue?waitlisted=true').set(auth('Admin', admin)).expect(200)
    expect(queue.body.items.some(item => item.accountId === String(applicant._id) && item.reasons.includes('Cross-check mismatch'))).toBe(true)
    for (const path of ['/api/profile', '/api/profile/consistency', `/api/applicants/${applicant._id}/verification-documents`, '/api/notifications']) {
      const response = await request(app).get(path).set(auth('Applicant', applicant)).expect(200)
      expect(JSON.stringify(response.body)).not.toMatch(/1992-02-03|OCR.*95|threshold|other account|fraud|WAITLIST_RULES_VERSION|cross_birth_nsrp_dob/i)
    }
    const mail = await Notification.find({ 'recipient.id': applicant._id }).lean()
    expect(JSON.stringify(mail)).not.toMatch(/1992-02-03|other account|fraud|threshold/i)
  })
  it.each([
    ['minor', sampleText('1990-01-01').replace('Example', 'Examplf'), 95],
    ['low confidence', sampleText('1992-02-03'), 20],
    ['could not read', 'SAMPLE — unreadable fictional document', 95],
  ])('keeps %s in normal review', async (_label, text, confidence) => {
    reading.text = text; reading.confidence = confidence
    expect((await check()).status).toBe('under_review')
  })
  it('ignores typed-only findings, quality warnings, and comparisons outside the permitted field groups', async () => {
    reading.text = sampleText('1990-01-01')
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'verificationDocuments.birthCertificate.versions.0.findings': [{ ruleId: 'typed_dob', severity: 'critical', evidence: 'self-declared' }], 'verificationDocuments.birthCertificate.versions.0.quality.warnings': ['blur'] } })
    expect((await check()).status).toBe('under_review')
  })
  it('allows login and document forms but blocks employment endpoints with APPLICANT_WAITLISTED', async () => {
    await check()
    await request(app).post('/api/login').send({ email: applicant.email, password: 'SamplePassword123!', role: 'Applicant' }).expect(200)
    for (const [method, path] of [['post', '/api/jobs/000000000000000000000001/apply'], ['post', '/api/referrals'], ['post', '/api/workflow/interviews/000000000000000000000001/respond'], ['get', '/api/hire-reports'], ['get', '/api/workflow/reputation']]) {
      const response = await request(app)[method](path).set(auth('Applicant', applicant)).send({ action: 'confirm' }).expect(403)
      expect(response.body.code).toBe('APPLICANT_WAITLISTED')
    }
    await request(app).post('/api/profile/document-explanations/birthCertificate').set(auth('Applicant', applicant)).field('category', 'Late-registered birth').field('note', 'Please review the supporting circumstances.').expect(200)
  })
  it('clears a passing correction and notifies the applicant', async () => {
    await check()
    reading.text = sampleText('1990-01-01')
    await consistencyWaitlist.begin(applicant._id, 'nsrpForm'); await drainVerificationJobs()
    expect((await consistencyWaitlist.publicState(applicant._id)).status).toBe('under_review')
    expect(await Notification.countDocuments({ type: 'consistency_review_update' })).toBe(1)
  })
  it('enforces attempts independently of upload caps, keeps explanations available, and permits reasoned grants', async () => {
    await check()
    await nsrpAutomation.updateSettings({ waitlistAttempts: 1 }, admin.email)
    await request(app).post('/api/profile/verification-documents/birthCertificate').set(auth('Applicant', applicant)).field('verificationDetails', JSON.stringify({ copyType: 'PSA copy on security paper' })).attach('document', image, { filename: 'SAMPLE.png', contentType: 'image/png' }).expect(200)
    await drainVerificationJobs()
    const blocked = await request(app).post('/api/profile/verification-documents/birthCertificate').set(auth('Applicant', applicant)).field('verificationDetails', JSON.stringify({ copyType: 'PSA copy on security paper' })).attach('document', image, { filename: 'SAMPLE.png', contentType: 'image/png' })
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('WAITLIST_ATTEMPTS_EXHAUSTED')
    await expect(consistencyWaitlist.assertSubmission(applicant._id, 'birthCertificate')).rejects.toMatchObject({ code: 'WAITLIST_ATTEMPTS_EXHAUSTED' })
    await request(app).post('/api/profile/document-explanations/birthCertificate').set(auth('Applicant', applicant)).field('category', 'Other').field('note', 'Please review.').expect(200)
    await action({ action: 'grant', docKey: 'birthCertificate', attempts: 1, reason: '' }).expect(400)
    await action({ action: 'grant', docKey: 'birthCertificate', attempts: 1, reason: 'Additional document requested by staff.' }).expect(200)
    await expect(consistencyWaitlist.assertSubmission(applicant._id, 'birthCertificate')).resolves.toBeUndefined()
    expect((await Applicant.findById(applicant._id).select('+consistencyState')).consistencyState.history.at(-1).action).toBe('grant')
  })
  it('shows duplicate findings generically and never charges for their correction', async () => {
    reading.text = sampleText('1990-01-01')
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'verificationDocuments.validId1.versions.0.findings': [{ ruleId: 'duplicate_sss', severity: 'critical', evidence: 'self-declared' }] } })
    const state = await check()
    expect(state.waitlisted).toBe(true)
    expect(state.issues.every(issue => issue.message === 'Your account needs a review by PESO staff.' && issue.chancesLeft === null)).toBe(true)
    await consistencyWaitlist.begin(applicant._id, 'nsrpForm'); await drainVerificationJobs()
    expect((await Applicant.findById(applicant._id).select('+consistencyState')).consistencyState.used).toEqual({})
  })
  it('honors the master switch and treats OCR failure and timeout as normal review', async () => {
    await nsrpAutomation.updateSettings({ waitlistOnMismatch: false }, admin.email)
    expect((await check()).waitlisted).toBe(false)
    await nsrpAutomation.updateSettings({ waitlistOnMismatch: true }, admin.email)
    reading.fail = true
    expect((await check()).waitlisted).toBe(false)
    const timed = createConsistencyWaitlist({ Applicant, automation: nsrpAutomation, notify: vi.fn(), notifyAdmins: vi.fn(), timeoutMs: 5, readImages: async () => new Promise(() => {}) })
    await timed.begin(applicant._id, 'signup'); await drainVerificationJobs()
    expect((await timed.publicState(applicant._id)).waitlisted).toBe(false)
  })
  it('reserves the last correction chance atomically and refunds a failed save', async () => {
    await check()
    await nsrpAutomation.updateSettings({ waitlistAttempts: 1 }, admin.email)
    const results = await Promise.allSettled([consistencyWaitlist.reserveSubmission(applicant._id, 'birthCertificate'), consistencyWaitlist.reserveSubmission(applicant._id, 'birthCertificate')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')[0].reason.code).toBe('WAITLIST_ATTEMPTS_EXHAUSTED')
    const reservation = results.find(r => r.status === 'fulfilled').value
    await consistencyWaitlist.cancelReservation(applicant._id, reservation)
    await consistencyWaitlist.cancelReservation(applicant._id, reservation)
    expect((await Applicant.findById(applicant._id).select('+consistencyState')).consistencyState.used.birthCertificate).toBe(0)
  })
  it('the admin master switch releases existing waitlists to review without approving them', async () => {
    await check()
    await request(app).put('/api/admin/nsrp-automation/settings').set(auth('Admin', admin)).send({ waitlistOnMismatch: false }).expect(200)
    expect((await consistencyWaitlist.publicState(applicant._id)).status).toBe('under_review')
    const state = (await Applicant.findById(applicant._id).select('+consistencyState')).consistencyState
    expect(state.history.at(-1)).toMatchObject({ action: 'waitlist-switch-off', by: admin.email })
  })
  it('preflight flags typed issues and quality concerns without doing OCR or storing files', async () => {
    const before = await Notification.countDocuments()
    const result = await request(app).post('/api/signup/check-documents').field('id1Type', 'SSS').field('nsrpAnswers', JSON.stringify({ gsisSss: '9999999999' })).field('verificationDetails', JSON.stringify({ birthCertificate: { copyType: 'PSA copy on security paper' }, validId1: { number: '1234567890', expiry: '2000-01-01' } })).attach('validId1Front', image, { filename: 'SAMPLE.png', contentType: 'image/png' }).expect(200)
    expect(result.body).toMatchObject({ advisory: true })
    expect(result.body.issues.some(i => /NSRP/.test(i.message))).toBe(true)
    expect(result.body.issues.some(i => /expired/.test(i.message))).toBe(true)
    expect(result.body.issues.some(i => /back/.test(i.message))).toBe(true)
    expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('under_review')
    expect(await Notification.countDocuments()).toBe(before)
  })
  it.each(['release', 'request', 'resolve', 'decline'])('audits admin action %s and rejects non-admins', async actionName => {
    await check()
    const state = await Applicant.findById(applicant._id).select('+consistencyState').lean()
    const body = { action: actionName, docKey: 'birthCertificate', reason: 'Documents compared by staff.', compared: true, unresolved: state.consistencyState.issues.length, attempts: 0 }
    await request(app).post(`/api/admin/document-verification/waitlist/${applicant._id}/action`).set(auth('Applicant', applicant)).send(body).expect(403)
    if (actionName === 'release') await action({ ...body, compared: false }).expect(400)
    await action(body).expect(200)
    const saved = await Applicant.findById(applicant._id).select('+consistencyState').lean()
    expect(saved.consistencyState.history.at(-1)).toMatchObject({ action: actionName, reason: body.reason, by: admin.email })
    expect(saved.verificationStatus).toBe(actionName === 'release' ? 'under_review' : actionName === 'decline' ? 'declined' : 'waitlisted')
    if (actionName === 'decline') {
      await request(app).get('/api/profile').set(auth('Applicant', applicant)).expect(200)
      expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('declined')
    }
  })
  it('sends one seven-day reminder, pauses for explanations, and never automatically declines stale accounts', async () => {
    await check()
    const ago = new Date(Date.now() - 31 * 86400000)
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'consistencyState.lastActivityAt': ago, 'consistencyState.waitlistedAt': ago } })
    await consistencyWaitlist.daily(); await consistencyWaitlist.daily()
    expect(await Notification.countDocuments({ type: 'waitlist_reminder' })).toBe(1)
    const queue = await request(app).get('/api/admin/document-verification/queue?waitlisted=true').set(auth('Admin', admin)).expect(200)
    expect(queue.body.items.some(item => item.staleWaitlist)).toBe(true)
    await consistencyWaitlist.explanation(applicant._id)
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'consistencyState.remindedAt': null } })
    await consistencyWaitlist.daily()
    expect(await Notification.countDocuments({ type: 'waitlist_reminder' })).toBe(1)
    expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('waitlisted')
  })
})
