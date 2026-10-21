// Shared password policy (client + server).
// All special characters and spaces are allowed — nothing is trimmed, stripped, or escaped.
// Max 64 chars keeps input under bcrypt's 72-byte limit even for multi-byte UTF-8.
export const PASSWORD_RULES = [
  { key: 'minLength', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { key: 'maxLength', label: 'At most 64 characters', test: (pw) => pw.length <= 64 },
  { key: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { key: 'number', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { key: 'symbol', label: 'One symbol or space', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

// Returns an array of failed rule keys (empty = valid)
export function validatePassword(password) {
  if (typeof password !== 'string') return PASSWORD_RULES.map((rule) => rule.key)
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.key)
}

export function isPasswordValid(password) {
  return validatePassword(password).length === 0
}

// Human-readable server error naming every failed rule
export function passwordErrorMessage(password) {
  const failed = validatePassword(password)
  if (failed.length === 0) return null
  const labels = PASSWORD_RULES.filter((rule) => failed.includes(rule.key)).map((rule) => rule.label)
  return `Password requirements not met: ${labels.join('; ')}`
}
