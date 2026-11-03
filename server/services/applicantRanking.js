import { rankJobApplicants } from '../../shared/applicantSuitability.js'
import { employerApplicantSummary, publicApplicationHistory } from '../../shared/employmentReporting.js'

// Rank the complete candidate pool for each authorized job BEFORE pagination.
// Employers receive only the existing public summary and whitelisted evidence.
export function rankEmployerReferrals(referrals, options = {}) {
  const groups = new Map()
  for (const referral of referrals) {
    const key = String(referral.jobId?._id || referral.jobId || '')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(referral)
  }
  return [...groups.values()].flatMap((entries) => {
    const active = entries.filter((entry) => !['withdrawn', 'withdrawn_by_admin'].includes(entry.status))
    const withdrawn = entries.filter((entry) => ['withdrawn', 'withdrawn_by_admin'].includes(entry.status)).map((entry) => ({ ...entry, applicantId: null, suitability: undefined }))
    return [...rankJobApplicants(entries[0].jobId || {}, active, (entry) => entry.applicantId, options), ...withdrawn]
      .map((entry) => ({ ...entry, applicantId: employerApplicantSummary(entry.applicantId), history: publicApplicationHistory(entry.history) }))
  })
}
