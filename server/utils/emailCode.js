import crypto from 'crypto'
import jwt from 'jsonwebtoken'

// 6-digit signup email codes: limits, hashing, and the short-lived proof token
// issued after a successful verification.
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
export const EMAIL_CODE_MAX_ATTEMPTS = 5
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds
export const EMAIL_CODE_HOURLY_LIMIT = 5 // per email
export const EMAIL_CODE_IP_HOURLY_LIMIT = 10 // per IP (express-rate-limit)
export const EMAIL_PROOF_TTL = '30m'
export const EMAIL_PROOF_PURPOSE = 'signup-email-proof'

const codeSecret = process.env.EMAIL_CODE_SECRET || process.env.JWT_SECRET || 'dev-secret'
const jwtSecret = process.env.JWT_SECRET || 'dev-secret'

export function generateEmailCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

// HMAC binds the code to the normalized email; only the digest is stored.
export function hashEmailCode(normalizedEmail, code) {
  return crypto.createHmac('sha256', codeSecret).update(`${normalizedEmail}:${code}`).digest('hex')
}

export function emailCodeMatches(normalizedEmail, code, storedHash) {
  const candidate = Buffer.from(hashEmailCode(normalizedEmail, code), 'hex')
  const stored = Buffer.from(String(storedHash || ''), 'hex')
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored)
}

// Signed, short-lived proof that `normalizedEmail` passed code verification.
// The jti makes it single-use (consumed jtis are recorded server-side).
export function signEmailProof(normalizedEmail) {
  return jwt.sign(
    { email: normalizedEmail, purpose: EMAIL_PROOF_PURPOSE, jti: crypto.randomBytes(16).toString('hex') },
    jwtSecret,
    { expiresIn: EMAIL_PROOF_TTL },
  )
}

// Returns { email, jti, exp } or null when invalid/expired/wrong purpose.
export function verifyEmailProof(token) {
  try {
    const decoded = jwt.verify(String(token || ''), jwtSecret)
    if (decoded?.purpose !== EMAIL_PROOF_PURPOSE || !decoded.email || !decoded.jti) return null
    return { email: decoded.email, jti: decoded.jti, exp: decoded.exp }
  } catch {
    return null
  }
}
