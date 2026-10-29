import { matchLocation, parseStoredLocation } from './phLocations.js'
// Job posting options, validation, and display helpers shared by the employer
// request form (client) and the /api/jobs routes (server) so both enforce the
// same rules and return the same field-level messages.

export const LOCATION_TYPES = ['On-site', 'Hybrid', 'Remote']
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contractual', 'Project-based', 'Internship-OJT', 'Probationary']
// Values stored before the expanded list existed, mapped to their closest current option.
export const LEGACY_EMPLOYMENT_TYPES = { Contract: 'Contractual', Temporary: 'Project-based', Internship: 'Internship-OJT' }
export const PAY_FREQUENCIES = ['Hourly', 'Daily', 'Monthly']
export const EDUCATION_LEVELS = ['Not Required', 'HS Graduate', 'Senior HS Graduate', 'Vocational (TESDA NC II)', 'College Level', 'College Graduate']
export const EXPERIENCE_LEVELS = ['No Experience', 'Less than 1 year', '1\u20133 years', '3\u20135 years', '5+ years']

export const JOB_LIMITS = {
  titleMax: 80,
  descriptionMax: 3000,
  requirementsMax: 2000,
  notesMax: 500,
  placeMax: 80,
  skillMax: 60,
  skillsMax: 30,
  slotsMax: 999,
  salaryMax: 9999999,
  deadlineMaxDays: 90,
}

const DAY_MS = 24 * 60 * 60 * 1000
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export function mapEmploymentType(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return LEGACY_EMPLOYMENT_TYPES[text] || text
}

// Calendar date (YYYY-MM-DD) in Philippine time, shifted by `offsetDays`.
export function manilaDate(now = new Date(), offsetDays = 0) {
  return new Date(now.getTime() + MANILA_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10)
}

export function deadlineBounds(now = new Date()) {
  return { min: manilaDate(now), max: manilaDate(now, JOB_LIMITS.deadlineMaxDays) }
}

const isRealDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value

// "25,000" / "\u20B125000" -> 25000; blank -> null; unparseable -> NaN.
export function parseAmount(value) {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/[\u20B1,\s]/g, '')
  if (!cleaned) return null
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : Number.NaN
}

const formatPeso = (amount) => `\u20B1${Number(amount).toLocaleString('en-US')}`
const PER_UNIT = { Hourly: 'hour', Daily: 'day', Monthly: 'month' }

// Human-readable salary. Falls back to the legacy free-text salary for old postings.
export function formatSalary(job = {}) {
  if (job.negotiable) return 'Negotiable'
  const min = job.salaryMin
  const max = job.salaryMax
  const hasMin = typeof min === 'number' && Number.isFinite(min)
  const hasMax = typeof max === 'number' && Number.isFinite(max)
  if (hasMin || hasMax) {
    const unit = PER_UNIT[job.payFrequency] || 'month'
    const range = hasMin && hasMax && min !== max ? `${formatPeso(min)} to ${formatPeso(max)}` : formatPeso(hasMin ? min : max)
    return `${range} / ${unit}`
  }
  return job.salary || ''
}

export function formatLocation(job = {}) {
  const place = [job.city, job.province].map((part) => (typeof part === 'string' ? part.trim() : '')).filter(Boolean).join(', ')
  return job.locationType === 'Remote' ? 'Remote' : (place || job.location || '')
}

