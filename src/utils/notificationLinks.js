const destinations = {
  Employer: {
    '/referrals': ['referrals', 'View applications and referrals'],
    '/jobs': ['employer', 'View job postings'],
    '/employer': ['employer', 'View job postings'],
    '/profile': ['profile', 'View company profile'],
    '/verification': ['verification', 'View account verification'],
  },
  Applicant: {
    '/my-applications': ['my-applications', 'Open My applications'],
    '/my-reputation': ['my-reputation', 'View my reputation'],
    '/jobs': ['jobs', 'View job applications'],
    '/employment-reports': ['my-applications', 'Open My applications'],
    '/profile': ['profile', 'View my profile'],
  },
  Admin: {
    '/peso-referrals': ['peso-referrals', 'Open referrals and applications'],
    '/jobs': ['jobs', 'Open job postings'],
    '/requests': ['requests', 'Open employer requests'],
    '/employment-updates': ['employment-updates', 'Open hiring updates'],
    '/account-deletions': ['account-deletions', 'Open account deletion requests'],
    '/employers': ['employers', 'View employers'],
    '/applicants': ['applicants', 'View applicants'],
    '/verification-rules': ['verification-rules', 'Open verification rules'],
    '/verification-flagged': ['verification-flagged', 'Open flagged documents'],
    '/verification-auto': ['verification-auto', 'Open automatic approvals'],
  },
}
export function notificationDestination(notification, role) {
  const raw = notification?.link || notification?.linkPath
  // Only known internal destinations become links; notification text is never HTML.
  if (raw != null && typeof raw !== 'string') return null
  if (raw && (!raw.startsWith('/') || raw.startsWith('//'))) return null
  const path = raw?.split(/[?#]/)[0].replace(/\/+$/, '')
  const legacy = role === 'Employer' && ['referral_received', 'application_withdrawn', 'employer_application_access'].includes(notification?.type || notification?.kind) ? '/referrals' : null
  const target = destinations[role]?.[path || legacy]
  return target ? { view: target[0], label: target[1], href: `?notificationView=${encodeURIComponent(target[0])}` } : null
}
export function notificationViewFromQuery(role, search) {
  const requested = new URLSearchParams(search).get('notificationView')
  const view = role === 'Applicant' && requested === 'employment-reports' ? 'my-applications' : requested
  return Object.values(destinations[role] || {}).some(([allowed]) => allowed === view) ? view : null
}
