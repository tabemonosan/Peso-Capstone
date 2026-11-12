import { isSharedPhoneFinding } from './verificationFindings.js'
export const DECISION_RULES_VERSION = '2026-11-13.4'
export const ALWAYS_MANUAL_TYPES = /government|recruitment|placement agency|DO 174/i
export const evidenceComparisons = rows => (rows || []).filter(row => row.evidence === 'independent' && row.result === 'match' && row.fieldGroup === 'name')
export function decisionReason({ settings, docKey, document, account, findings = [], comparisons = [], verifiedQr = false, pendingExplanation = false }) {
  if (docKey === 'birthCertificate') return 'Supporting document only'
  findings = findings.filter(finding => !isSharedPhoneFinding(finding))
  const identityDocument = ['birthCertificate', 'validId1', 'validId2'].includes(docKey)
  // Ignore older stored comparison findings outside the current identity policy.
  if (identityDocument) findings = findings.filter(finding => {
    const rule = finding.ruleId || finding.code || ''
    if (['declared_id_nsrp_difference', 'id_number_format', 'id_expired', 'national_id_screenshot'].includes(rule)) return false
    return !/^cross_(birth|id)_/.test(rule) || /_(surname|firstName|middleName|suffix|name)$/.test(rule)
  })
  const typeSwitch = { nsrpForm: 'applicant', employerNsrpForm: 'employer', birthCertificate: 'birthCertificate', validId1: 'validId', validId2: 'validId' }[docKey]
  if (!typeSwitch) return 'Always manual'
  if (!settings.automaticApproval || !settings.verificationEngineEnabled || !settings[typeSwitch]) return 'Auto-approval off'
  if (document.status !== 'pending') return 'Already reviewed'
  if (document.version !== 1 && !['birthCertificate', 'validId1', 'validId2'].includes(docKey)) return 'Resubmission'
  if (['nsrpForm', 'employerNsrpForm'].includes(docKey) && document.sourceType !== 'generated') return 'Uploaded file'
  if (!account.emailVerified) return 'Email unverified'
  if (account.holdAutoApproval || account.deletedAt || account.verificationStatus === 'restricted' || account.applyingSuspendedAt || account.receivingApplicantsSuspendedAt) return 'Hold'
  if (docKey === 'employerNsrpForm' && ALWAYS_MANUAL_TYPES.test(account.employerType || '')) return 'Always manual'
  if (findings.some(f => /duplicate|cross_account/.test(f.ruleId || f.code || ''))) return 'Flagged'
  if (findings.some(f => f.approvalBlocking !== false && f.status !== 'dismissed' && ['warning', 'critical'].includes(f.severity))) return 'Flagged'
  if (pendingExplanation) return 'Explanation'
  if (!document.quality?.passed) return 'Could not be read'
  if (document.quality.warnings?.length) return 'Quality warning'
  if (settings.minimumEvidence === 'independent' && !verifiedQr) {
    const evidence = evidenceComparisons(comparisons)
    if (identityDocument ? !evidence.some(row => row.fieldGroup === 'name') : !evidence.length) return 'Not independent'
  }
  return ''
}
