// Shared applicant name-field rules used by both the client (Vite) and the
// server (Express/Mongoose). Keep this module dependency-free ESM.

// Optional name suffixes offered in the UI ("" = none).
export const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV']

export const NAME_MAX_LENGTH = 50

// Letters (any script, includes ñ/Ñ and accented letters), spaces, hyphens,
// apostrophes, and periods. Digits and other symbols are rejected.
const NAME_ALLOWED_RE = /^[\p{L} .''\-]+$/u
const NAME_START_RE = /^[\p{L}]/u

// Particles that stay lowercase so names like "de la Cruz" keep their form.
const LOWERCASE_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'der', 'den', 'di', 'da', 'le', 'y', 'bin', 'binti', 'al'])

// Trim leading/trailing whitespace and collapse repeated internal spaces.
export function sanitizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

// Capitalize the first letter of each word segment while preserving
// conventional forms: particles stay lowercase ("de la Cruz"), and letters
// after apostrophes/hyphens are capitalized ("O'Brien", "Mary-Ann").
export function capitalizeName(value) {
  const sanitized = sanitizeName(value)
  if (!sanitized) return ''
  return sanitized
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase()
      if (LOWERCASE_PARTICLES.has(lower.replace(/\.$/, ''))) return lower
      return lower.replace(/(^|[\p{Pd}''.])(\p{L})/gu, (_match, sep, chr) => sep + chr.toUpperCase())
    })
    .join(' ')
}

// Validate one name field. Returns '' when valid, otherwise an error message.
export function validateNameField(value, { label = 'Name', required = true } = {}) {
  const sanitized = sanitizeName(value)
  if (!sanitized) return required ? `${label} is required.` : ''
  if (sanitized.length > NAME_MAX_LENGTH) return `${label} must be ${NAME_MAX_LENGTH} characters or fewer.`
  if (!NAME_START_RE.test(sanitized)) return `${label} must start with a letter.`
  if (!NAME_ALLOWED_RE.test(sanitized)) return `${label} may only contain letters, spaces, hyphens, apostrophes, and periods.`
  return ''
}

// Validate the set of applicant name fields. Returns { values, fieldErrors }.
export function validateNameFields(input = {}, { noMiddleName = false } = {}) {
  const values = {
    firstName: capitalizeName(input.firstName),
    middleName: noMiddleName ? '' : capitalizeName(input.middleName),
    lastName: capitalizeName(input.lastName),
    suffix: SUFFIX_OPTIONS.includes(input.suffix) ? input.suffix : '',
  }
  const fieldErrors = {}
  const firstError = validateNameField(values.firstName, { label: 'First name', required: true })
  if (firstError) fieldErrors.firstName = firstError
  const lastError = validateNameField(values.lastName, { label: 'Last name', required: true })
  if (lastError) fieldErrors.lastName = lastError
  if (!noMiddleName) {
    const middleError = validateNameField(values.middleName, { label: 'Middle name', required: false })
    if (middleError) fieldErrors.middleName = middleError
  }
  if (input.suffix && !SUFFIX_OPTIONS.includes(input.suffix)) fieldErrors.suffix = 'Choose a valid suffix.'
  return { values, fieldErrors }
}

// Split a legacy single "name" string into parts (best-effort):
// first word = first name, last word = last name, anything between = middle name.
export function splitFullName(name) {
  const words = sanitizeName(name).split(' ').filter(Boolean)
  if (words.length === 0) return { firstName: '', middleName: '', lastName: '', suffix: '' }
  const suffix = SUFFIX_OPTIONS.includes(words[words.length - 1]) ? words.pop() : ''
  if (words.length === 1) return { firstName: capitalizeName(words[0]), middleName: '', lastName: '', suffix }
  const firstName = words[0]
  const lastName = words[words.length - 1]
  const middleName = words.slice(1, -1).join(' ')
  return {
    firstName: capitalizeName(firstName),
    middleName: capitalizeName(middleName),
    lastName: capitalizeName(lastName),
    suffix,
  }
}

const hasParts = (p) => Boolean(p && (sanitizeName(p.firstName) || sanitizeName(p.lastName)))

// "First Middle Last Suffix"; falls back to the legacy single name field.
export function formatFullName(profile) {
  if (!profile) return ''
  if (hasParts(profile)) {
    return [profile.firstName, profile.middleName, profile.lastName, profile.suffix]
      .map((part) => sanitizeName(part))
      .filter(Boolean)
      .join(' ')
  }
  return sanitizeName(profile.name)
}

// "Last, First M." for admin lists; falls back to the legacy single name field.
export function formatDisplayName(profile) {
  if (!profile) return ''
  if (!hasParts(profile)) return sanitizeName(profile.name)
  const first = sanitizeName(profile.firstName)
  const last = sanitizeName(profile.lastName)
  const middle = sanitizeName(profile.middleName)
  const suffix = sanitizeName(profile.suffix)
  const middleInitial = middle ? ` ${middle.charAt(0).toUpperCase()}.` : ''
  const suffixText = suffix ? ` ${suffix}` : ''
  if (!last) return `${first}${suffixText}`.trim()
  if (!first) return `${last}${suffixText}`.trim()
  return `${last}, ${first}${middleInitial}${suffixText}`
}
