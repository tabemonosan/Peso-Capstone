const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  employers: 'M4 7h16v14H4z M8 7V3h8v4 M4 12h16 M10 12v3h4v-3',
  applicants: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  requests: 'M9 3H5v18h14V3h-4 M9 2h6v4H9z M8 11h8 M8 15h6',
  'account-deletions': 'M4 7h16 M9 7V3h6v4 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
  jobs: 'M3 7h18v14H3z M8 7V3h8v4 M3 12a24 24 0 0 0 18 0 M10 12v3h4v-3',
  'job-titles': 'M4 5h6 M14 5h6 M4 12h6 M14 12h6 M4 19h6 M14 19h6',
  'employment-updates': 'M5 3h14v18H5z M8 8h8 M8 12l2 2 5-5 M8 18h8',
  'peso-referrals': 'M4 21h16 M6 17V9 M12 17V3 M18 17v-5',
  complete: 'M9 3H5v18h14V3h-4 M9 2h6v4H9z M8 12l3 3 5-6',
  verification: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
  home: 'M3 10l9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8',
  referrals: 'M4 21h16 M6 17V9 M12 17V3 M18 17v-5',
  reviews: 'M12 3l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z',
  notify: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  clock: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check: 'M6 12l4 4 8-8 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
}

export default function PortalNavIcon({ name, className = '' }) {
  const icon = name === 'employer' ? 'jobs' : name === 'reputation' ? 'reviews' : name === 'employment-reports' ? 'employment-updates' : name
  return <svg className={`portal-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[icon] || paths.requests} /></svg>
}
