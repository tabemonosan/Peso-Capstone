export const EMPLOYER_VERIFICATION_STATUS = Object.freeze({
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  DECLINED: 'declined',
  NEEDS_RESUBMISSION: 'needs_resubmission',
})

export const EMPLOYER_VERIFICATION_STATUSES = Object.freeze(Object.values(EMPLOYER_VERIFICATION_STATUS))
export const EMPLOYER_REVIEW_DECISIONS = Object.freeze([
  EMPLOYER_VERIFICATION_STATUS.APPROVED,
  EMPLOYER_VERIFICATION_STATUS.DECLINED,
  EMPLOYER_VERIFICATION_STATUS.NEEDS_RESUBMISSION,
])

export function isEmployerVerificationStatus(status) {
  return EMPLOYER_VERIFICATION_STATUSES.includes(status)
}

export function deriveEmployerVerificationStatus({
  decision,
  documentStatus,
  fallbackStatus,
  hasRequest = false,
}) {
  if (decision === EMPLOYER_VERIFICATION_STATUS.APPROVED && documentStatus === 'approved') {
    return EMPLOYER_VERIFICATION_STATUS.APPROVED
  }
  if (decision === EMPLOYER_VERIFICATION_STATUS.DECLINED) {
    return EMPLOYER_VERIFICATION_STATUS.DECLINED
  }
  if (decision === EMPLOYER_VERIFICATION_STATUS.NEEDS_RESUBMISSION) {
    return EMPLOYER_VERIFICATION_STATUS.NEEDS_RESUBMISSION
  }
  if (documentStatus === 'approved') return EMPLOYER_VERIFICATION_STATUS.APPROVED
  if (documentStatus === 'rejected') return EMPLOYER_VERIFICATION_STATUS.DECLINED
  if (isEmployerVerificationStatus(fallbackStatus)) {
    if (fallbackStatus === EMPLOYER_VERIFICATION_STATUS.APPROVED && hasRequest && documentStatus === 'pending') {
      return EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW
    }
    return fallbackStatus
  }
  if (fallbackStatus === 'pending_verification' || fallbackStatus === 'pending') {
    return EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW
  }
  return EMPLOYER_VERIFICATION_STATUS.UNDER_REVIEW
}
