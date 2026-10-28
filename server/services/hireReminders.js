import { Employer, HireReport, Notification, Referral } from '../models/collections.js'
import { notify } from './notify.js'
import { redactString } from '../utils/redact.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const REMINDER_AFTER_DAYS = 7
export const REMINDER_REPEAT_DAYS = 7

// Reminds employers about accepted referrals that still have no hire report.
// A referral is reminded at most once per REMINDER_REPEAT_DAYS.
export async function sendHireReportReminders({ now = new Date(), notifyFn = notify } = {}) {
  const acceptedBefore = new Date(now.getTime() - REMINDER_AFTER_DAYS * DAY_MS)
  const remindedSince = new Date(now.getTime() - REMINDER_REPEAT_DAYS * DAY_MS)

  const referrals = await Referral.find({ status: 'accepted', updatedAt: { $lte: acceptedBefore } }).lean()
  let sent = 0
  for (const referral of referrals) {
    const reported = await HireReport.exists({ referralId: referral._id })
    if (reported) continue
    const recent = await Notification.exists({
      type: 'hire_report_reminder',
      'recipient.id': referral.employerId,
      'metadata.referralId': String(referral._id),
      createdAt: { $gte: remindedSince },
    })
    if (recent) continue
    const employer = await Employer.findById(referral.employerId).select('email').lean()
    if (!employer) continue
    const result = await notifyFn({
      recipient: { id: employer._id, role: 'Employer', email: employer.email },
      type: 'hire_report_reminder',
      title: 'Hire report reminder',
      message: 'You accepted a referral but have not submitted a hire report yet. Please report the outcome.',
      link: '/referrals',
      email: true,
      metadata: { referralId: String(referral._id), jobId: String(referral.jobId), applicantId: String(referral.applicantId) },
    })
    if (result) sent += 1
  }
  return sent
}

export function startHireReportReminders(intervalMs = DAY_MS) {
  const run = () => sendHireReportReminders().catch((err) => console.error('Hire report reminders failed:', redactString(err?.message || String(err))))
  setTimeout(run, 30 * 1000).unref?.()
  return setInterval(run, intervalMs).unref?.()
}
