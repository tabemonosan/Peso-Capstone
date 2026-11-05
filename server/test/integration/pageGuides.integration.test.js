// @vitest-environment node
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb, signupUploadRequest } from './helpers.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({ delivered: true })), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Applicant, Employer } = await import('../../models/collections.js')
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
beforeEach(clearDb)
const token = (role, account) => jwt.sign({ sub: String(account._id), sessionVersion: account.sessionVersion || 0, role, email: account.email }, process.env.JWT_SECRET || 'dev-secret')
const patch = (role, account, body) => request(app).patch('/api/profile/page-guides').set('Authorization', `Bearer ${token(role, account)}`).send(body)

it('enables page guides on new signup and includes them in the profile', async () => {
  const signup = await signupUploadRequest(request(app).post('/api/signup'), { email: 'new-guide@example.test' }).expect(200)
  expect(signup.body.user.pageGuides).toEqual({ seenPages: [], dismissedAll: false })
  const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${signup.body.token}`).expect(200)
  expect(profile.body.pageGuides).toEqual(signup.body.user.pageGuides)
})

it.each(['Applicant', 'Employer'])('persists per-page dismissals for %s and keeps other accounts separate', async role => {
  const Model = role === 'Applicant' ? Applicant : Employer
  const account = await Model.create({ email: 'guide-owner@example.test', passwordHash: 'unused', pageGuides: {} })
  const other = await Model.create({ email: 'other-guide@example.test', passwordHash: 'unused', pageGuides: {} })
  await patch(role, account, { page: 'dashboard' }).expect(200)
  await patch(role, account, { page: 'dashboard' }).expect(200)
  await patch(role, account, { page: 'profile', accountId: String(other._id) }).expect(200)
  const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${token(role, account)}`).expect(200)
  expect(profile.body.pageGuides.seenPages).toEqual(['dashboard', 'profile'])
  expect((await Model.findById(other._id)).pageGuides.seenPages).toEqual([])
  await patch(role, account, { dismissAll: true }).expect(200)
  expect((await Model.findById(account._id)).pageGuides.dismissedAll).toBe(true)
})

it('requires authentication and valid role-specific guide keys', async () => {
  await request(app).patch('/api/profile/page-guides').send({ page: 'dashboard' }).expect(401)
  const account = await Applicant.create({ email: 'invalid-guide@example.test', passwordHash: 'unused', pageGuides: {} })
  for (const page of ['verification-rules', 'employer', '__proto__', 'toString', '$set']) await patch('Applicant', account, { page }).expect(400)
  expect((await Applicant.findById(account._id)).pageGuides.seenPages).toEqual([])
})

it('does not enable guides for legacy accounts by reading or patching their preferences', async () => {
  const account = await Applicant.create({ email: 'legacy-guide@example.test', passwordHash: 'unused' })
  const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${token('Applicant', account)}`).expect(200)
  expect(profile.body.pageGuides).toBeUndefined()
  await patch('Applicant', account, { page: 'dashboard' }).expect(404)
  expect((await Applicant.findById(account._id)).pageGuides).toBeUndefined()
})
