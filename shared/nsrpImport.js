import { NSRP_TEXT_LIMITS, NSRP_ALLOWED_VALUES, NSRP_FIELD_VALIDATORS, normalizePhMobile, isValidCalendarDate } from './nsrpValidation.js'
import { NSRP_ROW_LIMITS } from './nsrpTableLimits.js'
import { NSRP_SKILL_LABELS } from './nsrpSkills.js'
import { nsrpProfileSkills } from './applicantProfile.js'
import { PH_LOCATIONS } from './phLocations.js'
import { capitalizeName, SUFFIX_OPTIONS } from './nameFields.js'

const clean = value => typeof value === 'string' ? [...value].map(char => char.charCodeAt(0) < 32 ? ' ' : char).join('').replace(/\s+/g, ' ').trim() : ''
const key = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export function nsrpImportDate(value) {
  const text = clean(value)
  if (isValidCalendarDate(text)) return text
  // NSRP Form 1 explicitly labels dates mm/dd/yyyy.
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text)
  const date = match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : ''
  return isValidCalendarDate(date) ? date : ''
}
export function sanitizeNsrpImport(input = {}) {
  const answers = {}, unreadable = []
  for (const [field, limit] of Object.entries(NSRP_TEXT_LIMITS)) {
    let value = clean(input[field])
    if (!value || /^(?:n\/?a|none|not applicable|_+)$/i.test(value)) continue
    if (['surname', 'firstName', 'middleName'].includes(field)) value = capitalizeName(value)
    if (field === 'suffix') value = SUFFIX_OPTIONS.find(option => key(option) === key(value)) || ''
    if (['dob', 'passportExpiry'].includes(field)) value = nsrpImportDate(value)
    if (field === 'cellphone') value = normalizePhMobile(value)
    if (field === 'email') value = value.replace(/\s/g, '').toLowerCase()
    if (field === 'addressCity') value = Object.keys(PH_LOCATIONS).find(city => key(city) === key(value)) || value
    if (field === 'addressProvince' && key(value) === 'albay') value = 'Albay'
    if (NSRP_ALLOWED_VALUES[field]) value = NSRP_ALLOWED_VALUES[field].find(option => key(option) === key(value)) || ''
    const maxLength = ['surname', 'firstName', 'middleName'].includes(field) ? 50 : limit
    if (!value || value.length > maxLength || NSRP_FIELD_VALIDATORS[field]?.(value)) { unreadable.push(field); continue }
    answers[field] = value
  }
  for (const [section, limits] of Object.entries(NSRP_ROW_LIMITS)) {
    if (section === 'languages') continue
    const rows = Array.isArray(input[section]) ? input[section] : []
    answers[section] = rows.slice(0, 10).map(row => Object.fromEntries(Object.entries(limits).flatMap(([field, limit]) => {
      const value = clean(row?.[field])
      if (!value || /^(?:n\/?a|_+)$/i.test(value)) return []
      if (value.length > limit) { unreadable.push(`${section}.${field}`); return [] }
      return [[field, value]]
    }))).filter(row => Object.keys(row).some(field => field !== 'level'))
  }
  answers.skills = [...new Set((Array.isArray(input.skills) ? input.skills : []).filter(skill => NSRP_SKILL_LABELS.includes(skill)))].slice(0, NSRP_SKILL_LABELS.length)
  if (Array.isArray(input.languages)) answers.languages = input.languages.slice(0, 3).filter(row => ['English', 'Filipino', 'Others'].includes(row.name)).map(row => ({ name: row.name, ...(row.name === 'Others' ? { otherName: clean(row.otherName).slice(0, 40) } : {}), ...Object.fromEntries(['read', 'write', 'speak', 'understand'].map(field => [field, row[field] === true])) }))
  return { answers, unreadable: [...new Set(unreadable)] }
}

export function nsrpImportBasic(answers = {}) {
  return Object.fromEntries(Object.entries({ firstName: answers.firstName, middleName: answers.middleName, lastName: answers.surname, suffix: answers.suffix, dob: answers.dob, cellphone: answers.cellphone, addressCity: answers.addressCity, addressProvince: answers.addressProvince }).filter(([, value]) => typeof value === 'string' && value))
}

// Enrich an existing profile without replacing personally edited values or its
// existing registration identity. Only the NSRP payload carries private fields.
export function mergeNsrpIntoProfile(profile = {}, answers = {}) {
  const next = { ...profile }
  const basics = nsrpImportBasic(answers)
  for (const [field, value] of Object.entries(basics)) {
    const target = field === 'cellphone' ? 'phone' : field
    if (!next[target]) next[target] = value
  }
  if (!next.location) next.location = [answers.addressStreet, answers.addressBarangay, next.addressCity, next.addressProvince].filter(Boolean).join(', ')
  const union = (old = [], imported = [], identity) => {
    const existing = new Set(old.map(identity))
    return [...old, ...imported.filter(row => { const id = identity(row); if (existing.has(id)) return false; existing.add(id); return true })]
  }
  next.skills = union(nsrpProfileSkills({ skills: profile.skills, othersText: profile.nsrp?.othersText || answers.othersText }), nsrpProfileSkills(answers), key)
  next.education = union(profile.education || [], (answers.education || []).map(row => ({ level: row.level || '', school: row.school || '', course: row.course || '', year: row.year || '' })), row => key(`${row.level} ${row.school}`))
  next.technicalTraining = union(profile.technicalTraining || [], (answers.technicalTraining || []).map(row => ({ name: row.course || '', provider: row.institution || '', course: row.course || '', year: /^\d{4}-/.test(row.toDate || '') ? row.toDate.slice(0, 4) : '' })), row => key(`${row.course || row.name} ${row.provider}`))
  next.workExperience = union(profile.workExperience || [], (answers.workExperience || []).map(row => ({ company: row.company || '', position: row.position || '', startDate: row.fromDate || '', endDate: row.toDate || '' })), row => key(`${row.company} ${row.position} ${row.startDate}`))
  next.nsrp = { ...answers, ...(profile.nsrp || {}) }
  for (const [field, profileField] of Object.entries({ firstName: 'firstName', surname: 'lastName', middleName: 'middleName', suffix: 'suffix', dob: 'dob' })) {
    if (profile[profileField] !== undefined) next.nsrp[field] = profile[profileField]
  }
  return next
}
