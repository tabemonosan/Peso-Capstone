// Registration completeness rules (computed, never stored so they can't go stale).
// Applicant complete = name/location/summary + NSRP form, birth certificate, valid ID #1, resume
// (7 required steps; skills are optional and NOT part of the checklist).
// Employer complete = company name, contact name, phone, location + NSRP registration PDF on file.
// The server is the source of truth: the UI renders whatever this returns.
import fs from 'fs'

const latestVersion = (slot) => (slot?.versions?.length ? slot.versions[slot.versions.length - 1] : null)

export function registrationChecklist(user, type, extras = {}) {
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0
  if (type === 'Applicant') {
    const docs = user.verificationDocuments || {}
    const hasDoc = (key) => Boolean(latestVersion(docs[key]))
    return [
      { key: 'name', label: 'Full name', done: (hasText(user.profile?.firstName) && hasText(user.profile?.lastName)) || hasText(user.profile?.name), link: 'profile' },
      { key: 'location', label: 'Location', done: hasText(user.profile?.location), link: 'profile' },
      { key: 'summary', label: 'Short bio / about me', done: hasText(user.profile?.summary), link: 'profile' },
      { key: 'nsrpForm', label: 'NSRP Registration Form', done: hasDoc('nsrpForm'), link: 'documents' },
      { key: 'birthCertificate', label: 'Birth Certificate', done: hasDoc('birthCertificate'), link: 'documents' },
      { key: 'validId1', label: 'Valid ID', done: hasDoc('validId1'), link: 'documents' },
      { key: 'resume', label: 'Resume (PDF, DOCX, JPG, or PNG)', done: hasDoc('resume'), link: 'documents' },
    ]
  }
  if (type === 'Employer') {
    const requirementsFile = extras.requirementsFile
    const hasRequirementsFile = Boolean(
      requirementsFile?.data
      || (requirementsFile?.path && fs.existsSync(requirementsFile.path)),
    )
    return [
      { key: 'companyName', label: 'Company name', done: hasText(user.companyName), link: 'profile' },
      { key: 'contactName', label: 'Contact person', done: hasText(user.contactName), link: 'profile' },
      { key: 'phone', label: 'Contact number', done: /^\d{11}$/.test(String(user.phone || '')), link: 'profile' },
      { key: 'location', label: 'Company location', done: hasText(user.profile?.location) || hasText(extras.requestLocation), link: 'profile' },
      { key: 'requirements', label: 'NSRP registration PDF', done: hasRequirementsFile, link: 'dashboard' },
    ]
  }
  return []
}

export function registrationProgress(user, type, extras) {
  const checklist = registrationChecklist(user, type, extras)
  const done = checklist.filter((item) => item.done).length
  return { complete: checklist.length > 0 && done === checklist.length, done, total: checklist.length, checklist }
}
