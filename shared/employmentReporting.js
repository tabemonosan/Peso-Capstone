export const EMPLOYER_OUTCOMES = ['hired', 'not_hired', 'deployed']
export const APPLICANT_OUTCOMES = ['hired', 'deployed']
export const outcomeLabel = (status) => ({ hired: 'Hired', not_hired: 'Not hired', deployed: 'Deployed' }[status] || status)

// The same event can be copied to application, referral and interview histories.
// Reconcile those copies while preserving repeated events within one history.
export function mergeApplicationHistory(...histories) {
  const events = []
  histories.forEach((history, source) => {
    for (const entry of Array.isArray(history) ? history : []) {
      let status = entry.status
      if ((entry.action || '').includes('interview') && ['invited', 'confirmed', 'declined', 'cancelled', 'held', 'attended'].includes(status)) status = `interview_${status}`
      if (status === 'interview_reschedule_requested') status = 'reschedule_requested'
      const time = +new Date(entry.at)
      const duplicate = events.some(previous => previous.action === entry.action && previous.status === status && (
        String(previous.at) === String(entry.at) || previous.source !== source && Number.isFinite(time) && Math.abs(+new Date(previous.at) - time) <= 1000
      ))
      if (!duplicate) events.push({ action: entry.action, status, at: entry.at, by: entry.by, reason: entry.reason, source })
    }
  })
  return events.sort((a, b) => new Date(a.at) - new Date(b.at)).map(({ source: _source, ...entry }) => entry)
}

// Participant timelines expose events, never private admin/report reasons.
export const publicApplicationHistory = (history = []) => mergeApplicationHistory(history).map(({ action, status, at }) => ({ action, status, at }))

// Employers receive a referral summary, never the NSRP answers or document data.
export function employerApplicantSummary(applicant) {
  if (!applicant) return null
  const profile = applicant.profile || {}
  const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]))
  return {
    _id: applicant._id,
    email: applicant.email,
    ...(applicant.resumeFile?.originalName ? { resumeFile: pick(applicant.resumeFile, ['originalName', 'mimetype', 'size', 'uploadedAt']) } : {}),
    phone: applicant.phone || profile.phone || profile.nsrp?.cellphone || '',
    profile: {
      ...pick(profile, ['firstName', 'middleName', 'lastName', 'suffix', 'name', 'skills', 'traits', 'summary', 'profileImage', 'bannerImage', 'portfolioLinks']),
      location: [profile.addressCity || profile.nsrp?.addressCity, profile.addressProvince || profile.nsrp?.addressProvince].filter(Boolean).join(', '),
      education: (profile.education || []).map((entry) => pick(entry, ['level', 'school', 'course', 'year'])),
      technicalTraining: (profile.technicalTraining || []).map((entry) => ({ ...pick(entry, ['name', 'course', 'year']), provider: entry.provider || entry.institution || '' })),
      workExperience: (profile.workExperience || []).map((entry) => ({ ...pick(entry, ['company', 'position']), startDate: entry.startDate || entry.fromDate || '', endDate: entry.endDate || entry.toDate || '' })),
    },
  }
}
