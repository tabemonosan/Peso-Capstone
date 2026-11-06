// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { generateKeyPairSync, sign } from 'node:crypto'
import { startTestDb, stopTestDb, clearDb, validNsrpAnswers, validBasicInfo, emailProofFor, pdfBuffer } from './helpers.js'
import { drainVerificationJobs } from '../../services/verificationJobs.js'
import { storeDocumentFile } from '../../utils/documentFiles.js'
import { createConsistencyWaitlist } from '../../services/consistencyWaitlist.js'
import { MANUAL_CHECKLIST } from '../../../shared/manualDocumentReview.js'
const reading = vi.hoisted(() => ({ text: '', confidence: 95, fail: false, qr: '' }))
vi.mock('../../services/localImageReading.js', () => ({
  readQr: vi.fn(async (_buffer, consume) => { if (reading.qr && consume) await consume(reading.qr); return { found: Boolean(reading.qr) } }),
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
afterAll(async () => { vi.unstubAllEnvs(); await stopTestDb() })
beforeEach(async () => {
  await clearDb()
  vi.unstubAllEnvs()
  reading.text = sampleText('1992-02-03'); reading.confidence = 95; reading.fail = false; reading.qr = ''
  admin = await Admin.create({ email: 'waitlist-admin@example.test', passwordHash: 'unused' })
  applicant = await Applicant.create({ email: 'waitlist-sample@example.test', passwordHash: await bcrypt.hash('SamplePassword123!', 4), emailVerified: true, profile: { firstName: 'Sample', lastName: 'Example', dob: '1990-01-01', location: 'Albay', nsrp: validNsrpAnswers({ firstName: 'Sample', surname: 'Example', dob: '1990-01-01', gsisSss: '1234567890' }) }, verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map(key => [key, { uploads: 1, versions: [{ version: 1, status: 'pending', mimetype: key === 'nsrpForm' ? 'application/pdf' : 'image/png', originalName: 'SAMPLE.png', uploadedAt: new Date(), quality: { passed: true }, declaredDetails: { idType: 'SSS', number: '1234567890', copyType: 'PSA copy on security paper' } }] }])) })
  for (const slot of ['birthCertificate', 'validId1']) await storeDocumentFile(applicant._id, slot, 1, 'front', { mimetype: 'image/png', buffer: image, size: image.length })
  await nsrpAutomation.updateSettings({ automaticApproval: false }, admin.email)
})
const check = async () => { await consistencyWaitlist.begin(applicant._id, 'signup', undefined, '192.0.2.8'); await drainVerificationJobs(); return consistencyWaitlist.publicState(applicant._id) }
const action = async body => {
  const account = await Applicant.findById(applicant._id).select('+consistencyState').lean()
  return request(app).post(`/api/admin/document-verification/waitlist/${applicant._id}/action`).set(auth('Admin', admin)).send({ token: account.consistencyState?.token, ...body })
}
describe('consistency waitlist', () => {
  describe.each(['online', 'upload'])('%s signup automation', mode => {
    it.each([
      ['matching documents', {}, false, false, 'approved', 'approved', 'approved'],
      ['significant mismatch', {}, true, false, 'waitlisted', 'pending', 'pending'],
      ['reader unavailable', {}, false, true, 'under_review', 'pending', 'pending'],
      ['glare warning', {}, false, false, 'under_review', 'pending', 'pending'],
      ['automation disabled', { automaticApproval: false }, false, false, 'under_review', 'pending', 'pending'],
      ['birth certificate automation disabled', { birthCertificate: false }, false, false, 'under_review', 'pending', 'approved'],
      ['ID automation disabled', { validId: false }, false, false, 'under_review', 'approved', 'pending'],
    ])('handles %s through the signup endpoint', async (_label, settings, mismatch, readerFailure, status, birthStatus, idStatus) => {
      reading.text = sampleText(mismatch ? '1992-02-03' : '1990-01-01').replace('1234567890', '4982761053')
      reading.fail = readerFailure
      const upload = _label === 'glare warning' ? image : await sharp(image).linear(0.85).png().toBuffer()
      await nsrpAutomation.updateSettings({ automaticApproval: true, ...settings }, admin.email)
      const email = `signup-${mode}@example.test`
      let submission = request(app).post('/api/signup')
        .field('email', email).field('password', 'SamplePassword123!').field('consent', 'true')
        .field('emailProof', emailProofFor(email)).field('nsrpMode', mode).field('id1Type', 'SSS')
        .field('verificationDetails', JSON.stringify({ birthCertificate: { copyType: 'PSA copy on security paper' }, validId1: { number: '4982761053' } }))
      if (mode === 'online') submission = submission.field('nsrpAnswers', JSON.stringify(validNsrpAnswers({ firstName: 'Sample', surname: 'Example', gsisSss: '4982761053' })))
      else {
        for (const [key, value] of Object.entries(validBasicInfo({ firstName: 'Sample', lastName: 'Example' }))) submission = submission.field(key, value)
        submission = submission.attach('nsrpFile', pdfBuffer(), { filename: 'SAMPLE.pdf', contentType: 'application/pdf' })
      }
      const response = await submission
        .attach('birthCertificate', upload, { filename: 'SAMPLE-birth.png', contentType: 'image/png' })
        .attach('validId1Front', upload, { filename: 'SAMPLE-id.png', contentType: 'image/png' })
      expect(response.status, JSON.stringify(response.body)).toBe(200)
      await drainVerificationJobs()
      const created = await Applicant.findOne({ email }).lean()
      expect(created.verificationDocuments.birthCertificate.versions.at(-1).status, JSON.stringify(created.verificationDocuments.birthCertificate)).toBe(birthStatus)
      expect(created.verificationDocuments.validId1.versions.at(-1).status, JSON.stringify(created.verificationDocuments.validId1)).toBe(idStatus)
      expect(created.verificationStatus).toBe(status)
      expect(created.verificationDocuments.nsrpForm.versions.at(-1).status).toBe('pending')
      const review = await request(app).get('/api/profile/review-status').set('Authorization', `Bearer ${response.body.token}`).expect(200)
      expect(review.body.status).toBe(status)
      expect(await Notification.countDocuments({ type: 'account_verified', 'recipient.id': created._id })).toBe(status === 'approved' ? 1 : 0)
    })
  })
  const approve = async docKey => {
    const account = await Applicant.findById(applicant._id).lean()
    const document = account.verificationDocuments[docKey].versions.at(-1)
    return request(app).post('/api/admin/document-verification/action').set(auth('Admin', admin)).send({
      role: 'Applicant', accountId: String(applicant._id), docKey, version: document.version,
      action: 'approve', reason: 'Compared the original document against NSRP.',
      unresolved: (document.findings || []).filter(f => ['warning', 'critical'].includes(f.severity) && f.status !== 'dismissed').length,
      checklist: Object.fromEntries(Object.keys(MANUAL_CHECKLIST).map(key => [key, true])),
    }).expect(200)
  }
  it('clears each manually approved document and verifies after both approvals, including later checks', async () => {
    await check()
    await approve('birthCertificate')
    let account = await Applicant.findById(applicant._id).select('+consistencyState').lean()
    expect(account.verificationStatus).toBe('waitlisted')
    expect(account.consistencyState.issues.every(issue => issue.docKey !== 'birthCertificate')).toBe(true)
    await approve('validId1')
    account = await Applicant.findById(applicant._id).select('+consistencyState').lean()
    expect(account.verificationStatus).toBe('approved')
    expect(account.consistencyState.issues).toEqual([])
    expect(await Notification.countDocuments({ type: 'account_verified' })).toBe(1)
    expect((await check()).status).toBe('approved')
  })
  it('prevents a check already in progress from overriding manual approval', async () => {
    await check()
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'consistencyState.status': 'checking' } })
    const before = await Applicant.findById(applicant._id).select('+consistencyState').lean()
    await approve('birthCertificate')
    await approve('validId1')
    await consistencyWaitlist.finish(applicant._id, before.consistencyState.token, 'complete')
    expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('approved')
  })
  it('repairs existing waitlists whose documents were already manually approved', async () => {
    await check()
    await Applicant.updateOne({ _id: applicant._id }, { $set: Object.fromEntries(['birthCertificate', 'validId1'].flatMap(key => [
      [`verificationDocuments.${key}.versions.0.status`, 'approved'],
      [`verificationDocuments.${key}.versions.0.reviewedBy`, admin.email],
      [`verificationDocuments.${key}.versions.0.autoApproved`, false],
    ])) })
    expect((await consistencyWaitlist.publicState(applicant._id)).checking).toBe(true)
    await drainVerificationJobs()
    expect((await consistencyWaitlist.publicState(applicant._id)).status).toBe('approved')
  })
  it('automatically rechecks legacy shared-phone flags without using correction chances', async () => {
    reading.text = sampleText('1990-01-01').replace('1234567890', '4982761053')
    await nsrpAutomation.updateSettings({ automaticApproval: true, auditPercent: 0, dataChecks: false }, admin.email)
    await Applicant.updateOne({ _id: applicant._id }, { $set: {
      verificationStatus: 'waitlisted', verificationReason: 'Your account needs a review by PESO staff.',
      'profile.nsrp.gsisSss': '4982761053',
      'verificationDocuments.validId1.versions.0.declaredDetails.number': '4982761053',
      ...Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map(key => [`verificationDocuments.${key}.versions.0.findings`, [{ ruleId: 'duplicate_mobile', severity: 'warning', status: 'open' }]])),
      consistencyState: { status: 'finished', rulesVersion: '2026-11-04.1', used: {}, issues: [{ docKey: 'birthCertificate', reasonCode: 'staff_review', fieldGroup: 'document' }] },
    } })
    expect((await consistencyWaitlist.publicState(applicant._id, '192.0.2.8')).checking).toBe(true)
    await drainVerificationJobs()
    const state = await consistencyWaitlist.publicState(applicant._id)
    expect(state).toMatchObject({ status: 'approved', checking: false, waitlisted: false, issues: [] })
    expect((await Applicant.findById(applicant._id).select('+consistencyState')).consistencyState.used).toEqual({})
  })
  it.each(['image/png', 'application/pdf'])('scans an uploaded %s correction and verifies matching documents without a staff task', async mimetype => {
    await check()
    reading.text = sampleText('1990-01-01').replace('1234567890', '4982761053')
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'profile.nsrp.gsisSss': '4982761053', 'verificationDocuments.validId1.versions.0.declaredDetails.number': '4982761053' } })
    await nsrpAutomation.updateSettings({ automaticApproval: true, auditPercent: 0, dataChecks: false }, admin.email)
    const response = await request(app).post('/api/profile/verification-documents/birthCertificate').set(auth('Applicant', applicant)).field('verificationDetails', JSON.stringify({ copyType: 'PSA copy on security paper' })).attach('document', mimetype === 'application/pdf' ? pdfBuffer() : await sharp(image).linear(0.85).png().toBuffer(), { filename: mimetype === 'application/pdf' ? 'SAMPLE.pdf' : 'SAMPLE.png', contentType: mimetype })
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    await drainVerificationJobs()
    const saved = await Applicant.findById(applicant._id)
    expect(saved.verificationDocuments.birthCertificate.versions.at(-1).status, JSON.stringify(saved.verificationDocuments.birthCertificate.versions.at(-1))).toBe('approved')
    expect(saved.verificationStatus).toBe('approved')
    expect(await Notification.countDocuments({ type: 'document_resubmitted' })).toBe(0)
  })
  it('automatically verifies matching identity documents against NSRP without approving NSRP itself', async () => {
    reading.text = sampleText('1990-01-01').replace('1234567890', '4982761053')
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'profile.nsrp.gsisSss': '4982761053', 'verificationDocuments.validId1.versions.0.declaredDetails.number': '4982761053' } })
    await nsrpAutomation.updateSettings({ automaticApproval: true, auditPercent: 0, dataChecks: false }, admin.email)
    await nsrpAutomation.process({ role: 'Applicant', accountId: applicant._id, ip: '192.0.2.8' })
    await check()
    const saved = await Applicant.findById(applicant._id)
    expect(saved.verificationDocuments.nsrpForm.versions[0].status).toBe('pending')
    expect(saved.verificationDocuments.birthCertificate.versions[0].status, JSON.stringify(saved.verificationDocuments)).toBe('approved')
    expect(saved.verificationDocuments.validId1.versions[0].status).toBe('approved')
    expect(saved.verificationStatus).toBe('approved')
  })
  it.each([false, true])('signup succeeds with asynchronous screening when reader failure is %s', async readerFailure => {
    reading.fail = readerFailure
    const email = `signup-screening-${readerFailure}@example.test`
    let submission = request(app).post('/api/signup').field('email', email).field('password', 'SamplePassword123!').field('consent', 'true').field('emailProof', emailProofFor(email)).field('nsrpMode', 'upload').field('id1Type', 'SSS').field('verificationDetails', JSON.stringify({ birthCertificate: { copyType: 'PSA copy on security paper' }, validId1: { number: '1234567890' } }))
    for (const [key, value] of Object.entries(validBasicInfo())) submission = submission.field(key, value)
    const response = await submission.attach('nsrpFile', pdfBuffer(), { filename: 'SAMPLE.pdf', contentType: 'application/pdf' }).attach('birthCertificate', image, { filename: 'SAMPLE-birth.png', contentType: 'image/png' }).attach('validId1Front', image, { filename: 'SAMPLE-id.png', contentType: 'image/png' })
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    await drainVerificationJobs()
    const created = await Applicant.findOne({ email })
    expect(created.verificationStatus).toBe(readerFailure ? 'under_review' : 'waitlisted')
    const state = await request(app).get('/api/profile/consistency').set('Authorization', `Bearer ${response.body.token}`).expect(200)
    expect(state.body.waitlisted).toBe(!readerFailure)
    expect(JSON.stringify(state.body)).not.toContain('1992-02-03')
  })

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
  it('uses verified QR differences even when OCR is unavailable and the ID was previously approved', async () => {
    const keys = generateKeyPairSync('ed25519')
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'sample' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ firstName: 'Sample', surname: 'Example', dob: '1992-02-03' })).toString('base64url')
    const unsigned = `${header}.${payload}`
    reading.qr = `${unsigned}.${sign(null, Buffer.from(unsigned), keys.privateKey).toString('base64url')}`
    vi.stubEnv('PHILSYS_PUBLIC_KEYS', JSON.stringify({ sample: { pem: keys.publicKey.export({ type: 'spki', format: 'pem' }) } }))
    await nsrpAutomation.updateSettings({ ocrTextReading: false }, admin.email)
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'verificationDocuments.validId1.versions.0.status': 'approved', 'verificationDocuments.validId1.versions.0.declaredDetails': { idType: 'PhilSys National ID', format: 'Card' } } })
    expect((await check()).waitlisted).toBe(true)
    expect((await consistencyWaitlist.publicState(applicant._id)).issues.some(i => i.document === 'validId1' && i.fieldGroup === 'birth date')).toBe(true)
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
  it('verifies a previously waitlisted account after all corrected documents pass', async () => {
    await check()
    reading.text = sampleText('1990-01-01').replace('1234567890', '4982761053')
    await Applicant.updateOne({ _id: applicant._id }, { $set: { 'profile.nsrp.gsisSss': '4982761053', 'verificationDocuments.validId1.versions.0.declaredDetails.number': '4982761053' } })
    await nsrpAutomation.updateSettings({ automaticApproval: true, auditPercent: 100, dataChecks: false }, admin.email)
    await consistencyWaitlist.begin(applicant._id, 'nsrpForm', undefined, '192.0.2.8'); await drainVerificationJobs()
    const saved = await Applicant.findById(applicant._id)
    expect(saved.verificationDocuments.birthCertificate.versions[0].status, JSON.stringify(saved.verificationDocuments)).toBe('approved')
    expect(saved.verificationDocuments.validId1.versions[0].status).toBe('approved')
    expect(saved.verificationStatus).toBe('approved')
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
    expect((await action({ action: 'grant', docKey: 'birthCertificate', attempts: 1, reason: '' })).status).toBe(400)
    expect((await action({ action: 'grant', docKey: 'birthCertificate', attempts: 1, reason: 'Additional document requested by staff.' })).status).toBe(200)
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
  it('rejects a stale admin release even when the unresolved flag count is unchanged', async () => {
    await check()
    const old = (await Applicant.findById(applicant._id).select('+consistencyState')).consistencyState
    await consistencyWaitlist.begin(applicant._id, 'signup'); await drainVerificationJobs()
    const response = await action({ action: 'release', token: old.token, compared: true, unresolved: old.issues.length, reason: 'Documents were compared before the new check.' })
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('WAITLIST_CHANGED')
    expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('waitlisted')
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
  it('does not retroactively screen an approved account during profile-only edits', async () => {
    await Applicant.updateOne({ _id: applicant._id }, { $set: { verificationStatus: 'approved', ...Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map(key => [`verificationDocuments.${key}.versions.0.status`, 'approved'])) } })
    await request(app).put('/api/profile').set(auth('Applicant', applicant)).send({ profile: { firstName: 'Sample', middleName: '', lastName: 'Example-Changed' } }).expect(200)
    await drainVerificationJobs()
    const saved = await Applicant.findById(applicant._id).select('+consistencyState')
    expect(saved.verificationStatus).toBe('approved')
    expect(saved.consistencyState).toBeUndefined()
  })
  it.each(['release', 'request', 'resolve', 'decline'])('audits admin action %s and rejects non-admins', async actionName => {
    await check()
    const state = await Applicant.findById(applicant._id).select('+consistencyState').lean()
    const body = { action: actionName, docKey: 'birthCertificate', reason: 'Documents compared by staff.', compared: true, unresolved: state.consistencyState.issues.length, attempts: 0 }
    await request(app).post(`/api/admin/document-verification/waitlist/${applicant._id}/action`).set(auth('Applicant', applicant)).send(body).expect(403)
    if (actionName === 'release') expect((await action({ ...body, compared: false })).status).toBe(400)
    expect((await action(body)).status).toBe(200)
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
