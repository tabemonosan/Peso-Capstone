export const CROSS_RULES_VERSION = '2026-11-13.7'
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
export function crossChecks({ nsrp = {}, ids = [] } = {}) {
  const findings = [], comparisons = []
  for (const document of ids) {
    const values = document.values || {}, baseline = parts(nsrp)
    let result = 'could_not_read'
    if (values.fullName) {
      const expected = [baseline.firstName, baseline.middleName, baseline.surname, baseline.suffix].filter(Boolean).join(' ')
      const surnameFirst = [baseline.surname, baseline.firstName, baseline.middleName, baseline.suffix].filter(Boolean).join(' ')
      const required = [baseline.firstName, baseline.surname, baseline.suffix].filter(Boolean).join(' ')
      const requiredSurnameFirst = [baseline.surname, baseline.firstName, baseline.suffix].filter(Boolean).join(' ')
      if (baseline.firstName && (baseline.surname || baseline.mononym)) {
        const candidates = [expected, surnameFirst, required, requiredSurnameFirst]
        // Licenses can print the suffix with the given name, before the middle
        // name. Limit OCR's III -> ill ambiguity to this known suffix slot;
        // never rewrite letters in the given, middle, or family name.
        if (baseline.suffix) {
          const suffixes = normalizeName(baseline.suffix) === 'iii' ? [baseline.suffix, 'ill'] : [baseline.suffix]
          for (const suffix of suffixes) {
            candidates.push(
              [baseline.firstName, suffix, baseline.middleName, baseline.surname].filter(Boolean).join(' '),
              [baseline.surname, baseline.firstName, suffix, baseline.middleName].filter(Boolean).join(' '),
              [baseline.firstName, baseline.middleName, baseline.surname, suffix].filter(Boolean).join(' '),
              [baseline.surname, baseline.firstName, baseline.middleName, suffix].filter(Boolean).join(' '),
            )
          }
        }
        const results = candidates.map(name => compareName(values.fullName, name))
        result = results.includes('match') ? 'match' : results.includes('minor') ? 'minor' : 'significant'
      }
    } else if (values.firstName && values.surname && baseline.firstName && baseline.surname) {
      const results = ['surname', 'firstName', ...(values.middleName && baseline.middleName ? ['middleName'] : []), ...(values.suffix && baseline.suffix ? ['suffix'] : [])].map(field => {
        const candidates = [baseline[field]]
        // PhilSys includes the suffix in its Given Names field.
        if (field === 'firstName' && baseline.suffix) {
          candidates.push(`${baseline.firstName} ${baseline.suffix}`)
          if (normalizeName(baseline.suffix) === 'iii') candidates.push(`${baseline.firstName} ill`)
        }
        const matches = candidates.map(candidate => compareName(values[field], candidate, { middle: field === 'middleName' }))
        return matches.includes('match') ? 'match' : matches.includes('minor') ? 'minor' : matches[0]
      })
      result = results.includes('significant') ? 'significant' : results.includes('minor') ? 'minor' : 'match'
    }
    const evidence = document.evidence === 'independent' ? 'independent' : 'self-declared'
    const comparison = { ruleId: 'cross_id_nsrp_name', fieldGroup: 'name', result, evidence }
    comparisons.push(comparison)
    if (result !== 'match') findings.push({ ...comparison, code: comparison.ruleId, severity: result === 'could_not_read' ? 'info' : result === 'significant' && evidence === 'independent' ? 'critical' : 'warning', status: 'open', approvalBlocking: true })
  }
  return { rulesVersion: CROSS_RULES_VERSION, level: comparisons.some(c => c.result === 'significant' && c.evidence === 'independent') ? 'needs attention' : comparisons.some(c => c.result === 'minor') ? 'minor differences' : 'consistent', comparisons, findings, independentComparisons: comparisons.filter(c => c.evidence === 'independent' && c.result === 'match').length }
}
// A combined row has comma-separated surname and given/middle names beneath
// these labels. The 'Last Name' label itself may be misread by OCR.
export function isCombinedNameHeader(line) {
  const normalized = String(line || '').toLowerCase().replace(/[^a-z]/g, '')
  return normalized.includes('firstname') && normalized.includes('middlename')
}
// Extract only labeled identity fields used by verification. OCR text remains transient.
export function extractDocumentFields(text = '') {
  const aliases = {
    fullName: '(?:full\\s*name|name)',
    surname: '(?:apelyido\\s*/\\s*)?(?:surname|last\\s*name|family\\s*name)',
    firstName: '(?:mga\\s*pangalan\\s*/\\s*)?(?:first\\s*name|given\\s*names?)',
    middleName: '(?:gitnang\\s*apelyido\\s*/\\s*)?middle\\s*name',
    suffix: 'suffix',
    dob: '(?:date\\s*of\\s*birth|birth\\s*date|dob)',
    sex: '(?:sex|gender)',
    placeOfBirth: 'place\\s*of\\s*birth',
    idNumber: '(?:id\\s*(?:number|no\\.?|#)|license\\s*(?:number|no\\.?|#)|driver.?s?\\s*license\\s*(?:number|no\\.?|#)|passport\\s*(?:number|no\\.?))',
  }
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const output = {}
  const nameHeader = lines.findIndex(isCombinedNameHeader)
  if (nameHeader >= 0) {
    for (const line of lines.slice(nameHeader + 1, nameHeader + 4)) {
      const match = /^\s*([^,]+),\s*([\p{L}?' -]+)\s*$/u.exec(line.replace(/[\s:;|.]+$/, ''))
      if (!match) continue
      const surname = match[1].trim().replace(/^(?:(?:lw|[aoilw?])\s+)+(?=[A-Z])/, '')
      output.fullName = `${surname}, ${match[2].trim()}`.slice(0, 240)
      break
    }
  }
  for (const [key, label] of Object.entries(aliases)) {
    if (output[key]) continue
    const pattern = new RegExp('^\\s*' + label + '\\s*(?::|=|-)?\\s*(.*?)\\s*$', 'i')
    for (let index = 0; index < lines.length; index++) {
      const match = pattern.exec(lines[index])
      if (!match) continue
      const value = match[1].replace(/^[#:\-\s]+|[#\s]+$/g, '').trim()
      if (value) { output[key] = value.slice(0, 120); break }
      const next = lines[index + 1]?.trim()
      if (next && !Object.values(aliases).some(alias => new RegExp('^\\s*' + alias + '\\b', 'i').test(next))) { output[key] = next.slice(0, 120); break }
    }
  }
  return output
}
export const EXPLANATION_CATEGORIES = ['Married name', 'Corrected record', 'Late-registered birth', 'ID name variant', 'Other']
