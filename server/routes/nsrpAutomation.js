import { Router } from 'express'
import mongoose from 'mongoose'

export function createNsrpAutomationRouter({ automation, authenticate, review, Admin }) {
  const router = Router()
  router.use((req, res, next) => {
    try {
      const user = authenticate(req)
      if (user?.role !== 'Admin') return res.status(403).json({ error: 'Admins only' })
      req.nsrpAdmin = user
      next()
    } catch { res.status(403).json({ error: 'Admins only' }) }
  })
  router.get('/settings', async (_req, res) => {
    try { res.json(await automation.getSettings()) } catch { res.status(503).json({ error: 'Settings unavailable' }) }
  })
  router.put('/settings', async (req, res) => {
    try { res.json(await automation.updateSettings(req.body || {}, req.nsrpAdmin.email)) }
    catch (err) { res.status(400).json({ error: err.message }) }
  })
  router.get('/decisions', async (req, res) => {
    const filter = {}
    if (['Applicant', 'Employer'].includes(req.query.role)) filter.role = req.query.role
    if (req.query.accountId) {
      if (!/^[a-f\d]{24}$/i.test(req.query.accountId)) return res.status(400).json({ error: 'Invalid account ID' })
      // IDs in this collection are ObjectIds; the request reference is separate.
      const { ObjectId } = mongoose.Types
      filter.$or = [{ accountId: new ObjectId(req.query.accountId) }, { recordId: new ObjectId(req.query.accountId) }]
    }
    if (req.query.result === 'Auto-approved') filter.result = 'Auto-approved'
    if (req.query.result === 'Audit sample') { filter.result = 'Manual'; filter.reason = 'Audit sample' }
    if (req.query.result === 'Manual') { filter.result = 'Manual'; filter.reason = { $ne: 'Audit sample' } }
    for (const key of ['from', 'to']) if (req.query[key] && !/^\d{4}-\d{2}-\d{2}$/.test(req.query[key])) return res.status(400).json({ error: 'Use dates in YYYY-MM-DD format' })
    if (req.query.from || req.query.to) {
      filter.at = {}
      if (req.query.from) filter.at.$gte = new Date(`${req.query.from}T00:00:00+08:00`)
      if (req.query.to) filter.at.$lt = new Date(+new Date(`${req.query.to}T00:00:00+08:00`) + 86400000)
    }
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1))
    try {
      const [items, total] = await Promise.all([automation.decisions().find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * 50).limit(50).toArray(), automation.decisions().countDocuments(filter)])
      res.json({ items, total, page })
    } catch { res.status(503).json({ error: 'Decision log unavailable' }) }
  })
  router.post('/revoke', async (req, res) => {
    try {
      if (review && (await automation.getSettings()).reviewToolsEnabled) {
        const decision = await automation.decisions().findOne({ _id: req.body?.id, result: 'Auto-approved' })
        if (!decision) return res.status(409).json({ error: 'Approval already changed; refresh the record.' })
        const admin = await Admin.findOne({ email: req.nsrpAdmin.email }).select('_id').lean()
        if (!admin) return res.status(403).json({ error: 'Admins only' })
        return res.json(await review({ role: decision.role, accountId: String(decision.accountId), docKey: decision.role === 'Applicant' ? 'nsrpForm' : 'employerNsrpForm' }, { ...req.nsrpAdmin, id: String(admin._id) }, { action: 'revoke', version: decision.version, reason: req.body?.reason }))
      }
      const revoked = await automation.revoke(req.body?.id, req.nsrpAdmin.email, req.body?.reason)
      res.status(revoked ? 200 : 409).json(revoked ? { ok: true } : { error: 'Approval already changed; refresh the record.' })
    } catch (err) { res.status(err.status || 400).json({ error: err.status ? err.message : 'Revoke unavailable; refresh the record' }) }
  })
  router.post('/dismiss-finding', async (req, res) => {
    const { id, code, reason } = req.body || {}
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) return res.status(400).json({ error: 'A reason is required (maximum 500 characters)' })
    const record = await automation.decisions().findOne({ _id: id })
    const finding = record?.report?.findings?.find((entry) => entry.code === code)
    if (!finding) return res.status(404).json({ error: 'Finding not found' })
    if (review && (await automation.getSettings()).reviewToolsEnabled) {
      try {
        const admin = await Admin.findOne({ email: req.nsrpAdmin.email }).select('_id').lean()
        if (!admin) return res.status(403).json({ error: 'Admins only' })
        return res.json(await review({ role: record.role, accountId: String(record.accountId), docKey: record.role === 'Applicant' ? 'nsrpForm' : 'employerNsrpForm' }, { ...req.nsrpAdmin, id: String(admin._id) }, { action: 'resolve', version: record.version, reason, ruleId: code }))
      } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Finding resolution unavailable' }) }
    }
    await automation.decisions().updateOne({ _id: id }, { $set: { ...(finding.severity === 'critical' ? { dismissedCritical: true } : {}) }, $push: { dismissals: { code, reason: reason.trim(), by: req.nsrpAdmin.email, at: new Date() } } })
    res.json({ ok: true })
  })
  return router
}
