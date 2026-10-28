// @vitest-environment node
// Dev-only verification-link fallback logging: opt-in flag + never in production.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
let consoleOutput

// Re-import the mailer fresh for each test so SMTP/env config is re-evaluated.
async function importMailer() {
  vi.resetModules()
  return import('../mailer.js')
}

beforeEach(() => {
  consoleOutput = []
  vi.spyOn(console, 'log').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...args) => consoleOutput.push(args.map(String).join(' ')))
  // Force the no-SMTP fallback path regardless of any local .env
  delete process.env.SMTP_HOST
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  delete process.env.DEV_LOG_VERIFICATION_LINKS
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

const loggedText = () => consoleOutput.join('\n')

describe('mailer dev verification-link logging', () => {
  it('never logs the token when the flag is off (default)', async () => {
    process.env.NODE_ENV = 'development'
    const { sendVerificationEmail } = await importMailer()
    await sendVerificationEmail('dev-off@example.com', 'token-flag-off-123', 'Applicant')
    const logs = loggedText()
    expect(logs).toContain('[email:fallback]')
    expect(logs).not.toContain('token-flag-off-123')
    expect(logs).not.toContain('dev-off@example.com')
    expect(logs).not.toContain('[DEV ONLY]')
  })

  it('prints the full link with the flag on and NODE_ENV=development, without the recipient', async () => {
    process.env.NODE_ENV = 'development'
    process.env.DEV_LOG_VERIFICATION_LINKS = 'true'
    const { sendVerificationEmail } = await importMailer()
    await sendVerificationEmail('dev-on@example.com', 'token-flag-on-456', 'Applicant')
    const logs = loggedText()
    expect(logs).toContain('[DEV ONLY] Verification link:')
    expect(logs).toContain('token=token-flag-on-456')
    const devLine = consoleOutput.find((line) => line.includes('[DEV ONLY]'))
    expect(devLine).not.toContain('dev-on@example.com')
  })

  it('never prints the link with NODE_ENV=production even when the flag is on', async () => {
    process.env.NODE_ENV = 'production'
    process.env.DEV_LOG_VERIFICATION_LINKS = 'true'
    const { sendVerificationEmail } = await importMailer()
    await sendVerificationEmail('prod@example.com', 'token-prod-789', 'Applicant')
    const logs = loggedText()
    expect(logs).toContain('[email:fallback]')
    expect(logs).not.toContain('token-prod-789')
    expect(logs).not.toContain('[DEV ONLY]')
  })
})
