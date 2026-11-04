import { publicApplicationHistory, mergeApplicationHistory } from '../../shared/employmentReporting.js'
import { applicationActions, applicationWithdrawalDeadline, WITHDRAWAL_WINDOW_MS } from '../../shared/applicationProgress.js'
import { publicPostInterviewTask } from '../../shared/postInterviewTask.js'

// The applicant-facing DTO is deliberately built field by field. Never return
// model spreads, report reasons, admin history actors/notes or private scores.
export function publicApplication(record, suspended, now = new Date()) {
  const referral = record.referral || {}, meeting = record.interview
  const report = (record.reports || []).find((entry) => entry.type === 'no_show' && entry.byRole === 'Employer')
  const outcome = record.outcome
  let status = record.deliveryStatus === 'delivered' ? referral.status || 'pending' : record.deliveryStatus || 'pending_admin'
  if (!['withdrawn', 'withdrawn_by_admin', 'declined_by_admin', 'pending_admin'].includes(status)) {
    if (meeting) status = { invited: 'interview_invited', confirmed: 'interview_confirmed', reschedule_requested: 'reschedule_requested', declined: 'interview_declined', cancelled: 'interview_cancelled', held: 'interview_held', attended: 'interview_attended', missed: 'no_show_confirmed' }[meeting.status] || status
    if (report && report.status !== 'dismissed') status = `no_show_${report.status || 'pending'}`
    if (outcome) status = outcome.status
  }
  const withdrawalDeadline = applicationWithdrawalDeadline(meeting)
  const interview = meeting ? { id: String(meeting._id), status: meeting.status, scheduledAt: meeting.scheduledAt, acceptedAt: withdrawalDeadline ? new Date(+new Date(withdrawalDeadline) - WITHDRAWAL_WINDOW_MS).toISOString() : null, mode: meeting.mode, location: meeting.location || '', message: meeting.message || '' } : null
  const publicReport = report ? { id: String(report._id), status: report.status || 'pending', reportedAt: report.at, responseDeadline: report.responseDeadline, respondedAt: report.respondedAt, applicantResponse: report.applicantResponse || '', reviewedAt: report.reviewedAt } : null
  const result = {
    id: String(record._id), source: referral.source || record.source || 'admin', jobId: String(record.jobId), referralId: record.referralId ? String(record.referralId) : null,
    job: { title: record.job?.title || record.jobTitle || 'Job posting no longer available', location: record.job?.location || '' },
    employer: { name: record.employer?.companyName || record.employerName || record.job?.company || 'Employer', profileImage: record.employer?.profile?.profileImage || '' },
    status, submittedAt: record.submittedAt, withdrawalDeadline, lastUpdate: record.lastUpdate || record.submittedAt, interview, noShowReport: publicReport, postInterviewTask: publicPostInterviewTask(meeting?.postInterviewTask),
    message: status === 'pending_admin' ? 'Your application is being reviewed.' : ['withdrawn', 'withdrawn_by_admin'].includes(status) ? 'This application remains in your history and is no longer shared with the employer.' : status === 'declined_by_admin' ? 'The review is complete. This application will not proceed.' : '',
    outcome: ['hired', 'deployed', 'not_hired'].includes(status) ? { status, at: outcome?.reportedAt, message: `The employer reported this application as ${status.replaceAll('_', ' ')}.` } : ['no_show_confirmed', 'no_show_dismissed', 'declined_by_admin', 'declined'].includes(status) ? { status, at: report?.reviewedAt || record.lastUpdate, message: status === 'no_show_dismissed' ? 'PESO dismissed the no-show report.' : status === 'no_show_confirmed' ? 'PESO completed its review and confirmed the no-show report.' : 'This application is not proceeding.' } : null,
    history: publicApplicationHistory(mergeApplicationHistory(record.history, referral.history, meeting?.history)),
  }
  result.actions = applicationActions({ status, interview, report: publicReport, referralId: result.referralId, suspended, now })
  return result
}

export const applicationProgressLookups = [
  ...[['jobpostings', 'jobId', 'job'], ['employers', 'employerId', 'employer'], ['referrals', 'referralId', 'referral'], ['interviews', 'referralId', 'interview']].flatMap(([from, localField, as]) => [
    { $lookup: { from, localField, foreignField: as === 'interview' ? 'referralId' : '_id', as } }, { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
  ]),
  { $lookup: { from: 'application_reports', let: { id: '$referralId' }, pipeline: [{ $match: { $expr: { $and: [{ $ne: ['$$id', null] }, { $eq: ['$referralId', '$$id'] }] } } }, { $sort: { at: -1 } }], as: 'reports' } },
  { $lookup: { from: 'hire_reports', let: { id: '$referralId' }, pipeline: [{ $match: { $expr: { $and: [{ $ne: ['$$id', null] }, { $eq: ['$referralId', '$$id'] }] }, reportedByRole: { $ne: 'Applicant' } } }, { $sort: { reportedAt: -1 } }, { $limit: 1 }], as: 'outcome' } },
  { $unwind: { path: '$outcome', preserveNullAndEmptyArrays: true } },
  { $addFields: { lastUpdate: { $max: ['$submittedAt', '$lastActivityAt', '$referral.updatedAt', '$interview.updatedAt', { $max: '$reports.at' }, { $max: '$reports.respondedAt' }, { $max: '$reports.reviewedAt' }, '$outcome.reportedAt'] } } },
  { $project: { source: 1, jobId: 1, referralId: 1, deliveryStatus: 1, jobTitle: 1, employerName: 1, submittedAt: 1, lastUpdate: 1, history: 1, 'job.title': 1, 'job.location': 1, 'job.company': 1, 'employer.companyName': 1, 'employer.profile.profileImage': 1, 'referral.source': 1, 'referral.status': 1, 'referral.history': 1, interview: 1, reports: 1, 'outcome.status': 1, 'outcome.reportedAt': 1 } },
]
