import { Router } from 'express'
import mongoose from 'mongoose'
import { ApplicationError } from '../services/referralWorkflow.js'

export function createReferralOversightRouter({ workflow, Applicant, Employer, JobPosting, JobApplication, authenticate }) {
  const router = Router()
  router.use((req, res, next) => {
    try {
      const actor = authenticate(req)
      if (actor?.role !== 'Admin') return res.status(403).json({ error: 'Admins only' })
      req.workflowAdmin = actor
      next()
    } catch { res.status(403).json({ error: 'Admins only' }) }
  })
  const wrap = (handler) => async (req, res) => {
    try { await handler(req, res) }
    catch (error) {
      if (error instanceof ApplicationError) return res.status(error.status).json({ code: error.code, error: error.message })
      console.error('[referral-oversight] request failed')
      res.status(409).json({ error: 'This request could not be completed. Refresh and try again.' })
    }
  }
  router.get('/settings', wrap(async (_req, res) => res.json(await workflow.getSettings())))
  router.put('/settings', wrap(async (req, res) => res.json(Object.hasOwn(req.body || {}, 'lowTrustRouting') ? await workflow.setLowTrustRouting(req.body.lowTrustRouting, req.workflowAdmin.email) : await workflow.setAutomatic(req.body?.automaticReferral, req.workflowAdmin.email))))
  router.get('/options', wrap(async (_req, res) => {
    const [employers, jobs, applicants] = await Promise.all([
      Employer.find().select('email companyName receivingApplicantsSuspendedAt').limit(500).lean(),
      JobPosting.find().select('title createdBy status').limit(1000).lean(),
      Applicant.find({ deletedAt: { $exists: false }, verificationStatus: 'approved', emailVerified: true }).select('email profile.firstName profile.lastName profile.name').limit(500).lean(),
    ])
    res.json({ employers, jobs, applicants })
  }))
  const stages = () => [
    { $match: { deliveryStatus: { $ne: 'processing' } } },
    { $lookup: { from: 'referrals', localField: 'referralId', foreignField: '_id', as: 'referral' } },
    { $unwind: { path: '$referral', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'employers', localField: 'employerId', foreignField: '_id', as: 'employer' } },
    { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'jobpostings', localField: 'jobId', foreignField: '_id', as: 'job' } },
    { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'applicants', localField: 'applicantEmail', foreignField: 'email', as: 'applicant' } },
    { $unwind: { path: '$applicant', preserveNullAndEmptyArrays: true } },
    { $project: {
      submittedAt: 1, findings: 1, reviewQueue: 1, applicationDetails: 1, resumeName: '$resumeFile.originalName', applicationId: '$_id', referralId: '$referral._id',
      status: { $ifNull: ['$referral.status', { $ifNull: ['$deliveryStatus', 'pending_admin'] }] },
      source: { $ifNull: ['$referral.source', { $ifNull: ['$source', 'admin'] }] },
      applicant: { id: '$applicant._id', email: '$applicantEmail', firstName: '$applicant.profile.firstName', lastName: '$applicant.profile.lastName', name: '$applicant.profile.name' },
      employer: { id: '$employer._id', name: '$employer.companyName', suspendedAt: '$employer.receivingApplicantsSuspendedAt' },
      job: { id: '$job._id', title: '$job.title' },
      history: { $concatArrays: [{ $ifNull: ['$history', []] }, { $ifNull: ['$referral.history', []] }] },
    } },
  ]
  router.get('/applications', wrap(async (req, res) => {
    const filter = {}
    for (const [parameter, field] of [['employer', 'employer.id'], ['job', 'job.id']]) if (req.query[parameter]) {
      if (!mongoose.isValidObjectId(req.query[parameter])) throw new ApplicationError('INVALID_FILTER', 'Choose a valid filter.', 403)
      filter[field] = new mongoose.Types.ObjectId(req.query[parameter])
    }
    if (req.query.status) {
      if (!['pending', 'accepted', 'declined', 'pending_admin', 'withdrawn_by_admin', 'withdrawn', 'declined_by_admin'].includes(req.query.status)) throw new ApplicationError('INVALID_FILTER', 'Choose a valid status.', 403)
      filter.status = req.query.status
    }
    if (req.query.source) {
      if (!['auto', 'admin'].includes(req.query.source)) throw new ApplicationError('INVALID_FILTER', 'Choose a valid source.', 403)
      filter.source = req.query.source
    }
    for (const key of ['from', 'to']) if (req.query[key]) {
      if (typeof req.query[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(req.query[key]) || !Number.isFinite(+new Date(req.query[key])) || new Date(req.query[key]).toISOString().slice(0, 10) !== req.query[key]) throw new ApplicationError('INVALID_FILTER', 'Enter a valid date.', 403)
      filter.submittedAt ||= {}
      filter.submittedAt[key === 'from' ? '$gte' : '$lt'] = new Date(+new Date(`${req.query[key]}T00:00:00+08:00`) + (key === 'to' ? 86400000 : 0))
    }
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(req.query.page)) || 1)), limit = Math.max(1, Math.min(100, Math.trunc(Number(req.query.limit)) || 10))
    const field = { date: 'submittedAt', employer: 'employer.name', job: 'job.title', status: 'status', source: 'source' }[req.query.sortBy] || 'submittedAt'
    const order = req.query.order === 'asc' ? 1 : -1
    const [result] = await JobApplication.aggregate([...stages(), { $match: filter }, { $facet: { items: [{ $sort: { [field]: order, _id: order } }, { $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'count' }] } }])
    const total = result.total[0]?.count || 0
    res.json({ items: result.items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) })
  }))
  router.get('/applications/:id', wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new ApplicationError('INVALID_APPLICATION', 'Choose a valid application.', 403)
    const [item] = await JobApplication.aggregate([{ $match: { _id: new mongoose.Types.ObjectId(req.params.id) } }, ...stages()])
    if (!item) return res.status(409).json({ error: 'Application not found' })
    res.json(item)
  }))
  router.post('/applications/:id/pull-back', wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new ApplicationError('INVALID_APPLICATION', 'Choose a valid application.', 403)
    const application = await JobApplication.findById(req.params.id).select('referralId').lean()
    if (!application?.referralId) throw new ApplicationError('NOT_DELIVERED', 'This application has not been shared with an employer.')
    res.json(await workflow.pullBack(application.referralId, req.workflowAdmin.email, req.body?.reason))
  }))
  router.post('/employers/:id/suspension', wrap(async (req, res) => {
    if (typeof req.body?.suspended !== 'boolean') throw new ApplicationError('INVALID_ACTION', 'Choose suspend or resume.', 403)
    res.json(await workflow.suspendEmployer(req.params.id, req.body.suspended, req.workflowAdmin.email, req.body.reason))
  }))
  return router
}
