// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({})), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Admin, Applicant, Employer } = await import('../../models/collections.js')
const { ActivityLog } = await import('../../models/activityLog.js')
let admin
const auth = (role = 'Admin', email = admin.email) => ({ Authorization: `Bearer ${jwt.sign({ role, email }, process.env.JWT_SECRET || 'dev-secret')}` })
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  admin = await Admin.create({ adminLevel: 'super_admin', email: 'activity-admin@example.test', passwordHash: await bcrypt.hash('AuditPassword123!', 4) })
})

describe('admin activity logs', () => {
  it('logs applicant approvals and job-title changes with clear labels and record references', async () => {
    const applicant = await Applicant.create({ email: 'approval-target@example.test', passwordHash: 'unused' })
    await request(app).put(`/api/applicants/${applicant._id}/verification`).set(auth()).send({ status: 'approved' }).expect(200)
    const created = await request(app).post('/api/admin/job-titles').set(auth()).send({ name: 'Cashier', category: 'Retail' }).expect(201)
    await request(app).delete(`/api/admin/job-titles/${created.body.id}`).set(auth()).expect(200)
    const rows = await ActivityLog.find().sort({ at: 1 }).lean()
    expect(rows.map(row => row.action)).toEqual(['Approved applicant account', 'Added job title: Cashier', 'Deleted job title: Cashier'])
    expect(rows.map(row => row.targetId)).toEqual([String(applicant._id), created.body.id, created.body.id])
  })
  it('records successful changes and failed decisions without logging views', async () => {
    await request(app).put('/api/admin/nsrp-automation/settings').set(auth()).send({ automaticApproval: false }).expect(200)
    await request(app).put('/api/admin/nsrp-automation/settings').set(auth()).send({ automaticApproval: 'invalid' }).expect(400)
    await request(app).get('/api/admin/nsrp-automation/settings').set(auth()).expect(200)
    const rows = await ActivityLog.find().sort({ at: 1 }).lean()
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.outcome)).toEqual(['success', 'failed'])
    expect(rows[0]).toMatchObject({ actorId: admin._id, actorEmail: admin.email, method: 'PUT', path: '/api/admin/nsrp-automation/settings', statusCode: 200 })
    expect(rows[1].statusCode).toBe(400)
  })
  it('does not log sign-ins, notification refreshes, or other passive actions', async () => {
    await request(app).post('/api/login').send({ email: admin.email, password: 'PRIVATE_WRONG_PASSWORD' }).expect(401)
    await request(app).post('/api/login').send({ email: admin.email, password: 'AuditPassword123!' }).expect(200)
    await request(app).get('/api/notifications').set(auth())
    await request(app).patch('/api/notifications/read-all').set(auth())
    await request(app).post('/api/nsrp/validate-signup').set(auth()).send({})
    const rows = await ActivityLog.find().sort({ at: 1 }).lean()
    expect(rows).toEqual([])
    expect(JSON.stringify(rows)).not.toMatch(/PRIVATE_WRONG_PASSWORD|AuditPassword123|passwordHash|Bearer|eyJ/)
  })
  it.each(['Applicant', 'Employer'])('does not record %s actions and restricts log access to admins', async role => {
    const account = await (role === 'Applicant' ? Applicant : Employer).create({ email: 'other-role@example.test', passwordHash: 'unused' })
    await request(app).put('/api/admin/nsrp-automation/settings').set(auth(role, account.email)).send({ automaticApproval: false }).expect(403)
    await request(app).get('/api/admin/activity-logs').set(auth(role, account.email)).expect(403)
    expect(await ActivityLog.countDocuments()).toBe(0)
  })
  it('rejects anonymous or removed admins, and exposes no log mutation endpoints', async () => {
    await request(app).get('/api/admin/activity-logs').expect(403)
    await request(app).get('/api/admin/activity-logs').set(auth('Admin', 'removed@example.test')).expect(401)
    expect(await ActivityLog.countDocuments()).toBe(0)
    await request(app).post('/api/admin/activity-logs').set(auth()).send({ action: 'Forged entry' }).expect(404)
    await request(app).delete('/api/admin/activity-logs/000000000000000000000001').set(auth()).expect(404)
    const rows = await ActivityLog.find().lean()
    expect(rows).toEqual([])
  })
  it('keeps request bodies, tokens, query strings, and signed document credentials out of the log', async () => {
    const id = '000000000000000000000001'
    await request(app).post('/api/admin/document-verification/action?token=PRIVATE_QUERY&email=private@example.test').set(auth()).send({ role: 'Applicant', accountId: id, docKey: 'birthCertificate', action: 'approve', reason: 'PRIVATE_REASON', password: 'PRIVATE_PASSWORD', authorizationCode: 'PRIVATE_CODE', nsrpAnswers: { tin: 'PRIVATE_TIN' }, version: 1, checklist: {} })
    const row = await ActivityLog.findOne().lean()
    expect(row.targetId).toBe(id)
    expect(row.path).toBe('/api/admin/document-verification/action')
    expect(row.action).toBe('Approved birth certificate')
    expect(JSON.stringify(row)).not.toMatch(/PRIVATE_|private@example|authorizationCode|nsrpAnswers|checklist/)
    await request(app).get('/api/documents/view/PRIVATE_SIGNED_DOCUMENT').set(auth())
    const view = await ActivityLog.findOne({ method: 'GET' }).lean()
    expect(view).toBeNull()
  })
  it('filters and paginates with Philippine dates without logging log-page refreshes', async () => {
    await ActivityLog.insertMany([
      { actorId: admin._id, actorEmail: admin.email, action: 'Approved birth certificate', method: 'POST', path: '/api/admin/document-verification/action', statusCode: 200, outcome: 'success', at: new Date('2026-11-05T16:30:00Z') },
      { actorId: admin._id, actorEmail: admin.email, action: 'Updated settings', method: 'PUT', path: '/api/admin/nsrp-automation/settings', statusCode: 400, outcome: 'failed', at: new Date('2026-11-06T16:30:00Z') },
      { actorId: admin._id, actorEmail: admin.email, action: 'Viewed notifications', method: 'GET', path: '/api/notifications', statusCode: 304, outcome: 'success' },
      { actorId: admin._id, actorEmail: admin.email, action: 'Signed in', method: 'POST', path: '/api/login', statusCode: 200, outcome: 'success' },
      { actorId: admin._id, actorEmail: admin.email, action: 'Marked notifications as read', method: 'PATCH', path: '/api/notifications/read-all', statusCode: 200, outcome: 'success' },
    ])
    const day = await request(app).get('/api/admin/activity-logs?from=2026-11-06&to=2026-11-06').set(auth()).expect(200)
    expect(day.body.total).toBe(1)
    expect(day.body.items[0].action).toBe('Approved birth certificate')
    const filtered = await request(app).get('/api/admin/activity-logs?search=settings&method=PUT&outcome=failed&limit=1').set(auth()).expect(200)
    expect(filtered.body).toMatchObject({ total: 1, page: 1, limit: 1 })
    const second = await request(app).get('/api/admin/activity-logs?limit=1&page=2').set(auth()).expect(200)
    expect(second.body.items[0].action).toBe('Approved birth certificate')
    const all = await request(app).get('/api/admin/activity-logs').set(auth()).expect(200)
    expect(all.body.total).toBe(2)
    expect(await ActivityLog.countDocuments()).toBe(5)
    for (const query of ['from=2026-02-30', 'outcome=invalid', 'method=INVALID', 'from=2026-11-08&to=2026-11-06']) await request(app).get(`/api/admin/activity-logs?${query}`).set(auth()).expect(400)
  })
})
