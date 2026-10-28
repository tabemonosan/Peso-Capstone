// @vitest-environment node
// Verifies request-derived secrets never reach the logs: malformed JSON sent to
// /api/login and /api/signup must not leak the body or any password string, and
// signed document URLs must not leak their token into the request log.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb } from './helpers.js'

const { app } = await import('../../index.js')
const { sendVerificationEmail } = await import('../../mailer.js')

let consoleOutput

beforeAll(async () => {
  await startTestDb()
}, 180000)

afterAll(async () => {
  await stopTestDb()
})

beforeEach(() => {
  consoleOutput = []
  vi.spyOn(console, 'log').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.spyOn(console, 'warn').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
})

afterEach(() => {
  vi.restoreAllMocks()
})

const loggedText = () => consoleOutput.join('\n')

describe('log redaction', () => {
  it('does not log the body or password when /api/login receives malformed JSON', async () => {
    const marker = 'SuperSecret-Login-Marker-123!'
    const res = await request(app)
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send(`{"email":"login-marker@example.com","password":"${marker}",}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid JSON payload')
    const logs = loggedText()
    expect(logs).toContain('JSON parse error')
    expect(logs).toContain('POST')
    expect(logs).toContain('/api/login')
    expect(logs).not.toContain(marker)
    expect(logs).not.toContain('login-marker@example.com')
    expect(logs).not.toContain('password')
  }, 60000)

  it('does not log the body or password when /api/signup receives malformed JSON', async () => {
    const marker = 'SuperSecret-Signup-Marker-456!'
    const res = await request(app)
      .post('/api/signup')
      .set('Content-Type', 'application/json')
      .send(`{"email":"signup-marker@example.com","password":"${marker}","nsrpAnswers":{"surname":"MarkerSurname"},}`)
    expect(res.status).toBe(400)
    const logs = loggedText()
    expect(logs).not.toContain(marker)
    expect(logs).not.toContain('signup-marker@example.com')
    expect(logs).not.toContain('MarkerSurname')
    expect(logs).not.toContain('nsrpAnswers')
  }, 60000)

  it('does not log signed document URL tokens in the request log', async () => {
    const token = jwt.sign({ applicantId: '507f1f77bcf86cd799439011', docKey: 'resume', versionIndex: 0 }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '10m' })
    await request(app).get(`/api/documents/view/${token}`)
    expect(loggedText()).not.toContain(token)
    expect(loggedText()).toContain('/api/documents/view/[redacted]')
  }, 60000)

  it('does not log the recipient or verification link in the email fallback', async () => {
    await sendVerificationEmail('verification-marker@example.com', 'raw-secret-token-abc123', 'Applicant')
    const logs = loggedText()
    expect(logs).toContain('[email:fallback]')
    expect(logs).not.toContain('verification-marker@example.com')
    expect(logs).not.toContain('raw-secret-token-abc123')
  }, 60000)
})
