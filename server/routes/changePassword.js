import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { passwordErrorMessage } from '../utils/passwordPolicy.js'

export function createChangePasswordRouter({ Applicant, Employer, authenticate }) {
  const router = Router()
  router.post('/change-password', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const actor = authenticate(req)
    if (!actor) return res.status(401).json({ error: 'Please sign in again.' })
    const Model = { Applicant, Employer }[actor.role]
    if (!Model) return res.status(403).json({ error: 'This action is for applicants and employers.' })
    const { currentPassword, newPassword } = req.body || {}
    if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 256) return res.status(400).json({ error: 'Enter your current password.' })
    const error = passwordErrorMessage(newPassword)
    if (error) return res.status(400).json({ error })
    const account = await Model.findOne({ email: actor.email }).lean()
    if (!account || account.deletedAt || (actor.sessionVersion || 0) !== (account.sessionVersion || 0) || (actor.role === 'Applicant' && actor.sub && actor.sub !== String(account._id))) return res.status(401).json({ error: 'Please sign in again.' })
    if (!await bcrypt.compare(currentPassword, account.passwordHash)) return res.status(400).json({ error: 'The current password is incorrect.' })
    if (await bcrypt.compare(newPassword, account.passwordHash)) return res.status(400).json({ error: 'Choose a new password different from your current password.' })
    const updated = await Model.findOneAndUpdate({ _id: account._id, passwordHash: account.passwordHash, $or: [{ sessionVersion: account.sessionVersion || 0 }, ...(!account.sessionVersion ? [{ sessionVersion: { $exists: false } }] : [])], ...(actor.role === 'Applicant' ? { deletedAt: { $exists: false } } : {}) }, { $set: { passwordHash: await bcrypt.hash(newPassword, 12) }, $inc: { sessionVersion: 1 } })
    if (!updated) return res.status(409).json({ error: 'Your account changed. Please sign in again.' })
    res.json({ ok: true, message: 'Password changed. Sign in with your new password.' })
  })
  return router
}
