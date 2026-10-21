import nodemailer from 'nodemailer'

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
    console.log(`[email:fallback] to=${to} subject="${subject}"\n${text}`)
    return { delivered: false }
  }
  try {
    await transporter.sendMail({ from, to, subject, text })
    return { delivered: true }
  } catch (err) {
    console.error('[email] send failed:', err.message)
    return { delivered: false, error: err.message }
  }
}

export async function sendVerificationEmail(to, rawToken, role) {
  const link = `${appUrl}/verify-email?token=${rawToken}&role=${role}`
  return sendEmail(
    to,
    'Verify your PESO Portal email',
    `Welcome to the PESO Job Portal!\n\nVerify your email address by opening this link (valid for 24 hours):\n\n${link}\n\nIf you did not create this account, you can ignore this email.`,
  )
}
