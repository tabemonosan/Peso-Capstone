import mongoose from 'mongoose'
import { reputationSettings, validateReputationSettings } from '../../shared/reputation.js'
import { ApplicationError } from './referralWorkflow.js'

export async function loadReputationSettings() {
  const stored = await mongoose.connection.db.collection('referral_settings').findOne({ _id: 'settings' })
  return { rules: reputationSettings(stored?.reputation), lowTrustRouting: stored?.lowTrustRouting === true, history: (stored?.history || []).filter(entry => entry.action === 'reputation_policy_changed') }
}
export async function saveReputationSettings(rules, by, reason) {
  const error = validateReputationSettings(rules)
  if (error || typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new ApplicationError('INVALID_REPUTATION_SETTINGS', error || 'Enter a reason of up to 1,000 characters.', 422)
  const before = await loadReputationSettings()
  const after = reputationSettings({ ...before.rules, ...rules })
  const combinedError = validateReputationSettings(after)
  if (combinedError) throw new ApplicationError('INVALID_REPUTATION_SETTINGS', combinedError, 422)
  const audit = { action: 'reputation_policy_changed', before: before.rules, after, by, reason: reason.trim(), at: new Date() }
  await mongoose.connection.db.collection('referral_settings').updateOne({ _id: 'settings' }, { $set: { reputation: after }, $push: { history: audit } }, { upsert: true })
  await mongoose.connection.db.collection('referral_audit').insertOne(audit)
  return loadReputationSettings()
}
