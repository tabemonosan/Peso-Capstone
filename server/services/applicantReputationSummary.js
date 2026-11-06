import { calculateReputation } from '../../shared/reputation.js'
import { loadReputationSettings } from './reputationSettings.js'
// Only the current numeric score is shared with authorized referral viewers.
// Event notes, actors, review evidence and routing flags stay private.
export async function applicantReputationSummaries(Applicant, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return new Map()
  const [{ rules }, applicants] = await Promise.all([
    loadReputationSettings(), Applicant.find({ _id: { $in: unique } }).select('_id +trustEvents').lean(),
  ])
  const now = new Date()
  return new Map(applicants.map(applicant => {
    const state = calculateReputation(applicant.trustEvents || [], rules, now)
    return [String(applicant._id), { points: state.points, maximumPoints: state.settings.maximumPoints }]
  }))
}
