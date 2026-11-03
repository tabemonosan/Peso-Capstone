import { Router } from 'express'
import mongoose from 'mongoose'
import { applicationProgressLookups, publicApplication } from '../services/applicationProgress.js'
import { rateLimit } from 'express-rate-limit'
import { validateApplicationEmail } from '../services/applicationEmail.js'

export function createApplicationHistoryRouter({ Applicant, JobApplication, Referral, authenticate, notify, loadEmployerVerification, applicationWorkflow, Interview, HireReport }) {
  const router = Router()
  router.use((req, res, next) => {
    try {
      req.applicationActor = authenticate(req)
      if (!['Applicant', 'Employer', 'Admin'].includes(req.applicationActor?.role)) return res.status(403).json({ error: 'Please sign in again.' })
      next()
    } catch { res.status(403).json({ error: 'Please sign in again.' }) }
  })
  router.post('/validate-email', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { valid: false, error: 'Please wait a minute before checking another email.' } }), async (req, res) => {
    if (req.applicationActor.role !== 'Applicant') return res.status(403).json({ error: 'Applicants only' })
    const result = await validateApplicationEmail(req.body?.email)
    res.status(result.valid ? 200 : result.status).json(result)
  })
  router.get('/:id/resume', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(403).json({ error: 'Choose a valid application.' })
    try {
      const actor = req.applicationActor
      const application = await JobApplication.findById(req.params.id).select('applicantEmail employerId referralId deliveryStatus resumeFile.originalName resumeFile.mimetype').lean()
      if (!application) return res.status(403).json({ error: 'Resume unavailable.' })
      if (actor.role === 'Applicant' && actor.email !== application.applicantEmail) return res.status(403).json({ error: 'This resume is private.' })
      if (actor.role === 'Employer') {
        const { employer, status } = await loadEmployerVerification(actor.email)
        const shared = employer && status === 'approved' && application.deliveryStatus === 'delivered' && await Referral.exists({ _id: application.referralId, employerId: employer._id, status: { $nin: ['withdrawn', 'withdrawn_by_admin'] }, deliveryState: { $ne: 'processing' } })
        if (!shared) return res.status(403).json({ error: 'This application is no longer shared with you.' })
      }
      const stored = await JobApplication.findById(application._id).select('+resumeFile.data').lean()
      if (!stored?.resumeFile?.data) return res.status(409).json({ error: 'No resume is attached to this application.' })
      res.set('Cache-Control', 'private, no-store')
      res.set('X-Content-Type-Options', 'nosniff')
      res.set('Content-Type', application.resumeFile.mimetype)
      res.set('Content-Disposition', `attachment; filename="resume${application.resumeFile.mimetype === 'application/pdf' ? '.pdf' : '.docx'}"; filename*=UTF-8''${encodeURIComponent(application.resumeFile.originalName)}`)
      res.send(Buffer.from(stored.resumeFile.data))
    } catch { res.status(409).json({ error: 'The resume is temporarily unavailable.' }) }
  })
  router.get('/mine', async (req, res) => {
    if (req.applicationActor.role !== 'Applicant') return res.status(403).json({ error: 'Applicants only' })
    try {
      const account = await Applicant.findOne({ email: req.applicationActor.email }).select('applyingSuspendedAt').lean()
      const records = await JobApplication.aggregate([{ $match: { applicantEmail: req.applicationActor.email, deliveryStatus: { $ne: 'processing' }, invitationDeclinedAt: { $exists: false } } }, ...applicationProgressLookups, { $sort: { lastUpdate: -1, _id: -1 } }])
      res.json(records.map((entry) => publicApplication(entry, Boolean(account?.applyingSuspendedAt))))
    } catch { res.status(409).json({ error: 'Application history is temporarily unavailable.' }) }
  })
  router.post('/:id/withdraw', async (req, res) => {
    const actor = req.applicationActor
    if (actor.role !== 'Applicant' || !mongoose.isValidObjectId(req.params.id)) return res.status(403).json({ error: 'Choose your own application.' })
    try {
      const owned = await JobApplication.findOne({ _id: req.params.id, applicantEmail: actor.email }).select('referralId').lean()
      const meeting = owned?.referralId ? await Interview.findOne({ referralId: owned.referralId }).lean() : null
      if (meeting && (+meeting.scheduledAt <= Date.now() || ['held', 'attended', 'missed'].includes(meeting.status))) return res.status(409).json({ error: 'The interview has started. Report a problem or contact PESO for assistance.' })
      if (owned?.referralId && await HireReport.exists({ referralId: owned.referralId, reportedByRole: { $ne: 'Applicant' } })) return res.status(409).json({ error: 'An employment outcome is already recorded. Report a problem for PESO assistance.' })
      const event = { action: 'applicant_withdrawal', status: 'withdrawn', by: 'Applicant', at: new Date() }
      const application = await JobApplication.findOneAndUpdate({ _id: req.params.id, applicantEmail: actor.email, deliveryStatus: { $in: ['delivered', 'pending_admin'] } }, { $set: { deliveryStatus: 'withdrawn' }, $push: { history: event } }, { returnDocument: 'after' }).select('referralId employerId jobId').lean()
      if (!application) return res.status(409).json({ error: 'This application is already withdrawn or unavailable.' })
      if (meeting) await Interview.updateOne({ _id: meeting._id }, { $set: { status: 'cancelled', cancelledBy: 'Applicant', cancelledAt: new Date() }, $push: { history: event } })
      if (application.referralId) await Referral.updateOne({ _id: application.referralId }, { $set: { status: 'withdrawn' }, $push: { history: event } })
      if (application.employerId && application.referralId) await notify({ recipient: { id: application.employerId, role: 'Employer' }, type: 'application_withdrawn', title: 'Application update', message: 'An application was withdrawn. Its profile summary is no longer available.', link: '/referrals' })
      res.json({ ok: true, status: 'withdrawn' })
    } catch { res.status(409).json({ error: 'This application could not be withdrawn. Refresh and try again.' }) }
  })
  router.post('/reports', async (req, res) => {
    try { res.json(await applicationWorkflow.report(req.applicationActor, req.body || {})) }
    catch (error) { res.status(error.status || 409).json({ code: error.code === 11000 ? 'ALREADY_RECORDED' : error.code || 'REPORT_UNAVAILABLE', error: error.code === 11000 ? 'This report is already recorded.' : error.status ? error.message : 'This report could not be submitted. Try again.' }) }
  })
  return router
}
