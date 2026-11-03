// @vitest-environment node
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest'
import { startTestDb, stopTestDb, clearDb, validNsrpAnswers } from './helpers.js'
import { VERIFICATION_DEFAULTS } from '../../../shared/verification.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app, nsrpAutomation } = await import('../../index.js')
const { Applicant, Employer, Admin, Notification } = await import('../../models/collections.js')
const EmployerRequest = mongoose.model('EmployerRequest')
let admin, sequence = 0
const sign = (role = 'Admin', account) => jwt.sign({ email: account?.email || 'review-admin@example.invalid', role, ...(account ? { sub: String(account._id), sessionVersion: account.sessionVersion || 0 } : {}) }, process.env.JWT_SECRET || 'dev-secret')
const api = (method, path, role = 'Admin', account) => request(app)[method](`/api/admin/document-verification${path}`).set('Authorization', `Bearer ${sign(role, account)}`)
const flag = { ruleId: 'example_name_difference', severity: 'warning', fieldGroup: 'name', evidence: 'independent', status: 'open' }
async function applicant(version = {}, extra = {}) {
  return Applicant.create({ email: `review-${++sequence}@example.invalid`, passwordHash: 'test', emailVerified: true, profile: { nsrp: validNsrpAnswers() },
    verificationDocuments: { nsrpForm: { versions: [{ version: 1, status: 'pending', sourceType: 'generated', uploadedAt: new Date(), ...version }] } }, ...extra })
}
const action = (account, type, extra = {}) => api('post', '/action').send({ role: 'Applicant', accountId: String(account._id), docKey: 'nsrpForm', version: 1, unresolved: 0, action: type, reason: 'Supervisor review recorded', ...extra })
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => { await clearDb(); admin = await Admin.create({ email: 'review-admin@example.invalid', passwordHash: 'test' }) })

