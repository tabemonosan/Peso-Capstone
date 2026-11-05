const common = {
  complete: { title: 'Finish your registration', tips: ['Complete the missing information shown below.', 'Save your changes so PESO can check your account.'] },
  notify: { title: 'Keep track of updates', tips: ['Open a notification to view the related application or document.', 'Check here for interview schedules and requests from PESO.'] },
}

export const PAGE_GUIDES = {
  Applicant: {
    ...common,
    dashboard: { title: 'Welcome to your workspace', tips: ['Check your account and document status here.', 'Once verified, browse jobs and follow your applications.', 'Use the navigation above to explore each page.'] },
    profile: { title: 'Keep your profile up to date', tips: ['Update your contact information, skills, and qualifications.', 'Open Manage my documents to view or correct your verification files.'] },
    documents: { title: 'Check your verification documents', tips: ['Your NSRP is the reference for your birth certificate and ID checks.', 'Upload clear copies and both sides of your valid ID.', 'If a document is flagged, read the feedback and upload a correction or explain a difference.'] },
    jobs: { title: 'Find a job that fits', tips: ['Use the filters to narrow jobs by location and skills.', 'Open a job to read its requirements before applying.', 'Track your next steps in My applications.'] },
    'my-applications': { title: 'Follow your applications', tips: ['Check application decisions, referrals, and interview schedules.', 'Open an application to see its available actions and next steps.'] },
    'my-reputation': { title: 'Understand your reputation', tips: ['View your points and the events that changed them.', 'Read the policy to understand how points are recorded.'] },
    'employment-reports': { title: 'Share your employment updates', tips: ['Report when you are hired and keep your employment details current.', 'PESO checks reports against the employer’s information.'] },
    reputation: { title: 'View your reviews', tips: ['Read feedback related to your employment.', 'Review ratings are separate from reputation points.'] },
  },
  Employer: {
    ...common,
    dashboard: { title: 'Welcome to your employer workspace', tips: ['Track your job postings, applicants, and hiring activity here.', 'Use Job Postings to create vacancies and manage applicants.'] },
    verification: { title: 'Track your registration review', tips: ['Check your registration status and any PESO feedback.', 'Complete requested corrections so PESO can review your account.'] },
    profile: { title: 'Introduce your company', tips: ['Keep your company details and contact information current.', 'Save your profile changes when you are finished.'] },
    employer: { title: 'Manage your vacancies', tips: ['Create a posting with clear requirements and job details.', 'Submit it for PESO review, then manage applicants once it is approved.'] },
    referrals: { title: 'Keep hiring reports current', tips: ['Review referrals and update applicants’ hiring outcomes.', 'Accurate reports help PESO confirm employment records.'] },
    reviews: { title: 'Review employment feedback', tips: ['Select the relevant employment record to view or submit feedback.', 'Use specific, factual comments about the work experience.'] },
  },
}

export function pageGuide(role, view) {
  const key = ['home', 'all-dashboard'].includes(view) ? 'dashboard' : view
  const entries = Object.hasOwn(PAGE_GUIDES, role) ? PAGE_GUIDES[role] : null
  const content = entries && Object.hasOwn(entries, key) ? entries[key] : null
  return content ? { key, ...content } : null
}
