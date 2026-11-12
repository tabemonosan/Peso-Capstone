import { Router } from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { ADMIN_LEVELS, adminCan, adminLevel } from '../../shared/adminAccess.js'
import { passwordErrorMessage } from '../utils/passwordPolicy.js'
import { normalizeEmail } from '../utils/emailVerification.js'
import { escapeRegex, parsePagination, paginateQuery } from '../utils/paginate.js'

const noteSchema = new mongoose.Schema({
  entityType: { type: String, enum: ['Applicant', 'Employer', 'EmployerRequest', 'JobPosting', 'AccountDeletionRequest'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  entityLabel: String,
  authorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  authorEmail: String,
  authorLevel: String,
  recommendation: { type: String, enum: ['note', 'approve', 'decline', 'correction', 'follow_up'], default: 'note' },
  note: { type: String, required: true, maxlength: 1000 },
}, { timestamps: true })
noteSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
export const AdminReviewNote = mongoose.models.AdminReviewNote || mongoose.model('AdminReviewNote', noteSchema)
const safeAccount = account => ({ id: String(account._id), email: account.email, name: account.profile?.name || '', adminLevel: adminLevel(account), disabled: Boolean(account.disabled), createdAt: account.createdAt })

export function createInternalAccountsRouter({ Admin, Applicant, Employer, AccountDeletionRequest, signSession }) {
  const router = Router()
  const requirePermission = permission => (req, res, next) => req.internalAccount && adminCan(req.internalAccount, permission)
    ? next() : res.status(403).json({ error: 'Your account does not have permission for this action.' })
  router.post('/change-password', requirePermission('notes'), async (req, res) => {
    const { currentPassword, newPassword } = req.body || {}
    if (typeof currentPassword !== 'string' || currentPassword.length > 256 || typeof newPassword !== 'string') return res.status(400).json({ error: 'Provide your initial password and a new password.' })
    const error = passwordErrorMessage(newPassword)
    if (error) return res.status(400).json({ error })
    const account = await Admin.findById(req.internalAccount._id).lean()
    if (!account || !await bcrypt.compare(currentPassword, account.passwordHash)) return res.status(400).json({ error: 'The current password is incorrect.' })
    if (await bcrypt.compare(newPassword, account.passwordHash)) return res.status(400).json({ error: 'Choose a password different from your initial password.' })
    const updated = await Admin.findOneAndUpdate({ _id: account._id, passwordHash: account.passwordHash, disabled: { $ne: true } }, { $set: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false }, $inc: { sessionVersion: 1 } }, { returnDocument: 'after' }).lean()
    if (!updated) return res.status(409).json({ error: 'The account changed. Please sign in again.' })
    res.locals.activityAction = 'Changed own internal account password'
    res.set('Cache-Control', 'no-store')
    res.json({ token: signSession(updated), mustChangePassword: false })
  })
  router.get('/internal-accounts', requirePermission('accounts'), async (req, res) => {
    const result = await paginateQuery(Admin, {}, { ...parsePagination(req.query, { defaultLimit: 20 }), select: '-passwordHash', sort: { createdAt: -1 } })
    res.json({ ...result, items: result.items.map(safeAccount) })
  })
  router.post('/internal-accounts', requirePermission('accounts'), async (req, res) => {
    const { name, email: rawEmail, adminLevel: level = 'staff', reason = 'New internal account' } = req.body || {}
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : rawEmail
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !ADMIN_LEVELS.includes(level)) return res.status(400).json({ error: 'Provide a name, valid email, and account level.' })
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) return res.status(400).json({ error: 'A reason is required.' })
    const normalized = normalizeEmail(email)
    const emailPattern = new RegExp(`^${escapeRegex(email)}$`, 'i')
    const exists = await Promise.all([Admin.exists({ email: emailPattern }), Applicant.exists({ $or: [{ emailNormalized: normalized }, { email: emailPattern }] }), Employer.exists({ $or: [{ emailNormalized: normalized }, { email: emailPattern }] })])
    if (exists.some(Boolean)) return res.status(409).json({ error: 'That email is already registered.' })
    try {
      const initialPassword = `P3!a${crypto.randomBytes(15).toString('base64url')}`
      const account = await Admin.create({ email: email.trim().toLowerCase(), passwordHash: await bcrypt.hash(initialPassword, 12), mustChangePassword: true, adminLevel: level, profile: { name: name.trim() } })
      res.locals.activityAction = `Created ${level} internal account: ${reason.trim()}`
      res.locals.activityTargetId = String(account._id)
      res.set('Cache-Control', 'no-store')
      res.status(201).json({ ...safeAccount(account), initialPassword, mustChangePassword: true })
    } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'That email is already registered.' }); throw error }
  })
  router.post('/internal-accounts/:id/reset-password', requirePermission('accounts'), async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid account.' })
    const targetId = new mongoose.Types.ObjectId(req.params.id)
    if (String(targetId) === String(req.internalAccount._id)) return res.status(403).json({ error: 'Use Forgot password to recover your own account.' })
    const { reason } = req.body || {}
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) return res.status(400).json({ error: 'A reason is required.' })
    const target = await Admin.findById(targetId).lean()
    if (!target) return res.status(404).json({ error: 'Account not found.' })
    if (adminLevel(target) === 'super_admin') return res.status(403).json({ error: 'Only Admin and Staff accounts can be reset here.' })
    if (target.disabled) return res.status(409).json({ error: 'Enable the account before resetting its password.' })
    const initialPassword = `P3!a${crypto.randomBytes(15).toString('base64url')}`
    const updated = await Admin.findOneAndUpdate({ _id: targetId, adminLevel: { $ne: 'super_admin' }, disabled: { $ne: true } }, { $set: { passwordHash: await bcrypt.hash(initialPassword, 12), mustChangePassword: true }, $inc: { sessionVersion: 1 } }, { returnDocument: 'after' }).lean()
    if (!updated) return res.status(409).json({ error: 'The account changed. Refresh the list and try again.' })
    res.locals.activityTargetId = String(updated._id)
    res.locals.activityAction = `Reset internal account password: ${reason.trim()}`
    res.set('Cache-Control', 'no-store')
    res.json({ ...safeAccount(updated), initialPassword, mustChangePassword: true })
  })
  router.patch('/internal-accounts/:id', requirePermission('accounts'), async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid account.' })
    const { adminLevel: level, disabled, reason } = req.body || {}
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000 || (level !== undefined && !ADMIN_LEVELS.includes(level)) || (disabled !== undefined && typeof disabled !== 'boolean')) return res.status(400).json({ error: 'Provide valid changes and a reason.' })
    const targetId = new mongoose.Types.ObjectId(req.params.id)
    if (String(req.internalAccount._id) === String(targetId)) return res.status(409).json({ error: 'You cannot change your own access or disable your own account.' })
    const target = await Admin.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Account not found.' })
    // Protect all Super Admin accounts from demotion/deactivation to preserve access.
    if (adminLevel(target) === 'super_admin') return res.status(409).json({ error: 'Super Admin accounts cannot be demoted or disabled here.' })
    const changes = { ...(level !== undefined ? { adminLevel: level } : {}), ...(disabled !== undefined ? { disabled } : {}) }
    if (!Object.keys(changes).length) return res.status(400).json({ error: 'Choose an access level or account status to change.' })
    const updated = await Admin.findOneAndUpdate({ _id: targetId, adminLevel: { $ne: 'super_admin' } }, { $set: changes, ...(disabled === true ? { $inc: { sessionVersion: 1 } } : {}) }, { returnDocument: 'after', runValidators: true }).lean()
    if (!updated) return res.status(409).json({ error: 'The account access changed. Refresh the list and try again.' })
    res.locals.activityAction = `Updated internal account access: ${reason.trim()}`
    res.json(safeAccount(updated))
  })
  router.get('/review-notes', requirePermission('notes'), async (req, res) => {
    const filter = { authorLevel: 'staff' }
    if (req.internalAccount.adminLevel === 'staff') filter.authorId = req.internalAccount._id
    if (req.query.entityType) {
      if (!noteSchema.path('entityType').enumValues.includes(req.query.entityType)) return res.status(400).json({ error: 'Invalid record type.' })
      if (req.query.entityType === 'AccountDeletionRequest' && !adminCan(req.internalAccount, 'decide')) return res.status(403).json({ error: 'Deletion requests are unavailable for this account.' })
      filter.entityType = req.query.entityType
    } else if (!adminCan(req.internalAccount, 'decide')) filter.entityType = { $ne: 'AccountDeletionRequest' }
    if (req.query.entityId) {
      if (!mongoose.isValidObjectId(req.query.entityId)) return res.status(400).json({ error: 'Invalid record ID.' })
      filter.entityId = req.query.entityId
    }
    res.json(await paginateQuery(AdminReviewNote, filter, { ...parsePagination(req.query, { defaultLimit: 20 }), sort: { createdAt: -1 } }))
  })
  router.post('/review-notes', requirePermission('writeNotes'), async (req, res) => {
    const { entityType, entityId, recommendation = 'note', note } = req.body || {}
    if (!noteSchema.path('entityType').enumValues.includes(entityType) || !mongoose.isValidObjectId(entityId) || !noteSchema.path('recommendation').enumValues.includes(recommendation) || typeof note !== 'string' || !note.trim() || note.length > 1000) return res.status(400).json({ error: 'Choose a record, recommendation, and note (up to 1,000 characters).' })
    if (entityType === 'AccountDeletionRequest' && !adminCan(req.internalAccount, 'decide')) return res.status(403).json({ error: 'Deletion requests are unavailable for this account.' })
    const Model = { Applicant, Employer, AccountDeletionRequest }[entityType] || mongoose.model(entityType)
    const target = await Model.findById(entityId).select('email companyName title').lean()
    if (!target) return res.status(404).json({ error: 'Record not found.' })
    const record = await AdminReviewNote.create({ entityType, entityId, entityLabel: target.email || target.companyName || target.title || entityId, recommendation, note: note.trim(), authorId: req.internalAccount._id, authorEmail: req.internalAccount.email, authorLevel: req.internalAccount.adminLevel })
    res.locals.activityTargetId = entityId
    res.locals.activityAction = `Recorded ${recommendation.replaceAll('_', ' ')} for ${entityType}`
    res.status(201).json(record)
  })
  return router
}
