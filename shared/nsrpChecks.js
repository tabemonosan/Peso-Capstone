export const NSRP_RULES_VERSION = '2026-11-01.1'

export function checkSummary(findings) {
  const summary = { critical: 0, warning: 0, info: 0 }
  for (const finding of findings) summary[finding.severity]++
  return { summary, level: summary.critical ? 'attention' : summary.warning ? 'review' : 'clear' }
}

// These checks deliberately do not inspect age, sex, religion, disability,
// civil status, or address. Findings never contain submitted field values.
export function checkNsrp(answers = {}) {
  const findings = []
  for (const field of ['firstName', 'surname', 'cellphone', 'occupation1', 'employmentStatus']) {
    if (!String(answers[field] || '').trim()) findings.push({ code: `missing_${field}`, severity: 'warning' })
  }
  for (const [section, from, to] of [['workExperience', 'fromDate', 'toDate'], ['technicalTraining', 'fromDate', 'toDate']]) {
    for (const row of answers[section] || []) {
      if (row[from] && row[to] && row[to] !== 'Present' && row[from] > row[to]) {
        findings.push({ code: `${section}_date_order`, severity: 'warning' })
      }
    }
  }
  for (const field of ['tin', 'gsisSss', 'pagibig', 'philhealth']) {
    const value = String(answers[field] || '').replace(/\D/g, '')
    if (value && /^(\d)\1+$/.test(value)) findings.push({ code: `${field}_repeated_digits`, severity: 'warning' })
  }
  return { rulesVersion: NSRP_RULES_VERSION, findings, ...checkSummary(findings) }
}
