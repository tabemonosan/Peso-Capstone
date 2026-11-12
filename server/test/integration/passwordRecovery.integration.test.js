// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ delivered: true }), sendVerificationEmail: vi.fn(), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Admin, Applicant, Employer, EmailCode } = await import('../../models/collections.js')
const { sendEmail } = await import('../../mailer.js')
const { ActivityLog } = await import('../../models/activityLog.js')
const { hashEmailCode } = await import('../../utils/emailCode.js')
const { PasswordRecovery, recoveryRequestStore, recoveryVerifyStore } = await import('../../routes/passwordRecovery.js')
const base = '/api/auth/password-recovery'
const oldPassword = 'BeforeRecovery123!', newPassword = 'AfterRecovery456!'
let users
beforeAll(async () => { await startTestDb(); await PasswordRecovery.init() }, 60000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb(); await recoveryRequestStore.resetAll(); await recoveryVerifyStore.resetAll(); vi.clearAllMocks()
  sendEmail.mockResolvedValue({ delivered: true })
  const passwordHash = await bcrypt.hash(oldPassword, 4)
  users = {}
  for (const level of ['super_admin', 'admin', 'staff']) users[level] = await Admin.create({ email: `${level}@recovery.test`, passwordHash, adminLevel: level })
  users.Applicant = await Applicant.create({ email: 'applicant@recovery.test', emailNormalized: 'applicant@recovery.test', passwordHash, emailVerified: true, verificationStatus: 'under_review' })
  users.Employer = await Employer.create({ email: 'employer@recovery.test', emailNormalized: 'employer@recovery.test', passwordHash, emailVerified: true, companyName: 'Recovery Works' })
})
const login = (email, password = oldPassword) => request(app).post('/api/login').send({ email, password })
const auth = token => ({ Authorization: `Bearer ${token}` })
async function sendCode(email) {
  const result = await request(app).post(`${base}/request`).send({ email })
  expect(result.status).toBe(200)
  const code = sendEmail.mock.calls.at(-1)?.[2]?.match(/\b\d{6}\b/)?.[0]
  expect(code).toMatch(/^\d{6}$/)
  expect(JSON.stringify(result.body)).not.toContain(code)
  return code
}
async function proof(email) {
  const code = await sendCode(email)
  const response = await request(app).post(`${base}/verify`).send({ email, code })
  expect(response.status).toBe(200)
  return response.body.resetToken
}

