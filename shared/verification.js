// Shared vocabulary. Findings contain rule identifiers, never extracted values.
import { VERIFICATION_DOC_KEYS, VERIFICATION_DOC_LABELS } from './verificationDocs.js'
import { WAITLIST_DEFAULTS } from './consistencyWaitlist.js'
import { isSharedPhoneFinding } from './verificationFindings.js'
export const VERIFICATION_RULES_VERSION = '2026-11-04.2'
export const DOCUMENT_KEYS = [...VERIFICATION_DOC_KEYS, 'employerNsrpForm']
export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected', 'needs_resubmission', 'superseded']
export const FINDING_SEVERITIES = ['info', 'warning', 'critical']
export const FINDING_LEVELS = ['clear', 'review', 'attention']
export const REVIEWER_LABELS = { system: 'System (verification engine)', admin: 'PESO administrator' }
export const VERIFICATION_DEFAULTS = Object.freeze({
  ...WAITLIST_DEFAULTS,
  automaticApproval: true, applicant: true, employer: true,
  birthCertificate: true, validId: true, minimumEvidence: 'independent',
  auditPercent: 20, rateLimit: 5, ocrTextReading: true, reviewToolsEnabled: true, dataChecks: true, imageChecks: true, crossChecks: true, verificationEngineEnabled: true, philsysQrVerification: true,
})
export const DOCUMENT_LABELS = {
  ...VERIFICATION_DOC_LABELS, nsrpForm: 'Generated NSRP Form 1', employerNsrpForm: 'Employer NSRP Form 2',
}
export const REVIEW_ACTIONS = ['approve', 'resubmit', 'decline', 'resolve', 'explain', 'checked', 'revoke', 'hold', 'release-hold']
export const openFlags = (findings = []) => findings.filter(f => !isSharedPhoneFinding(f) && f.status !== 'dismissed' && ['warning', 'critical'].includes(f.severity))
