import { matchLocation } from './phLocations.js'
import { NSRP_RULES_VERSION, checkSummary, finding, junkText, junkNumber, FREE_EMAIL_DOMAINS } from './nsrpChecks.js'
export function checkNsrp2(input = {}) {
  const findings = [], d = input.registrationDetails || {}, add = (...args) => findings.push(finding(...args))
  for (const field of ['companyName', 'contactName', 'phone']) if (!String(input[field] || '').trim()) add('missing_' + field)
  for (const field of ['employerType', 'workforceSize', 'lineOfBusiness']) if (!String(d[field] || '').trim()) add('missing_' + field)
  for (const [field, value] of [['companyName', input.companyName], ['contactName', input.contactName], ['lineOfBusiness', d.lineOfBusiness]]) if (value && junkText(value)) add('junk_' + field, 'warning', 'establishment')
  if (junkNumber(d.taxIdentificationNumber)) add('tin_repeated_digits', 'warning', 'identifiers')
  if (input.phone && (!/^(09\d{9}|\+?639\d{9})$/.test(String(input.phone).replace(/[\s-]/g, '')) || junkNumber(input.phone))) add('employer_mobile', 'warning', 'contact')
  if (d.cityMunicipality && d.province && !matchLocation(d.cityMunicipality, d.province)) add('employer_location_pair', 'warning', 'address', false)
  if (d.contactTitle === 'Others' && !d.otherContactTitle?.trim()) add('contact_title_other', 'warning', 'contact')
  if (d.employerType === 'Government' && FREE_EMAIL_DOMAINS.has(String(input.email || '').split('@')[1]?.toLowerCase())) add('government_free_email', 'info', 'contact')
  if (/agency|recruitment|DO 174/i.test(d.employerType || '')) add('agency_manual_license', 'info', 'agency license')
  return { rulesVersion: NSRP_RULES_VERSION, findings, ...checkSummary(findings) }
}
