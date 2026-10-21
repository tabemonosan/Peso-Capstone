import crypto from 'crypto'

// Normalize emails for uniqueness checks:
// - always trim + lowercase
// - gmail.com / googlemail.com: strip dots in the local part and everything after "+"
export function normalizeEmail(email) {
  if (typeof email !== 'string') return ''
  const trimmed = email.trim().toLowerCase()
  const [local, domain] = trimmed.split('@')
  if (!local || !domain) return trimmed
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`
  }
  return trimmed
}

// Raw token goes in the email link; only its SHA-256 hash is stored
export function generateVerifyToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashVerifyToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
export const RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds
