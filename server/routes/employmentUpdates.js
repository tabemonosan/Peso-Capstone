import mongoose from 'mongoose'
import { parsePagination } from '../utils/paginate.js'
import { applicantFullName } from '../models/collections.js'

export function createEmploymentUpdatesHandler({ HireReport, Applicant, Employer, JobPosting, authenticate }) {
  return async (req, res) => {
    try {
      const user = authenticate(req)
      if (!user) return res.status(401).json({ error: 'Sign in to continue.' })
      if (user.role !== 'Admin') return res.status(403).json({ error: 'Administrators only.' })
      const filter = {}
      for (const key of ['applicantId', 'jobId']) {
        if (req.query[key]) {
          if (typeof req.query[key] !== 'string' || !mongoose.isValidObjectId(req.query[key])) return res.status(400).json({ error: 'Invalid employment update filter.' })
          filter[key] = new mongoose.Types.ObjectId(req.query[key])
        }
      }
      const { page, limit } = parsePagination(req.query)
      const [result] = await HireReport.aggregate([
        { $match: filter },
        { $sort: { reportedAt: -1, _id: -1 } },
        // Legacy reports are employer statements. Keep the latest statement
        // from each party, then pair them without conflating their statuses.
        { $group: { _id: { applicantId: '$applicantId', employerId: '$employerId', jobId: '$jobId', role: { $ifNull: ['$reportedByRole', 'Employer'] } }, report: { $first: '$$ROOT' } } },
        { $group: { _id: { applicantId: '$_id.applicantId', employerId: '$_id.employerId', jobId: '$_id.jobId' }, reports: { $push: '$report' }, latestReportedAt: { $max: '$report.reportedAt' } } },
        { $sort: { latestReportedAt: -1, '_id.applicantId': 1, '_id.employerId': 1, '_id.jobId': 1 } },
        { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'count' }] } },
      ])
      const groups = result?.items || []
      const [applicants, employers, jobs] = await Promise.all([
        Applicant.find({ _id: { $in: groups.map((group) => group._id.applicantId) } }).select('email +retainedEmail profile.firstName profile.middleName profile.lastName profile.suffix profile.name').lean(),
        Employer.find({ _id: { $in: groups.map((group) => group._id.employerId) } }).select('email companyName contactName').lean(),
        JobPosting.find({ _id: { $in: groups.map((group) => group._id.jobId) } }).select('title company').lean(),
      ])
      const byId = (docs) => new Map(docs.map((doc) => [String(doc._id), doc]))
      const applicantMap = byId(applicants), employerMap = byId(employers), jobMap = byId(jobs)
      const statement = (report) => report ? {
        id: String(report._id), status: report.status, employmentDate: report.employmentDate || '', notes: report.notes || '', reportedAt: report.reportedAt,
        history: (report.history || []).map((entry) => ({ status: entry.status, employmentDate: entry.employmentDate || '', notes: entry.notes || '', reportedAt: entry.reportedAt })),
      } : null
      const items = groups.map((group) => {
        const applicantId = String(group._id.applicantId), employerId = String(group._id.employerId), jobId = String(group._id.jobId)
        const applicant = applicantMap.get(applicantId), employer = employerMap.get(employerId), job = jobMap.get(jobId)
        return {
          id: `${applicantId}-${employerId}-${jobId}`,
          applicant: { id: applicantId, name: applicant ? applicantFullName(applicant) : 'Applicant record unavailable', email: applicant?.retainedEmail || applicant?.email || '' },
          employer: { id: employerId, name: employer?.companyName || job?.company || 'Employer record unavailable', email: employer?.email || '' },
          job: { id: jobId, title: job?.title || 'Job record unavailable' },
          latestReportedAt: group.latestReportedAt,
          applicantReport: statement(group.reports.find((report) => report.reportedByRole === 'Applicant')),
          employerReport: statement(group.reports.find((report) => !report.reportedByRole || report.reportedByRole === 'Employer')),
        }
      })
      const total = result?.total?.[0]?.count || 0
      res.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) })
    } catch { res.status(500).json({ error: 'Unable to load employment updates.' }) }
  }
}
