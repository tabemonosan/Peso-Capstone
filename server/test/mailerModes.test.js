// @vitest-environment node
// Mailer mode selection and log-redaction guarantees. nodemailer is fully
// mocked — no network calls happen.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { sendMailMock, verifyMock, createTransportMock, createTestAccountMock, getTestMessageUrlMock } =
  vi.hoisted(() => ({
    sendMailMock: vi.fn(),
    verifyMock: vi.fn(),
    createTransportMock: vi.fn(),
    createTestAccountMock: vi.fn(),
    getTestMessageUrlMock: vi.fn(),
  }))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
    createTestAccount: createTestAccountMock,
    getTestMessageUrl: getTestMessageUrlMock,
  },
}))

const ORIGINAL_ENV = { ...process.env }
let consoleOutput

const SMTP_ENV = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'secret-user@gmail.com',
  SMTP_PASS: 'secret-app-password-123',
}

function clearEmailEnv() {
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'EMAIL_DEV_MODE', 'DEV_LOG_VERIFICATION_LINKS']) {
    delete process.env[key]
  }
}

async function importMailer() {
  vi.resetModules()
  return import('../mailer.js')
}

beforeEach(() => {
  consoleOutput = []
  vi.spyOn(console, 'log').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.spyOn(console, 'warn').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.clearAllMocks()
  clearEmailEnv()
  delete process.env.NODE_ENV
  createTransportMock.mockReturnValue({ sendMail: sendMailMock, verify: verifyMock })
  sendMailMock.mockResolvedValue({ messageId: 'msg-1' })
  verifyMock.mockResolvedValue(true)
  createTestAccountMock.mockResolvedValue({
    user: 'ethereal-user@ethereal.email',
    pass: 'ethereal-pass-456',
    smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
  })
  getTestMessageUrlMock.mockReturnValue('https://ethereal.email/message/abc123')
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

const loggedText = () => consoleOutput.join('\n')

describe('mailer mode selection', () => {
  it('uses SMTP when SMTP vars are set, and logs "Mailer ready" without credentials', async () => {
    Object.assign(process.env, SMTP_ENV)
    const mailer = await importMailer()
    await mailer.initMailer()
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: SMTP_ENV.SMTP_USER, pass: SMTP_ENV.SMTP_PASS },
      }),
    )
    expect(createTestAccountMock).not.toHaveBeenCalled()
    expect(loggedText()).toContain('Mailer ready')
    expect(loggedText()).not.toContain(SMTP_ENV.SMTP_PASS)
    expect(loggedText()).not.toContain(SMTP_ENV.SMTP_USER)
  })

  it('uses secure: true for port 465', async () => {
    Object.assign(process.env, SMTP_ENV, { SMTP_PORT: '465' })
    const mailer = await importMailer()
    await mailer.initMailer()
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }))
  })

  it('uses Ethereal when SMTP is unset and EMAIL_DEV_MODE=ethereal (non-production)', async () => {
    process.env.NODE_ENV = 'development'
    process.env.EMAIL_DEV_MODE = 'ethereal'
    const mailer = await importMailer()
    await mailer.initMailer()
    expect(createTestAccountMock).toHaveBeenCalled()
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.ethereal.email', auth: { user: 'ethereal-user@ethereal.email', pass: 'ethereal-pass-456' } }),
    )
    // after a send, only the preview URL is logged (no recipient)
    await mailer.sendEmail('real-recipient@example.com', 'Hi', 'body with code 999888')
    const devLine = consoleOutput.find((line) => line.includes('[DEV ONLY] Email preview:'))
    expect(devLine).toBeDefined()
    expect(devLine).toContain('https://ethereal.email/message/abc123')
    expect(devLine).not.toContain('real-recipient@example.com')
    expect(loggedText()).not.toContain('999888')
    expect(loggedText()).not.toContain('ethereal-pass-456')
  })

  it('never uses Ethereal in production, even with EMAIL_DEV_MODE=ethereal', async () => {
    process.env.NODE_ENV = 'production'
    process.env.EMAIL_DEV_MODE = 'ethereal'
    const mailer = await importMailer()
    await mailer.initMailer()
    expect(createTestAccountMock).not.toHaveBeenCalled()
    expect(createTransportMock).not.toHaveBeenCalled()
    expect(loggedText()).toContain('Email is not configured.')
  })

  it('falls back to subject-only logging with the startup warning when nothing is configured', async () => {
    process.env.NODE_ENV = 'development'
    const mailer = await importMailer()
    await mailer.initMailer()
    expect(loggedText()).toContain(
      'Email is not configured. Verification codes will not be delivered. Set SMTP_* or EMAIL_DEV_MODE=ethereal.',
    )
    await mailer.sendEmail('nobody@example.com', 'Secret subject', 'code 111222')
    expect(loggedText()).toContain('[email:fallback]')
    expect(loggedText()).not.toContain('nobody@example.com')
    expect(loggedText()).not.toContain('111222')
  })
})

describe('mailer redaction', () => {
  it('never logs password, recipient, code, or token when sending via SMTP', async () => {
    Object.assign(process.env, SMTP_ENV)
    const mailer = await importMailer()
    await mailer.sendVerificationEmail('applicant@example.com', 'raw-token-abc-789', 'Applicant')
    expect(sendMailMock).toHaveBeenCalled()
    const logs = loggedText()
    expect(logs).not.toContain(SMTP_ENV.SMTP_PASS)
    expect(logs).not.toContain('applicant@example.com')
    expect(logs).not.toContain('raw-token-abc-789')
  })

  it('translates auth failures and never leaks credentials from verify errors', async () => {
    Object.assign(process.env, SMTP_ENV)
    verifyMock.mockRejectedValue(
      Object.assign(new Error(`535-5.7.8 Username and Password not accepted for ${SMTP_ENV.SMTP_USER} pass ${SMTP_ENV.SMTP_PASS}`), {
        code: 'EAUTH',
        responseCode: 535,
      }),
    )
    const mailer = await importMailer()
    await mailer.initMailer()
    const logs = loggedText()
    expect(logs).toContain('Check the app password and that 2-Step Verification is on')
    expect(logs).not.toContain(SMTP_ENV.SMTP_PASS)
    expect(logs).not.toContain(SMTP_ENV.SMTP_USER)
    expect(logs).not.toContain('Mailer ready')
  })

  it('translates connection and certificate errors into plain messages', async () => {
    Object.assign(process.env, SMTP_ENV)
    const { describeSmtpError } = await importMailer()
    expect(describeSmtpError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toContain('Check host and port')
    expect(describeSmtpError(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }))).toContain('Check host and port')
    expect(describeSmtpError(new Error('self signed certificate in certificate chain'))).toMatch(/certificate/i)
  })

  it('send failures log a redacted error only', async () => {
    Object.assign(process.env, SMTP_ENV)
    sendMailMock.mockRejectedValue(new Error(`bad auth for ${SMTP_ENV.SMTP_USER} using ${SMTP_ENV.SMTP_PASS}`))
    const mailer = await importMailer()
    const result = await mailer.sendEmail('target@example.com', 'x', 'code 555000')
    expect(result.delivered).toBe(false)
    const logs = loggedText()
    expect(logs).not.toContain(SMTP_ENV.SMTP_PASS)
    expect(logs).not.toContain('target@example.com')
    expect(logs).not.toContain('555000')
  })
})
