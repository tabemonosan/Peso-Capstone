import { crossChecks, extractDocumentFields, normalizeName } from './crossChecks.js'
import { WAITLIST_LIMITS } from './consistencyWaitlist.js'

// OCR text and line confidence remain transient; persist comparison results only.
export function checkIdName(text, confidence, nsrp, { lines = [] } = {}) {
  const values = extractDocumentFields(text)
  const nameValues = values.fullName ? [values.fullName] : [values.firstName, values.surname, values.middleName, values.suffix].filter(Boolean)
  const nameLines = nameValues.map(value => lines.find(line => normalizeName(line.text).includes(normalizeName(value))))
  const nameConfidence = nameValues.length && nameLines.every(line => Number.isFinite(line?.confidence))
    ? Math.min(...nameLines.map(line => line.confidence)) : confidence
  const reliable = Number.isFinite(nameConfidence) && nameConfidence >= WAITLIST_LIMITS.minOcrConfidence
  if (!reliable) return { comparisons: [{ ruleId: 'cross_id_nsrp_name', fieldGroup: 'name', result: 'could_not_read', evidence: 'independent', reliable: false }], findings: [] }
  const report = crossChecks({ nsrp, ids: [{ values, evidence: 'independent' }] })
  return { comparisons: report.comparisons.map(row => ({ ...row, reliable: true })), findings: report.findings }
}
