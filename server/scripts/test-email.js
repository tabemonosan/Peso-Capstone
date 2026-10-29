// Send a test email: npm run mail:test -- someone@example.com
// Uses the same mode selection and redaction rules as the app mailer.
// Never prints the password, SMTP username, or message contents.
import 'dotenv/config'
import { initMailer, sendEmail, describeSmtpError } from '../mailer.js'

const to = process.argv[2]
if (!to || !to.includes('@')) {
  console.error('Usage: npm run mail:test -- someone@example.com')
  process.exit(1)
}

try {
  await initMailer()
  const result = await sendEmail(
    to,
    'PESO Portal test email',
    'This is a test email from the PESO Portal mailer. If you can read this, email delivery is working.',
  )
  if (result.delivered) {
    // Recipient address is intentionally not echoed back to the console.
    console.log('Test email sent successfully.')
    process.exit(0)
  } else {
    console.error(`Test email was not delivered. ${result.error || 'Email is not configured (log-only fallback).'}`)
    process.exit(1)
  }
} catch (err) {
  console.error(`Test email failed: ${describeSmtpError(err)}`)
  process.exit(1)
}
