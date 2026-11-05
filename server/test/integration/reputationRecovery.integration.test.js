// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { startTestDb, stopTestDb, clearDb, pdfBuffer } from './helpers.js'
import { recordTrustEvent } from '../../services/trustPolicy.js'
import { calculateReputation } from '../../../shared/reputation.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app, applicationWorkflow } = await import('../../index.js')
const { Applicant, Employer, Admin, Referral, Notification, DocumentFile } = await import('../../models/collections.js')
const { Interview, ReputationReview } = await import('../../models/applicationWorkflow.js')
let applicant, employer, admin
const auth = (role, account) => ({ Authorization: `Bearer ${jwt.sign({ role, email: account.email }, process.env.JWT_SECRET || 'dev-secret')}` })
const api = (method, path, role = 'Admin', account = admin, body) => request(app)[method](`/api/workflow${path}`).set(auth(role, account)).send(body)
const read = () => api('get', '/reputation', 'Applicant', applicant)
const penalty = (key = 'no-show:one') => recordTrustEvent(Applicant, { applicantId: applicant._id, key, type: 'confirmed_no_show', by: admin.email, reason: 'PRIVATE admin note' })
const requestReview = (eventId, withFile = false) => {
  const req = request(app).post('/api/workflow/reputation/reviews').set(auth('Applicant', applicant)).field('eventId', eventId).field('category', 'Emergency or illness').field('note', 'Please review the circumstances.')
  return withFile ? req.attach('file', pdfBuffer(), { filename: 'evidence.pdf', contentType: 'application/pdf' }) : req
}
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  applicant = await Applicant.create({ email: 'recovery@applicant.test', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', profile: { firstName: 'Test', lastName: 'Applicant' } })
  employer = await Employer.create({ email: 'recovery@employer.test', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', companyName: 'Test employer' })
  admin = await Admin.create({ email: 'recovery@admin.test', passwordHash: 'unused' })
})
describe('reputation recovery and reviews', () => {
  it.each(['reverse', 'keep', 'reduce'])('records a %s decision, its points, private audit and neutral applicant notification', async action => {
    await penalty()
    const initial = await read().expect(200)
    expect(initial.body.points).toBe(90)
    const eventId = initial.body.items[0].id
    const review = await requestReview(eventId, true).expect(200)
    await requestReview(eventId).expect(409)
    expect((await read()).body.items[0]).toMatchObject({ status: 'under_review', canRequestReview: false })
    const queue = await api('get', '/admin/reputation/reviews').expect(200)
    expect(queue.body.total).toBe(1)
    expect(queue.body.items[0].supportingVersion).toBe(1)
    expect(await DocumentFile.countDocuments({ slot: 'reputationReview' })).toBe(1)
    await request(app).get(`/api/workflow/reputation/reviews/${review.body.id}/file`).set(auth('Applicant', applicant)).expect(200)
    await request(app).get(`/api/workflow/reputation/reviews/${review.body.id}/file`).set(auth('Employer', employer)).expect(403)
    await api('post', `/admin/reputation/reviews/${review.body.id}`, 'Admin', admin, { action, reducedPoints: 3, reason: 'PRIVATE staff rationale', publicReason: 'The available information supports this decision.' }).expect(200)
    const current = await read().expect(200)
    expect(current.body.points).toBe(action === 'reverse' ? 100 : action === 'keep' ? 90 : 97)
    expect(JSON.stringify(current.body)).not.toMatch(/PRIVATE|staff rationale|adminNote|confirmedNoShows|employerId|recovery@admin/)
    const original = current.body.items.find(event => event.id === eventId)
    expect(original.review.status).toBe({ reverse: 'reversed', keep: 'kept', reduce: 'reduced' }[action])
    expect(await mongoose.connection.db.collection('referral_audit').countDocuments({ action: `reputation_review_${action}` })).toBe(1)
    const notification = await Notification.findOne({ type: 'reputation_review_update' }).lean()
    expect(notification.recipient.role).toBe('Applicant')
    expect(notification.message).not.toMatch(/PRIVATE/)
    expect(await ReputationReview.countDocuments()).toBe(1)
  })
  it('automatically credits outcomes, prevents same-employer farming, and supports admin reversal', async () => {
    await recordTrustEvent(Applicant, { applicantId: applicant._id, key: 'legacy-loss', type: 'manual_adjustment', delta: -30, by: admin.email, reason: 'Prior loss' })
    const first = await Referral.create({ applicantId: applicant._id, employerId: employer._id, jobId: new mongoose.Types.ObjectId(), status: 'pending' })
    const second = await Referral.create({ applicantId: applicant._id, employerId: employer._id, jobId: new mongoose.Types.ObjectId(), status: 'pending' })
    for (const [index, referral] of [first, second].entries()) {
      const interview = await Interview.create({ referralId: referral._id, applicantId: applicant._id, employerId: employer._id, scheduledAt: new Date(Date.now() - 86400000), status: 'confirmed' })
      await api('post', `/interviews/${interview._id}/outcome`, 'Employer', employer, { outcome: index ? 'did_not_pass' : 'passed' }).expect(200)
    }
    const own = await read().expect(200)
    expect(own.body.points).toBe(75)
    expect(own.body.items.filter(event => event.type === 'attended_interview').map(event => event.change).sort()).toEqual([0, 5])
    const privateAccount = await Applicant.findById(applicant._id).select('+trustEvents').lean()
    const credited = calculateReputation(privateAccount.trustEvents).events.find(event => event.type === 'attended_interview' && event.change === 5)
    await api('post', `/admin/reputation/applicants/${applicant._id}/reverse`, 'Admin', admin, { eventKey: credited.key, reason: 'Disputed attendance reviewed.' }).expect(200)
    expect((await read()).body.points).toBe(70)
    expect(await mongoose.connection.db.collection('referral_audit').countDocuments({ action: 'reputation_event_reversed' })).toBe(1)
  })
  it('reads recovery from the ledger rather than an outdated cache and uses the routing setting in the public page', async () => {
    await Applicant.collection.updateOne({ _id: applicant._id }, { $set: { trustValue: 1, trustEvents: [{ key: 'old-loss', type: 'confirmed_no_show', points: -20, at: new Date(Date.now() - 70 * 86400000) }] } })
    expect((await read()).body.points).toBe(100)
    await mongoose.connection.db.collection('referral_settings').updateOne({ _id: 'settings' }, { $set: { lowTrustRouting: true } }, { upsert: true })
    expect((await read()).body.lowTrustRouting).toBe(true)
  })
  it('restricts and audits settings, and returns policy text generated from live settings', async () => {
    await api('post', '/admin/reputation/settings', 'Employer', employer, { rules: { weeklyRecovery: 3 }, reason: 'Attempt' }).expect(403)
    await api('post', '/admin/reputation/settings', 'Applicant', applicant, { rules: { weeklyRecovery: 3 }, reason: 'Attempt' }).expect(403)
    await api('post', '/admin/reputation/settings', 'Admin', admin, { rules: { weeklyRecovery: 3 }, reason: 'Recovery policy reviewed.' }).expect(200)
    expect((await read()).body.policy.find(row => row.type === 'weekly_recovery').description).toContain('3 previously lost points')
    expect((await api('get', '/admin/reputation/settings')).body.history).toHaveLength(1)
    expect(await mongoose.connection.db.collection('referral_audit').countDocuments({ action: 'reputation_policy_changed' })).toBe(1)
    await api('post', '/admin/reputation/settings', 'Admin', admin, { rules: { weeklyRecovery: -1 }, reason: 'Invalid' }).expect(422)
    await api('post', '/admin/reputation/settings', 'Admin', admin, { rules: { recoveryDays: 0 }, reason: 'Invalid' }).expect(422)
  })
  it('rejects bad inputs and prevents other applicants and employers from reading private reputation or evidence', async () => {
    await penalty()
    const own = await read()
    const review = await requestReview(own.body.items[0].id, true).expect(200)
    const other = await Applicant.create({ email: 'other@recovery.test', passwordHash: 'unused', emailVerified: true })
    await request(app).get(`/api/workflow/reputation/reviews/${review.body.id}/file`).set(auth('Applicant', other)).expect(403)
    expect((await api('get', `/reputation?applicantId=${applicant._id}`, 'Applicant', other)).body.points).toBe(100)
    for (const path of ['/reputation', '/admin/reputation/settings', '/admin/reputation/reviews', `/admin/reputation/applicants/${applicant._id}`]) await api('get', path, 'Employer', employer).expect(403)
    await api('post', '/admin/reputation/reviews/not-an-id', 'Admin', admin, { action: 'reverse', reason: 'Test' }).expect(422)
    await api('post', '/admin/reputation/applicants/not-an-id/reverse', 'Admin', admin, { eventKey: 'x', reason: 'Test' }).expect(422)
    await api('post', '/admin/events/confirm', 'Admin', admin, { applicantId: String(applicant._id), type: 'manual_adjustment', delta: 5, eventKey: 'forbidden-positive', reason: 'Unsupported credit' }).expect(422)
  })
})
