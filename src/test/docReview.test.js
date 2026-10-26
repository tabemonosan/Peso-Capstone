import { describe, it, expect } from 'vitest'
import { validateReviewTransition } from '../../server/utils/docReview.js'

describe('validateReviewTransition', () => {
  it('allows approving a pending document when the email is verified', () => {
    expect(validateReviewTransition({ action: 'approved', currentStatus: 'pending', emailVerified: true })).toBeNull()
  })

  it('returns 409 NOT_PENDING when approving an already-approved or rejected document', () => {
    for (const currentStatus of ['approved', 'rejected', 'superseded']) {
      const guard = validateReviewTransition({ action: 'approved', currentStatus, emailVerified: true })
      expect(guard.status).toBe(409)
      expect(guard.code).toBe('NOT_PENDING')
    }
  })

  it('blocks nothing based on email verification (no such restriction)', () => {
    expect(validateReviewTransition({ action: 'approved', currentStatus: 'pending', emailVerified: false })).toBeNull()
  })

  it('requires a reason of at least 5 characters to reject', () => {
    expect(validateReviewTransition({ action: 'rejected', currentStatus: 'pending', emailVerified: true, reason: 'bad' })?.code).toBe('REASON_REQUIRED')
    expect(validateReviewTransition({ action: 'rejected', currentStatus: 'pending', emailVerified: true, reason: 'Blurry or unreadable' })).toBeNull()
  })

  it('revert requires an approved document and a reason', () => {
    expect(validateReviewTransition({ action: 'revert', currentStatus: 'approved', emailVerified: true, reason: 'Approved by mistake' })).toBeNull()
    expect(validateReviewTransition({ action: 'revert', currentStatus: 'pending', emailVerified: true, reason: 'Approved by mistake' })?.code).toBe('NOT_APPROVED')
    expect(validateReviewTransition({ action: 'revert', currentStatus: 'approved', emailVerified: true, reason: '' })?.code).toBe('REASON_REQUIRED')
  })
})
