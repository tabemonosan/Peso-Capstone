export const CROSS_RULES_VERSION = '2026-11-03.4'
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
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text)
  if (iso) return [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  const local = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text)
  if (local) return [Number(local[3]), Number(local[2]), Number(local[1])]
  if (/[a-z]/i.test(text)) { const d = new Date(text); if (!Number.isNaN(+d)) return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] }
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
      if (result !== 'match') findings.push({ ruleId, code: ruleId, severity: ['info', 'could_not_read'].includes(result) ? 'info' : result === 'significant' && independent ? 'critical' : 'warning', fieldGroup, evidence, status: 'open', approvalBlocking: field !== 'sex' })
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
