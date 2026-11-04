// @vitest-environment node
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import { generateKeyPairSync, sign } from 'node:crypto'
import QRCode from 'qrcode'
import { startTestDb, stopTestDb, clearDb, validNsrpAnswers } from './helpers.js'
import { createVerificationEngine } from '../../services/verificationEngine.js'
import { createNsrpAutomation } from '../../services/nsrpAutomation.js'
import { storeDocumentFile } from '../../utils/documentFiles.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({})), initMailer: vi.fn() }))
await import('../../index.js')
const { Applicant, Employer } = await import('../../models/collections.js')
const EmployerRequest = mongoose.model('EmployerRequest')
const notify = vi.fn(async () => {}), notifyAdmins = vi.fn(async () => {})
let automation, engine, sequence = 0
const version = extra => ({ version: 1, status: 'pending', quality: { passed: true, warnings: [] }, imageComparisons: [{ fieldGroup: 'name', result: 'match', evidence: 'independent' }], ...extra })
async function account(extra = {}, docKey = 'birthCertificate', accountExtra = {}) {
  return Applicant.create({ email: `engine-${++sequence}@example.invalid`, passwordHash: 'test', emailVerified: true, phone: '09171234567', nsrpAutoEnabledAtCreation: true, profile: { nsrp: validNsrpAnswers() }, verificationDocuments: { [docKey]: { versions: [version(extra)] } }, ...accountExtra })
}
const run = (user, docKey = 'birthCertificate', instance = engine) => instance.process({ role: 'Applicant', accountId: user._id, docKey, ip: '192.0.2.7' })
const saved = (user, docKey = 'birthCertificate') => Applicant.findById(user._id).lean().then(a => a.verificationDocuments[docKey].versions.at(-1))
beforeAll(startTestDb, 180000)
afterAll(async () => { vi.unstubAllEnvs(); await stopTestDb() })
beforeEach(async () => {
 await clearDb(); notify.mockClear(); notifyAdmins.mockClear(); vi.unstubAllEnvs()
 automation = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify })
 await automation.updateSettings({ auditPercent: 0, dataChecks: false }, 'test-admin')
 engine = createVerificationEngine({ Applicant, Employer, EmployerRequest, automation, notify, notifyAdmins, recomputeApplicant: async () => {}, random: () => 0.5 })
})
it.each(['birthCertificate', 'validId1'])('approves an unflagged %s with independent evidence once under concurrency', async docKey => {
 const user = await account({}, docKey)
 await Promise.all([run(user, docKey), run(user, docKey), run(user, docKey)])
 expect(await saved(user, docKey)).toMatchObject({ status: 'approved', approvedBy: 'system', autoApproved: true, provider: 'LocalChecksProvider' })
 expect((await saved(user, docKey)).verificationAudit).toHaveLength(1)
 expect(notify).toHaveBeenCalledTimes(1)
})
it('holds audit samples before approval and never rerolls the recorded sample', async () => {
 await automation.updateSettings({ auditPercent: 100 }, 'test-admin')
 const user = await account(); await run(user)
 expect(await saved(user)).toMatchObject({ status: 'pending', reviewReasons: ['Audit sample'] })
 await automation.updateSettings({ auditPercent: 0 }, 'test-admin'); await run(user)
 expect((await saved(user)).status).toBe('pending')
 expect((await automation.decisions().findOne({ accountId: user._id })).sampleDraw).toBe(0.5)
})
it('enforces the shared rolling IP/mobile quota', async () => {
 const users = await Promise.all(Array.from({ length: 6 }, () => account()))
 await Promise.all(users.map(user => run(user)))
 const rows = await automation.decisions().find({}).toArray()
 expect(rows.filter(row => row.result === 'Auto-approved')).toHaveLength(5)
 expect(rows.filter(row => row.reason === 'Rate guard')).toHaveLength(1)
})
it('requires independent evidence by default and supports the explicit typed-only option', async () => {
 const first = await account({ imageComparisons: [] }); await run(first)
 expect((await saved(first)).reviewReasons).toContain('Not independent')
 await automation.updateSettings({ minimumEvidence: 'none' }, 'test-admin')
 const second = await account({ imageComparisons: [] }); await run(second)
 expect((await saved(second)).status).toBe('approved')
})
it('rechecks the kill switch immediately before writing an approval', async () => {
 const user = await account()
 const instance = createVerificationEngine({ Applicant, Employer, EmployerRequest, automation, notify, notifyAdmins, recomputeApplicant: async () => {}, beforeApproval: () => automation.updateSettings({ automaticApproval: false }, 'test-admin') })
 await run(user, 'birthCertificate', instance)
 expect((await saved(user)).status).toBe('pending'); expect(notify).not.toHaveBeenCalled()
})
it('does not approve identity evidence against an NSRP reference replaced during the check', async () => {
 const user = await account({}, 'birthCertificate', { verificationDocuments: { birthCertificate: { versions: [version()] }, nsrpForm: { versions: [version({ sourceType: 'generated' })] } } })
 const instance = createVerificationEngine({ Applicant, Employer, EmployerRequest, automation, notify, notifyAdmins, recomputeApplicant: async () => {}, beforeApproval: async () => {
  await Applicant.updateOne({ _id: user._id }, { $push: { 'verificationDocuments.nsrpForm.versions': version({ version: 2, sourceType: 'generated' }) } })
 } })
 await run(user, 'birthCertificate', instance)
 expect(await saved(user)).toMatchObject({ status: 'pending', reviewReasons: ['Registration reference changed'] })
 expect(notify).not.toHaveBeenCalled()
})
it('never approves resubmissions, uploaded NSRP forms, or accounts with pending explanations', async () => {
 for (const [extra, docKey, expected] of [[{ version: 2 }, 'birthCertificate', 'Resubmission'], [{ explanation: { status: 'submitted' } }, 'birthCertificate', 'Explanation']]) {
  const user = await account(extra, docKey); await run(user, docKey)
  expect((await saved(user, docKey)).reviewReasons).toContain(expected)
 }
})
it.each(['uploaded', 'generated'])('does not independently approve or sample the %s NSRP reference', async sourceType => {
 const user = await account({ sourceType }, 'nsrpForm'); await run(user, 'nsrpForm')
 expect((await saved(user, 'nsrpForm')).status).toBe('pending')
 expect(await automation.decisions().countDocuments({ accountId: user._id })).toBe(0)
 expect(notify).not.toHaveBeenCalled()
})
it('provider errors leave status pending and emit only a fixed redacted message', async () => {
 const log = vi.spyOn(console, 'error').mockImplementation(() => {})
 try {
  const user = await account(), instance = createVerificationEngine({ Applicant, Employer, EmployerRequest, automation, notify, notifyAdmins, recomputeApplicant: async () => {}, providers: { verify: async () => { throw new Error('PRIVATE Juan 1990-01-01 P123456') } } })
  await run(user, 'birthCertificate', instance)
  expect((await saved(user)).status).toBe('pending')
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE|Juan|1990|P123456/)
 } finally { log.mockRestore() }
})
it('routes three technical failures to an admin without declining and counts each version once', async () => {
 const user = await account(), instance = createVerificationEngine({ Applicant, Employer, EmployerRequest, automation, notify, notifyAdmins, recomputeApplicant: async () => {}, providers: { verify: async () => ({ provider: 'Test', result: 'failed', assurance: 'low', findings: [] }) } })
 for (let attempt = 1; attempt <= 3; attempt++) {
  if (attempt > 1) await Applicant.updateOne({ _id: user._id }, { $push: { 'verificationDocuments.birthCertificate.versions': version({ version: attempt }) } })
  await run(user, 'birthCertificate', instance)
 }
 expect(await saved(user)).toMatchObject({ status: 'pending', technicalAttempts: 3, reviewReasons: ['Technical attempts: admin review'] })
 await run(user, 'birthCertificate', instance)
 expect((await Applicant.findById(user._id).select('+verificationFailureCounts')).verificationFailureCounts.birthCertificate).toBe(3)
})
it('verifies a generated signed QR image locally and flags its reuse on another account', async () => {
 const keys = generateKeyPairSync('ed25519'), header = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'demo' })).toString('base64url')
 const payload = Buffer.from(JSON.stringify({ firstName: 'Juan', surname: 'Cruz', dob: '1990-01-01', cardNumber: 'DO-NOT-STORE' })).toString('base64url')
 const unsigned = header + '.' + payload, encoded = unsigned + '.' + sign(null, Buffer.from(unsigned), keys.privateKey).toString('base64url')
 vi.stubEnv('PHILSYS_PUBLIC_KEYS', JSON.stringify({ demo: { pem: keys.publicKey.export({ type: 'spki', format: 'pem' }) } }))
 const buffer = await QRCode.toBuffer(encoded, { width: 800, margin: 4 })
 const first = await account({ declaredDetails: { idType: 'PhilSys National ID', format: 'Card' }, imageComparisons: [] }, 'validId1')
 const second = await account({ declaredDetails: { idType: 'PhilSys National ID', format: 'Card' }, imageComparisons: [] }, 'validId1')
 for (const user of [first, second]) { await storeDocumentFile(user._id, 'validId1', 1, 'front', { mimetype: 'image/png', buffer, size: buffer.length }); await run(user, 'validId1') }
 expect(await saved(first, 'validId1'), JSON.stringify(await automation.decisions().findOne({ accountId: first._id }, { projection: { reason: 1, provider: 1, assurance: 1 } }))).toMatchObject({ status: 'approved', provider: 'PhilSysQrSignatureProvider', assurance: 'high' })
 expect((await saved(second, 'validId1')).findings.some(f => f.ruleId === 'duplicate_qr')).toBe(true)
 const stored = JSON.stringify(await automation.decisions().find({}).toArray()) + JSON.stringify(await mongoose.connection.db.collection('verification_qr_claims').find({}).toArray())
 expect(stored).not.toMatch(/DO-NOT-STORE|1990-01-01|signature|qrPayload/)
 expect(stored).not.toContain(encoded)
}, 15000)
it('sends one counted digest for the preceding Manila day', async () => {
 const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), end = new Date(day + 'T00:00:00+08:00')
 const at = new Date(+end - 3600000)
 await automation.decisions().insertMany([{ _id: 'digest-auto', result: 'Auto-approved', at }, { _id: 'digest-sample', result: 'Manual', reason: 'Audit sample', at }, { _id: 'digest-revoked', result: 'Revoked', at }])
 await engine.digest(); await engine.digest()
 expect(notifyAdmins).toHaveBeenCalledTimes(1)
 expect(notifyAdmins.mock.calls[0][0].metadata).toEqual({ automatic: 1, flagged: 1, samples: 1, revoked: 1 })
})
it.each(['Private', 'Government', 'Recruitment & Placement Agency (Local)', 'Licensed Recruitment Agency (Overseas)', 'DO 174-17, Subcontractor'])('handles employer type %s through the same rules', async employerType => {
 await automation.updateSettings({ minimumEvidence: 'none' }, 'test-admin')
 const employer = await Employer.create({ email: 'employer-engine@example.invalid', passwordHash: 'test', emailVerified: true, phone: '09171234567' })
 await EmployerRequest.create({ email: employer.email, passwordHash: 'test', companyName: 'Company', contactName: 'Contact', phone: employer.phone, status: 'under_review', registrationDetails: { employerType, workforceSize: 'Micro (1-9)', lineOfBusiness: 'Retail' }, requirementsFile: { status: 'pending' }, requirementsVersions: [version({ sourceType: 'generated' })] })
 await engine.process({ role: 'Employer', accountId: employer._id, docKey: 'employerNsrpForm', ip: '192.0.2.4' })
 const stored = await EmployerRequest.findOne({ email: employer.email })
 expect(stored.requirementsVersions[0].status).toBe(employerType === 'Private' ? 'approved' : 'pending')
 expect((await Employer.findById(employer._id)).verificationStatus).toBe('under_review')
})
