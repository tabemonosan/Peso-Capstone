// Consistency screening policy; no extracted document values belong here or in findings.
import { isSharedPhoneFinding } from './verificationFindings.js'
export const WAITLIST_RULES_VERSION = '2026-11-13.8'
export const APPLICANT_STATUSES = ['under_review', 'waitlisted', 'approved', 'declined', 'restricted']
export const WAITLIST_DEFAULTS = { waitlistOnMismatch: true, waitlistAttempts: 3, pesoContact: 'Contact your local PESO office.', pesoOfficeHours: 'Contact PESO to confirm office hours.' }
export const WAITLIST_LIMITS = { timeoutMs: 90000, reminderDays: 7, staleDays: 30, maxAttemptsSetting: 5, minOcrConfidence: 60 }
export const WAITLIST_GROUPS = ['name']
export const WAITLIST_DOCUMENTS = ['nsrpForm', 'validId1', 'validId2']
export const WAITLIST_TIP = 'Text reading is approximate. If your photo is blurry or cropped, retake it, or explain the difference.'
export const WAITLIST_MESSAGE = 'Your account needs a review by PESO staff.'
export const WAITLIST_TRANSITIONS = { under_review: ['waitlisted'], waitlisted: ['under_review', 'declined'] }
export const isManuallyApproved = document => document?.status === 'approved'
  && document.autoApproved !== true
  && Boolean(document.reviewedBy || document.approvedBy)
  && !/^(system(?:\s|$))/i.test(document.reviewedBy || document.approvedBy)
export function consistencyIssues(documents = {}) {
  return WAITLIST_DOCUMENTS.flatMap(docKey => {
    const document = documents[docKey]?.versions?.at(-1)
    if (!document || isManuallyApproved(document)) return []
    const duplicates = (document.findings || []).filter(f => !isSharedPhoneFinding(f) && /duplicate|cross_account/.test(f.ruleId || f.code || '') && f.status !== 'dismissed')
    const significant = (document.imageComparisons || []).filter(c => c.evidence === 'independent' && c.reliable === true && c.result === 'significant' && WAITLIST_GROUPS.includes(c.fieldGroup) && /_(?:surname|firstName|name)$/.test(c.ruleId || ''))
    return [...(duplicates.length ? [{ docKey, fieldGroup: 'document', result: 'review', severity: 'warning', evidence: 'independent', reasonCode: 'staff_review' }] : []),
      ...significant.map(c => ({ docKey, fieldGroup: c.fieldGroup, result: 'significant', severity: 'critical', evidence: 'independent', reasonCode: 'cross_check_mismatch' }))]
  }).filter((issue, index, all) => all.findIndex(other => other.docKey === issue.docKey && other.fieldGroup === issue.fieldGroup && other.reasonCode === issue.reasonCode) === index)
}
export function waitlistIssueMessage(issue) {
  if (issue.reasonCode === 'staff_review') return WAITLIST_MESSAGE
  return { name: 'The name we read on this document may not match the name in your NSRP or other document.', 'birth date': 'The date of birth we read on this document may not match the one in your NSRP or other document.', 'ID number': 'The ID number we read on this document may not match the one you entered.' }[issue.fieldGroup] || WAITLIST_MESSAGE
}
