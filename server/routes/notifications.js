import express from 'express'
import mongoose from 'mongoose'
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
      { 'recipient.id': user.id, 'recipient.role': user.role },
      { 'recipient.id': { $exists: false }, recipientEmail: user.email },
    ],
  })
  const unreadFilter = { readAt: null, read: { $ne: true } }

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
