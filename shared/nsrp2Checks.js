import { NSRP_RULES_VERSION, checkSummary } from './nsrpChecks.js'

export function checkNsrp2(input = {}) {
  const findings = []
  for (const field of ['companyName', 'contactName', 'phone']) {
    if (!String(input[field] || '').trim()) findings.push({ code: `missing_${field}`, severity: 'warning' })
  }
  for (const field of ['employerType', 'workforceSize', 'lineOfBusiness']) {
    if (!String(input.registrationDetails?.[field] || '').trim()) findings.push({ code: `missing_${field}`, severity: 'warning' })
  }
  const tin = String(input.registrationDetails?.taxIdentificationNumber || '').replace(/\D/g, '')
  if (tin && /^(\d)\1+$/.test(tin)) findings.push({ code: 'tin_repeated_digits', severity: 'warning' })
  return { rulesVersion: NSRP_RULES_VERSION, findings, ...checkSummary(findings) }
}
