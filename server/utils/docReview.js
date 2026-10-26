// Guards for admin document review transitions. Pure functions so the rules are
// unit-testable and the endpoint stays thin.
//
// Actions: 'approved' | 'rejected' | 'revert'
// Returns null when the transition is allowed, otherwise { status, code, message }.

export const REVIEW_REASON_MIN = 5

export function validateReviewTransition({ action, currentStatus, reason = '' }) {
  if (action === 'revert') {
    if (currentStatus !== 'approved') {
      return { status: 409, code: 'NOT_APPROVED', message: 'Only an approved document can be reverted to pending.' }
    }
    if (String(reason).trim().length < REVIEW_REASON_MIN) {
      return { status: 400, code: 'REASON_REQUIRED', message: 'A reason of at least 5 characters is required to revert a document.' }
    }
    return null
  }

  // approve / reject: only a pending document can be decided. A resubmitted
  // rejected document becomes a new pending version, so it is reviewable again.
  if (currentStatus !== 'pending') {
    return { status: 409, code: 'NOT_PENDING', message: 'This document is not pending review. It may have already been decided — refresh the list.' }
  }
  if (action === 'rejected' && String(reason).trim().length < REVIEW_REASON_MIN) {
    return { status: 400, code: 'REASON_REQUIRED', message: 'A reason of at least 5 characters is required to reject a document.' }
  }
  return null
}
