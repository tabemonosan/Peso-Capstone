// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
import { CSM_VERSION, CSM_QUESTION_KEYS } from '../../../shared/csmQuestionnaire.js'

vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }), sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }), initMailer: vi.fn() }))
const { app } = await import('../../index.js')
const { Applicant, Employer, Admin, CsmResponse, Notification } = await import('../../models/collections.js')
const auth = (role) => ({ Authorization: `Bearer ${jwt.sign({ role, email: `${role.toLowerCase()}@example.com` }, process.env.JWT_SECRET || 'dev-secret')}` })
const payload = (extra = {}) => ({ language: 'en', date: '2026-01-01', age: 25, sex: 'male', clientType: 'citizen', cc1: '4', ratings: Object.fromEntries(CSM_QUESTION_KEYS.map((key) => [key, 'agree'])), ...extra })
const submit = (role, body = payload(), key = randomUUID()) => request(app).post('/api/csm/responses').set(auth(role)).set('Idempotency-Key', key).send(body)

beforeAll(async () => { await startTestDb(); await CsmResponse.init() }, 60000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  await Admin.create({ email: 'admin@example.com', passwordHash: 'unused' })
  await Employer.create({ email: 'employer@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', companyName: 'Example Works' })
  await Applicant.create({ email: 'applicant@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', profile: { firstName: 'Juan', lastName: 'Cruz', location: 'Legazpi City' }, verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map((key) => [key, { versions: [{ version: 1, status: 'approved', data: Buffer.from('%PDF') }] }])) })
})

describe('CSM response API', () => {
  it('accepts both respondent roles and preserves the language/version and canonical answers', async () => {
    for (const role of ['Applicant', 'Employer']) {
      const result = await submit(role, payload({ language: role === 'Employer' ? 'tl' : 'en', submitterRole: 'Admin' }))
      expect(result.status, JSON.stringify(result.body)).toBe(201)
      expect(result.body.reference).toMatch(/^CSM-[A-F0-9]{8}$/)
    }
    const records = await CsmResponse.find().lean()
    expect(records.map((record) => record.submitterRole).sort()).toEqual(['Applicant', 'Employer'])
    expect(records.every((record) => record.questionnaireVersion === CSM_VERSION && record.answers.cc2 === '5' && record.answers.cc3 === '4')).toBe(true)
    expect(await Notification.countDocuments({ type: 'csm_response_submitted' })).toBe(2)
  })
  it('validates required answers server-side without saving incomplete responses', async () => {
    expect((await submit('Applicant', payload({ age: 0, ratings: {} }))).status).toBe(422)
    expect((await submit('Employer', payload({ language: 'invalid' }))).status).toBe(422)
    expect(await CsmResponse.countDocuments()).toBe(0)
  })
  it('returns one receipt for retries and rejects reuse with changed answers', async () => {
    const key = randomUUID()
    const first = await submit('Applicant', payload(), key)
    const retry = await submit('Applicant', payload(), key)
    expect(first.status).toBe(201)
    expect(retry.status).toBe(200)
    expect(retry.body).toEqual(first.body)
    expect((await submit('Applicant', payload({ suggestions: 'Changed' }), key)).status).toBe(409)
    expect(await CsmResponse.countDocuments()).toBe(1)
    expect(await Notification.countDocuments({ type: 'csm_response_submitted' })).toBe(1)
  })
  it('restricts browsing to admins, filters results, and excludes internal account and retry identifiers', async () => {
    await submit('Applicant')
    await submit('Employer', payload({ language: 'tl' }))
    expect((await request(app).get('/api/csm/responses')).status).toBe(401)
    expect((await request(app).get('/api/csm/responses').set(auth('Applicant'))).status).toBe(403)
    const result = await request(app).get('/api/csm/responses?role=Employer&language=tl&limit=1').set(auth('Admin'))
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ total: 1, items: [{ language: 'tl', submitterRole: 'Employer' }] })
    for (const key of ['submitterId', 'submissionKey', 'payloadHash']) expect(result.body.items[0]).not.toHaveProperty(key)
    expect((await request(app).get('/api/csm/responses?role=bogus').set(auth('Admin'))).status).toBe(400)
    expect((await submit('Admin')).status).toBe(403)
  })
  it('blocks pending or unverified accounts', async () => {
    await Applicant.updateOne({}, { verificationStatus: 'under_review', 'verificationDocuments.validId1.versions.0.status': 'pending' })
    expect((await submit('Applicant')).status).toBe(403)
    await Employer.updateOne({}, { emailVerified: false })
    expect((await submit('Employer')).status).toBe(403)
    expect(await CsmResponse.countDocuments()).toBe(0)
  })
})
