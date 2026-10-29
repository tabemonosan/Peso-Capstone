// Single source of truth for NSRP field limits, allowed values, sanitizers,
// and validators. Used by the sign-up/Update wizard (live input control) and
// the server (validateNsrpAnswers), and mirrors the Mongoose schema enums so
// an invalid value can never reach the database as a 500.
import { SUFFIX_OPTIONS, validateNameFields } from './nameFields.js'
import { NSRP_ROW_LIMITS } from './nsrpTableLimits.js'

export const CURRENT_YEAR = new Date().getFullYear()
export const MIN_YEAR = 1950

export const NSRP_TEXT_LIMITS = {
  surname: 80,
  firstName: 80,
  middleName: 80,
  suffix: 20,
  dob: 10,
  placeOfBirth: 120,
  sex: 10,
  religion: 80,
  civilStatus: 20,
  height: 20,
  addressStreet: 120,
  addressBarangay: 80,
  addressCity: 80,
  addressProvince: 80,
  tin: 30,
  gsisSss: 30,
  pagibig: 30,
  philhealth: 30,
  email: 254,
  cellphone: 20,
  landline: 20,
  disability: 120,
  disabilityOthers: 60,
  employmentStatus: 20,
  employmentTypeDetail: 120,
  terminatedAbroadCountry: 60,
  employmentTypeOther: 60,
  activelyLooking: 5,
  lookingDuration: 40,
  willingImmediately: 5,
  willingWhen: 80,
  fourPs: 5,
  fourPsId: 40,
  occupation1: 80,
  occupation2: 80,
  occupation3: 80,
  occupation4: 80,
  localPref1: 80,
  localPref2: 80,
  localPref3: 80,
  overseasPref1: 80,
  overseasPref2: 80,
  overseasPref3: 80,
  expectedSalary: 40,
  passportNo: 30,
  passportExpiry: 10,
  othersText: 60,
}

export const NSRP_REQUIRED_FIELDS = [
  'surname', 'firstName', 'dob', 'placeOfBirth', 'sex', 'civilStatus',
  'addressStreet', 'addressBarangay', 'addressCity', 'addressProvince',
  'email', 'cellphone', 'employmentStatus', 'activelyLooking',
  'willingImmediately', 'fourPs', 'occupation1',
]

export const SEX_OPTIONS = ['Male', 'Female']
export const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Live-in']
export const EMPLOYMENT_STATUS_OPTIONS = ['Employed', 'Unemployed']
export const EMPLOYED_TYPES = ['Wage Employed', 'Self Employed']
export const UNEMPLOYED_TYPES = ['New Entrant/Fresh Graduate', 'Finished Contract', 'Resigned', 'Retired', 'Terminated/Laidoff (local)', 'Terminated/Laidoff (abroad)', 'Others']
export const YES_NO = ['Yes', 'No']
export const DISABILITY_OPTIONS = ['Visual', 'Hearing', 'Speech', 'Physical', 'Others']
export const EDUCATION_LEVELS = ['Elementary', 'Secondary', 'Tertiary', 'Graduate Studies']
export const LANGUAGE_ROWS = ['English', 'Filipino', 'Others']
export const WORK_STATUS_OPTIONS = ['Permanent', 'Contractual', 'Part-time', 'Probationary']

// Enum-style fields: only these values may reach the database.
// suffix mirrors the Mongoose enum on profile.suffix.
export const NSRP_ALLOWED_VALUES = {
  suffix: SUFFIX_OPTIONS,
  sex: SEX_OPTIONS,
  civilStatus: CIVIL_STATUS_OPTIONS,
  employmentStatus: EMPLOYMENT_STATUS_OPTIONS,
  activelyLooking: YES_NO,
  willingImmediately: YES_NO,
  fourPs: YES_NO,
  disability: ['', ...DISABILITY_OPTIONS],
}

// One education row per level on the printed form; other sections capped.
export const NSRP_SECTION_MAX_ROWS = {
  education: EDUCATION_LEVELS.length,
  technicalTraining: 3,
  eligibility: 2,
  workExperience: 5,
  languages: LANGUAGE_ROWS.length,
}

// --- Sanitizers (typing and paste go through the same onChange path) ---
export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '')
export const collapseSpaces = (value) => String(value ?? '').replace(/\s+/g, ' ')
export const trimCollapse = (value) => collapseSpaces(value).trim()

// Convert +639XXXXXXXXX / 639XXXXXXXXX to 09XXXXXXXXX; digits only otherwise.
// Does NOT truncate: the wizard truncates for input blocking, the server must
// see the true length so over-long numbers are rejected, not silently cut.
export function normalizePhMobile(value) {
  const digits = digitsOnly(value)
  if (digits.startsWith('63') && digits.length >= 11) return `0${digits.slice(2)}`
  return digits
}

export const normalizePassportNo = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)

