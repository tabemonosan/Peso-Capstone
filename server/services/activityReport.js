import { activityReportRange } from '../../shared/activityReport.js'
export function createActivityReportService({ Applicant, Employer, JobPosting, JobApplication, Referral, Interview, HireReport, ApplicationReport, now = () => new Date() }) {
  const sources = [
    ['applicants', 'Applicant registrations', Applicant, 'createdAt', 'Registration date'],
    ['employers', 'Employer registrations', Employer, 'createdAt', 'Registration date'],
    ['jobs', 'Job postings submitted', JobPosting, 'createdAt', 'Submission date', 'status'],
    ['applications', 'Applications submitted', JobApplication, 'submittedAt', 'Submission date', 'deliveryStatus', { deliveryStatus: { $ne: 'processing' } }],
    ['referrals', 'Referrals created', Referral, 'createdAt', 'Referral creation date', 'source', { deliveryState: { $ne: 'processing' } }],
    ['interviews', 'Interviews scheduled', Interview, 'scheduledAt', 'Scheduled interview date', 'status'],
    ['outcomes', 'Hiring outcome reports', HireReport, 'reportedAt', 'Latest employer/PESO report date; applicant self-reports excluded', 'status', { reportedByRole: { $ne: 'Applicant' } }],
    ['noShows', 'No-show reports', ApplicationReport, 'at', 'Report submission date', 'status', { type: 'no_show' }],
  ]
  return async input => {
    const generated = now()
    let range
    try { range = activityReportRange(input, generated) } catch (error) { error.status = 422; throw error }
    const daily = new Map()
    const metrics = await Promise.all(sources.map(async ([key, label, Model, field, basis, status, extra = {}]) => {
      const [result] = await Model.aggregate([
        { $match: { ...extra, [field]: { $gte: range.since, $lt: range.until } } },
        { $facet: {
          total: [{ $count: 'count' }],
          daily: [{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: 'Asia/Manila' } }, count: { $sum: 1 } } }],
          statuses: status ? [{ $group: { _id: { $ifNull: [`$${status}`, 'Unspecified'] }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }] : [{ $match: { $expr: { $eq: [1, 0] } } }],
        } },
      ])
      for (const day of result.daily) {
        if (!daily.has(day._id)) daily.set(day._id, { date: day._id })
        daily.get(day._id)[key] = day.count
      }
      return { key, label, basis, count: result.total[0]?.count || 0, statuses: result.statuses.map(row => ({ status: row._id, count: row.count })) }
    }))
    return { title: 'PESO activity report', generatedAt: generated.toISOString(), range: { preset: range.preset, start: range.start, end: range.end, timeZone: range.timeZone }, metrics, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), note: "Counts use each metric's date basis. Status breakdowns show the current status of records in the selected period, not their historical status on that date. These categories overlap; do not add them into a single total." }
  }
}
