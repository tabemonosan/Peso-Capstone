import { matchLocation, applicantCityName } from './phLocations.js'
export const NSRP_RULES_VERSION = '2026-11-03.2'
export const CHECK_LIMITS = Object.freeze({ education: { Elementary: 10, Secondary: 14, Tertiary: 16, 'Graduate Studies': 20 }, workAge: 15, marriedAge: 18, heightMin: 50, heightMax: 250, salaryMax: 9999999 })
export const DISPOSABLE_DOMAINS = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com'])
export const FREE_EMAIL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'])
export const normalizedText = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export const junkText = value => /^(test|testing|xxx+|asdf+|qwerty|placeholder|sample|dummy|nobody)$/i.test(String(value || '').trim()) || /^(.)\1{3,}$/u.test(String(value || '').trim())
export const junkNumber = value => {
  const n = String(value || '').replace(/\D/g, '')
  return n.length >= 4 && (/^(\d)\1+$/.test(n) || '01234567890123456789'.includes(n) || '98765432109876543210'.includes(n))
}
export function checkSummary(findings) {
  const summary = { critical: 0, warning: 0, info: 0 }
  for (const f of findings) if (f.severity in summary) summary[f.severity]++
  return { summary, level: summary.critical ? 'attention' : summary.warning ? 'review' : 'clear' }
}
export const finding = (code, severity = 'warning', fieldGroup = 'registration', approvalBlocking = true) => ({ code, ruleId: code, severity, fieldGroup, evidence: 'self-declared', status: 'open', approvalBlocking })
export function checkNsrp(a = {}, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const findings = [], add = (...args) => findings.push(finding(...args))
  const born = Number(String(a.dob || '').slice(0, 4)), year = Number(today.slice(0, 4))
  for (const field of ['firstName', 'surname', 'cellphone', 'occupation1', 'employmentStatus']) if (!String(a[field] || '').trim()) add('missing_' + field)
  for (const field of ['firstName', 'surname', 'middleName']) if (a[field] && (junkText(a[field]) || /\d/.test(a[field]))) add('junk_' + field, 'warning', 'name')
  const education = (a.education || []).filter(r => CHECK_LIMITS.education[r.level] && /^\d{4}$/.test(r.year || r.yearLastAttended || ''))
  for (const r of education) {
    const completed = Number(r.year || r.yearLastAttended)
    // Protected attributes are consistency reminders only, never eligibility inputs.
    if (born && completed < born + CHECK_LIMITS.education[r.level]) add('education_age', 'warning', 'education', false)
    if (completed > year) add('education_future', 'warning', 'education')
  }
  const ordered = [...education].sort((x, y) => CHECK_LIMITS.education[x.level] - CHECK_LIMITS.education[y.level])
  if (ordered.some((r, i) => i && Number(r.year || r.yearLastAttended) < Number(ordered[i - 1].year || ordered[i - 1].yearLastAttended))) add('education_order', 'warning', 'education')
  const work = a.workExperience || []
  let months = 0
  for (const [section, rows] of [['workExperience', work], ['technicalTraining', a.technicalTraining || []]]) for (const r of rows) {
    const from = r.fromDate || r.startDate, to = r.toDate || r.endDate
    if (from && to && to !== 'Present' && from > to) add(section + '_date_order', 'warning', 'work')
    if (to && to !== 'Present' && to > today) add(section + '_future_end', 'warning', 'work')
    if (section === 'workExperience') {
      if (from && born && Number(from.slice(0, 4)) < born + CHECK_LIMITS.workAge) add('work_start_age', 'warning', 'work', false)
      if (r.present === true && to && to !== 'Present') add('present_job_end', 'warning', 'work')
      if (from) months += Math.max(0, (Date.parse(!to || to === 'Present' ? today : to) - Date.parse(from)) / 2629800000) || 0
    }
  }
  const full = work.filter(r => !/part.?time/i.test(r.status || '') && r.fromDate)
  if (full.some((r, i) => full.slice(i + 1).some(s => r.fromDate <= (!s.toDate || s.toDate === 'Present' ? today : s.toDate) && s.fromDate <= (!r.toDate || r.toDate === 'Present' ? today : r.toDate)))) add('overlapping_full_time', 'warning', 'work')
  if (born && months / 12 > year - born - CHECK_LIMITS.workAge + 1) add('experience_age', 'warning', 'work', false)
  if (a.employmentStatus === 'Unemployed' && work.some(r => r.toDate === 'Present' || r.present === true)) add('unemployed_present_job', 'warning', 'work')
  if (a.employmentStatus === 'Employed' && !work.length) add('employed_without_history', 'info', 'work')
  if (a.civilStatus === 'Married' && born && year - born < CHECK_LIMITS.marriedAge) add('married_under_18', 'warning', 'personal details', false)
  if (a.height && (+a.height < CHECK_LIMITS.heightMin || +a.height > CHECK_LIMITS.heightMax)) add('height_range', 'warning', 'height')
  if (a.expectedSalary && (+a.expectedSalary < 0 || +a.expectedSalary > CHECK_LIMITS.salaryMax)) add('salary_range', 'warning', 'salary')
  for (const field of ['tin', 'gsisSss', 'pagibig', 'philhealth', 'passportNo', 'cellphone']) if (junkNumber(a[field])) add(field + '_repeated_digits', 'warning', field === 'cellphone' ? 'contact' : 'identifiers')
  if (a.addressCity && a.addressProvince && !matchLocation(applicantCityName(a.addressCity), a.addressProvince)) add('location_pair', 'warning', 'address', false)
  if (DISPOSABLE_DOMAINS.has(String(a.email || '').split('@')[1]?.toLowerCase())) add('disposable_email', 'warning', 'contact')
  const unique = [...new Map(findings.map(f => [f.code, f])).values()]
  return { rulesVersion: NSRP_RULES_VERSION, findings: unique, ...checkSummary(unique) }
}
