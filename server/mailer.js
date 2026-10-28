import nodemailer from 'nodemailer'
import { redactString } from './utils/redact.js'

// Configured via .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL
// If SMTP is not configured, falls back to logging so the app still works in dev.
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null

const from = process.env.MAIL_FROM || 'PESO Portal <no-reply@peso-portal.local>'
export const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')

export async function sendEmail(to, subject, text) {
  if (!transporter) {
    // Never log the recipient or body: they contain email addresses and
    // token-bearing links (e.g. email verification URLs).
    console.log(`[email:fallback] SMTP not configured; email not sent. subject="${subject}"`)
    return { delivered: false }
  }
  try {
    await transporter.sendMail({ from, to, subject, text })
    return { delivered: true }
  } catch (err) {
    console.error('[email] send failed:', redactString(err.message))
    return { delivered: false, error: err.message }
  }
}

// Dev-only escape hatch: print the full verification link when SMTP is not
// configured. Requires explicit opt-in and is always disabled in production.
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