// Names: letters (incl. ñ/accents), spaces, hyphens, apostrophes, periods.
export const NAME_PATTERN = /^[\p{L}\s.'-]+$/u
// Addresses / place of birth: letters, numbers, and common punctuation.
export const ADDRESS_PATTERN = /^[\p{L}\p{N}\s.,#()\-'/]+$/u

// --- Numeric ID specs (digits only; dashes/spaces stripped) ---
export const NSRP_NUMERIC_SPECS = {
  tin: { lengths: [9, 12], helper: '9 or 12 digits' },
  gsisSss: { lengths: [10], helper: '10 digits' },
  pagibig: { lengths: [12], helper: '12 digits' },
  philhealth: { lengths: [12], helper: '12 digits' },
  fourPsId: { lengths: null, maxDigits: 20, helper: 'digits only' },
}

export const HEIGHT_MIN = 50
export const HEIGHT_MAX = 250
export const SALARY_MAX = 9999999
export const MOBILE_ERROR = 'Enter an 11-digit mobile number starting with 09.'

export const isValidCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const isValidYear = (value) => /^\d{4}$/.test(String(value || '')) && Number(value) >= MIN_YEAR && Number(value) <= CURRENT_YEAR

// "Today" as a calendar date (YYYY-MM-DD) in Asia/Manila. Comparing against
// the server's UTC date rejects legitimate same-day dates in the morning
// (UTC+8 is ahead of UTC for most of the day).
export const todayInManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

export function ageFromDob(dob) {
  if (!isValidCalendarDate(dob)) return null
  const birth = new Date(`${dob}T00:00:00.000Z`)
  const now = new Date()
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

// Per-field scalar validators. Return '' when valid, otherwise the error text.
// `value` here is already trimmed/collapsed; optional fields may be ''.
export const NSRP_FIELD_VALIDATORS = {
  surname: nameRule, firstName: nameRule, middleName: nameRule,
  placeOfBirth: addressRule,
  addressStreet: addressRule, addressBarangay: addressRule, addressCity: addressRule, addressProvince: addressRule,
  height(value) {
    if (!value) return ''
    if (!/^\d+$/.test(value)) return 'Enter a whole number of centimeters.'
    const cm = Number(value)
    return cm >= HEIGHT_MIN && cm <= HEIGHT_MAX ? '' : `Enter a height between ${HEIGHT_MIN} and ${HEIGHT_MAX} cm.`
  },
  expectedSalary(value) {
    if (!value) return ''
    if (!/^\d+$/.test(value)) return 'Enter a whole number.'
    return Number(value) <= SALARY_MAX ? '' : `Enter ${SALARY_MAX.toLocaleString('en-US')} or less.`
  },
  passportNo(value) {
    if (!value) return ''
    return /^[A-Z0-9]{7,12}$/.test(value) ? '' : 'Enter 7 to 12 letters/digits (uppercase).'
  },
  cellphone(value) {
    if (!value) return '' // required-ness is handled separately
    return /^09\d{9}$/.test(value) ? '' : MOBILE_ERROR
  },
  landline(value) {
    if (!value) return ''
    return /^\d{7,11}$/.test(value) ? '' : 'Enter 7 to 11 digits (area code allowed).'
  },
}

function nameRule(value) {
  if (!value) return ''
  if (!/[\p{L}]/u.test(value)) return 'Enter a valid name.'
  return NAME_PATTERN.test(value) ? '' : 'Use letters, spaces, hyphens, apostrophes, and periods only.'
}

function addressRule(value) {
  if (!value) return ''
  if (!/[\p{L}\p{N}]/u.test(value)) return 'Enter a valid value.'
  return ADDRESS_PATTERN.test(value) ? '' : 'Use letters, numbers, and common punctuation only.'
}

export function validateNumericId(field, digits) {
  const spec = NSRP_NUMERIC_SPECS[field]
  if (!spec || !digits) return ''
  if (spec.lengths && !spec.lengths.includes(digits.length)) return `Enter ${spec.helper}.`
  return ''
}

// Basic information collected on the upload path (applicant already has a
// filled NSRP form). These become the account's display name and location.
export const NSRP_BASIC_INFO_FIELDS = ['firstName', 'middleName', 'noMiddleName', 'lastName', 'suffix', 'dob', 'cellphone', 'addressCity', 'addressProvince']

export function validateNsrpBasicInfo(input = {}) {
  const { values, fieldErrors } = validateNameFields(input, { noMiddleName: input.noMiddleName === true || input.noMiddleName === 'true' })
  const cleaned = { ...values }

  const dob = String(input.dob || '').trim()
  cleaned.dob = dob
  if (!dob) fieldErrors.dob = 'This field is required.'
  else if (!isValidCalendarDate(dob)) fieldErrors.dob = 'Enter a valid date.'
  else if (dob > todayInManila()) fieldErrors.dob = 'Enter a date that is not in the future.'
  else {
    const age = ageFromDob(dob)
    if (age !== null && (age < 15 || age > 100)) fieldErrors.dob = 'Applicants must be 15 to 100 years old.'
  }

  const cellphone = normalizePhMobile(input.cellphone)
  cleaned.cellphone = cellphone
  if (!cellphone) fieldErrors.cellphone = 'This field is required.'
  else {
    const problem = NSRP_FIELD_VALIDATORS.cellphone(cellphone)
    if (problem) fieldErrors.cellphone = problem
  }

  for (const field of ['addressCity', 'addressProvince']) {
    const value = trimCollapse(input[field])
    cleaned[field] = value
    if (!value) fieldErrors[field] = 'This field is required.'
    else {
      const problem = NSRP_FIELD_VALIDATORS[field](value)
      if (problem) fieldErrors[field] = problem
    }
  }

  return { values: cleaned, fieldErrors }
}

export { NSRP_ROW_LIMITS }
