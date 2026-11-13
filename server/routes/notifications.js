import express from 'express'
import mongoose from 'mongoose'
import { adminNotificationFeature, canReadNotificationFeature } from '../../shared/adminNotificationFeatures.js'
import { redactString } from '../utils/redact.js'

const MAX_LIMIT = 50

// authenticate(req) -> { email, role } | null ; resolveUser(decoded) -> { id, role, email } | null
export function createNotificationsRouter({ NotificationModel, authenticate, resolveUser }) {
  const router = express.Router()

  router.use(async (req, res, next) => {
    try {
      const decoded = authenticate(req)
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' })
      const user = await resolveUser(decoded)
      if (!user) return res.status(401).json({ error: 'Unauthorized' })
      req.notificationUser = user
      next()
    } catch (err) {
      next(err)
    }
  })

  // Only the caller's own notifications; legacy documents are matched by their recipient email.
  const ownerFilter = (user) => ({
    $or: [
      { 'recipient.id': new mongoose.Types.ObjectId(user.id), 'recipient.role': user.role },
      { 'recipient.id': { $exists: false }, recipientEmail: user.email },
    ],
  })
  const unreadFilter = { readAt: null, read: { $ne: true } }

  const linkExpression = { $cond: [{ $ne: [{ $ifNull: ['$link', ''] }, ''] }, '$link', { $ifNull: ['$linkPath', ''] }] }
  const typeExpression = { $cond: [{ $ne: [{ $ifNull: ['$type', ''] }, ''] }, '$type', { $ifNull: ['$kind', ''] }] }
  // Aggregate all unread notifications, independently of bell pagination.
  const groupedUnread = (user, before) => NotificationModel.aggregate([
    { $match: { $and: [ownerFilter(user), unreadFilter, { createdAt: { $lte: before } }] } },
    { $group: { _id: { link: linkExpression, type: typeExpression }, count: { $sum: 1 } } },
  ])
  router.get('/features', async (req, res, next) => {
    const user = req.notificationUser
    if (user.role !== 'Admin') return res.status(403).json({ error: 'Internal accounts only.' })
    try {
      const before = new Date(), counts = {}
      for (const group of await groupedUnread(user, before)) {
        const feature = adminNotificationFeature(group._id)
        if (canReadNotificationFeature(user, feature)) counts[feature] = (counts[feature] || 0) + group.count
      }
      res.set('Cache-Control', 'no-store').json({ counts, asOf: before.toISOString() })
    } catch (error) { next(error) }
  })
  router.patch('/features/:feature/read', async (req, res, next) => {
    const user = req.notificationUser, feature = req.params.feature
    if (!canReadNotificationFeature(user, feature)) return res.status(403).json({ error: 'This feature is unavailable for your account.' })
    const before = new Date(req.body?.before)
    if (!Number.isFinite(+before) || +before > Date.now()) return res.status(400).json({ error: 'Refresh notification counts before opening this feature.' })
    try {
      const groups = (await groupedUnread(user, before)).filter(group => adminNotificationFeature(group._id) === feature)
      // Only acknowledge the snapshot the user saw. A newer arrival stays unread.
      const matchingGroups = groups.map(group => ({ $expr: { $and: [
        { $eq: [linkExpression, group._id.link] },
        { $eq: [typeExpression, group._id.type] },
      ] } }))
      const result = matchingGroups.length ? await NotificationModel.updateMany({ $and: [ownerFilter(user), unreadFilter, { createdAt: { $lte: before } }, { $or: matchingGroups }] }, { $set: { readAt: new Date(), read: true } }) : null
      res.set('Cache-Control', 'no-store').json({ updated: result?.modifiedCount || 0 })
    } catch (error) { next(error) }
  })

  router.get('/', async (req, res) => {
    try {
      const user = req.notificationUser
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
      const owner = ownerFilter(user)

      const [items, total, unreadCount] = await Promise.all([
        NotificationModel.find(owner).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        NotificationModel.countDocuments(owner),
        NotificationModel.countDocuments({ $and: [owner, unreadFilter] }),
      ])
      res.json({ items, unreadCount, page, limit, total })
    } catch (err) {
      console.error('List notifications error:', redactString(err?.message || String(err)))
      res.status(500).json({ error: 'Failed to load notifications' })
    }
  })

  // Declared before '/:id/read' so "read-all" is never parsed as an id
  router.patch('/read-all', async (req, res) => {
    try {
      const owner = ownerFilter(req.notificationUser)
      const result = await NotificationModel.updateMany(
        { $and: [owner, unreadFilter] },
        { $set: { readAt: new Date(), read: true } },
      )
      res.json({ updated: result.modifiedCount ?? 0, unreadCount: 0 })
    } catch (err) {
      console.error('Read-all notifications error:', redactString(err?.message || String(err)))
      res.status(500).json({ error: 'Failed to update notifications' })
    }
  })

  const markRead = async (req, res) => {
    try {
      const { id } = req.params
      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid notification id' })
      const owner = ownerFilter(req.notificationUser)
      const updated = await NotificationModel.findOneAndUpdate(
        { $and: [{ _id: id }, owner] },
        { $set: { readAt: new Date(), read: true } },
        { new: true },
      ).lean()
      // Someone else's notification is indistinguishable from a missing one
      if (!updated) return res.status(404).json({ error: 'Notification not found' })
      res.json(updated)
    } catch (err) {
      console.error('Mark notification read error:', redactString(err?.message || String(err)))
      res.status(500).json({ error: 'Failed to update notification' })
    }
  }
  router.patch('/:id/read', markRead)

  return router
}
