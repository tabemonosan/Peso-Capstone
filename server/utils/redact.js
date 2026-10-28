// Redaction helpers so logs never contain passwords, tokens, email addresses,
// NSRP answers, signature data, or file contents. Use redact() for any value
// derived from a request and redactPath() before logging a URL path.

const REDACTED = '[redacted]'

// Keys (compared lowercase) whose values must never appear in logs
const SENSITIVE_KEYS = new Set([
  'password',
  'confirmpassword',
  'passwordhash',
  'token',
  'authorization',
  'auth',
  'cookie',
  'signature',
  'signaturedataurl',
  'nsrpanswers',
  'emailverifytokenhash',
  'data',
  'buffer',
  'rawbody',
  'body',
])

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/g
const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g // header.payload.signature
const DATA_URL_PATTERN = /data:[\w/+.-]+;base64,[A-Za-z0-9+/=\s]+/g

// Masks emails, JWTs, and inline data URLs inside a free-form string.
export function redactString(input) {
  if (typeof input !== 'string') return input
  return input
    .replace(DATA_URL_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, '[redacted-email]')
}

// Deep-copies a value, replacing sensitive keys and masking string content.
export function redact(value) {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (value && typeof value === 'object') {
    if (Buffer.isBuffer(value)) return REDACTED
    const output = {}
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(entry)
    }
    return output
  }
  return value
}

// Safe path for request logging: drops the query string (may carry emails or
// tokens) and masks credential-bearing path segments such as signed document
// URLs (/api/documents/view/<jwt>).
export function redactPath(path) {
  const withoutQuery = String(path || '').split('?')[0]
  const masked = withoutQuery.replace(/^(\/api\/documents\/view\/)[^/]+$/, '$1[redacted]')
  return redactString(masked)
}
