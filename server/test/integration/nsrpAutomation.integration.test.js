// @vitest-environment node
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest'
import { startTestDb, stopTestDb, clearDb, validNsrpAnswers, signupRequest } from './helpers.js'
import { createNsrpAutomation, SYSTEM_REVIEWER } from '../../services/nsrpAutomation.js'
import { checkNsrp, NSRP_RULES_VERSION } from '../../../shared/nsrpChecks.js'
vi.mock('../../mailer.js', async (original) => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app, nsrpAutomation } = await import('../../index.js')
const { Applicant, Employer, Admin, Notification } = await import('../../models/collections.js')
const EmployerRequest = mongoose.model('EmployerRequest')
const notify = vi.fn(async () => {})
let service
let sequence = 0
const token = (role = 'Admin') => jwt.sign({ email: 'admin@example.com', role }, process.env.JWT_SECRET || 'dev-secret')
const api = (method, path, role = 'Admin') => request(app)[method](`/api/admin/nsrp-automation${path}`).set('Authorization', `Bearer ${token(role)}`)

beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb(); notify.mockClear()
  await Admin.create({ email: 'admin@example.com', passwordHash: 'test' })
  service = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, random: () => 0.99 })
  await service.updateSettings({ auditPercent: 0, minimumEvidence: 'none' }, 'test-admin')
})

async function applicant(options = {}) {
  const email = `auto-${++sequence}@example.com`
  const version = { version: 1, status: 'pending', sourceType: 'generated', ...options.version }
  return Applicant.create({ email, passwordHash: 'test', emailVerified: true, nsrpAutoEnabledAtCreation: true,
    profile: { nsrp: validNsrpAnswers() }, phone: '09171234567', verificationDocuments: {
      nsrpForm: { versions: [version], history: [] }, birthCertificate: { versions: [{ version: 1, status: 'pending' }] }, validId1: { versions: [{ version: 1, status: 'pending' }] },
    }, ...options.account })
}
async function employer(type = 'Private') {
  const email = `employer-auto-${++sequence}@example.com`
  const account = await Employer.create({ email, passwordHash: 'test', emailVerified: true, verificationStatus: 'under_review', companyName: 'Company', phone: '09171234567' })
  await EmployerRequest.create({ email, passwordHash: 'test', companyName: 'Company', contactName: 'Contact', phone: '09171234567', nsrpAutoEnabledAtCreation: true,
    registrationDetails: { employerType: type, workforceSize: 'Micro (1-9)', lineOfBusiness: 'Retail' },
    requirementsVersions: [{ version: 1, status: 'pending', sourceType: 'generated' }], requirementsFile: { status: 'pending', version: 1 } })
  return account
}
const run = async (account, role = 'Applicant', instance = service, ip = '192.0.2.1') => {
  await instance.process({ role, accountId: account._id, ip })
  return instance.decisions().findOne({ accountId: account._id, result: { $exists: true } }, { sort: { at: -1 } })
}

