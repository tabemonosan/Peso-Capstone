export const EMPLOYER_OUTCOMES = ['hired', 'not_hired', 'deployed']
export const APPLICANT_OUTCOMES = ['hired', 'deployed']
export const outcomeLabel = (status) => ({ hired: 'Hired', not_hired: 'Not hired', deployed: 'Deployed' }[status] || status)

// Employers receive a referral summary, never the NSRP answers or document data.
export function employerApplicantSummary(applicant) {
  if (!applicant) return null
  const profile = applicant.profile || {}
  const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]))
  return {
    _id: applicant._id,
    email: applicant.email,
    phone: applicant.phone || profile.phone || profile.nsrp?.cellphone || '',
    profile: {
      ...pick(profile, ['firstName', 'middleName', 'lastName', 'suffix', 'name', 'skills', 'traits', 'summary', 'profileImage', 'bannerImage']),
      location: [profile.addressCity || profile.nsrp?.addressCity, profile.addressProvince || profile.nsrp?.addressProvince].filter(Boolean).join(', '),
      education: (profile.education || []).map((entry) => pick(entry, ['level', 'school', 'course', 'year'])),
      technicalTraining: (profile.technicalTraining || []).map((entry) => pick(entry, ['name', 'provider', 'course', 'year'])),
      workExperience: (profile.workExperience || []).map((entry) => pick(entry, ['company', 'position', 'startDate', 'endDate'])),
    },
  }
}
