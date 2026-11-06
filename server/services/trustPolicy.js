import mongoose from 'mongoose'
import { ApplicationError } from './referralWorkflow.js'
import { REPUTATION_DEFAULTS, calculateReputation } from '../../shared/reputation.js'
import { loadReputationSettings } from './reputationSettings.js'

export const LOW_TRUST_THRESHOLD = REPUTATION_DEFAULTS.atRiskBelow
export const INITIAL_TRUST = REPUTATION_DEFAULTS.initialPoints
export const TRUST_DELTAS = { confirmed_no_show: -REPUTATION_DEFAULTS.noShowFirst, late_cancellation: -REPUTATION_DEFAULTS.lateFirst, attended_interview: REPUTATION_DEFAULTS.attendanceCredit, hired: REPUTATION_DEFAULTS.employmentCredit }
const fail = (message, status = 422) => { throw new ApplicationError('INVALID_TRUST_EVENT', message, status) }

// Optimistic concurrency keeps caps, employer cooldowns, and the private cache
// atomic with the existing embedded ledger, including on standalone MongoDB.
export async function appendTrustEvents(Applicant, applicantId, entries) {
  const { rules } = await loadReputationSettings()
  for (let attempt = 0; attempt < 10; attempt++) {
    const account = await Applicant.findById(applicantId).select('+trustEvents +trustRevision').lean()
    if (!account || account.deletedAt) fail('Applicant unavailable.', 403)
    const events = account.trustEvents || []
    if (entries.some(entry => events.some(event => event.key === entry.key))) return false
    const next = []
    for (const entry of entries) {
      const { key, type, by, reason, at = new Date() } = entry
      if (!by || typeof reason !== 'string' || !reason.trim() || reason.length > 1000 || typeof key !== 'string' || !key || ![...Object.keys(TRUST_DELTAS), 'manual_adjustment', 'reversal'].includes(type) || !Number.isFinite(+new Date(at))) fail('Enter a supported event, time, actor, and reason.')
      if (type === 'manual_adjustment' && (!Number.isInteger(entry.delta) || entry.delta > 0 || entry.delta < -100 || entry.points > 0)) fail('Manual credits are not supported. Use confirmed attendance or employment.')
      if (type === 'reversal' && [...events, ...next].some(event => event.type === 'reversal' && event.targetKey === entry.targetKey)) throw new ApplicationError('EVENT_ALREADY_REVERSED', 'This event was already reversed. Refresh the history.', 409)
      const event = { ...entry, at: new Date(at), status: 'applied', actor: entry.actor || { role: 'Admin', label: by }, reason: reason.trim(), policy: rules }
      const result = calculateReputation([...events, ...next, event], rules, at)
      const row = result.events.find(row => row.key === key)
      if (!row) fail('The event could not be calculated.')
      if (type === 'reversal' && !result.events.some(row => row.key === entry.targetKey && row.status === 'reversed')) fail('This event is unavailable or already reversed.', 409)
      event.points = row.nominalPoints
      event.before = row.before; event.after = row.after
      next.push(event)
    }
    const state = calculateReputation([...events, ...next], rules, next.at(-1).at)
    const revision = account.trustRevision || 0
    const match = { _id: new mongoose.Types.ObjectId(applicantId), ...(revision ? { trustRevision: revision } : { $or: [{ trustRevision: 0 }, { trustRevision: { $exists: false } }] }) }
    const updated = await Applicant.collection.updateOne(match, { $push: { trustEvents: { $each: next } }, $set: { trustValue: state.points }, $inc: { trustRevision: 1 } })
    if (updated.modifiedCount) return true
  }
  throw new ApplicationError('REPUTATION_CHANGED', 'Another event is being recorded. Refresh and try again.', 409)
}
export const recordTrustEvent = (Applicant, entry) => appendTrustEvents(Applicant, entry.applicantId, [entry])

export async function readReputation(Applicant, applicantId, now = new Date()) {
  const [account, settings] = await Promise.all([Applicant.findById(applicantId).select('+trustEvents').lean(), loadReputationSettings()])
  if (!account || account.deletedAt) fail('Applicant unavailable.', 403)
  return { account, ...calculateReputation(account.trustEvents || [], settings.rules, now), lowTrustRouting: settings.lowTrustRouting }
}
