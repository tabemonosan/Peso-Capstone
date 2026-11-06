import { bachelorDegreeFromNsrp } from '../../shared/jobApplication.js'
import { loadDocumentFile } from '../utils/documentFiles.js'
import { readNsrpPdf } from './nsrpImportReader.js'
import { Applicant } from '../models/collections.js'

// Older generated registrations can retain their NSRP PDF without structured
// qualification answers. Share one cached read of the saved registration reference.
const recovered = new Map()
async function savedQualifications(applicant) {
  const version = applicant?.verificationDocuments?.nsrpForm?.versions?.at(-1)
  if (!version || !applicant?._id) return {}
  const key = `${applicant._id}:${version.version}:${version.uploadedAt || ''}`
  if (!recovered.has(key)) {
    if (recovered.size >= 100) recovered.delete(recovered.keys().next().value)
    const task = (async () => {
      const stored = await loadDocumentFile(applicant._id, 'nsrpForm', version.version)
      const legacy = !stored?.data && !version.data ? await Applicant.findById(applicant._id).select('+verificationDocuments.nsrpForm.versions.data').lean() : null
      const data = stored?.data || version.data || legacy?.verificationDocuments?.nsrpForm?.versions?.at(-1)?.data
      if (!data) return {}
      const result = await readNsrpPdf(Buffer.from(data))
      const keys = ['education', 'technicalTraining', 'eligibility', 'languages', 'workExperience', 'willingImmediately']
      return Object.fromEntries(keys.filter(key => result.answers[key] !== undefined).map(key => [key, result.answers[key]]))
    })()
    recovered.set(key, task)
    task.catch(() => recovered.delete(key))
  }
  try { return await recovered.get(key) }
  catch { return {} }
}

export async function recoverApplicantQualifications(applicant) {
  if (!applicant) return applicant
  const profile = applicant.profile || {}, nsrp = profile.nsrp || {}
  const keys = ['education', 'technicalTraining', 'eligibility', 'languages', 'workExperience']
  // Explicit NSRP answers take priority. Only recover missing legacy sections.
  const missing = keys.filter(key => !Array.isArray(nsrp[key]) && !(Array.isArray(profile[key]) && profile[key].length))
  if (!missing.length) return applicant
  const saved = await savedQualifications(applicant)
  const merged = { ...nsrp }
  for (const key of missing) if (Array.isArray(saved[key])) merged[key] = saved[key]
  if (merged.willingImmediately === undefined && saved.willingImmediately !== undefined) merged.willingImmediately = saved.willingImmediately
  const enriched = { ...profile, nsrp: merged }
  for (const key of ['education', 'technicalTraining', 'workExperience']) {
    if (!profile[key]?.length && merged[key]?.length) enriched[key] = merged[key]
  }
  return { ...applicant, profile: enriched }
}

export async function applicantDegree(applicant) {
  const profile = applicant?.profile || {}
  const education = Array.isArray(profile.nsrp?.education) ? profile.nsrp.education : profile.education
  if (Array.isArray(education) && education.some(row => row?.school || row?.course || row?.year)) return bachelorDegreeFromNsrp(profile)
  const saved = await savedQualifications(applicant)
  return bachelorDegreeFromNsrp({ nsrp: { education: saved.education || [] } })
}