describe('NSRP automation with a real MongoDB database', () => {
  it('defaults switches ON with independent evidence, a twenty percent audit sample and limit five', async () => {
    await mongoose.connection.db.collection('nsrp_auto_settings').deleteMany({})
    expect(await service.getSettings()).toMatchObject({ automaticApproval: true, applicant: true, employer: true, minimumEvidence: 'independent', auditPercent: 20, rateLimit: 5 })
  })
  it('approves only the clean NSRP, records its report and audit, and notifies once under concurrent runs', async () => {
    const account = await applicant()
    await Promise.all([run(account), run(account)])
    await run(account)
    const stored = await Applicant.findById(account._id).lean()
    expect(stored.verificationDocuments.nsrpForm.versions[0]).toMatchObject({ status: 'approved', reviewedBy: SYSTEM_REVIEWER })
    expect(stored.verificationDocuments.nsrpForm.history).toHaveLength(1)
    expect(stored.verificationDocuments.birthCertificate.versions[0].status).toBe('pending')
    expect(stored.verificationStatus).toBe('under_review')
    expect(notify).toHaveBeenCalledTimes(1)
    const decision = await service.decisions().findOne({ accountId: account._id })
    expect(decision).toMatchObject({ result: 'Auto-approved', report: { level: 'clear', documentVersion: 1, rulesVersion: NSRP_RULES_VERSION } })
    // Existing manual approval flow still controls completion of the account.
    for (const doc of ['birthCertificate', 'validId1']) {
      const response = await request(app).put(`/api/applicants/${account._id}/verification-documents/${doc}`).set('Authorization', `Bearer ${token()}`).send({ status: 'approved', reason: 'Document reviewed' })
      expect(response.status).toBe(200)
    }
    expect((await Applicant.findById(account._id)).verificationStatus).toBe('approved')
  })
  it.each([
    [{ version: { sourceType: 'uploaded' } }, 'Uploaded file'],
    [{ version: { version: 2 } }, 'Resubmission'],
    [{ account: { emailVerified: false } }, 'Email unverified'],
    [{ account: { nsrpAutoEnabledAtCreation: false } }, 'Auto-approval off'],
  ])('keeps an ineligible NSRP pending: %s', async (options, reason) => {
    const account = await applicant(options)
    expect(await run(account)).toMatchObject({ result: 'Manual', reason })
    expect((await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0].status).toBe('pending')
  })
  it.each(['Government', 'Recruitment & Placement Agency (Local)', 'Licensed Recruitment Agency (Overseas)', 'DO 174-17, Subcontractor'])('keeps %s employer NSRPs manual', async (type) => {
    expect(await run(await employer(type), 'Employer')).toMatchObject({ result: 'Manual', reason: 'Always manual: agency type' })
  })
  it.each(['warning', 'critical'])('keeps %s findings manual', async (severity) => {
    const checks = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, runCheck: () => ({ ...checkNsrp(validNsrpAnswers()), findings: [{ code: 'logical_check', severity }] }) })
    expect(await run(await applicant(), 'Applicant', checks)).toMatchObject({ result: 'Manual', reason: 'Needs attention' })
  })
  it.each([['tin', '123456789'], ['gsisSss', '1234567890']])('detects duplicate %s across accounts', async (field, value) => {
    const first = await applicant({ account: { profile: { nsrp: validNsrpAnswers({ [field]: value }) } } })
    await run(first)
    const second = await applicant({ account: { profile: { nsrp: validNsrpAnswers({ [field]: value }) } } })
    const decision = await run(second)
    expect(decision.reason).toBe('Needs attention')
    expect(decision.report.level).toBe('attention')
  })
  it('blocks cross-role duplicate TINs', async () => {
    await applicant({ account: { profile: { nsrp: validNsrpAnswers({ tin: '123456789' }) } } })
    const account = await employer()
    await EmployerRequest.updateOne({ email: account.email }, { $set: { 'registrationDetails.taxIdentificationNumber': '123456789' } })
    expect(await run(account, 'Employer')).toMatchObject({ result: 'Manual', reason: 'Needs attention' })
  })
  it('records forced audit selection and does not approve it', async () => {
    await service.updateSettings({ auditPercent: 10 }, 'admin')
    const sampled = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, random: () => 0 })
    expect(await run(await applicant(), 'Applicant', sampled)).toMatchObject({ result: 'Manual', reason: 'Audit sample', sampled: true })
  })
  it('respects the rolling per-IP and per-mobile limit under concurrent submissions', async () => {
    const accounts = await Promise.all(Array.from({ length: 8 }, () => applicant()))
    const results = await Promise.all(accounts.map((account, index) => run(account, 'Applicant', service, `192.0.2.${index}`)))
    expect(results.filter((item) => item.result === 'Auto-approved')).toHaveLength(5)
    expect(results.filter((item) => item.reason === 'Rate guard')).toHaveLength(3)
    const raw = await mongoose.connection.db.collection('nsrp_auto_rate_guard').findOne({ _id: 'rolling' })
    expect(JSON.stringify(raw)).not.toContain('192.0.2.')
    expect(JSON.stringify(raw)).not.toContain('09171234567')
  })
  it('enforces the IP limit for distinct mobile numbers and expires reservations after 24 hours', async () => {
    const accounts = await Promise.all(Array.from({ length: 6 }, (_, index) => applicant({ account: { profile: { nsrp: validNsrpAnswers({ cellphone: `0917123456${index}` }) } } })))
    for (const account of accounts) await run(account)
    expect((await service.decisions().findOne({ accountId: accounts[5]._id })).reason).toBe('Rate guard')
    await mongoose.connection.db.collection('nsrp_auto_rate_guard').updateOne({ _id: 'rolling' }, { $set: { 'entries.$[].at': new Date(Date.now() - 25 * 3600000) } })
    expect((await run(await applicant())).result).toBe('Auto-approved')
  })
  it('does not unlock employer account access when only its NSRP is auto-approved', async () => {
    const account = await employer()
    expect((await run(account, 'Employer')).result).toBe('Auto-approved')
    expect((await EmployerRequest.findOne({ email: account.email })).requirementsFile.status).toBe('approved')
    expect((await Employer.findById(account._id)).verificationStatus).toBe('under_review')
    const response = await request(app).get('/api/employer/verification').set('Authorization', `Bearer ${jwt.sign({ email: account.email, role: 'Employer' }, process.env.JWT_SECRET || 'dev-secret')}`)
    expect(response.body.verificationStatus).toBe('under_review')
  })
  it('turning the switch OFF stops new approvals without changing existing ones', async () => {
    const first = await applicant(); await run(first)
    await api('put', '/settings').send({ applicant: false }).expect(200)
    expect((await run(await applicant())).reason).toBe('Auto-approval off')
    expect((await Applicant.findById(first._id)).verificationDocuments.nsrpForm.versions[0].status).toBe('approved')
    expect((await service.getSettings()).history.at(-1).by).toBe('admin@example.com')
  })
  it('requires a reason to revoke and records it, resets verification, and notifies the owner', async () => {
    const account = await applicant(); const decision = await run(account)
    await api('post', '/revoke').send({ id: decision._id, reason: '' }).expect(400)
    await api('post', '/revoke').send({ id: decision._id, reason: 'Supervisor review required' }).expect(200)
    const stored = await Applicant.findById(account._id)
    expect(stored.verificationDocuments.nsrpForm.versions[0].status).toBe('pending')
    expect(stored.verificationDocuments.nsrpForm.history.at(-1).action).toBe('revoke-auto-approval')
    expect(stored.verificationStatus).toBe('under_review')
    expect((await service.decisions().findOne({ _id: decision._id })).result).toBe('Revoked')
    expect(await Notification.countDocuments({ type: 'document_review_update' })).toBe(1)
    await run(account)
    expect((await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0].status).toBe('pending')
  })
  it('makes dismissed critical findings permanently manual, including later versions', async () => {
    const account = await applicant()
    await service.decisions().insertOne({ _id: 'previous', role: 'Applicant', accountId: account._id, dismissedCritical: true })
    expect((await run(account)).reason).toBe('Always manual: dismissed critical finding')
  })
  it('does not retroactively approve accounts created while disabled after the switch is enabled', async () => {
    await service.updateSettings({ applicant: false }, 'admin')
    const account = await applicant({ account: { nsrpAutoEnabledAtCreation: await service.creationEnabled('Applicant') } })
    await service.updateSettings({ applicant: true }, 'admin')
    expect((await run(account)).reason).toBe('Auto-approval off')
  })
  it('does not approve a version replaced while its check was running', async () => {
    const account = await applicant()
    const racing = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, random: () => 0.99, beforeApproval: async () => {
      await Applicant.updateOne({ _id: account._id }, { $push: { 'verificationDocuments.nsrpForm.versions': { version: 2, sourceType: 'generated', status: 'pending' } } })
    } })
    expect((await run(account, 'Applicant', racing)).result).toBe('Manual')
    expect((await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions.at(-1).status).toBe('pending')
    expect(notify).not.toHaveBeenCalled()
  })
  it('revoking a document preserves an administrative restriction', async () => {
    const account = await applicant(); const decision = await run(account)
    await Applicant.updateOne({ _id: account._id }, { $set: { verificationStatus: 'restricted' } })
    expect(await service.revoke(decision._id, 'admin', 'Inspect original documents')).toBe(true)
    expect((await Applicant.findById(account._id)).verificationStatus).toBe('restricted')
  })
  it('announces automatic approvals to admins once per day as an info digest', async () => {
    const admins = vi.fn()
    const digestService = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, notifyAdmins: admins, random: () => 0.99 })
    await run(await applicant(), 'Applicant', digestService)
    await run(await applicant(), 'Applicant', digestService)
    expect(admins).toHaveBeenCalledTimes(1)
    expect(admins.mock.calls[0][0].metadata.severity).toBe('info')
  })
  it.each(['Applicant', 'Employer'])('prevents %s from reading settings or decisions, modifying settings, or revoking', async (role) => {
    if (role === 'Applicant') await Applicant.create({ email: 'admin@example.com', passwordHash: 'test' })
    await api('get', '/settings', role).expect(403)
    await api('get', '/decisions', role).expect(403)
    await api('put', '/settings', role).send({ applicant: false }).expect(403)
    await api('post', '/revoke', role).send({ id: 'x', reason: 'x' }).expect(403)
  })
  it('validates setting ranges and allows date-filtered admin logs', async () => {
    await api('put', '/settings').send({ rateLimit: 6 }).expect(400)
    await api('put', '/settings').send({ auditPercent: 101 }).expect(400)
    await api('put', '/settings').send({ applicant: 'true' }).expect(400)
    await run(await applicant())
    const response = await api('get', '/decisions?from=2000-01-01&to=2099-12-31&result=Auto-approved')
    expect(response.body.total).toBe(1)
  })
  it.each(['check', 'approval'])('a failure in %s leaves the document pending and logs no personal data', async (stage) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fail = async () => { throw new Error('private name user@example.com 09171234567') }
    const failing = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, random: () => 0.99, ...(stage === 'check' ? { runCheck: fail } : { beforeApproval: fail }) })
    const account = await applicant()
    expect((await run(account, 'Applicant', failing)).result).toBe('Manual')
    expect((await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0].status).toBe('pending')
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/user@example|091712|private name/)
    log.mockRestore()
  })
  it('runs within signup, sends the usual notification/email, and keeps reports private', async () => {
    const response = await signupRequest(request(app).post('/api/signup'), { email: 'signup-auto@example.com' })
    expect(response.status).toBe(200)
    const account = await Applicant.findOne({ email: 'signup-auto@example.com' })
    expect(account.verificationDocuments.nsrpForm.versions[0].reviewedBy).toBe(SYSTEM_REVIEWER)
    expect(account.verificationStatus).toBe('under_review')
    expect(await Notification.countDocuments({ type: 'document_approved' })).toBe(1)
    const ownerToken = jwt.sign({ sub: String(account._id), sessionVersion: account.sessionVersion, email: account.email, role: 'Applicant' }, process.env.JWT_SECRET || 'dev-secret')
    const owner = await request(app).get(`/api/applicants/${account._id}/verification-documents`).set('Authorization', `Bearer ${ownerToken}`)
    expect(JSON.stringify(owner.body)).not.toMatch(/sampled|rulesVersion|report|Auto-approval off|nsrpAutoEnabledAtCreation/)
  })
  it('signup succeeds if the check service fails', async () => {
    const spy = vi.spyOn(nsrpAutomation, 'process').mockImplementation(async () => {
      const failing = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, runCheck: () => { throw new Error('simulated failure') } })
      const account = await Applicant.findOne({ email: 'signup-failure@example.com' })
      await failing.process({ role: 'Applicant', accountId: account._id, ip: '192.0.2.1' })
    })
    const response = await signupRequest(request(app).post('/api/signup'), { email: 'signup-failure@example.com' })
    spy.mockRestore()
    expect(response.status).toBe(200)
    expect((await Applicant.findOne({ email: 'signup-failure@example.com' })).verificationDocuments.nsrpForm.versions[0].status).toBe('pending')
  })
})
