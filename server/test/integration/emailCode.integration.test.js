// @vitest-environment node
// Integration tests for the 6-digit signup email-code flow against a real
// MongoDB (mongodb-memory-server) over HTTP via supertest. The mailer is
// mocked so no network calls happen; sent messages are captured instead.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'

const sentEmails = vi.hoisted(() => [])

vi.mock('../../mailer.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    sendEmail: vi.fn(async (to, subject, text) => {
      sentEmails.push({ to, subject, text })
      return { delivered: true }
    }),
    sendVerificationEmail: vi.fn(async () => ({ delivered: true })),
  }
})

const { app, emailCodeIpStore } = await import('../../index.js')
const { EmailCode, EmailCodeSend, UsedEmailProof, Applicant } = await import('../../models/collections.js')
const helpers = await import('./helpers.js')
const { startTestDb, stopTestDb, clearDb, signupRequest, emailProofFor } = helpers

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

let consoleOutput

beforeAll(async () => {
  await startTestDb()
}, 180000)

afterAll(async () => {
  await stopTestDb()
})

beforeEach(async () => {
  await clearDb()
  emailCodeIpStore.resetAll()
  sentEmails.length = 0
  consoleOutput = []
  vi.spyOn(console, 'log').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.spyOn(console, 'warn').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
})

afterEach(() => {
  vi.restoreAllMocks()
})

const requestCode = (email) => request(app).post('/api/signup/email-code').send({ email })
const verifyCode = (email, code) => request(app).post('/api/signup/email-code/verify').send({ email, code })
const lastSentCode = () => sentEmails.at(-1).text.match(/\b(\d{6})\b/)[1]
const loggedText = () => consoleOutput.join('\n')
const wrongCode = () => (lastSentCode() === '000000' ? '000001' : '000000')

describe('POST /api/signup/email-code', () => {
  it('sends a 6-digit code, stores only its hash, and is reachable without auth (no 401)', async () => {
    const res = await requestCode('new.user@example.com')
    expect(res.status).toBe(200) // would be 401 if the registration gate applied
    expect(res.body).toEqual({ ok: true })
    expect(sentEmails).toHaveLength(1)
    expect(sentEmails[0].to).toBe('new.user@example.com')
    expect(sentEmails[0].subject).toBe('Your PESO Portal verification code')

    const code = lastSentCode()
    expect(code).toMatch(/^\d{6}$/)
    const record = await EmailCode.findOne({ email: 'new.user@example.com' }).lean()
    expect(record).toBeTruthy()
    expect(record.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(record.codeHash).not.toBe(code)
    expect(record.attempts).toBe(0)
    expect(JSON.stringify(record)).not.toContain(code)
  })

  it('returns the same generic response for a registered email and sends nothing', async () => {
    await Applicant.create({ email: 'taken@example.com', emailNormalized: 'taken@example.com', passwordHash: 'x' })
    const res = await requestCode('taken@example.com')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(sentEmails).toHaveLength(0)
    expect(await EmailCode.countDocuments({ email: 'taken@example.com' })).toBe(0)
  })

  it('enforces the 60-second resend cooldown with 429 and retryAfter', async () => {
    expect((await requestCode('cooldown@example.com')).status).toBe(200)
    const second = await requestCode('cooldown@example.com')
    expect(second.status).toBe(429)
    expect(second.body.code).toBe('EMAIL_CODE_COOLDOWN')
    expect(second.body.retryAfter).toBeGreaterThan(0)
    expect(second.headers['retry-after']).toBeTruthy()
    expect(sentEmails).toHaveLength(1)
  })

  it('a new request invalidates the previous code', async () => {
    await requestCode('rotate@example.com')
    const oldCode = lastSentCode()
    // Move past the cooldown so a resend is allowed
    await EmailCode.updateOne({ email: 'rotate@example.com' }, { $set: { sentAt: new Date(Date.now() - 61000) } })
    await requestCode('rotate@example.com')
    expect(sentEmails).toHaveLength(2)

    const res = await verifyCode('rotate@example.com', oldCode)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('EMAIL_CODE_INVALID')
  })

  it('limits sends to 5 per email per hour (429)', async () => {
    await EmailCodeSend.create(Array.from({ length: 5 }, () => ({ key: 'email:capped@example.com' })))
    await EmailCode.updateOne(
      { email: 'capped@example.com' },
      { $setOnInsert: { codeHash: 'x', sentAt: new Date(Date.now() - 61000), createdAt: new Date() } },
      { upsert: true },
    )
    const res = await requestCode('capped@example.com')
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('EMAIL_CODE_RATE_LIMITED')
    expect(sentEmails).toHaveLength(0)
  })

  it('limits sends to 10 per IP per hour (429)', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await requestCode(`ip-limit-${i}@example.com`)
      expect(res.status).toBe(200)
    }
    const res = await requestCode('ip-limit-11@example.com')
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('EMAIL_CODE_RATE_LIMITED')
  }, 60000)
})