describe('Document verification foundations', () => {
  it('provides all defaults, validates settings, and audits administrative changes', async () => {
    const headers = { Authorization: `Bearer ${sign()}` }
    const before = await request(app).get('/api/admin/nsrp-automation/settings').set(headers).expect(200)
    expect(before.body).toMatchObject(VERIFICATION_DEFAULTS)
    await request(app).put('/api/admin/nsrp-automation/settings').set(headers).send({ minimumEvidence: 'low' }).expect(400)
    await request(app).put('/api/admin/nsrp-automation/settings').set(headers).send({ automaticApproval: 'yes' }).expect(400)
    const after = await request(app).put('/api/admin/nsrp-automation/settings').set(headers).send({ automaticApproval: false, ocrTextReading: false }).expect(200)
    expect(after.body.history.at(-1)).toMatchObject({ by: admin.email, changes: { automaticApproval: false, ocrTextReading: false } })
  })
  it.each(['Applicant', 'Employer'])('keeps queues, actions, counts and settings private from %s', async role => {
    const account = role === 'Applicant' ? await applicant() : await Employer.create({ email: 'owner@example.invalid', passwordHash: 'test' })
    await api('get', '/queue', role, account).expect(403)
    await api('get', '/counts', role, account).expect(403)
    await api('post', '/action', role, account).send({}).expect(403)
    await request(app).get('/api/admin/nsrp-automation/settings').set('Authorization', `Bearer ${sign(role, account)}`).expect(403)
    await request(app).put('/api/admin/nsrp-automation/settings').set('Authorization', `Bearer ${sign(role, account)}`).send({ automaticApproval: false }).expect(403)
  })
  it('paginates and sorts flagged documents, tags explanations/samples/exceptions, and highlights seven days', async () => {
    const old = await applicant({ uploadedAt: new Date('2026-01-01'), findings: [flag] })
    await applicant({ uploadedAt: new Date('2026-02-01'), reviewReasons: ['Audit sample'] })
    await applicant({ uploadedAt: new Date('2026-03-01'), explanation: { status: 'submitted', note: 'Corrected record' } })
    await applicant({ uploadedAt: new Date('2026-04-01'), reviewReasons: ['Check or approval unavailable'] })
    const first = await api('get', '/queue?limit=1').expect(200)
    expect(first.body.total).toBe(4)
    expect(first.body.items).toHaveLength(1)
    expect(first.body.items[0]).toMatchObject({ accountId: String(old._id), overdue: true, reasons: ['Flagged'] })
    const second = await api('get', '/queue?limit=1&page=2').expect(200)
    expect(second.body.items[0].reasons).toContain('Audit sample')
    const latest = await api('get', '/queue?order=desc&limit=1').expect(200)
    expect(latest.body.items[0].reasons).toContain('Check or approval unavailable')
    const explanations = await api('get', '/queue?from=2026-03-01&to=2026-03-31').expect(200)
    expect(explanations.body.items[0].reasons).toContain('Explanation submitted')
    expect(explanations.body.total).toBe(1)
    expect((await api('get', '/queue?docKey=birthCertificate').expect(200)).body.total).toBe(0)
    expect((await api('get', '/counts').expect(200)).body.flagged).toBe(4)
  })
  it('filters automatic approvals by type, date, and checked state, including legacy reviewers', async () => {
    await applicant({ status: 'approved', autoApproved: true, reviewedAt: new Date('2026-06-10') })
    await applicant({ status: 'approved', reviewedBy: 'System (auto-approval)', reviewedAt: new Date('2026-06-10'), adminConfirmedAt: new Date(), adminConfirmedBy: String(admin._id) })
    await applicant({ status: 'approved', approvedBy: String(admin._id) })
    expect((await api('get', '/queue?queue=auto').expect(200)).body.total).toBe(2)
    const unchecked = await api('get', '/queue?queue=auto&checked=false&docKey=nsrpForm&from=2026-06-01&to=2026-06-30').expect(200)
    expect(unchecked.body.total).toBe(1)
    expect((await api('get', '/queue?queue=auto&checked=true').expect(200)).body.total).toBe(1)
  })
  it.each(['approve', 'resubmit', 'decline', 'resolve', 'explain', 'checked', 'revoke', 'hold', 'release-hold'])('requires a reason for %s', async type => {
    await action(await applicant(), type, { reason: '' }).expect(400)
  })
  it('requires the current unresolved count before approving and records the administrator ID', async () => {
    const account = await applicant({ findings: [flag] })
    await action(account, 'approve').expect(409)
    await action(account, 'approve', { unresolved: 1 }).expect(200)
    const version = (await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0]
    expect(version).toMatchObject({ status: 'approved', approvedBy: String(admin._id) })
    expect(version.verificationAudit).toHaveLength(1)
    expect(version.verificationAudit[0]).toMatchObject({ action: 'approve', by: String(admin._id), reason: 'Supervisor review recorded' })
    expect(version.findings[0].status).toBe('open')
  })
  it.each([['resubmit', 'needs_resubmission'], ['decline', 'rejected'], ['explain', 'pending']])('audits %s and notifies neutrally without internal notes', async (type, status) => {
    const account = await applicant({ findings: [flag] })
    await action(account, type, { reason: 'INTERNAL rule example_name_difference' }).expect(200)
    const version = (await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0]
    expect(version.status).toBe(status)
    expect(version.verificationAudit[0].action).toBe(type)
    const notification = await Notification.findOne({ 'recipient.id': account._id })
    expect(notification).not.toBeNull()
    expect(JSON.stringify(notification)).not.toMatch(/INTERNAL|example_name_difference|findings|independent/)
    if (type === 'explain') expect(version.explanation.status).toBe('requested')
  })
  it('resolves a flag with a note and keeps the document pending', async () => {
    const account = await applicant({ findings: [flag] })
    await action(account, 'resolve', { ruleId: flag.ruleId, reason: 'Record reviewed with applicant' }).expect(200)
    const version = (await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0]
    expect(version.status).toBe('pending')
    expect(version.findings[0]).toMatchObject({ status: 'dismissed', dismissedBy: String(admin._id), note: 'Record reviewed with applicant' })
    expect(version.verificationAudit[0].action).toBe('resolve')
  })
  it('marks an automatic approval checked only once and revokes it to pending with an audit and notification', async () => {
    const account = await applicant({ status: 'approved', autoApproved: true, approvedBy: 'system' })
    await action(account, 'checked').expect(200)
    await action(account, 'checked').expect(409)
    const checked = (await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0]
    expect(checked.adminConfirmedBy).toBe(String(admin._id)); expect(checked.adminConfirmedAt).toBeInstanceOf(Date)
    await action(account, 'revoke').expect(200)
    const version = (await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0]
    expect(version.status).toBe('pending'); expect(version.autoApproved).toBe(false)
    expect(version.adminConfirmedAt).toBeUndefined()
    expect(version.verificationAudit.map(entry => entry.action)).toEqual(['checked', 'revoke'])
    expect(await Notification.countDocuments({ 'recipient.id': account._id })).toBe(1)
  })
  it('audits account hold/release and lets admins switch review tools off', async () => {
    const account = await applicant()
    await action(account, 'hold').expect(200)
    expect((await Applicant.findById(account._id).select('+holdAutoApproval')).holdAutoApproval).toBe(true)
    await action(account, 'release-hold').expect(200)
    const stored = await Applicant.findById(account._id).select('+autoApprovalHoldHistory +holdAutoApproval')
    expect(stored.holdAutoApproval).toBe(false)
    expect(stored.autoApprovalHoldHistory.map(entry => entry.action)).toEqual(['hold', 'release-hold'])
    await nsrpAutomation.updateSettings({ reviewToolsEnabled: false }, admin.email)
    await api('get', '/queue').expect(409)
    await action(account, 'approve').expect(409)
  })
  it('rejects stale document versions and records one audit under concurrent approval', async () => {
    const account = await applicant()
    await action(account, 'approve', { version: 2 }).expect(409)
    const results = await Promise.all([action(account, 'approve'), action(account, 'approve')])
    expect(results.map(response => response.status).sort()).toEqual([200, 409])
    expect((await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0].verificationAudit).toHaveLength(1)
  })
  it('includes employer Form 2 and records document approval without granting account access', async () => {
    const employer = await Employer.create({ email: 'review-employer@example.invalid', passwordHash: 'test', verificationStatus: 'under_review' })
    await EmployerRequest.create({ email: employer.email, passwordHash: 'test', companyName: 'Demo', contactName: 'Demo contact', status: 'under_review', requirementsFile: { status: 'pending' }, requirementsVersions: [{ version: 1, status: 'pending', findings: [flag], uploadedAt: new Date() }] })
    const queue = await api('get', '/queue?docKey=employerNsrpForm').expect(200)
    expect(queue.body.total).toBe(1); expect(queue.body.items[0].accountId).toBe(String(employer._id))
    await api('post', '/action').send({ role: 'Employer', accountId: String(employer._id), docKey: 'employerNsrpForm', version: 1, action: 'approve', unresolved: 1, reason: 'Document reviewed' }).expect(200)
    const stored = await EmployerRequest.findOne({ email: employer.email })
    expect(stored.requirementsVersions[0].verificationAudit[0].action).toBe('approve')
    expect((await Employer.findById(employer._id)).verificationStatus).toBe('under_review')
  })
  it('never sends findings, evidence, holds or internal audit notes to the applicant', async () => {
    const account = await applicant({ findings: [flag], autoApprovalSummary: [{ ruleId: 'private_rule', level: 'review' }], reviewReasons: ['Audit sample'] })
    await action(account, 'resubmit', { reason: 'INTERNAL evidence needs review' }).expect(200)
    for (const path of [`/api/applicants/${account._id}/verification-documents`, '/api/profile']) {
      const response = await request(app).get(path).set('Authorization', `Bearer ${sign('Applicant', account)}`).expect(200)
      expect(JSON.stringify(response.body)).not.toMatch(/findings|ruleId|private_rule|example_name_difference|INTERNAL|Audit sample|verificationAudit|holdAutoApproval/)
    }
    const adminQueue = await api('get', '/queue').expect(200)
    expect(adminQueue.body.items[0].findings[0].ruleId).toBe(flag.ruleId)
    expect(JSON.stringify(adminQueue.body)).not.toMatch(/passwordHash|"data"|"buffer"/)
  })
  it('uses independent evidence by default and honors master switch and account hold in typed-only mode', async () => {
    const run = async () => {
      const account = await applicant({}, { nsrpAutoEnabledAtCreation: true })
      await nsrpAutomation.process({ role: 'Applicant', accountId: account._id, ip: '192.0.2.9' })
      return { account, decision: await nsrpAutomation.decisions().findOne({ accountId: account._id }) }
    }
    expect((await run()).decision.reason).toBe('Not independent')
    await nsrpAutomation.updateSettings({ minimumEvidence: 'none', automaticApproval: false }, admin.email)
    expect((await run()).decision.reason).toBe('Auto-approval off')
    await nsrpAutomation.updateSettings({ automaticApproval: true }, admin.email)
    const held = await applicant({}, { nsrpAutoEnabledAtCreation: true, holdAutoApproval: true })
    await nsrpAutomation.process({ role: 'Applicant', accountId: held._id, ip: '192.0.2.9' })
    expect((await nsrpAutomation.decisions().findOne({ accountId: held._id })).reason).toBe('Hold')
  })
  it('enforces reasons and flag confirmation through the existing applicant review endpoint too', async () => {
    const account = await applicant({ findings: [flag] })
    const put = body => request(app).put(`/api/applicants/${account._id}/verification-documents/nsrpForm`).set('Authorization', `Bearer ${sign()}`).send(body)
    await put({ status: 'approved' }).expect(400)
    await put({ status: 'approved', reason: 'Manual review completed' }).expect(409)
    await put({ status: 'approved', reason: 'Manual review completed', unresolved: 1 }).expect(200)
    expect((await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0].verificationAudit[0]).toMatchObject({ action: 'approve', by: String(admin._id) })
  })
  it('resolves a legacy NSRP report through the original action with synchronized document and audit state', async () => {
    const account = await applicant()
    const id = `Applicant:${account._id}:1`
    await nsrpAutomation.decisions().insertOne({ _id: id, role: 'Applicant', accountId: account._id, recordId: account._id, version: 1, result: 'Manual', reason: 'Needs attention', report: { findings: [{ code: 'duplicate_tin', severity: 'critical' }] } })
    const before = await api('get', '/queue').expect(200)
    expect(before.body.items[0].unresolved).toBe(1)
    await request(app).post('/api/admin/nsrp-automation/dismiss-finding').set('Authorization', `Bearer ${sign()}`).send({ id, code: 'duplicate_tin', reason: 'Reviewed by supervisor' }).expect(200)
    const version = (await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions[0]
    expect(version.findings[0]).toMatchObject({ status: 'dismissed', dismissedBy: String(admin._id) })
    expect(version.verificationAudit[0].action).toBe('resolve')
    expect((await nsrpAutomation.decisions().findOne({ _id: id })).dismissedCritical).toBe(true)
    expect((await api('get', '/queue').expect(200)).body.items[0].unresolved).toBe(0)
  })
  it('keeps employer findings and administrative notes out of the owner verification response', async () => {
    const employer = await Employer.create({ email: 'private-employer@example.invalid', passwordHash: 'test' })
    await EmployerRequest.create({ email: employer.email, companyName: 'Demo', contactName: 'Contact', passwordHash: 'test', requirementsFile: { status: 'pending' }, requirementsVersions: [{ version: 1, status: 'pending', findings: [flag] }] })
    await api('post', '/action').send({ role: 'Employer', accountId: String(employer._id), docKey: 'employerNsrpForm', version: 1, action: 'resubmit', reason: 'INTERNAL evidence review note' }).expect(200)
    const owner = await request(app).get('/api/employer/verification').set('Authorization', `Bearer ${sign('Employer', employer)}`).expect(200)
    expect(JSON.stringify(owner.body)).not.toMatch(/INTERNAL|evidence|findings|ruleId|verificationAudit|example_name_difference/)
    expect(owner.body.verificationStatus).toBe('needs_resubmission')
  })
  it('allows applicant resubmission after the new request action while preserving the previous audit', async () => {
    const account = await applicant({ findings: [flag] })
    await action(account, 'resubmit').expect(200)
    await request(app).post('/api/profile/verification-documents/nsrpForm').set('Authorization', `Bearer ${sign('Applicant', account)}`)
      .attach('document', Buffer.from('%PDF-1.4 demo document'), { filename: 'replacement.pdf', contentType: 'application/pdf' }).expect(200)
    const versions = (await Applicant.findById(account._id)).verificationDocuments.nsrpForm.versions
    expect(versions).toHaveLength(2)
    expect(versions[0].status).toBe('superseded')
    expect(versions[0].verificationAudit[0].action).toBe('resubmit')
    expect(versions[1]).toMatchObject({ version: 2, status: 'pending', sourceType: 'uploaded', autoApproved: false })
  })
  it('finds normalized passport, mobile and name/birth duplicates without revealing other accounts', async () => {
    const first = await applicant({}, { nsrpAutoEnabledAtCreation: true, profile: { nsrp: validNsrpAnswers({ passportNo: 'P1234567' }) } })
    const second = await applicant({}, { nsrpAutoEnabledAtCreation: true, profile: { nsrp: validNsrpAnswers({ passportNo: 'P1234567' }) } })
    for (const account of [first, second]) await nsrpAutomation.process({ role: 'Applicant', accountId: account._id, ip: '192.0.2.4' })
    const report = (await nsrpAutomation.decisions().findOne({ accountId: second._id })).report
    expect(report.findings.map(f => f.code)).toEqual(expect.arrayContaining(['duplicate_passport', 'duplicate_mobile', 'duplicate_name_birth']))
    expect(JSON.stringify(report)).not.toMatch(/P1234567|09171234567|Juan|Cruz/)
    expect((await Applicant.findById(second._id)).verificationDocuments.nsrpForm.versions[0].status).toBe('pending')
  })
  it('limits authorization codes to admin details and deletes them after a manual result', async () => {
    const account = await applicant({}, { verificationDocuments: { birthCertificate: { versions: [{ version: 1, status: 'pending', declaredDetails: { copyType: 'PSA e-Certificate', referenceNumber: 'demo-reference' } }] } } })
    await mongoose.connection.db.collection('verification_private').insertOne({ _id: `${account._id}:birthCertificate:1`, code: 'PRIVATE-CODE' })
    const details = `/details?role=Applicant&accountId=${account._id}&docKey=birthCertificate`
    expect((await api('get', details).expect(200)).body.authorizationCode).toBe('PRIVATE-CODE')
    await api('get', details, 'Applicant', account).expect(403)
    expect(JSON.stringify((await api('get', '/queue').expect(200)).body)).not.toContain('PRIVATE-CODE')
    await action(account, 'approve', { docKey: 'birthCertificate' }).expect(400)
    await action(account, 'approve', { docKey: 'birthCertificate', checklist: { nameMatches: true, photoClear: true, notExpired: true, typeMatches: true, bothSides: true } }).expect(200)
    expect(await mongoose.connection.db.collection('verification_private').countDocuments()).toBe(0)
  })
})
