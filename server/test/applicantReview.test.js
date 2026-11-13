// @vitest-environment node
import { expect, it } from 'vitest'
import { applicantReviewSummary, documentReviewMessage } from '../services/applicantReview.js'

const automation = { decisions: () => ({ find: () => ({ toArray: async () => [] }) }) }
const summarize = document => applicantReviewSummary({ _id: 'owner', verificationStatus: 'under_review', verificationDocuments: {
  nsrpForm: { versions: [{ version: 1, status: 'pending' }] }, birthCertificate: { versions: [{ version: 1, status: 'pending' }] },
  validId1: { uploads: 1, versions: [{ version: 1, ...document }] },
} }, automation)

it('explains a rate-limited decision without implying a document mismatch', async () => {
  const doc = { status: 'pending', reviewReasons: ['Rate guard'], findings: [] }
  expect(documentReviewMessage('validId1', doc)).toContain('daily limit')
  const review = (await summarize(doc)).documents[0]
  expect(review).toMatchObject({ docKey: 'validId1', verificationDelayed: true, needsReview: true, uploadsRemaining: 4 })
  expect(review.reason).toContain('do not need to upload it again')
})
it.each([
  { findings: [{ ruleId: 'cross_id_nsrp_name', severity: 'critical', status: 'open' }] },
  { explanation: { status: 'submitted' } },
  { reviewReasons: ['Rate guard', 'Flagged'] },
  { status: 'needs_resubmission' },
])('keeps actual correction or explanation requirements visible: %j', async extra => {
  const review = (await summarize({ status: 'pending', reviewReasons: ['Rate guard'], ...extra })).documents[0]
  expect(review.verificationDelayed).toBe(false)
})
