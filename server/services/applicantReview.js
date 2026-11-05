import { REQUIRED_DOC_KEYS, VERIFICATION_DOC_LABELS } from '../../shared/verificationDocs.js'

// Owner-facing explanations are templates, never raw findings, sampling details,
// extracted values, provider errors, private notes or comparison rule identifiers.
export function documentReviewMessage(docKey, document, reason = '') {
  if (!document) return 'This required document has not been submitted yet.'
  if (document.status === 'approved') return 'This document is verified. No admin review is needed.'
  if (['rejected', 'needs_resubmission'].includes(document.status)) return 'PESO needs a corrected copy of this document. Open My Documents to review the feedback and make changes.'
  if (docKey === 'nsrpForm') return 'Your NSRP is the registration reference used to check your birth certificate and IDs. It does not need separate approval.'
  const reasons = [...(document.reviewReasons || []), reason]
  if (reasons.some(r => ['Could not be read', 'Not independent', 'Retake requested', 'Quality warning', 'Technical attempts: admin review'].includes(r))) return 'The system could not read enough clear information to verify this document automatically. You can submit a clearer copy for review.'
  if (reasons.includes('Explanation') || document.explanation?.status === 'submitted') return 'Your explanation is waiting for PESO staff review. You can still correct this document if needed.'
  if (reasons.includes('Resubmission')) return 'Your updated document is waiting for PESO staff review.'
  if (reasons.includes('Auto-approval off')) return 'Automatic verification is unavailable for this document. PESO staff will review it; you only need to update it if something is incorrect.'
  if (docKey.startsWith('validId') && document.findings?.some(f => f.status !== 'dismissed' && f.severity === 'critical' && /^cross_id_.*_idNumber$/.test(f.ruleId || f.code || ''))) return 'The ID number read from your document does not match the number entered or recorded in your NSRP. Check the ID type and number, then upload both sides again, or explain the difference.'
  if (reasons.some(r => ['Flagged', 'Needs attention'].includes(r))) return 'PESO staff need to compare this document with your registration details. You can correct your information or explain a difference.'
  return 'This document has not been verified automatically and is waiting for PESO staff review. You can update it if something needs correction.'
}

export async function applicantReviewSummary(account, automation, consistency) {
  let decisions = []
  try {
    decisions = await automation.decisions().find({ role: 'Applicant', accountId: account._id }, { projection: { docKey: 1, version: 1, reason: 1 } }).toArray()
  } catch { /* Use safe document metadata when decision details are unavailable. */ }
  const status = consistency?.status || account.verificationStatus
  const documents = REQUIRED_DOC_KEYS.filter(docKey => docKey !== 'nsrpForm' || !account.verificationDocuments?.nsrpForm?.versions?.length).map(docKey => {
    const slot = account.verificationDocuments?.[docKey], latest = slot?.versions?.at(-1)
    const decision = decisions.find(d => (d.docKey || 'nsrpForm') === docKey && d.version === latest?.version)
    const correction = consistency?.issues?.filter(i => i.document === docKey || docKey === 'nsrpForm' && i.chancesLeft !== null) || []
    const remaining = Math.max(0, 5 - (slot?.uploads || 0))
    const canUpdate = remaining > 0 && (status === 'under_review' && latest?.status !== 'approved' || status === 'waitlisted' && (correction.length > 0 ? correction.every(i => i.chancesLeft !== null && i.chancesLeft > 0) : latest?.status !== 'approved'))
    const needsReview = Boolean(latest && docKey !== 'nsrpForm' && (['rejected', 'needs_resubmission'].includes(latest.status) || latest.status === 'pending' && ((latest.reviewReasons || []).length || decision?.reason || latest.findings?.some(f => f.status !== 'dismissed' && f.approvalBlocking !== false && ['warning', 'critical'].includes(f.severity)) || ['requested', 'submitted'].includes(latest.explanation?.status))))
    return { docKey, label: VERIFICATION_DOC_LABELS[docKey], status: latest?.status || 'missing', needsReview, reason: latest?.status === 'pending' && !needsReview ? 'Automatic verification is in progress.' : documentReviewMessage(docKey, latest, decision?.reason), canUpdate, uploadsRemaining: remaining }
  }).filter(doc => doc.status !== 'approved')
  return { status, checking: Boolean(consistency?.checking), message: status === 'approved' ? 'Your account is verified.' : status === 'waitlisted' ? 'Your account needs a review by PESO staff. Open My Documents to correct or explain a difference.' : consistency?.checking ? 'Your documents are being checked. You can open My Documents to review your details.' : documents.length ? 'Your account is under review because the required documents below still need verification.' : 'Your documents have been reviewed. PESO staff need to complete the account review.', documents }
}
