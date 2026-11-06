export const CROSS_RULES_VERSION = '2026-11-06.3'
export const NO_MIDDLE = new Set(['', 'nomiddlename', 'n/a', 'na', 'nmn'])
export function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\bma\.?(?=\s|$)/g, 'maria').replace(/\bsto\.?(?=\s|$)/g, 'santo').replace(/[^\p{L}\p{N}]/gu, '')
}
export function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = next
  }
  return previous[b.length]
}
export function compareName(left, right, { middle = false } = {}) {
  const a = normalizeName(left), b = normalizeName(right)
  if (middle && (NO_MIDDLE.has(a) || NO_MIDDLE.has(b))) return 'info'
  if (!a || !b) return 'could_not_read'
  if (a === b || (middle && ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))))) return 'match'
  return editDistance(a, b) <= (Math.max(a.length, b.length) <= 6 ? 1 : 2) ? 'minor' : 'significant'
}
export function dateParts(value) {
  const text = String(value || '').trim()
  const valid = parts => {
    const [year, month, day] = parts
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? parts : null
  }
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text)
  if (iso) return valid([Number(iso[1]), Number(iso[2]), Number(iso[3])])
  const local = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text)
  if (local) return valid([Number(local[3]), Number(local[2]), Number(local[1])])
  // A birth date is a calendar value, not a timestamp. Native Date parsing
  // shifts local midnight into the previous UTC day in Asia/Manila.
  const months = 'January February March April May June July August September October November December'.split(' ')
  const monthPattern = months.map(month => `${month.slice(0, 3)}(?:${month.slice(3)})?`).join('|')
  const named = new RegExp(`^(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})(?:\\s*\\((\\d{4}-\\d{2}-\\d{2})\\))?$`, 'i').exec(text)
  const dayFirst = new RegExp(`^(\\d{1,2})\\s+(${monthPattern})\\.?[,]?\\s+(\\d{4})$`, 'i').exec(text)
  if (named || dayFirst) {
    const match = named || dayFirst
    const monthName = match[named ? 1 : 2].slice(0, 3).toLowerCase()
    const parts = valid([Number(match[3]), months.findIndex(month => month.slice(0, 3).toLowerCase() === monthName) + 1, Number(match[named ? 2 : 1])])
    if (named?.[4] && (!parts || dateParts(named[4])?.join() !== parts.join())) return null
    return parts
  }
  return null
}
export function compareDate(left, right) {
  const a = dateParts(left), b = dateParts(right)
  if (!a || !b) return 'could_not_read'
  if (a.join() === b.join()) return 'match'
  if (a[0] === b[0] && a[1] === b[2] && a[2] === b[1]) return 'minor'
  return 'significant'
}
function parts(values = {}) {
  if (!values.fullName || values.firstName || values.surname) return values
  if (values.fullName.includes(',')) { const [surname, rest] = values.fullName.split(','); const [firstName, ...middle] = rest.trim().split(/\s+/); return { ...values, surname, firstName, middleName: middle.join(' ') } }
  return { ...values, mononym: true, firstName: values.fullName }
}
export function crossChecks({ nsrp = {}, birth = {}, ids = [] } = {}) {
  const findings = [], comparisons = []
  const birthValues = parts(birth.values)
  const compare = (document, label, baseline, reference) => {
    const values = parts(document.values), independent = document.evidence === 'independent'
    for (const field of ['surname', 'firstName', 'middleName', 'suffix', 'dob', 'sex', 'placeOfBirth', ...(label === 'id' ? ['idNumber'] : [])]) {
      const a = values[field], b = baseline[field]
      let result = field === 'dob' ? compareDate(a, b) : field === 'idNumber' ? !a || !b ? 'could_not_read' : normalizeName(a) === normalizeName(b) ? 'match' : 'significant' : compareName(a, b, { middle: field === 'middleName' })
      let ruleId = `cross_${label}_${reference}_${field}`
      if (field === 'surname' && label === 'id' && result === 'significant' && nsrp.sex === 'Female' && ['Married', 'Widowed', 'Separated'].includes(nsrp.civilStatus) && birthValues.surname && normalizeName(birthValues.surname) === normalizeName(nsrp.middleName)) { result = 'info'; ruleId = 'cross_married_name' }
      if (field === 'surname' && label === 'birth' && result === 'significant' && nsrp.sex === 'Female' && ['Married', 'Widowed', 'Separated'].includes(nsrp.civilStatus) && normalizeName(a) === normalizeName(nsrp.middleName)) { result = 'info'; ruleId = 'cross_married_name' }
      if ((values.mononym || baseline.mononym) && ['surname', 'middleName'].includes(field)) { result = 'info'; ruleId = 'cross_mononym' }
      // Sex only avoids false flags; it can never introduce an approval-blocking finding.
      if (field === 'sex' && result !== 'match') result = 'info'
      if (['middleName', 'suffix'].includes(field) && result === 'significant') result = 'minor'
      const evidence = independent ? 'independent' : 'self-declared'
      const fieldGroup = ['surname', 'firstName', 'middleName', 'suffix'].includes(field) ? 'name' : field === 'dob' ? 'birth date' : field === 'idNumber' ? 'ID number' : field
      comparisons.push({ ruleId, fieldGroup, result, evidence })
      if (result !== 'match') findings.push({ ruleId, code: ruleId, severity: ['info', 'could_not_read'].includes(result) ? 'info' : result === 'significant' && independent ? 'critical' : 'warning', fieldGroup, evidence, status: 'open', approvalBlocking: ['name', 'birth date'].includes(fieldGroup) })
    }
  }
  compare(birth, 'birth', nsrp, 'nsrp')
  for (const id of ids) { compare(id, 'id', nsrp, 'nsrp'); if (birth.values) compare(id, 'id', birthValues, 'birth') }
  const significant = comparisons.some(c => c.evidence === 'independent' && c.result === 'significant')
  const minor = comparisons.filter(c => ['minor', 'significant'].includes(c.result)).length
  return { rulesVersion: CROSS_RULES_VERSION, level: significant ? 'needs attention' : minor > 1 ? 'minor differences' : 'consistent', comparisons, findings: [...new Map(findings.map(f => [f.ruleId, f])).values()], independentComparisons: comparisons.filter(c => c.evidence === 'independent' && c.result === 'match' && c.fieldGroup !== 'sex').length }
}
// English labelled fields only. Used transiently; unlabelled OCR remains inconclusive.
export function extractDocumentFields(text = '') {
  const aliases = { surname: '(?:surname|last name)', firstName: '(?:first name|given names?)', middleName: 'middle name', dob: '(?:date of birth|birth date|dob)', sex: 'sex', placeOfBirth: 'place of birth', idNumber: '(?:id number|passport no\\.?)' }
  return Object.fromEntries(Object.entries(aliases).flatMap(([key, label]) => {
    const match = new RegExp('(?:^|\\n)\\s*' + label + '\\s*[:=]\\s*([^\\n]+)', 'i').exec(text)
    return match ? [[key, match[1].trim().slice(0, 120)]] : []
  }))
}
export const EXPLANATION_CATEGORIES = ['Married name', 'Corrected record', 'Late-registered birth', 'ID name variant', 'Other']
