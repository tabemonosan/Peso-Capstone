export const APPLICATION_STATUS_LABELS = {
  pending_admin: 'Being reviewed', pending: 'With employer', accepted: 'Accepted by employer', declined: 'Not selected', declined_by_admin: 'Not proceeding', withdrawn: 'Withdrawn', withdrawn_by_admin: 'Returned to PESO review',
  interview_invited: 'Interview invitation', interview_confirmed: 'Interview confirmed', reschedule_requested: 'Reschedule requested', interview_declined: 'Interview declined', interview_cancelled: 'Interview cancelled', interview_held: 'Interview held', interview_attended: 'Interview attended', no_show_pending: 'Response requested', no_show_responded: 'Report being reviewed', no_show_confirmed: 'Report reviewed', no_show_dismissed: 'Report dismissed', hired: 'Hired', deployed: 'Deployed', not_hired: 'Not hired',
}
export function applicationActions({ status, interview, report, referralId, suspended, now = new Date() }) {
  const actions = []
  const terminal = ['withdrawn', 'withdrawn_by_admin', 'declined_by_admin', 'declined', 'hired', 'deployed', 'not_hired', 'no_show_confirmed', 'no_show_dismissed'].includes(status)
  if (interview?.status === 'invited' && +new Date(interview.scheduledAt) > +now && !terminal) {
    if (!suspended) actions.push('confirm')
    actions.push('reschedule', 'decline')
  }
  if (!terminal && !report && (!interview || +new Date(interview.scheduledAt) > +now) && !['held', 'attended', 'missed'].includes(interview?.status)) actions.push('withdraw')
  if (report?.status === 'pending' && report.responseDeadline && +new Date(report.responseDeadline) >= +now) actions.push('respond_no_show')
  if (referralId) actions.push('report_problem')
  if (['hired', 'deployed', 'not_hired', 'no_show_confirmed', 'no_show_dismissed', 'declined', 'declined_by_admin'].includes(status)) actions.push('view_outcome')
  return actions
}
