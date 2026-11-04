import { Router } from 'express'
import { ApplicationError } from '../services/referralWorkflow.js'
import { applicationProgressLookups, publicApplication } from '../services/applicationProgress.js'
import { publicApplicationHistory } from '../../shared/employmentReporting.js'
import multer from 'multer'
import { createPostInterviewTaskService } from '../services/postInterviewTask.js'
import { publicPostInterviewTask, POST_INTERVIEW_FILE_MAX_BYTES } from '../../shared/postInterviewTask.js'
import { REPUTATION_POLICY, reputationEventLabel } from '../../shared/reputation.js'

export function createApplicationWorkflowRouter({ service, Applicant, Admin, JobApplication, Interview, ApplicationReport, ApplicationAppeal, HireReport, authenticate, notify, now = () => new Date() }) {
  const router = Router()
  const tasks = createPostInterviewTaskService({ workflow: service, HireReport, notify, now })
  const uploadTaskFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: POST_INTERVIEW_FILE_MAX_BYTES, files: 1, fields: 0 } }).single('file')
  router.use(async (req, res, next) => {
    try {
      req.actor = authenticate(req)
      if (!['Applicant', 'Employer', 'Admin'].includes(req.actor?.role)) return res.status(403).json({ error: 'Please sign in.' })
      if (req.actor.role === 'Admin') {
        const admin = await Admin.findOne({ email: req.actor.email }).select('_id').lean()
        if (!admin) return res.status(403).json({ error: 'Admin account required.' })
        req.actor.id = admin._id
      }
      next()
    } catch { res.status(403).json({ error: 'Please sign in again.' }) }
  })
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res) }
    catch (error) { res.status(error instanceof ApplicationError ? error.status : 409).json({ code: error.code === 11000 ? 'ALREADY_RECORDED' : error instanceof ApplicationError ? error.code : 'WORKFLOW_UNAVAILABLE', error: error.code === 11000 ? 'This report, invitation or appeal is already recorded.' : error instanceof ApplicationError ? error.message : 'This request could not be completed. Refresh and try again.' }) }
  }
  const adminOnly = (req, res, next) => req.actor.role === 'Admin' ? next() : res.status(403).json({ error: 'Admins only.' })
  router.get('/reputation', wrap(async (req, res) => {
    if (req.actor.role !== 'Applicant') return res.status(403).json({ error: 'Applicants can view only their own reputation.' })
    const account = await Applicant.findOne({ email: req.actor.email, deletedAt: { $exists: false } }).select('+trustValue +trustEvents').lean()
    if (!account) return res.status(403).json({ error: 'Account unavailable.' })
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(req.query.page)) || 1)), limit = 10
    const events = [...(account.trustEvents || [])].reverse()
    res.set('Cache-Control', 'private, no-store')
    res.json({ points: account.trustValue ?? 100, initialPoints: 100, maximumPoints: 100, minimumPoints: 0, policy: REPUTATION_POLICY, page, pageSize: limit, total: events.length,
      items: events.slice((page - 1) * limit, page * limit).map(event => ({ type: event.type, label: reputationEventLabel(event.type), at: event.at, before: event.before, after: event.after, change: Number.isFinite(event.after) && Number.isFinite(event.before) ? event.after - event.before : event.delta })) })
  }))
  const meetingDto = (meeting) => meeting ? { id: String(meeting._id), status: meeting.status, scheduledAt: meeting.scheduledAt, mode: meeting.mode, location: meeting.location, city: meeting.city, barangay: meeting.barangay, province: meeting.province, landmark: meeting.landmark, meetingLink: meeting.meetingLink, message: meeting.message, responseMessage: meeting.responseMessage, history: publicApplicationHistory(meeting.history), postInterviewTask: publicPostInterviewTask(meeting.postInterviewTask) } : null
  router.get('/mine', wrap(async (req, res) => {
    if (req.actor.role !== 'Applicant') return res.status(403).json({ error: 'Applicants only.' })
    const account = await Applicant.findOne({ email: req.actor.email }).select('+applyingSuspensionReason').lean()
    if (!account || account.deletedAt) return res.status(403).json({ error: 'Account unavailable.' })
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(req.query.page)) || 1)), limit = Math.max(1, Math.min(50, Math.trunc(Number(req.query.limit)) || 10))
    const [result] = await JobApplication.aggregate([{ $match: { applicantEmail: account.email, deliveryStatus: { $ne: 'processing' }, invitationDeclinedAt: { $exists: false } } }, ...applicationProgressLookups,
      { $facet: { items: [{ $sort: { lastUpdate: req.query.order === 'asc' ? 1 : -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'count' }] } },
    ])
    const total = result.total[0]?.count || 0
    const appeal = await ApplicationAppeal.exists({ applicantId: account._id, status: 'pending' })
    res.json({ items: result.items.map((entry) => publicApplication(entry, Boolean(account.applyingSuspendedAt), now())), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), account: { applyingSuspended: Boolean(account.applyingSuspendedAt), suspensionReason: account.applyingSuspendedAt ? account.applyingSuspensionReason || '' : '', appealPending: Boolean(appeal) } })
  }))
  router.get('/referrals/:id/interview', wrap(async (req, res) => {
    await service.ownedReferral(req.actor, req.params.id)
    const meeting = await Interview.findOne({ referralId: req.params.id }).lean()
    const report = meeting ? await ApplicationReport.findOne({ interviewId: meeting._id, type: 'no_show' }).select('status responseDeadline at').lean() : null
    res.json(meeting ? { ...meetingDto(meeting), noShowReport: report ? { status: report.status, responseDeadline: report.responseDeadline, reportedAt: report.at } : null } : null)
  }))
  router.post('/referrals/:id/interview', wrap(async (req, res) => res.json(meetingDto(await service.invite(req.actor, req.params.id, req.body || {})))))
  router.post('/interviews/:id/respond', wrap(async (req, res) => res.json(meetingDto(await service.respondInterview(req.actor, req.params.id, req.body || {})))))
  router.post('/interviews/:id/held', wrap(async (req, res) => res.json(meetingDto(await service.held(req.actor, req.params.id, req.body || {})))))
  router.post('/interviews/:id/task', wrap(async (req, res) => res.json(meetingDto(await tasks.request(req.actor, req.params.id, req.body || {})))))
  router.post('/interviews/:id/task/complete', wrap(async (req, res) => res.json(meetingDto(await tasks.complete(req.actor, req.params.id, req.body || {})))))
  router.post('/interviews/:id/task/:key/file', wrap(async (req, res) => {
    if (req.actor.role !== 'Applicant') return res.status(403).json({ error: 'Applicants only.' })
    await tasks.context(req.actor, req.params.id)
    try { await new Promise((resolve, reject) => uploadTaskFile(req, res, error => error ? reject(error) : resolve())) }
    catch { return res.status(422).json({ error: 'Upload one PDF, JPG, or PNG file up to 5 MB.' }) }
    res.json(meetingDto(await tasks.upload(req.actor, req.params.id, req.params.key, req.file)))
  }))
  router.get('/interviews/:id/task/files/:fileId', wrap(async (req, res) => {
    const file = await tasks.download(req.actor, req.params.id, req.params.fileId)
    res.set('Cache-Control', 'private, no-store')
    res.set('X-Content-Type-Options', 'nosniff')
    res.attachment(file.name)
    res.type(file.mimetype)
    const raw = file.data
    res.send(Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw.value === 'function' ? raw.value() : raw.buffer || raw))
  }))
  router.post('/reports/:id/respond', wrap(async (req, res) => res.json(await service.respondNoShow(req.actor, req.params.id, req.body || {}))))
  router.post('/appeals', wrap(async (req, res) => res.json(await service.appeal(req.actor, req.body || {}))))
  router.use('/admin', adminOnly)
  router.get('/admin/overview', wrap(async (req, res) => {
    const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1), limit = 20
    const [reports, totalReports, meetings, appeals, hires] = await Promise.all([
      ApplicationReport.find().select('+reason +reviewReason +reviewedBy').sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(), ApplicationReport.countDocuments(),
      Interview.find({ status: { $in: ['held', 'cancelled'] } }).sort({ updatedAt: -1 }).limit(50).lean(),
      ApplicationAppeal.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50).lean(),
      HireReport.find({ reportedByRole: { $ne: 'Applicant' }, status: { $in: ['hired', 'deployed'] } }).sort({ reportedAt: -1 }).limit(50).select('applicantId jobId status').lean(),
    ])
    res.json({ reports, totalReports, page, limit, meetings, appeals, hires })
  }))
  router.get('/admin/applicants', wrap(async (_req, res) => res.json(await Applicant.find({ deletedAt: { $exists: false } }).select('email profile.firstName profile.lastName applyingSuspendedAt +applyingSuspensionReason +trustValue +trustEvents').limit(1000).lean())))
  router.post('/admin/applicants/:id/suspension', wrap(async (req, res) => res.json(await service.suspendApplicant(req.actor, req.params.id, req.body || {}))))
  router.post('/admin/reports/:id/review', wrap(async (req, res) => res.json(await service.reviewReport(req.actor, req.params.id, req.body || {}))))
  router.post('/admin/applications/:id/review', wrap(async (req, res) => res.json(await service.reviewApplication(req.actor, req.params.id, req.body || {}))))
  router.post('/admin/events/confirm', wrap(async (req, res) => res.json(await service.confirmEvent(req.actor, req.body || {}))))
  return router
}
