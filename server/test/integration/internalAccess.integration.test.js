// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }), sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Admin, Applicant, JobTitle } = await import('../../models/collections.js')
const { ActivityLog } = await import('../../models/activityLog.js')
const { AdminReviewNote } = await import('../../routes/internalAccounts.js')
const secret = process.env.JWT_SECRET || 'dev-secret'
const password = 'AccessTest123!'
let accounts
const auth = (level, claims = {}) => ({ Authorization: `Bearer ${jwt.sign({ role: 'Admin', email: `${level}@example.com`, ...claims }, secret)}` })
beforeAll(startTestDb, 60000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash(password, 4)
  accounts = await Admin.insertMany(['super_admin', 'admin', 'staff'].map(adminLevel => ({ email: `${adminLevel}@example.com`, adminLevel, passwordHash })))
})

describe('internal access levels', () => {
  it('enforces permissions when URL capitalization differs', async () => {
    for (const path of ['/api/admin/nsrp-automation/SETTINGS', '/api/ADMIN/job-moderation/Settings']) {
      expect((await request(app).put(path).set(auth('admin')).send({ enabled: false, automaticApproval: false, reason: 'Case variant' })).status).toBe(403)
      expect((await request(app).get(path).set(auth('staff'))).status).toBe(403)
    }
    expect((await request(app).put(`/api/ACCOUNT-DELETION/requests/${new mongoose.Types.ObjectId()}`).set(auth('admin')).send({ status: 'approved' })).status).toBe(403)
  })
  it('keeps disabled sessions revoked after an account is enabled again', async () => {
    const staff = accounts.find(account => account.adminLevel === 'staff')
    const update = disabled => request(app).patch(`/api/admin/internal-accounts/${staff._id}`).set(auth('super_admin')).send({ disabled, reason: 'Session revocation test' })
    expect((await request(app).get('/api/profile').set(auth('staff'))).status).toBe(200)
    expect((await update(true)).status).toBe(200)
    expect((await update(false)).status).toBe(200)
    expect((await request(app).get('/api/profile').set(auth('staff'))).status).toBe(401)
    const login = await request(app).post('/api/login').send({ email: staff.email, password })
    expect(login.status).toBe(200)
    expect((await request(app).get('/api/profile').set({ Authorization: `Bearer ${login.body.token}` })).status).toBe(200)
  })
  it('accepts internal email capitalization and rejects malformed login credentials', async () => {
    expect((await request(app).post('/api/login').send({ email: ' STAFF@EXAMPLE.COM ', password })).status).toBe(200)
    for (const body of [{ email: { $ne: '' }, password }, { email: 'staff@example.com', password: {} }]) {
      expect((await request(app).post('/api/login').send(body)).status).toBe(400)
    }
  })
  it('rejects duplicate legacy email spellings and trims new account emails', async () => {
    const create = email => request(app).post('/api/admin/internal-accounts').set(auth('super_admin')).send({ name: 'New account', email })
    await Admin.create({ email: 'Legacy@Example.com', passwordHash: 'unused' })
    expect((await create('legacy@example.com')).status).toBe(409)
    await Applicant.create({ email: 'legacy-applicant@example.com', passwordHash: 'unused' })
    expect((await create('legacy-applicant@example.com')).status).toBe(409)
    const valid = await create(' New-Staff@Example.com ')
    expect(valid.status).toBe(201)
    expect(valid.body.email).toBe('new-staff@example.com')
  })
  it('keeps settings, internal accounts, and passive actions out of normal Admin logs regardless of case', async () => {
    const owner = accounts.find(account => account.adminLevel === 'super_admin')
    await ActivityLog.create(['/api/ADMIN/INTERNAL-ACCOUNTS', '/api/admin/nsrp-automation/SETTINGS/', '/api/NOTIFICATIONS/read-all', '/api/notifications/read-all', '/api/jobs/test/status'].map(path => ({ actorId: owner._id, actorEmail: owner.email, action: 'Updated record', method: 'PUT', path, statusCode: 200, outcome: 'success' })))
    const result = await request(app).get('/api/admin/activity-logs').set(auth('admin'))
    expect(result.status).toBe(200)
    expect(result.body.items.map(item => item.path)).toEqual(['/api/jobs/test/status'])
  })
  it('cannot demote an account promoted to Super Admin while another access update is in flight', async () => {
    const target = accounts.find(account => account.adminLevel === 'admin')
    const original = Admin.findOneAndUpdate
    const updateSpy = vi.spyOn(Admin, 'findOneAndUpdate').mockImplementationOnce((filter, changes, options) => ({ lean: async () => {
      await Admin.updateOne({ _id: target._id }, { $set: { adminLevel: 'super_admin' } })
      return original.call(Admin, filter, changes, options).lean()
    } }))
    try {
      const result = await request(app).patch(`/api/admin/internal-accounts/${target._id}`).set(auth('super_admin')).send({ adminLevel: 'staff', disabled: true, reason: 'Concurrent access update' })
      expect(result.status).toBe(409)
      const stored = await Admin.findById(target._id).lean()
      expect(stored.adminLevel).toBe('super_admin')
      expect(stored.disabled).toBe(false)
    } finally { updateSpy.mockRestore() }
  })
  it.each(['super_admin', 'admin', 'staff'])('returns the %s level at login and profile without leaking passwords', async level => {
    const login = await request(app).post('/api/login').send({ email: `${level}@example.com`, password })
    expect(login.status).toBe(200)
    expect(login.body.user).toMatchObject({ role: 'Admin', adminLevel: level })
    expect(JSON.stringify(login.body)).not.toContain('passwordHash')
    const profile = await request(app).get('/api/profile').set({ Authorization: `Bearer ${login.body.token}` })
    expect(profile.status).toBe(200)
    expect(profile.body.adminLevel).toBe(level)
  })
  it('denies staff decisions, settings, deletion queues, and account management despite forged tier claims', async () => {
    const headers = auth('staff', { adminLevel: 'super_admin' })
    for (const [method, path] of [
      ['put', `/api/applicants/${new mongoose.Types.ObjectId()}/verification`],
      ['put', `/api/applicants/${new mongoose.Types.ObjectId()}/verification-documents/validId1`],
      ['post', '/api/admin/document-verification/action'],
      ['put', `/api/jobs/${new mongoose.Types.ObjectId()}/status`],
      ['put', `/api/employer-requests/${new mongoose.Types.ObjectId()}/status`],
      ['post', '/api/workflow/admin/reputation/reviews/test'],
      ['post', '/api/admin/job-titles'],
      ['delete', '/api/admin/job-titles/test'],
      ['get', '/api/admin/referral-workflow/settings'],
      ['get', '/api/account-deletion/requests'],
      ['get', '/api/admin/internal-accounts'],
      ['put', '/api/admin/job-moderation/settings'],
    ]) expect((await request(app)[method](path).set(headers).send({ adminLevel: 'super_admin' })).status, `${method} ${path}`).toBe(403)
  })
  it('allows normal admins to decide and inspect settings but reserves settings changes and deletion decisions for Super Admin', async () => {
    expect((await request(app).get('/api/admin/nsrp-automation/settings').set(auth('admin'))).status).toBe(200)
    expect((await request(app).put('/api/admin/nsrp-automation/settings').set(auth('admin')).send({})).status).toBe(403)
    expect((await request(app).get('/api/account-deletion/requests').set(auth('admin'))).status).toBe(200)
    expect((await request(app).put(`/api/account-deletion/requests/${new mongoose.Types.ObjectId()}`).set(auth('admin')).send({ status: 'approved' })).status).toBe(403)
    expect((await request(app).get('/api/admin/internal-accounts').set(auth('admin'))).status).toBe(403)
    const title = await request(app).post('/api/admin/job-titles').set(auth('admin')).send({ name: 'Access test title', category: 'Office' })
    expect(title.status).toBe(201)
    expect(await JobTitle.exists({ name: 'Access test title' })).toBeTruthy()
  })
  it('creates and manages internal accounts with audited reasons and revokes existing sessions immediately', async () => {
    const create = await request(app).post('/api/admin/internal-accounts').set(auth('super_admin')).send({ name: 'New staff', email: 'new-staff@example.com', password, adminLevel: 'staff', reason: 'New appointment' })
    expect(create.status).toBe(201)
    expect(create.body).toMatchObject({ email: 'new-staff@example.com', adminLevel: 'staff' })
    const stored = await Admin.findById(create.body.id).lean()
    expect(stored.passwordHash).not.toBe(password)
    expect(await bcrypt.compare(create.body.initialPassword, stored.passwordHash)).toBe(true)
    expect(create.body.initialPassword).not.toBe(password)
    expect(stored.mustChangePassword).toBe(true)
    const list = await request(app).get('/api/admin/internal-accounts').set(auth('super_admin'))
    expect(list.status).toBe(200)
    expect(JSON.stringify(list.body)).not.toContain('passwordHash')
    expect(JSON.stringify(list.body)).not.toContain(create.body.initialPassword)
    const staff = accounts.find(account => account.adminLevel === 'staff')
    const update = () => request(app).patch(`/api/admin/internal-accounts/${staff._id}`).set(auth('super_admin'))
    expect((await update().send({ adminLevel: 'admin' })).status).toBe(400)
    expect((await update().send({ adminLevel: 'admin', reason: 'Promoted' })).status).toBe(200)
    expect((await request(app).get('/api/account-deletion/requests').set(auth('staff'))).status).toBe(200)
    expect((await update().send({ disabled: true, reason: 'Access removed' })).status).toBe(200)
    expect((await request(app).get('/api/profile').set(auth('staff'))).status).toBe(401)
    expect((await request(app).post('/api/login').send({ email: staff.email, password })).status).toBe(403)
    expect(await ActivityLog.exists({ actorEmail: 'super_admin@example.com', path: '/api/admin/internal-accounts', outcome: 'success' })).toBeTruthy()
    const owner = accounts.find(account => account.adminLevel === 'super_admin')
    expect((await request(app).patch(`/api/admin/internal-accounts/${owner._id}`).set(auth('super_admin')).send({ disabled: true, reason: 'Self-disable' })).status).toBe(409)
  })
  it('generates a password, defaults to Staff, and enforces password change across all initial sessions', async () => {
    const create = await request(app).post('/api/admin/internal-accounts').set(auth('super_admin')).send({ name: 'Onboarding staff', email: 'onboarding@example.com' })
    expect(create.status).toBe(201)
    expect(create.body).toMatchObject({ adminLevel: 'staff', mustChangePassword: true })
    expect(create.headers['cache-control']).toBe('no-store')
    const { email, initialPassword } = create.body
    const login = () => request(app).post('/api/login').send({ email, password: initialPassword })
    const first = await login(), second = await login()
    expect(first.body.user.mustChangePassword).toBe(true)
    const headers = { Authorization: `Bearer ${first.body.token}` }
    const profile = await request(app).get('/api/profile').set(headers)
    expect(profile.body.mustChangePassword).toBe(true)
    expect((await request(app).get('/api/dashboard').set(headers)).body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    expect((await request(app).post('/api/admin/review-notes').set(headers).send({})).body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    const change = body => request(app).post('/api/admin/change-password').set(headers).send(body)
    expect((await change({ currentPassword: 'incorrect', newPassword: 'MyOwnPassword123!' })).status).toBe(400)
    expect((await change({ currentPassword: initialPassword, newPassword: 'weak' })).status).toBe(400)
    expect((await change({ currentPassword: initialPassword, newPassword: initialPassword })).status).toBe(400)
    const changed = await change({ currentPassword: initialPassword, newPassword: 'MyOwnPassword123!' })
    expect(changed.status).toBe(200)
    expect(changed.body.mustChangePassword).toBe(false)
    expect((await request(app).get('/api/dashboard').set({ Authorization: `Bearer ${changed.body.token}` })).status).toBe(200)
    for (const token of [first.body.token, second.body.token]) expect((await request(app).get('/api/profile').set({ Authorization: `Bearer ${token}` })).status).toBe(401)
    expect((await login()).status).toBe(401)
    const ownLogin = await request(app).post('/api/login').send({ email, password: 'MyOwnPassword123!' })
    expect(ownLogin.status).toBe(200)
    expect(ownLogin.body.user.mustChangePassword).toBe(false)
    const logs = JSON.stringify(await ActivityLog.find().lean())
    expect(logs).not.toContain(initialPassword)
    expect(logs).not.toContain('MyOwnPassword123!')
  })
  it('stores staff recommendations without changing verification status and prevents forged authors', async () => {
    const applicant = await Applicant.create({ email: 'applicant@example.com', passwordHash: 'unused', verificationStatus: 'under_review' })
    const response = await request(app).post('/api/admin/review-notes').set(auth('staff')).send({ entityType: 'Applicant', entityId: String(applicant._id), recommendation: 'approve', note: 'Documents inspected; recommend approval.', authorEmail: 'super_admin@example.com' })
    expect(response.status).toBe(201)
    expect(response.body.authorEmail).toBe('staff@example.com')
    expect((await Applicant.findById(applicant._id)).verificationStatus).toBe('under_review')
    expect(await AdminReviewNote.countDocuments()).toBe(1)
    const list = await request(app).get('/api/admin/review-notes').set(auth('admin')).query({ entityId: String(applicant._id) })
    expect(list.body.items).toHaveLength(1)
  })
  it('scopes staff activity logs to their own actions and provides a task dashboard', async () => {
    await ActivityLog.create(accounts.map(account => ({ actorId: account._id, actorEmail: account.email, action: 'Updated record', method: 'PUT', path: '/api/jobs/test/status', statusCode: 200, outcome: 'success' })))
    const logs = await request(app).get('/api/admin/activity-logs').set(auth('staff')).query({ search: 'example.com' })
    expect(logs.status).toBe(200)
    expect(logs.body.items).toHaveLength(1)
    expect(logs.body.items[0].actorEmail).toBe('staff@example.com')
    const dashboard = await request(app).get('/api/dashboard').set(auth('staff'))
    expect(dashboard.status).toBe(200)
    expect(dashboard.body).toMatchObject({ adminLevel: 'staff', tasks: { applicants: 0, jobs: 0 } })
    expect(dashboard.body.stats).toBeUndefined()
  })
})