describe('POST /api/signup/email-code/verify', () => {
  it('correct code returns a proof token bound to the normalized email', async () => {
    await requestCode('verify.me+test@gmail.com')
    const res = await verifyCode('verify.me+test@gmail.com', lastSentCode())
    expect(res.status).toBe(200)
    expect(res.body.proofToken).toBeTruthy()
    const jwt = (await import('jsonwebtoken')).default
    const decoded = jwt.verify(res.body.proofToken, JWT_SECRET)
    expect(decoded.purpose).toBe('signup-email-proof')
    expect(decoded.email).toBe('verifyme@gmail.com') // gmail plus-tag normalized
    expect(decoded.exp - decoded.iat).toBe(30 * 60)
    // The code is single-use: it was deleted on success
    expect(await EmailCode.countDocuments({ email: 'verifyme@gmail.com' })).toBe(0)
  })

  it('wrong codes report attempts left; the 5th wrong attempt invalidates the code and the 6th is blocked', async () => {
    await requestCode('attempts@example.com')
    for (let i = 1; i <= 4; i += 1) {
      const res = await verifyCode('attempts@example.com', wrongCode())
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('EMAIL_CODE_INVALID')
      expect(res.body.attemptsLeft).toBe(5 - i)
      expect(res.body.error).toContain(`${5 - i}`)
    }
    const fifth = await verifyCode('attempts@example.com', wrongCode())
    expect(fifth.status).toBe(400)
    expect(fifth.body.code).toBe('EMAIL_CODE_LOCKED')
    // The code was invalidated — even the correct code is now rejected
    const sixth = await verifyCode('attempts@example.com', lastSentCode())
    expect(sixth.status).toBe(400)
    expect(sixth.body.code).toBe('EMAIL_CODE_EXPIRED')
  })

  it('rejects an expired code', async () => {
    await requestCode('expired@example.com')
    const code = lastSentCode()
    await EmailCode.updateOne({ email: 'expired@example.com' }, { $set: { createdAt: new Date(Date.now() - 11 * 60 * 1000) } })
    const res = await verifyCode('expired@example.com', code)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('EMAIL_CODE_EXPIRED')
  })

  it('never logs the code, proof token, or recipient email', async () => {
    await requestCode('private@example.com')
    const code = lastSentCode()
    const res = await verifyCode('private@example.com', code)
    expect(res.status).toBe(200)
    const logs = loggedText()
    expect(logs).not.toContain(code)
    expect(logs).not.toContain(res.body.proofToken)
    expect(logs).not.toContain('private@example.com')
  })
})

describe('POST /api/signup with email proof', () => {
  const signup = (email, emailProof) => signupRequest(request(app).post('/api/signup'), { email, emailProof })

  it('rejects signup without a proof token (400 EMAIL_NOT_VERIFIED)', async () => {
    const res = await signup('no-proof@example.com', null)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED')
    expect(await Applicant.countDocuments()).toBe(0)
  })

  it('rejects a proof token bound to a different email', async () => {
    const res = await signup('real@example.com', emailProofFor('other@example.com'))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('rejects an expired proof token', async () => {
    const res = await signup('expired-proof@example.com', emailProofFor('expired-proof@example.com', { sign: { expiresIn: '-1s' } }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('rejects a reused (single-use) proof token', async () => {
    const proof = emailProofFor('reused@example.com')
    const first = await signup('reused@example.com', proof)
    expect(first.status).toBe(200)
    // Same token again: proof check runs before the duplicate-email check
    const second = await signup('reused@example.com', proof)
    expect(second.status).toBe(400)
    expect(second.body.code).toBe('EMAIL_NOT_VERIFIED')
  }, 60000)

  it('valid proof creates the account with emailVerified true, consumes the token, and sends no link email', async () => {
    const { sendVerificationEmail } = await import('../../mailer.js')
    const proof = emailProofFor('verified.signup@gmail.com')
    const res = await signup('verified.signup@gmail.com', proof)
    expect(res.status).toBe(200)
    expect(res.body.user.emailVerified).toBe(true)

    const applicant = await Applicant.findOne({ email: 'verified.signup@gmail.com' }).lean()
    expect(applicant.emailVerified).toBe(true)
    expect(sendVerificationEmail).not.toHaveBeenCalled()
    expect(await UsedEmailProof.countDocuments()).toBe(1)

    const logs = loggedText()
    expect(logs).not.toContain(proof)
  }, 60000)

  it('end-to-end: request code, verify it, sign up with the returned proof', async () => {
    await requestCode('e2e@example.com')
    const verify = await verifyCode('e2e@example.com', lastSentCode())
    expect(verify.status).toBe(200)
    const res = await signup('e2e@example.com', verify.body.proofToken)
    expect(res.status).toBe(200)
    expect(res.body.user.emailVerified).toBe(true)
  }, 60000)
})
