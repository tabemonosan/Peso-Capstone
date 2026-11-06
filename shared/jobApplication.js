export const RESUME_MAX_BYTES = 5 * 1024 * 1024
export const RESUME_TYPES = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
export const APPLICATION_STEPS = ['Contact details', 'Resume', 'Qualifications', 'Review']

export function validApplicationEmail(email) {
  if (typeof email !== 'string' || email.length > 254) return false
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  const labels = domain.split('.')
  return labels.length >= 2 && labels.every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
    && /^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(labels.at(-1))
}

export function bachelorDegreeFromNsrp(profile = {}) {
  const education = Array.isArray(profile.nsrp?.education) ? profile.nsrp.education : profile.education
  return (Array.isArray(education) ? education : []).some(row =>
    /^(tertiary|college)$/i.test(String(row?.level || '').trim())
    && /^\d{4}$/.test(String(row?.year || '').trim())
    && String(row?.course || '').trim()
    && !/\b(associate|diploma|certificate|vocational)\b/i.test(String(row.course))
  ) ? 'Yes' : 'No'
}

export function validateJobApplication(input = {}, resume, profile = {}) {
  const text = (value) => typeof value === 'string' ? value.trim() : ''
  const value = { email: text(input?.email).toLowerCase(), mobile: text(input?.mobile), bachelorDegree: bachelorDegreeFromNsrp(profile), hasExperience: text(input?.hasExperience), experience: text(input?.experience) }
  const errors = {}
  if (!validApplicationEmail(value.email)) errors.email = 'Enter a valid email address, such as name@gmail.com.'
  if (!/^\d{11}$/.test(value.mobile)) errors.mobile = 'Enter exactly 11 digits, using numbers only.'
  const name = resume?.name || resume?.originalname || ''
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (!resume) errors.resume = 'Upload your resume.'
  else if (!RESUME_TYPES[ext] || (resume.type || resume.mimetype) !== RESUME_TYPES[ext]) errors.resume = 'Upload a PDF or DOCX resume.'
  else if (!resume.size || resume.size > RESUME_MAX_BYTES) errors.resume = 'Your resume must be between 1 byte and 5 MB.'
  if (!['Yes', 'No'].includes(value.hasExperience)) errors.hasExperience = 'Select Yes or No.'
  if (value.hasExperience === 'Yes') {
    if (!value.experience) errors.experience = 'Briefly describe your experience.'
    else if (value.experience.length > 20) errors.experience = 'Use at most 20 characters.'
  } else value.experience = ''
  return { value, errors }
}
