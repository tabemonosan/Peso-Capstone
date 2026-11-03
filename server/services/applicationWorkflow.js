import mongoose from 'mongoose'
import { ApplicationError, WITHDRAWN_REFERRALS } from './referralWorkflow.js'
import { recordTrustEvent, TRUST_DELTAS } from './trustPolicy.js'
import { validateInterviewInvitation } from '../../shared/interviewInvitation.js'
const fail = (code, message, status = 409) => { throw new ApplicationError(code, message, status) }
const id = (value) => { if (!mongoose.isValidObjectId(value)) fail('INVALID_RECORD', 'Choose a valid record.', 403); return value }
const reasonText = (reason) => { if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) fail('REASON_REQUIRED', 'Enter a reason of 1 to 1,000 characters.', 403); return reason.trim() }
const DAY = 86400000

export function createApplicationWorkflow({ Applicant, Employer, JobPosting, JobApplication, Referral, HireReport, Interview, ApplicationReport, ApplicationAppeal, notify, notifyAdmins, loadEmployerVerification, referralWorkflow, now = () => new Date() }) {
  const audit = async (entry) => mongoose.connection.db.collection('referral_audit').insertOne({ ...entry, at: now() })
  async function actorAccount(actor) {
    const Model = actor.role === 'Applicant' ? Applicant : actor.role === 'Employer' ? Employer : null
    if (!Model) fail('FORBIDDEN', 'Applicants and employers only.', 403)
    const account = await Model.findOne({ email: actor.email }).lean()
    if (!account || account.deletedAt) fail('FORBIDDEN', 'Account unavailable.', 403)
    if (actor.role === 'Employer' && (await loadEmployerVerification(actor.email)).status !== 'approved') fail('EMPLOYER_NOT_APPROVED', 'Employer approval is required.', 403)
    return account
  }
  async function ownedReferral(actor, referralId) {
    const account = await actorAccount(actor)
    const referral = await Referral.findById(id(referralId)).lean()
    if (!referral || String(referral[actor.role === 'Applicant' ? 'applicantId' : 'employerId']) !== String(account._id)) fail('FORBIDDEN', 'This application is not available to you.', 403)
    if (actor.role === 'Employer' && (WITHDRAWN_REFERRALS.includes(referral.status) || referral.deliveryState === 'processing')) fail('APPLICATION_WITHDRAWN', 'This application is no longer shared with you.', 403)
    return { account, referral }
  }
  async function event(referral, action, status, by, reason) {
    const entry = { action, status, by, at: now(), ...(reason ? { reason } : {}) }
    await Referral.updateOne({ _id: referral._id }, { $push: { history: entry } })
    await JobApplication.updateOne({ referralId: referral._id }, { $set: { lastActivityAt: now() } })
    return entry
  }
  const messageApplicant = (referral, type, message) => notify({ recipient: { id: referral.applicantId, role: 'Applicant' }, type, title: 'Application update', message, link: '/my-applications', metadata: { referralId: String(referral._id) }, email: true })
  async function invite(actor, referralId, body) {
    if (actor.role !== 'Employer') fail('FORBIDDEN', 'Employers only.', 403)
    const { referral } = await ownedReferral(actor, referralId)
    const applicant = await Applicant.findById(referral.applicantId).lean()
    if (!applicant || applicant.applyingSuspendedAt || applicant.verificationStatus !== 'approved') fail('APPLICANT_UNAVAILABLE', 'This applicant is unavailable for a new invitation.', 403)
    const { value: invitation, errors } = validateInterviewInvitation(body, now())
    if (Object.keys(errors).length) fail('INVALID_INTERVIEW', Object.values(errors).join(' '), 403)
    if (await ApplicationReport.exists({ referralId: referral._id, type: 'no_show', status: { $in: ['pending', 'responded', 'confirmed'] } })) fail('INTERVIEW_UNAVAILABLE', 'PESO must complete the existing report before another invitation.')
    const previous = await Interview.findOne({ referralId: referral._id }).lean()
    if (previous && (['held', 'attended', 'missed'].includes(previous.status) || previous.status === 'confirmed' && +previous.scheduledAt <= +now())) fail('INTERVIEW_COMPLETE', 'This interview is already complete.')
    const entry = { action: previous ? 'interview_rescheduled' : 'interview_invited', status: 'invited', by: 'Employer', at: now() }
    const meeting = await Interview.findOneAndUpdate({ referralId: referral._id, ...(previous ? { status: previous.status } : {}) }, { $set: { applicationId: referral.applicationId, applicantId: referral.applicantId, employerId: referral.employerId, jobId: referral.jobId, ...invitation, responseMessage: '', status: 'invited' }, $push: { history: entry } }, { upsert: !previous, returnDocument: 'after' })
    if (!meeting) fail('INTERVIEW_CHANGED', 'The interview changed. Refresh and try again.')
    await event(referral, entry.action, 'interview_invited', 'Employer')
    await messageApplicant(referral, 'interview_invited', 'You have an interview invitation. Open My applications to confirm, request a reschedule, or decline.')
    return meeting
  }
  async function respondInterview(actor, interviewId, body) {
    if (actor.role !== 'Applicant') fail('FORBIDDEN', 'Applicants only.', 403)
    const meeting = await Interview.findById(id(interviewId)).lean()
    if (!meeting) fail('INTERVIEW_UNAVAILABLE', 'Interview unavailable.')
    const { account, referral } = await ownedReferral(actor, meeting.referralId)
    if (WITHDRAWN_REFERRALS.includes(referral.status)) fail('APPLICATION_WITHDRAWN', 'This application is withdrawn.')
    if (body.action === 'confirm' && account.applyingSuspendedAt) fail('APPLICANT_SUSPENDED', 'PESO has paused your applications. You can appeal from My applications.', 403)
    if (!['confirm', 'reschedule', 'decline'].includes(body.action)) fail('INVALID_ACTION', 'Choose confirm, reschedule, or decline.', 403)
    if (!['invited', 'reschedule_requested'].includes(meeting.status) || +meeting.scheduledAt <= +now()) fail('INTERVIEW_CHANGED', 'This invitation has expired or already been answered.')
    if (body.action === 'decline' && await HireReport.exists({ referralId: referral._id, reportedByRole: { $ne: 'Applicant' } })) fail('OUTCOME_ALREADY_RECORDED', 'An employment outcome is already recorded. Contact PESO for assistance.')
    const reason = body.action === 'confirm' ? '' : reasonText(body.reason)
    if (['reschedule', 'decline'].includes(body.action) && body.reason.length > 50) fail(body.action === 'reschedule' ? 'INVALID_RESCHEDULE_REASON' : 'INVALID_DECLINE_REASON', `Use 50 characters or fewer for the ${body.action === 'reschedule' ? 'reschedule' : 'decline'} reason.`, 403)
    const status = { confirm: 'confirmed', reschedule: 'reschedule_requested', decline: 'declined' }[body.action]
    const changed = await Interview.findOneAndUpdate({ _id: meeting._id, status: meeting.status, scheduledAt: { $gt: now() } }, { $set: { status, responseMessage: reason }, $push: { history: { action: `interview_${status}`, status, by: 'Applicant', reason, at: now() } } }, { returnDocument: 'after' }).lean()
    if (!changed) fail('INTERVIEW_CHANGED', 'This invitation changed. Refresh and try again.')
    await event(referral, `interview_${status}`, `interview_${status}`, 'Applicant', reason)
    if (body.action === 'decline') {
      await JobApplication.updateOne({ referralId: referral._id }, { $set: { deliveryStatus: 'withdrawn', invitationDeclinedAt: now(), lastActivityAt: now() } })
      await Referral.updateOne({ _id: referral._id }, { $set: { status: 'withdrawn' } })
      await JobPosting.updateOne({ _id: referral.jobId }, { $pull: { applicants: { email: account.email } } })
      await audit({ action: 'interview_invitation_declined', applicantId: account._id, referralId: referral._id, interviewId: meeting._id, by: 'Applicant', reason })
      await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'interview_declined', title: 'Invitation declined', message: 'This application is no longer active. You can apply again from Jobs if the posting is still available.', link: '/jobs' })
    }
    await notify({ recipient: { id: referral.employerId, role: 'Employer' }, type: 'interview_response', title: 'Interview response', message: `An applicant ${status === 'confirmed' ? 'confirmed the interview' : status === 'declined' ? 'declined the invitation' : 'requested a reschedule'}.`, link: '/referrals', metadata: { referralId: String(referral._id) } })
    return changed
  }
  async function held(actor, interviewId) {
    if (actor.role !== 'Employer') fail('FORBIDDEN', 'Employers only.', 403)
    const meeting = await Interview.findById(id(interviewId)).lean()
    if (!meeting) fail('INTERVIEW_UNAVAILABLE', 'Interview unavailable.')
    const { referral } = await ownedReferral(actor, meeting.referralId)
    if (meeting.status !== 'confirmed' || +meeting.scheduledAt > +now()) fail('INTERVIEW_NOT_DUE', 'Only a confirmed interview that has started can be marked held.')
    if (await ApplicationReport.exists({ interviewId: meeting._id, type: 'no_show', status: { $in: ['pending', 'responded', 'confirmed'] } })) fail('REPORT_PENDING', 'PESO must review the no-show report first.')
    const changed = await Interview.findOneAndUpdate({ _id: meeting._id, status: 'confirmed' }, { $set: { status: 'held' }, $push: { history: { action: 'employer_recorded_interview_held', status: 'held', by: 'Employer', at: now() } } }, { returnDocument: 'after' }).lean()
    if (!changed) fail('INTERVIEW_CHANGED', 'This interview changed. Refresh and try again.')
    await event(referral, 'employer_recorded_interview_held', 'interview_held', 'Employer')
    await notifyAdmins({ type: 'interview_held', title: 'Interview held awaiting confirmation', message: 'An employer recorded an interview as held. Review it in Referrals and applications.', link: '/peso-referrals' })
    return changed
  }
  async function report(actor, body) {
    const { account, referral } = await ownedReferral(actor, body.referralId)
    const reason = reasonText(body.reason)
    if (!['problem', 'no_show'].includes(body.type) || body.type === 'no_show' && actor.role !== 'Employer') fail('INVALID_REPORT', 'Only the employer can report an interview no-show.', 403)
    let meeting
    if (body.type === 'no_show') {
      meeting = await Interview.findOne({ referralId: referral._id }).lean()
      if (!meeting || meeting.status !== 'confirmed' || +meeting.scheduledAt > +now()) fail('INTERVIEW_NOT_DUE', 'A no-show report requires a confirmed interview that has started.')
    }
    const day = now().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const entry = await ApplicationReport.create({ _id: `${referral._id}:${actor.role}:${account._id}:${body.type}:${day}`, referralId: referral._id, interviewId: meeting?._id, applicantId: referral.applicantId, employerId: referral.employerId, jobId: referral.jobId, type: body.type, byRole: actor.role, byId: account._id, reason, at: now(), status: 'pending', ...(meeting ? { responseDeadline: new Date(+now() + 7 * DAY) } : {}) })
    await event(referral, body.type === 'no_show' ? 'employer_reported_no_show' : 'problem_report_submitted', referral.status, actor.role)
    if (meeting) await messageApplicant(referral, 'no_show_response_requested', 'The employer reported a missed interview. You have 7 days to respond in My applications before PESO reviews the report.')
    await notifyAdmins({ type: body.type === 'no_show' ? 'application_no_show' : 'application_problem', title: body.type === 'no_show' ? 'No-show report received' : 'Application problem reported', message: 'A report is ready for PESO review in Referrals and applications.', link: '/peso-referrals', metadata: { referralId: String(referral._id), reportId: entry._id } })
    return { ok: true, id: entry._id, responseDeadline: entry.responseDeadline }
  }
  async function respondNoShow(actor, reportId, body) {
    if (actor.role !== 'Applicant') fail('FORBIDDEN', 'Applicants only.', 403)
    const account = await actorAccount(actor)
    const response = reasonText(body.response)
    const entry = await ApplicationReport.findOneAndUpdate({ _id: reportId, applicantId: account._id, type: 'no_show', byRole: 'Employer', status: 'pending', responseDeadline: { $gte: now() } }, { $set: { status: 'responded', applicantResponse: response, respondedAt: now() } }, { returnDocument: 'after' }).lean()
    if (!entry) fail('RESPONSE_UNAVAILABLE', 'The response deadline has passed or the report has already been answered.')
    const referral = await Referral.findById(entry.referralId).lean()
    if (referral) await event(referral, 'applicant_responded_to_report', 'no_show_responded', 'Applicant')
    await notifyAdmins({ type: 'no_show_response_received', title: 'Applicant response received', message: 'An applicant responded to a no-show report. Review the statement before deciding.', link: '/peso-referrals' })
    return { ok: true }
  }
  async function reviewReport(admin, reportId, body) {
    const reason = reasonText(body.reason)
    if (!['confirmed', 'dismissed', 'resolved'].includes(body.decision)) fail('INVALID_ACTION', 'Choose a report decision.', 403)
    const existing = await ApplicationReport.findById(reportId).lean()
    if (!existing) fail('REPORT_UNAVAILABLE', 'Report unavailable.')
    if (existing.type === 'problem' && body.decision !== 'resolved' || existing.type === 'no_show' && body.decision === 'resolved') fail('INVALID_ACTION', 'Choose a decision for this report type.', 403)
    if (existing.type === 'no_show' && body.decision === 'confirmed' && existing.status === 'pending' && +existing.responseDeadline > +now()) fail('RESPONSE_WINDOW_OPEN', 'Wait for the applicant response or the 7-day response deadline.')
    if (existing.type === 'no_show' && body.decision === 'confirmed' && (!existing.interviewId || existing.byRole !== 'Employer')) fail('INVALID_REPORT', 'Only an employer report tied to an interview can be confirmed.', 403)
    if (!['pending', 'responded', body.decision].includes(existing.status)) fail('REPORT_ALREADY_REVIEWED', 'This report already has a final decision.')
    const changed = await ApplicationReport.findOneAndUpdate({ _id: reportId, status: { $in: ['pending', 'responded'] } }, { $set: { status: body.decision, reviewReason: reason, reviewedBy: admin.email, reviewedAt: now() } }, { returnDocument: 'after' }).lean()
    if (!changed && (await ApplicationReport.findById(reportId).select('status').lean())?.status !== body.decision) fail('REPORT_ALREADY_REVIEWED', 'This report already has a different final decision.')
    if (existing.type === 'no_show' && body.decision === 'confirmed') {
      await recordTrustEvent(Applicant, { applicantId: existing.applicantId, key: `no-show:${reportId}`, type: 'confirmed_no_show', by: admin.email, reason, at: now() })
      await Interview.updateOne({ _id: existing.interviewId }, { $set: { status: 'missed' } })
    }
    if (changed) {
      await audit({ action: `report_${body.decision}`, reportId, applicantId: existing.applicantId, by: admin.email, reason })
      const referral = await Referral.findById(existing.referralId).lean()
      if (referral) { await event(referral, `peso_${existing.type}_report_${body.decision}`, existing.type === 'no_show' ? `no_show_${body.decision}` : referral.status, 'PESO'); await messageApplicant(referral, 'application_report_reviewed', `PESO ${body.decision === 'confirmed' ? 'confirmed' : body.decision === 'dismissed' ? 'dismissed' : 'resolved'} the report. View the outcome in My applications.`) }
    }
    return { ok: true }
  }
  async function suspendApplicant(admin, applicantId, body) {
    id(applicantId); const reason = reasonText(body.reason)
    if (typeof body.suspended !== 'boolean') fail('INVALID_ACTION', 'Choose suspend or lift suspension.', 403)
    const entry = { action: body.suspended ? 'applicant_application_suspended' : 'applicant_application_resumed', by: admin.email, reason, at: now() }
    const account = await Applicant.findOneAndUpdate({ _id: applicantId, deletedAt: { $exists: false } }, { ...(body.suspended ? { $set: { applyingSuspendedAt: now(), applyingSuspensionReason: reason } } : { $unset: { applyingSuspendedAt: '', applyingSuspensionReason: '' } }), $push: { applyingSuspensionHistory: entry } }, { returnDocument: 'after' }).lean()
    if (!account || account.deletedAt) fail('APPLICANT_UNAVAILABLE', 'Applicant unavailable.', 403)
    if (!body.suspended) await ApplicationAppeal.updateMany({ applicantId, status: 'pending' }, { $set: { status: 'resolved', reviewedAt: now() } })
    await audit({ ...entry, applicantId: account._id })
    await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'application_suspension_changed', title: body.suspended ? 'Applications paused by PESO' : 'Application suspension lifted', message: `${body.suspended ? 'You can still sign in and view your data. Applying and accepting new invitations are paused.' : 'You can apply and accept new invitations again.'} Reason: ${reason}${body.suspended ? ' You can submit an appeal from My applications.' : ''}`, link: '/my-applications', email: true })
    return { ok: true }
  }
  async function appeal(actor, body) {
    if (actor.role !== 'Applicant') fail('FORBIDDEN', 'Applicants only.', 403)
    const account = await actorAccount(actor)
    if (!account.applyingSuspendedAt) fail('NO_SUSPENSION', 'There is no application suspension to appeal.')
    await ApplicationAppeal.create({ applicantId: account._id, reason: reasonText(body.reason) })
    await notifyAdmins({ type: 'application_suspension_appeal', title: 'Application suspension appeal', message: 'An applicant submitted an appeal. Review it in Referrals and applications.', link: '/peso-referrals' })
    return { ok: true }
  }
  async function reviewApplication(admin, applicationId, body) {
    const reason = reasonText(body.reason)
    const application = await JobApplication.findById(id(applicationId)).select('+reviewQueue').lean()
    if (!application || application.deliveryStatus !== 'pending_admin' || application.reviewQueue !== 'low_trust') fail('APPLICATION_NOT_QUEUED', 'This application is not awaiting this review.')
    if (body.decision === 'approved') await referralWorkflow.submit({ email: application.applicantEmail, jobId: application.jobId, source: 'admin', adminId: admin.id, adminEmail: admin.email, reason, ip: 'admin-review' })
    else if (body.decision === 'declined') {
      const result = await JobApplication.updateOne({ _id: application._id, deliveryStatus: 'pending_admin' }, { $set: { deliveryStatus: 'declined_by_admin', lastActivityAt: now() }, $push: { history: { action: 'application_review_completed', status: 'declined_by_admin', by: admin.email, reason, at: now() } } })
      if (!result.modifiedCount) fail('APPLICATION_CHANGED', 'The application was already reviewed.')
    } else fail('INVALID_ACTION', 'Choose approve or decline.', 403)
    await audit({ action: `application_review_${body.decision}`, applicationId: application._id, applicantId: application.applicantId, by: admin.email, reason })
    await notify({ recipient: { id: application.applicantId, role: 'Applicant' }, type: 'application_review_update', title: 'Application review complete', message: 'PESO has completed its review. Open My applications for the current status.', link: '/my-applications' })
    return { ok: true }
  }
  async function confirmEvent(admin, body) {
    const reason = reasonText(body.reason); id(body.applicantId)
    if (!await Applicant.exists({ _id: body.applicantId, deletedAt: { $exists: false } })) fail('APPLICANT_UNAVAILABLE', 'Applicant unavailable.', 403)
    let key, confirmedMeeting
    if (body.type === 'attended_interview' || body.type === 'late_cancellation') {
      const meeting = await Interview.findOne({ _id: id(body.referenceId), applicantId: body.applicantId }).lean()
      if (!meeting) fail('INTERVIEW_UNAVAILABLE', 'Interview unavailable.')
      if (body.type === 'attended_interview') {
        if (!['held', 'attended'].includes(meeting.status)) fail('INTERVIEW_NOT_HELD', 'The employer must first record the interview as held.')
        await Interview.updateOne({ _id: meeting._id }, { $set: { status: 'attended' } })
      } else if (meeting.status !== 'cancelled' || meeting.cancelledBy !== 'Applicant' || !meeting.cancelledAt || +meeting.scheduledAt - +meeting.cancelledAt > DAY || +meeting.scheduledAt < +meeting.cancelledAt) fail('NOT_LATE_CANCELLATION', 'This is not an applicant cancellation within 24 hours of the interview.')
      key = `${body.type}:${meeting._id}`
      confirmedMeeting = meeting
    } else if (body.type === 'hired') {
      const hire = await HireReport.findOne({ _id: id(body.referenceId), applicantId: body.applicantId, reportedByRole: { $ne: 'Applicant' }, status: { $in: ['hired', 'deployed'] } }).lean()
      if (!hire) fail('HIRE_UNAVAILABLE', 'An employer hire/deployment report is required.')
      key = `hire:${hire.jobId}:${hire.applicantId}`
    } else if (body.type === 'manual_adjustment') key = body.eventKey && /^[a-z0-9-]{8,100}$/i.test(body.eventKey) ? `manual:${body.eventKey}` : fail('EVENT_KEY_REQUIRED', 'A unique adjustment key is required.', 403)
    else fail('INVALID_TRUST_EVENT', 'Confirm a supported event. No-shows must use report review.', 403)
    const applied = await recordTrustEvent(Applicant, { applicantId: body.applicantId, key, type: body.type, delta: body.type === 'manual_adjustment' ? body.delta : TRUST_DELTAS[body.type], by: admin.email, reason, at: now() })
    if (applied && confirmedMeeting) {
      const referral = await Referral.findById(confirmedMeeting.referralId).lean()
      if (referral) await event(referral, body.type === 'attended_interview' ? 'peso_confirmed_interview_attendance' : 'peso_confirmed_late_cancellation', body.type === 'attended_interview' ? 'interview_attended' : 'interview_cancelled', 'PESO')
    }
    if (applied) await audit({ action: 'applicant_event_confirmed', applicantId: new mongoose.Types.ObjectId(body.applicantId), eventKey: key, type: body.type, by: admin.email, reason })
    return { ok: true, applied }
  }
  return { actorAccount, ownedReferral, invite, respondInterview, held, report, respondNoShow, reviewReport, suspendApplicant, appeal, reviewApplication, confirmEvent }
}