// Old single-salary string ("\u20B125,000") -> structured fields. Returns null when there is nothing to derive.
export function deriveSalaryFields(salary) {
  const amount = parseAmount(salary)
  if (amount === null || !Number.isFinite(amount)) return null
  return { salaryMin: amount, salaryMax: amount, payFrequency: 'Monthly', negotiable: false }
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const oneOf = (value, list) => list.includes(value)

export const emptyJobPosting = () => ({ title: '', customTitle: '', description: '', requirements: '', skills: [], locationType: 'On-site', city: '', province: '', employmentType: 'Full-time', education: 'Not Required', experience: 'No Experience', salaryMin: '', salaryMax: '', payFrequency: 'Monthly', negotiable: false, slots: '', deadline: '', notesToAdmin: '' })

// Recover legacy fields from the posting itself, preserving a different branch address.
export function normalizeJobPosting(job = {}) {
  const derived = job.salaryMin == null && job.salaryMax == null ? deriveSalaryFields(job.salary) : null
  const storedPlace = matchLocation(job.city, job.province)
  const legacyPlace = parseStoredLocation(job.location)
  const consistentLegacyPlace = legacyPlace
    && (!text(job.city) || text(job.city).toLowerCase() === legacyPlace.city.toLowerCase())
    && (!text(job.province) || text(job.province).toLowerCase() === legacyPlace.province.toLowerCase())
  const place = job.locationType === 'Remote' ? { city: '', province: '' } : (storedPlace || (consistentLegacyPlace ? legacyPlace : {}))
  return { ...job, ...place, ...(derived || {}), negotiable: job.negotiable || /^negotiable$/i.test(job.salary || ''),
    payFrequency: job.payFrequency || 'Monthly', employmentType: mapEmploymentType(job.employmentType),
    education: job.education || 'Not Required', experience: job.experience || 'No Experience',
    skills: Array.isArray(job.skills) ? job.skills : (typeof job.skills === 'string' ? job.skills.split(',').map((s) => s.trim()).filter(Boolean) : []) }
}

// Validates and normalizes a job posting payload.
// options.now: clock for deadline bounds. options.keepDeadline: an already-stored
// deadline (YYYY-MM-DD) that may retain an older maximum bound on edit.
export function validateJobPosting(input = {}, { now = new Date(), keepDeadline = '' } = {}) {
  const errors = {}
  const value = {}

  const title = text(input.title)
  const customTitle = text(input.customTitle)
  if (!title) errors.title = 'Select or enter a job title.'
  else if (title.toLowerCase() === 'other') {
    if (!customTitle) errors.title = 'Enter a job title.'
    else if (customTitle.length > JOB_LIMITS.titleMax) errors.title = `Job title must be ${JOB_LIMITS.titleMax} characters or fewer.`
  } else if (title.length > JOB_LIMITS.titleMax) errors.title = `Job title must be ${JOB_LIMITS.titleMax} characters or fewer.`
  value.title = title
  value.customTitle = customTitle

  value.description = text(input.description)
  if (!value.description) errors.description = 'Describe the responsibilities and role.'
  else if (value.description.length > JOB_LIMITS.descriptionMax) errors.description = `Description must be ${JOB_LIMITS.descriptionMax} characters or fewer.`

  value.requirements = text(input.requirements)
  if (value.requirements.length > JOB_LIMITS.requirementsMax) errors.requirements = `Requirements must be ${JOB_LIMITS.requirementsMax} characters or fewer.`

  value.notesToAdmin = text(input.notesToAdmin)
  if (value.notesToAdmin.length > JOB_LIMITS.notesMax) errors.notesToAdmin = `Notes must be ${JOB_LIMITS.notesMax} characters or fewer.`

  const rawSkills = Array.isArray(input.skills) ? input.skills.filter((skill) => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean) : []
  const seen = new Set()
  value.skills = rawSkills.filter((skill) => {
    const key = skill.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (value.skills.length === 0) errors.skills = 'Add at least one required skill.'
  if (!Array.isArray(input.skills) || input.skills.some((skill) => typeof skill !== 'string')) errors.skills = 'Enter skills as a list of text tags.'
  else if (value.skills.length > JOB_LIMITS.skillsMax) errors.skills = `Add no more than ${JOB_LIMITS.skillsMax} skills.`
  else if (value.skills.some((skill) => skill.length > JOB_LIMITS.skillMax)) errors.skills = `Each skill must be ${JOB_LIMITS.skillMax} characters or fewer.`

  value.locationType = text(input.locationType)
  if (!oneOf(value.locationType, LOCATION_TYPES)) errors.locationType = 'Choose On-site, Hybrid, or Remote.'
  const needsPlace = value.locationType === 'On-site' || value.locationType === 'Hybrid'
  value.city = needsPlace ? text(input.city).replace(/\s+/g, ' ') : ''
  value.province = needsPlace ? text(input.province).replace(/\s+/g, ' ') : ''
  if (needsPlace) {
    if (!value.city) errors.city = 'Enter the city or municipality.'
    else if (value.city.length > JOB_LIMITS.placeMax) errors.city = `City or municipality must be ${JOB_LIMITS.placeMax} characters or fewer.`
    if (!value.province) errors.province = 'Enter the province.'
    else if (value.province.length > JOB_LIMITS.placeMax) errors.province = `Province must be ${JOB_LIMITS.placeMax} characters or fewer.`
    if (!errors.city && !errors.province) {
      const place = matchLocation(value.city, value.province)
      if (!place) {
        errors.city = 'Choose a city/municipality from the location list.'
        errors.province = 'Province must match the selected city/municipality.'
      } else Object.assign(value, place)
    }
  }

  value.employmentType = mapEmploymentType(input.employmentType)
  if (!oneOf(value.employmentType, EMPLOYMENT_TYPES)) errors.employmentType = 'Choose a valid employment type.'
  value.education = text(input.education) || 'Not Required'
  if (value.education && !oneOf(value.education, EDUCATION_LEVELS)) errors.education = 'Choose a valid educational attainment.'
  value.experience = text(input.experience) || 'No Experience'
  if (value.experience && !oneOf(value.experience, EXPERIENCE_LEVELS)) errors.experience = 'Choose a valid experience level.'

  value.negotiable = input.negotiable === true || input.negotiable === 'true'
  const legacy = input.salaryMin === undefined && input.salaryMax === undefined ? deriveSalaryFields(input.salary) : null
  const source = legacy || input
  let salaryMin = null
  let salaryMax = null
  if (!value.negotiable) {
    const salary = (raw, key, label) => {
      if (raw === '' || raw === null || raw === undefined) {
        errors[key] = `${label} salary is required when salary is not negotiable.`
        return null
      }
      if ((typeof raw === 'number' && raw < 0) || (typeof raw === 'string' && /^-\d/.test(raw))) errors[key] = `${label} salary can't be negative.`
      else if (!['string', 'number'].includes(typeof raw) || !/^\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw))) errors[key] = 'Enter the salary as numbers only.'
      else if (Number(raw) > JOB_LIMITS.salaryMax) errors[key] = `${label} salary must be from 0 to 9,999,999.`
      return errors[key] ? null : Number(raw)
    }
    salaryMin = salary(source.salaryMin, 'salaryMin', 'Minimum')
    salaryMax = salary(source.salaryMax, 'salaryMax', 'Maximum')
    if (!errors.salaryMin && !errors.salaryMax && salaryMax < salaryMin) {
      errors.salaryMax = 'Maximum salary must be at least the minimum.'
    }
  }

  value.salaryMin = salaryMin
  value.salaryMax = salaryMax
  const frequency = text(source.payFrequency) || text(input.payFrequency)
  if (frequency && !oneOf(frequency, PAY_FREQUENCIES)) errors.payFrequency = 'Choose Hourly, Daily, or Monthly.'
  value.payFrequency = value.negotiable || (salaryMin === null && salaryMax === null) ? (oneOf(frequency, PAY_FREQUENCIES) ? frequency : '') : (frequency || 'Monthly')

  const slotsRaw = input.slots
  if (slotsRaw === '' || slotsRaw === undefined || slotsRaw === null) errors.slots = 'Enter the available slots.'
  else {
    const slots = ['string', 'number'].includes(typeof slotsRaw) ? Number(slotsRaw) : Number.NaN
    if (!['string', 'number'].includes(typeof slotsRaw) || !/^\d+$/.test(String(slotsRaw)) || !Number.isInteger(slots) || slots < 1 || slots > JOB_LIMITS.slotsMax) errors.slots = `Slots must be a whole number from 1 to ${JOB_LIMITS.slotsMax.toLocaleString('en-US')}.`
    else value.slots = slots
  }

  const deadline = text(input.deadline)
  value.deadline = deadline
  if (!deadline) errors.deadline = 'Enter the application deadline.'
  if (deadline) {
    const { min, max } = deadlineBounds(now)
    if (!isRealDate(deadline)) errors.deadline = 'Enter a valid application deadline.'
    else if (deadline < min) errors.deadline = 'The deadline must be today or later.'
    else if (deadline !== keepDeadline && deadline > max) errors.deadline = `The deadline can be at most ${JOB_LIMITS.deadlineMaxDays} days from today.`
  }

  return { errors, value }
}
