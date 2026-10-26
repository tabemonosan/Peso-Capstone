const DAY_MS = 24 * 60 * 60 * 1000
export const CHART_DAYS = 30

const countBy = (rows, key = '_id') => Object.fromEntries(rows.map((row) => [String(row[key]), row.count]))

const dayKey = (date) => date.toISOString().slice(0, 10)

// Zero-fills the last `days` days (UTC) so the chart has a continuous x-axis
export function fillDays(buckets, now = new Date(), days = CHART_DAYS) {
  const byDay = Object.fromEntries(buckets.map((b) => [b._id, b.count]))
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(now.getTime() - i * DAY_MS))
    out.push({ date: key, count: byDay[key] || 0 })
  }
  return out
}

const perDay = (field, since, extraMatch = {}) => [
  { $match: { [field]: { $gte: since }, ...extraMatch } },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: 'UTC' } }, count: { $sum: 1 } } },
]

const countJobsByStatus = (JobPosting, match = {}) =>
  JobPosting.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }])

// Number of applicant documents whose latest version is still pending review
const pendingDocsPipeline = [
  {
    $project: {
      pending: {
        $size: {
          $filter: {
            input: { $objectToArray: { $ifNull: ['$verificationDocuments', {}] } },
            as: 'doc',
            cond: { $eq: [{ $arrayElemAt: ['$$doc.v.versions.status', -1] }, 'pending'] },
          },
        },
      },
    },
  },
  { $group: { _id: null, documents: { $sum: '$pending' }, applicants: { $sum: { $cond: [{ $gt: ['$pending', 0] }, 1, 0] } } } },
]

export function createDashboardService({ Applicant, Employer, JobPosting, JobApplication, Referral, HireReport, Notification }) {
  const recentActivity = async (user) => {
    const items = await Notification.find({
      $or: [
        { 'recipient.id': user.id, 'recipient.role': user.role },
        { 'recipient.id': { $exists: false }, recipientEmail: String(user.email).toLowerCase() },
      ],
    }).sort({ createdAt: -1 }).limit(10).select('type title message createdAt').lean()
    return items.map((n) => ({ id: String(n._id), type: n.type, title: n.title, message: n.message, createdAt: n.createdAt }))
  }

  async function admin(user, now) {
    const since = new Date(now.getTime() - (CHART_DAYS - 1) * DAY_MS)
    since.setUTCHours(0, 0, 0, 0)
    const [applicants, employers, jobs, docs, hires, referrals, applicantDays, employerDays, applicationDays, activity] = await Promise.all([
      Applicant.countDocuments({}),
      Employer.countDocuments({}),
      countJobsByStatus(JobPosting),
      Applicant.aggregate(pendingDocsPipeline),
      HireReport.countDocuments({}),
      Referral.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Applicant.aggregate(perDay('createdAt', since)),
      Employer.aggregate(perDay('createdAt', since)),
      JobApplication.aggregate(perDay('submittedAt', since)),
      recentActivity(user),
    ])
    const jobCounts = countBy(jobs)
    const referralCounts = countBy(referrals)
    const registrations = fillDays([...applicantDays, ...employerDays].reduce((acc, b) => {
      const hit = acc.find((x) => x._id === b._id)
      if (hit) hit.count += b.count
      else acc.push({ ...b })
      return acc
    }, []), now)
    return {
      role: 'Admin',
      stats: {
        applicants,
        employers,
        jobs: { pending: jobCounts.pending || 0, approved: jobCounts.approved || 0, declined: jobCounts.declined || 0 },
        documentsAwaitingReview: docs[0]?.documents || 0,
        applicantsAwaitingReview: docs[0]?.applicants || 0,
        hires,
        referrals: { total: Object.values(referralCounts).reduce((a, b) => a + b, 0), pending: referralCounts.pending || 0, accepted: referralCounts.accepted || 0, declined: referralCounts.declined || 0 },
      },
      charts: { registrations, applications: fillDays(applicationDays, now) },
      activity,
    }
  }

  async function employer(user, now) {
    const since = new Date(now.getTime() - (CHART_DAYS - 1) * DAY_MS)
    since.setUTCHours(0, 0, 0, 0)
    const jobs = await JobPosting.find({ createdBy: user.email }).select('_id').lean()
    const jobIds = jobs.map((j) => j._id)
    const [jobStatus, applicantCount, applicationDays, referrals, hires, activity] = await Promise.all([
      countJobsByStatus(JobPosting, { createdBy: user.email }),
      JobApplication.countDocuments({ jobId: { $in: jobIds } }),
      JobApplication.aggregate(perDay('submittedAt', since, { jobId: { $in: jobIds } })),
      Referral.aggregate([{ $match: { employerId: user.objectId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      HireReport.countDocuments({ employerId: user.objectId }),
      recentActivity(user),
    ])
    const jobCounts = countBy(jobStatus)
    const referralCounts = countBy(referrals)
    return {
      role: 'Employer',
      stats: {
        jobs: { pending: jobCounts.pending || 0, approved: jobCounts.approved || 0, declined: jobCounts.declined || 0 },
        applicants: applicantCount,
        referrals: { total: Object.values(referralCounts).reduce((a, b) => a + b, 0), pending: referralCounts.pending || 0, accepted: referralCounts.accepted || 0, declined: referralCounts.declined || 0 },
        hires,
      },
      charts: { applications: fillDays(applicationDays, now) },
      activity,
    }
  }

  async function applicant(user, now) {
    const since = new Date(now.getTime() - (CHART_DAYS - 1) * DAY_MS)
    since.setUTCHours(0, 0, 0, 0)
    const [applications, applicationDays, referrals, docs, activity] = await Promise.all([
      JobApplication.countDocuments({ applicantEmail: user.email }),
      JobApplication.aggregate(perDay('submittedAt', since, { applicantEmail: user.email })),
      Referral.aggregate([{ $match: { applicantId: user.objectId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Applicant.aggregate([{ $match: { _id: user.objectId } }, ...pendingDocsPipeline]),
      recentActivity(user),
    ])
    const referralCounts = countBy(referrals)
    return {
      role: 'Applicant',
      stats: {
        verificationStatus: user.verificationStatus || 'under_review',
        applications,
        referrals: { total: Object.values(referralCounts).reduce((a, b) => a + b, 0), pending: referralCounts.pending || 0, accepted: referralCounts.accepted || 0, declined: referralCounts.declined || 0 },
        documentsAwaitingReview: docs[0]?.documents || 0,
      },
      charts: { applications: fillDays(applicationDays, now) },
      activity,
    }
  }

  return {
    // user: { id, objectId, role, email, verificationStatus }
    getDashboard(user, now = new Date()) {
      if (user.role === 'Admin') return admin(user, now)
      if (user.role === 'Employer') return employer(user, now)
      if (user.role === 'Applicant') return applicant(user, now)
      return Promise.resolve(null)
    },
  }
}
