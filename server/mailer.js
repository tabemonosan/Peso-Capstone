import nodemailer from 'nodemailer'
import { redactString } from './utils/redact.js'

// Email delivery modes:
//   A) Real SMTP   — when SMTP_HOST, SMTP_USER and SMTP_PASS are set
//                    (SMTP_PORT optional, default 587; 465 uses secure: true).
//   B) Ethereal    — development only, when SMTP is not configured,
//                    NODE_ENV is not production and EMAIL_DEV_MODE=ethereal.
//                    A throwaway account is created at startup; after each send
//                    only the message preview URL is logged (no recipient).
//   Fallback       — neither configured: log the subject only.
// Ethereal is never used in production.
//
// Redaction rules: never log codes, tokens, links, passwords, or recipient
// email addresses. Use redactString() on any third-party error message.

export const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function etherealEnabled() {
  return (
    !smtpConfigured() &&
    process.env.EMAIL_DEV_MODE === 'ethereal' &&
    process.env.NODE_ENV !== 'production'
  )
}

// Translate common nodemailer/SMTP failures into plain-language hints.
// Returns a redacted, single-line message safe to print.
export function describeSmtpError(err) {
  const raw = redactString(String(err?.message || err || 'unknown error'))
  const code = err?.code || ''
  const responseCode = Number(err?.responseCode || 0)
  if (code === 'EAUTH' || responseCode === 535 || /auth/i.test(raw)) {
    return 'Authentication failed. Check the app password and that 2-Step Verification is on.'
  }
  if (
    ['ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code) ||
    /timed?\s*out|refused|ENOTFOUND|EHOSTUNREACH/i.test(raw)
  ) {
    return 'Could not reach the SMTP server. Check host and port (587 = STARTTLS, 465 = SSL).'
  }
  if (/certificate|self[- ]signed|CERT_|TLS/i.test(raw) || code === 'ESOCKET') {
    return 'TLS/certificate error. Check that the port matches the encryption (587 STARTTLS, 465 SSL) and that the server certificate is valid.'
  }
  return raw
}

let transporter = null
let from = null
let mode = 'fallback' // 'smtp' | 'ethereal' | 'fallback'
let initPromise = null

async function createSmtpTransport() {
  const port = Number(process.env.SMTP_PORT || 587)
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS upgrade
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  from = process.env.MAIL_FROM || process.env.SMTP_USER
  try {
    await transporter.verify()
    console.log('Mailer ready')
  } catch (err) {
    // Non-fatal: the app still runs, sends will retry and log failures.
    console.error(`[email] Mailer verification failed: ${describeSmtpError(err)}`)
  }
}

async function createEtherealTransport() {
  const account = await nodemailer.createTestAccount()
  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  })
  from = process.env.MAIL_FROM || account.user
  console.log('[DEV ONLY] Ethereal email enabled. Preview URLs are printed after each send.')
}

// Resolve the delivery mode and build the transporter. Safe to call multiple
// times; the result is memoized.
export function initMailer() {
  if (!initPromise) {
    initPromise = (async () => {
      if (smtpConfigured()) {
        mode = 'smtp'
        await createSmtpTransport()
      } else if (etherealEnabled()) {
        mode = 'ethereal'
        try {
          await createEtherealTransport()
        } catch (err) {
          mode = 'fallback'
          transporter = null
          console.error(`[email] Ethereal setup failed, falling back to log-only: ${describeSmtpError(err)}`)
        }
      } else {
        mode = 'fallback'
        console.warn('Email is not configured. Verification codes will not be delivered. Set SMTP_* or EMAIL_DEV_MODE=ethereal.')
      }
    })()
  }
  return initPromise
}

export async function sendEmail(to, subject, text) {
  await initMailer()
  if (!transporter) {
    // Never log the recipient or body: they contain email addresses and
    // token-bearing links (e.g. email verification URLs).
    console.log(`[email:fallback] Email not sent. subject="${subject}"`)
    return { delivered: false }
  }
  try {
    const info = await transporter.sendMail({ from, to, subject, text })
    if (mode === 'ethereal') {
      const previewUrl = nodemailer.getTestMessageUrl(info)
      if (previewUrl) {
        // Deliberately does NOT include the recipient's email address.
        console.log(`[DEV ONLY] Email preview: ${previewUrl}`)
      }
    }
    return { delivered: true }
  } catch (err) {
    console.error(`[email] send failed: ${describeSmtpError(err)}`)
    return { delivered: false, error: describeSmtpError(err) }
  }
}

// Dev-only escape hatch: print the full verification link when delivery is not
// possible. Requires explicit opt-in and is always disabled in production.
// Read at call time so tests and local tooling can toggle it.
export function devVerificationLinkLoggingEnabled() {
  return process.env.DEV_LOG_VERIFICATION_LINKS === 'true' && process.env.NODE_ENV !== 'production'
}

export async function sendVerificationEmail(to, rawToken, role) {
  const link = `${appUrl}/verify-email?token=${rawToken}&role=${role}`
  const result = await sendEmail(
    to,
    'Verify your PESO Portal email',
    `Welcome to the PESO Job Portal!\n\nVerify your email address by opening this link (valid for 24 hours):\n\n${link}\n\nIf you did not create this account, you can ignore this email.`,
  )
  if (!result.delivered && devVerificationLinkLoggingEnabled()) {
    // Deliberately does NOT include the recipient's email address.
    console.log(`[DEV ONLY] Verification link: ${link}`)
  }
  return result
}
