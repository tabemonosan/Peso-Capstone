import express from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { normalizeEmail } from '../utils/emailVerification.js'
import { parsePagination, paginateQuery, escapeRegex } from '../utils/paginate.js'

export function createAccountDeletionRouter({ Applicant, AccountDeletionRequest, JobPosting, JobApplication, Notification, authenticate, notify, notifyAdmins, mail }) {
  const router = express.Router()
  router.use((req, res, next) => {
    const user = authenticate(req)
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' })
    req.accountUser = user
    next()
  })
  const applicantOnly = (req, res, next) => req.accountUser.role === 'Applicant' ? next() : res.status(403).json({ error: 'Applicants only.' })
  const adminOnly = (req, res, next) => req.accountUser.role === 'Admin' ? next() : res.status(403).json({ error: 'Administrators only.' })

  router.get('/current', applicantOnly, async (req, res, next) => {
    try {
      const account = await Applicant.findOne({ email: req.accountUser.email, deletedAt: { $exists: false } }).select('_id').lean()
      if (!account) return res.status(401).json({ error: 'Account unavailable.' })
      res.json(await AccountDeletionRequest.findOne({ applicantId: account._id }).sort({ createdAt: -1 }).lean())
    } catch (err) { next(err) }
  })

  router.post('/requests', applicantOnly, async (req, res, next) => {
    try {
      const { password, reason = '' } = req.body || {}
      if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'Enter your current password.' })
      if (typeof reason !== 'string' || reason.length > 1000) return res.status(400).json({ error: 'Reason must be at most 1,000 characters.' })
      const account = await Applicant.findOne({ email: req.accountUser.email, deletedAt: { $exists: false } })
      if (!account) return res.status(401).json({ error: 'Account unavailable.' })
      if (!await bcrypt.compare(password, account.passwordHash)) return res.status(403).json({ error: 'Current password is incorrect.' })
      const record = await AccountDeletionRequest.create({ applicantId: account._id, activeApplicant: account._id, applicantName: account.profile?.name || account.email, email: account.email, reason: reason.trim() })
      await notifyAdmins({ type: 'account_deletion_requested', title: 'Account deletion requested', message: `${record.applicantName} requested account deletion.`, link: '/account-deletions', metadata: { requestId: String(record._id), applicantId: String(account._id) } })
      res.status(201).json(record)
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'An account deletion request is already awaiting review.' })
      next(err)
    }
  })

  router.delete('/requests/:id', applicantOnly, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid request ID.' })
      const account = await Applicant.findOne({ email: req.accountUser.email, deletedAt: { $exists: false } }).select('_id').lean()
      if (!account) return res.status(401).json({ error: 'Account unavailable.' })
      const record = await AccountDeletionRequest.findOneAndUpdate({ _id: req.params.id, applicantId: account._id, status: 'pending' }, { $set: { status: 'cancelled' }, $unset: { activeApplicant: 1 } }, { returnDocument: 'after' })
      if (!record) return res.status(409).json({ error: 'This request is no longer pending or does not belong to you.' })
      res.json(record)
    } catch (err) { next(err) }
  })

  router.get('/requests', adminOnly, async (req, res, next) => {
    try {
      const status = req.query.status || 'pending'
      if (!['all', 'pending', 'processing', 'approved', 'declined', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid request status.' })
      const filter = status === 'all' ? {} : status === 'pending' ? { status: { $in: ['pending', 'processing'] } } : { status }
      res.json(await paginateQuery(AccountDeletionRequest, filter, { ...parsePagination(req.query), sort: { createdAt: -1 } }))
    } catch (err) { next(err) }
  })

  router.put('/requests/:id', adminOnly, async (req, res, next) => {
    let leaseToken
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid request ID.' })
      const { status, reason = '' } = req.body || {}
      if (!['approved', 'declined'].includes(status)) return res.status(400).json({ error: 'Choose approve or decline.' })
      if (typeof reason !== 'string' || reason.length > 1000 || (status === 'declined' && reason.trim().length < 5)) return res.status(400).json({ error: 'Declining requires a reason of 5 to 1,000 characters.' })
      const review = { reviewReason: reason.trim(), reviewedBy: req.accountUser.email, reviewedAt: new Date() }
      if (status === 'declined') {
        const record = await AccountDeletionRequest.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { $set: { ...review, status }, $unset: { activeApplicant: 1 } }, { returnDocument: 'after' })
        if (!record) return res.status(409).json({ error: 'This request is no longer pending.' })
        await notify({ recipient: { id: record.applicantId, role: 'Applicant' }, type: 'account_deletion_declined', title: 'Account deletion request declined', message: `PESO declined your request: ${record.reviewReason}`, link: '/profile?accountSettings=1', email: true })
        return res.json(record)
      }

      // Keep a processing state so interrupted approvals can be retried. Release
      // the email only after every email-based historical reference is detached.
      leaseToken = crypto.randomUUID()
      const record = await AccountDeletionRequest.findOneAndUpdate({ _id: req.params.id, status: { $in: ['pending', 'processing'] }, $or: [{ processingToken: { $exists: false } }, { processingStartedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) } }] }, { $set: { ...review, status: 'processing', processingToken: leaseToken, processingStartedAt: new Date() } }, { returnDocument: 'after' })
      if (!record) return res.status(409).json({ error: 'Approval is already running or this request is no longer awaiting approval.' })
      const account = await Applicant.findById(record.applicantId)
      if (!account) throw new Error('Applicant record unavailable')
      await Applicant.updateOne({ _id: account._id, deletedAt: { $exists: false } }, { $set: { deletedAt: new Date(), retainedEmail: record.email }, $inc: { sessionVersion: 1 } })
      const archivedEmail = `deleted-${account._id}@retained.invalid`
      // Once released, never scan by the original email again: it may now
      // belong to a new account with its own applications and notifications.
      if (account.email !== archivedEmail) {
        const oldEmail = new RegExp(`^${escapeRegex(record.email)}$`, 'i')
        await JobPosting.updateMany({ 'applicants.email': oldEmail }, { $set: { 'applicants.$[entry].email': archivedEmail } }, { arrayFilters: [{ 'entry.email': oldEmail }] })
        await JobApplication.updateMany({ applicantEmail: oldEmail }, { $set: { applicantEmail: archivedEmail } })
        await Notification.updateMany({ $or: [{ 'recipient.id': account._id, 'recipient.role': 'Applicant' }, { 'recipient.id': { $exists: false }, recipientEmail: oldEmail }] }, { $set: { recipientEmail: archivedEmail, 'recipient.id': account._id, 'recipient.role': 'Applicant' } })
        await Applicant.updateOne({ _id: account._id }, { $set: { email: archivedEmail, emailNormalized: normalizeEmail(archivedEmail) }, $unset: { emailVerifyTokenHash: 1, emailVerifyExpires: 1 } })
      }
      const completed = await AccountDeletionRequest.findOneAndUpdate({ _id: record._id, status: 'processing', processingToken: leaseToken }, { $set: { status: 'approved' }, $unset: { activeApplicant: 1, processingToken: 1, processingStartedAt: 1 } }, { returnDocument: 'after' })
      if (completed) {
        try { await mail(record.email, 'Account deletion approved', 'PESO approved your account deletion request. Sign-in and existing sessions are disabled. PESO registration and employment records are retained separately. You may register a fresh account using the same email; you must complete registration and verification again.') } catch { /* Account closure must not depend on mail availability. */ }
      }
      res.json(completed || await AccountDeletionRequest.findById(record._id))
    } catch (err) {
      if (leaseToken) await AccountDeletionRequest.updateOne({ _id: req.params.id, processingToken: leaseToken }, { $unset: { processingToken: 1 } }).catch(() => {})
      next(err)
    }
  })
  router.use((_err, _req, res, _next) => res.status(500).json({ error: 'Unable to process the request. If approval was interrupted, an admin can retry it from the pending requests list.' }))
  return router
}
