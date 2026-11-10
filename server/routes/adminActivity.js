import { Router } from 'express'
import { escapeRegex, parsePagination, paginateQuery } from '../utils/paginate.js'
import { ADMIN_ACTION_METHODS, PASSIVE_ADMIN_PATH } from '../services/adminActivity.js'

export function createAdminActivityRouter({ ActivityLog, Admin, authenticate }) {
  const router = Router()
  router.get('/', async (req, res) => {
    try {
      const actor = authenticate(req)
      if (actor?.role !== 'Admin' || !await Admin.exists({ email: actor.email })) return res.status(403).json({ error: 'Admins only.' })
      // Hide earlier request-level entries without deleting the audit history.
      const filter = { method: { $in: ADMIN_ACTION_METHODS }, path: { $not: PASSIVE_ADMIN_PATH } }
      if (req.internalAccount?.adminLevel === 'staff') filter.actorId = req.internalAccount._id
      if (req.internalAccount?.adminLevel === 'admin') filter.$and = [{ path: { $not: /\/internal-accounts(?:\/|$)|\/settings\/?$/i } }]
      if (req.query.search) {
        const search = new RegExp(escapeRegex(String(req.query.search).slice(0, 100)), 'i')
        filter.$or = ['actorEmail', 'action', 'path', 'targetId'].map(field => ({ [field]: search }))
      }
      if (req.query.outcome) {
        if (!['success', 'failed', 'interrupted'].includes(req.query.outcome)) return res.status(400).json({ error: 'Choose a valid result.' })
        filter.outcome = req.query.outcome
      }
      if (req.query.method) {
        if (!ADMIN_ACTION_METHODS.includes(req.query.method)) return res.status(400).json({ error: 'Choose a valid action type.' })
        filter.method = req.query.method
      }
      for (const field of ['from', 'to']) if (req.query[field]) {
        const date = String(req.query[field])
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return res.status(400).json({ error: 'Use a valid date in YYYY-MM-DD format.' })
        filter.at ||= {}
        filter.at[field === 'from' ? '$gte' : '$lt'] = new Date(+new Date(`${date}T00:00:00+08:00`) + (field === 'to' ? 86400000 : 0))
      }
      if (filter.at?.$gte && filter.at?.$lt && filter.at.$gte >= filter.at.$lt) return res.status(400).json({ error: 'The end date must be on or after the start date.' })
      res.set('Cache-Control', 'private, no-store')
      res.json(await paginateQuery(ActivityLog, filter, { ...parsePagination(req.query, { defaultLimit: 20 }), sort: { at: -1, _id: -1 } }))
    } catch { res.status(503).json({ error: 'Activity logs are unavailable. Please try again.' }) }
  })
  return router
}
