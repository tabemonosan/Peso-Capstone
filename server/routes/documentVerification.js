import { Router } from 'express'

export function createDocumentVerificationRouter({ service, authenticate, automation, Admin }) {
  const router = Router()
  router.use(async (req, res, next) => {
    try {
      const actor = authenticate(req)
      if (actor?.role !== 'Admin') return res.status(403).json({ error: 'Admins only' })
      const admin = await Admin.findOne({ email: actor.email }).select('_id').lean()
      if (!admin) return res.status(403).json({ error: 'Admins only' })
      req.verificationActor = { ...actor, id: String(admin._id) }; next()
    } catch { res.status(403).json({ error: 'Admins only' }) }
  })
  router.get('/queue', async (req, res) => {
    try {
      if (!(await automation.getSettings()).reviewToolsEnabled) return res.status(409).json({ error: 'Document review tools are switched off' })
      res.json(await service.list(req.query))
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Review queue unavailable' }) }
  })
  router.get('/counts', async (_req, res) => {
    try {
      if (!(await automation.getSettings()).reviewToolsEnabled) return res.json({ flagged: 0, automatic: 0 })
      const [flagged, automatic] = await Promise.all([service.list({ limit: 1 }), service.list({ queue: 'auto', limit: 1 })])
      res.json({ flagged: flagged.total, automatic: automatic.total })
    } catch { res.status(503).json({ error: 'Review counts unavailable' }) }
  })
  router.get('/details', async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await service.details(req.query)) }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Document details unavailable' }) }
  })
  router.post('/action', async (req, res) => {
    try {
      const { role, accountId, docKey } = req.body || {}
      res.json(await service.act({ role, accountId, docKey }, req.verificationActor, req.body || {}))
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Review action unavailable; refresh before retrying' }) }
  })
  return router
}