describe('email password recovery', () => {
  it('stores hashes only, sends to the registered mailbox, and keeps delivery failures generic', async () => {
    const code = await sendCode(' APPLICANT@RECOVERY.TEST ')
    expect(sendEmail.mock.calls[0][0]).toBe(users.Applicant.email)
    let stored = await PasswordRecovery.findOne({ email: users.Applicant.email }).lean()
    expect(stored.codeHash).toHaveLength(64)
    expect(stored.code).toBeUndefined()
    const verified = await request(app).post(`${base}/verify`).send({ email: users.Applicant.email, code })
    stored = await PasswordRecovery.findById(stored._id).lean()
    expect(stored.resetTokenHash).toHaveLength(64)
    expect(stored.resetTokenHash).not.toBe(verified.body.resetToken)
    expect(stored.resetToken).toBeUndefined()
    sendEmail.mockRejectedValueOnce(new Error('SMTP unavailable'))
    const failed = await request(app).post(`${base}/request`).send({ email: users.Employer.email })
    const unknown = await request(app).post(`${base}/request`).send({ email: 'unknown@recovery.test' })
    expect(failed.status).toBe(200)
    expect(failed.body).toEqual(unknown.body)
  })
  it('enforces hourly and IP send limits and validates email input', async () => {
    expect((await request(app).post(`${base}/request`).send({ email: { $ne: '' } })).status).toBe(400)
    const email = users.Applicant.email
    for (let index = 0; index < 5; index++) {
      if (index) await PasswordRecovery.updateOne({ email }, { $set: { sentAt: new Date(Date.now() - 61000) } })
      await sendCode(email)
    }
    await PasswordRecovery.updateOne({ email }, { $set: { sentAt: new Date(Date.now() - 61000) } })
    expect((await request(app).post(`${base}/request`).send({ email })).status).toBe(429)
    expect(sendEmail).toHaveBeenCalledTimes(5)
    await recoveryRequestStore.resetAll()
    for (let index = 0; index < 10; index++) expect((await request(app).post(`${base}/request`).send({ email: `unknown${index}@recovery.test` })).status).toBe(200)
    expect((await request(app).post(`${base}/request`).send({ email: 'another@recovery.test' })).status).toBe(429)
  })
  it('does not let a recovery code reset an account after it closes or its email changes', async () => {
    const resetToken = await proof(users.Applicant.email)
    await Applicant.updateOne({ _id: users.Applicant._id }, { $set: { deletedAt: new Date() } })
    expect((await request(app).post(`${base}/reset`).send({ email: users.Applicant.email, resetToken, newPassword })).status).toBe(400)
    const employerToken = await proof(users.Employer.email)
    await Employer.updateOne({ _id: users.Employer._id }, { $set: { email: 'changed@recovery.test' } })
    expect((await request(app).post(`${base}/reset`).send({ email: users.Employer.email, resetToken: employerToken, newPassword })).status).toBe(400)
  })
  it.each(['super_admin', 'admin', 'staff', 'Applicant', 'Employer'])('recovers %s with a verified code and revokes its previous sessions', async type => {
    const account = users[type], oldLogin = await login(account.email)
    expect(oldLogin.status).toBe(200)
    const resetToken = await proof(account.email)
    expect((await request(app).post(`${base}/reset`).send({ email: account.email, resetToken, newPassword: 'weak' })).status).toBe(400)
    const reset = await request(app).post(`${base}/reset`).send({ email: account.email, resetToken, newPassword })
    expect(reset.status).toBe(200)
    expect(reset.headers['cache-control']).toBe('no-store')
    expect((await request(app).get('/api/profile').set(auth(oldLogin.body.token))).status).toBe(401)
    expect((await login(account.email)).status).toBe(401)
    const signedIn = await login(account.email, newPassword)
    expect(signedIn.status).toBe(200)
    expect(signedIn.body.user.mustChangePassword).not.toBe(true)
    expect((await request(app).post(`${base}/reset`).send({ email: account.email, resetToken, newPassword: oldPassword })).status).toBe(400)
  })
  it('does not reveal unknown or disabled accounts and applies the same cooldown', async () => {
    const known = await request(app).post(`${base}/request`).send({ email: users.Applicant.email })
    const unknown = await request(app).post(`${base}/request`).send({ email: 'unknown@recovery.test' })
    expect(unknown.body).toEqual(known.body)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    for (const email of [users.Applicant.email, 'unknown@recovery.test']) expect((await request(app).post(`${base}/request`).send({ email })).status).toBe(429)
    await Admin.updateOne({ _id: users.staff._id }, { $set: { disabled: true } })
    expect((await request(app).post(`${base}/request`).send({ email: users.staff.email })).body).toEqual(known.body)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
  it('expires codes, limits wrong attempts, and keeps signup codes separate', async () => {
    const email = users.Applicant.email, code = await sendCode(email), wrongCode = code === '111111' ? '222222' : '111111'
    await EmailCode.create({ email, codeHash: hashEmailCode(email, wrongCode) })
    for (let index = 0; index < 5; index++) expect((await request(app).post(`${base}/verify`).send({ email, code: wrongCode })).status).toBe(400)
    expect((await request(app).post(`${base}/verify`).send({ email, code })).status).toBe(400)
    await PasswordRecovery.updateOne({ email }, { $set: { attempts: 0, expiresAt: new Date(Date.now() - 1) } })
    expect((await request(app).post(`${base}/verify`).send({ email, code })).status).toBe(400)
  })
  it('invalidates old reset proofs on resend, rejects cross-account tokens, and expires proofs', async () => {
    const email = users.Employer.email, resetToken = await proof(email)
    expect((await request(app).post(`${base}/reset`).send({ email: users.Applicant.email, resetToken, newPassword })).status).toBe(400)
    await PasswordRecovery.updateOne({ email }, { $set: { sentAt: new Date(Date.now() - 61000) } })
    await sendCode(email)
    expect((await request(app).post(`${base}/reset`).send({ email, resetToken, newPassword })).status).toBe(400)
    await PasswordRecovery.updateOne({ email }, { $set: { sentAt: new Date(Date.now() - 61000) } })
    const nextProof = await proof(email)
    await PasswordRecovery.updateOne({ email }, { $set: { resetExpiresAt: new Date(Date.now() - 1) } })
    expect((await request(app).post(`${base}/reset`).send({ email, resetToken: nextProof, newPassword })).status).toBe(400)
  })
  it('allows only one code verification and one password reset when requests race', async () => {
    const email = users.Applicant.email, code = await sendCode(email)
    const checks = await Promise.all([1, 2].map(() => request(app).post(`${base}/verify`).send({ email, code })))
    expect(checks.map(result => result.status).sort()).toEqual([200, 400])
    const resetToken = checks.find(result => result.status === 200).body.resetToken
    const resets = await Promise.all([1, 2].map(() => request(app).post(`${base}/reset`).send({ email, resetToken, newPassword })))
    expect(resets.map(result => result.status).sort()).toEqual([200, 400])
  })
})

describe('Super Admin password reset', () => {
  it.each(['admin', 'staff'])('resets %s, ends sessions, and requires a new personal password', async level => {
    const owner = await login(users.super_admin.email), target = users[level], old = await login(target.email)
    const oldProof = await proof(target.email)
    const path = `/api/admin/internal-accounts/${target._id}/reset-password`
    expect((await request(app).post(path).set(auth(old.body.token)).send({ reason: 'Lost password' })).status).toBe(403)
    expect((await request(app).post(path).set(auth(owner.body.token)).send({})).status).toBe(400)
    const result = await request(app).post(path).set(auth(owner.body.token)).send({ reason: 'Account holder lost their initial password' })
    expect(result.status).toBe(200)
    expect(result.body.mustChangePassword).toBe(true)
    expect(await bcrypt.compare(result.body.initialPassword, (await Admin.findById(target._id)).passwordHash)).toBe(true)
    expect((await request(app).get('/api/profile').set(auth(old.body.token))).status).toBe(401)
    expect((await request(app).post(`${base}/reset`).send({ email: target.email, resetToken: oldProof, newPassword })).status).toBe(400)
    const temporary = await login(target.email, result.body.initialPassword)
    expect(temporary.body.user.mustChangePassword).toBe(true)
    expect((await request(app).get('/api/dashboard').set(auth(temporary.body.token))).body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    const changed = await request(app).post('/api/admin/change-password').set(auth(temporary.body.token)).send({ currentPassword: result.body.initialPassword, newPassword })
    expect(changed.status).toBe(200)
    expect((await request(app).get('/api/dashboard').set(auth(changed.body.token))).status).toBe(200)
    expect(JSON.stringify(await ActivityLog.find().lean())).not.toContain(result.body.initialPassword)
  })
  it('protects Super Admin accounts and disabled accounts from an administrative reset', async () => {
    const token = (await login(users.super_admin.email)).body.token
    for (const account of [users.super_admin, await Admin.create({ email: 'another-super@recovery.test', passwordHash: 'unused', adminLevel: 'super_admin' })]) {
      expect((await request(app).post(`/api/admin/internal-accounts/${account._id}/reset-password`).set(auth(token)).send({ reason: 'Reset' })).status).toBe(403)
    }
    await Admin.updateOne({ _id: users.staff._id }, { $set: { disabled: true } })
    expect((await request(app).post(`/api/admin/internal-accounts/${users.staff._id}/reset-password`).set(auth(token)).send({ reason: 'Reset' })).status).toBe(409)
  })
})


describe('current password reuse', () => {
  it.each(['Applicant', 'Employer'])('rejects the current %s password without consuming the recovery token', async role => {
    const email = users[role].email, resetToken = await proof(email)
    const rejected = await request(app).post(`${base}/reset`).send({ email, resetToken, newPassword: oldPassword })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error).toMatch(/different from your current password/)
    expect((await login(email)).status).toBe(200)
    expect((await request(app).post(`${base}/reset`).send({ email, resetToken, newPassword })).status).toBe(200)
  })
  it.each(['Applicant', 'Employer'])('requires a different password while signed in as %s and revokes old sessions', async role => {
    const email = users[role].email, signedIn = await login(email)
    const change = body => request(app).post('/api/auth/change-password').set(auth(signedIn.body.token)).send(body)
    expect((await change({ currentPassword: 'wrong', newPassword })).status).toBe(400)
    const rejected = await change({ currentPassword: oldPassword, newPassword: oldPassword })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error).toMatch(/different from your current password/)
    expect((await change({ currentPassword: oldPassword, newPassword })).status).toBe(200)
    expect((await request(app).get('/api/profile').set(auth(signedIn.body.token))).status).toBe(401)
    expect((await change({ currentPassword: newPassword, newPassword: oldPassword })).status).toBe(401)
    expect((await login(email, newPassword)).status).toBe(200)
    const nextToken = (await login(email, newPassword)).body.token
    expect((await request(app).post('/api/auth/change-password').set(auth(nextToken)).send({ currentPassword: newPassword, newPassword: oldPassword })).status).toBe(200)
  })
  it('requires authentication for signed-in password changes', async () => {
    expect((await request(app).post('/api/auth/change-password').send({ currentPassword: oldPassword, newPassword })).status).toBe(401)
  })
})
