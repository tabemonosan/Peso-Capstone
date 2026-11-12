import { Router } from 'express'
import mongoose from 'mongoose'
import { adminCan } from '../../shared/adminAccess.js'
import { parsePagination, paginateQuery, escapeRegex } from '../utils/paginate.js'

export function createEmailDeliveryRouter({ Model, service }) {
  const router = Router()
  router.use((req, res, next) => req.internalAccount && adminCan(req.internalAccount, 'emailDelivery') ? next() : res.status(403).json({ error: 'Email delivery tracking requires a Super Admin account.' }))
  router.get('/', async (req, res) => {
    const filter = {}
    if (req.query.status) {
      if (!['queued', 'sending', 'sent', 'failed', 'expired'].includes(req.query.status)) return res.status(400).json({ error: 'Choose a valid delivery status.' })
      filter.status = req.query.status
    }
    if (req.query.search) filter.$or = ['recipientEmail', 'subject'].map(field => ({ [field]: new RegExp(escapeRegex(String(req.query.search).slice(0, 150)), 'i') }))
    res.set('Cache-Control', 'no-store')
    res.json(await paginateQuery(Model, filter, { ...parsePagination(req.query, { defaultLimit: 20 }), select: '-payload', sort: { createdAt: -1 } }))
  })
  router.post('/:id/retry', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid delivery record.' })
    const entry = await Model.findById(req.params.id).lean()
    if (!entry) return res.status(404).json({ error: 'Delivery record not found.' })
    if (!entry.retryable || entry.status !== 'failed' || entry.attempts >= 5 || +entry.expiresAt <= Date.now()) return res.status(409).json({ error: entry.purpose === 'verification' ? 'Request a fresh verification code or link from the relevant account page.' : 'This message cannot be retried.' })
    const result = await service.attempt(entry._id, true)
    res.locals.activityTargetId = String(entry._id)
    res.locals.activityAction = 'Retried email delivery'
    res.json(result)
  })
  return router
}
