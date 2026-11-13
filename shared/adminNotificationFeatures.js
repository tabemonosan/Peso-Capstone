import { adminViewAllowed } from './adminAccess.js'

export const ADMIN_NOTIFICATION_FEATURES = ['dashboard', 'report-maker', 'employers', 'applicants', 'requests', 'account-deletions', 'activity-logs', 'internal-accounts', 'review-notes', 'email-delivery', 'verification-flagged', 'verification-auto', 'verification-rules', 'jobs', 'job-titles', 'employment-updates', 'peso-referrals']
const typeTargets = {
  new_application: 'peso-referrals', hire_report_submitted: 'employment-updates',
  account_deletion_requested: 'account-deletions', applicant_registration_pending: 'applicants',
  employer_request: 'requests', review_note_added: 'review-notes',
}
export function adminNotificationFeature(notification) {
  const type = notification.type || notification.kind || ''
  if (typeTargets[type]) return typeTargets[type]
  const raw = notification.link || notification.linkPath || ''
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null
  const feature = raw.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')
  return ADMIN_NOTIFICATION_FEATURES.includes(feature) ? feature : null
}
export const canReadNotificationFeature = (user, feature) => user.role === 'Admin' && ADMIN_NOTIFICATION_FEATURES.includes(feature) && adminViewAllowed(user, feature)
