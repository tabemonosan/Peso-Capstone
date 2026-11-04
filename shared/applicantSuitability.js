import { jobSkillMatchCount } from './jobSkills.js'

export const SUITABILITY_VERSION = '2026-11-02.1'
export const SUITABILITY_WEIGHTS = { skills: 40, workExperience: 25, technicalTraining: 15, eligibility: 10, languages: 5, availability: 5 }
const text = (value) => typeof value === 'string' ? value.trim() : ''
const rows = (value) => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object').slice(0, 50) : []
const yes = (value) => value === true || value === 'true'
const pick = (row, keys) => Object.fromEntries(keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]))

// This whitelist is also the employer-visible evidence. Never return the full
// NSRP, identity numbers, home address, or demographic fields to employers.
export function applicantQualifications(applicant = {}) {
  const profile = applicant.profile || {}
  const nsrp = profile.nsrp || {}
  const sourceRows = (key) => rows(Array.isArray(nsrp[key]) ? nsrp[key] : profile[key])
  return {
    skills: (Array.isArray(profile.skills) ? profile.skills : Array.isArray(nsrp.skills) ? nsrp.skills : []).filter((entry) => typeof entry === 'string'),
    technicalTraining: sourceRows('technicalTraining').map((row) => ({
      course: text(row.course || row.name), institution: text(row.institution || row.provider), certificate: text(row.certificate),
      ...pick(row, ['fromDate', 'toDate', 'year']),
    })),
    eligibility: sourceRows('eligibility').map((row) => pick(row, ['eligibility', 'rating', 'examDate', 'validUntil'])),
    languages: sourceRows('languages').map((row) => ({
      name: row.name === 'Others' ? text(row.otherName) : text(row.name),
      ...Object.fromEntries(['read', 'write', 'speak', 'understand'].map((key) => [key, yes(row[key])])),
    })).filter((row) => row.name && ['read', 'write', 'speak', 'understand'].some((key) => row[key])),
    workExperience: sourceRows('workExperience').map((row) => ({
      company: text(row.company), position: text(row.position), fromDate: text(row.fromDate || row.startDate), toDate: text(row.toDate || row.endDate),
    })),
    ...(nsrp.willingImmediately === 'Yes' ? { immediatelyAvailable: true } : {}),
  }
}

const STOP = new Set(['the', 'and', 'for', 'with', 'work', 'working', 'experience', 'required', 'requirements', 'must', 'have', 'able', 'applicant', 'applicants', 'job', 'skills', 'skill', 'position', 'years', 'year', 'certificate', 'certification', 'training', 'course'])
const tokens = (value) => [...new Set(text(value).toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word)))]
const overlap = (evidence, target) => {
  const terms = tokens(target)
  const available = new Set(tokens(evidence))
  return terms.length ? terms.filter((term) => available.has(term)).length / terms.length : 0
}
function relevance(evidence, job) {
  return Math.max(0, overlap(evidence, job.title), ...(job.skills || []).filter((entry) => typeof entry === 'string').map((skill) => overlap(evidence, skill)), overlap(evidence, job.requirements))
}
const dateValue = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null
}
function workYears(entries, now) {
  const intervals = entries.map((entry) => [dateValue(entry.fromDate), entry.toDate === 'Present' || !entry.toDate ? +now : dateValue(entry.toDate)])
    .filter(([from, to]) => from !== null && to !== null && from <= to && from <= +now)
    .map(([from, to]) => [from, Math.min(to, +now)]).sort((a, b) => a[0] - b[0])
  const merged = []
  for (const interval of intervals) {
    const previous = merged.at(-1)
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1])
    else merged.push([...interval])
  }
  return merged.reduce((total, [from, to]) => total + to - from, 0) / (365.25 * 86400000)
}

const LANGUAGES = ['English', 'Filipino', 'Tagalog', 'Bikol', 'Bicol', 'Cebuano', 'Ilocano', 'Waray', 'Hiligaynon', 'Pangasinan', 'Kapampangan', 'Mandarin', 'Japanese', 'Korean', 'Spanish', 'Arabic', 'French', 'German']
const languageKey = (value) => ({ tagalog: 'filipino', bicol: 'bikol' }[value.toLowerCase()] || value.toLowerCase())

export function assessApplicantSuitability(job = {}, applicant = {}, { now = new Date() } = {}) {
  const qualifications = applicantQualifications(applicant)
  const components = []
  const add = (key, ratio, detail, applicable = true) => {
    const maximum = applicable ? SUITABILITY_WEIGHTS[key] : 0
    components.push({ key, points: Math.round(Math.max(0, Math.min(1, ratio)) * maximum * 10) / 10, maximum, detail })
  }
  const skillTotal = new Set((job.skills || []).filter((entry) => typeof entry === 'string').map((entry) => entry.trim().toLowerCase())).size
  const skillMatches = jobSkillMatchCount(job.skills, qualifications.skills)
  add('skills', skillTotal ? skillMatches / skillTotal : 0, `${skillMatches} of ${skillTotal} required skills match`, skillTotal > 0)

  const relevantWork = qualifications.workExperience.filter((row) => relevance(row.position, job) >= 0.5)
  const years = workYears(relevantWork, now)
  const expectedYears = /^Less than/i.test(text(job.experience)) ? 0.5 : Number.parseInt(job.experience, 10) || 0
  const roleRelevance = Math.max(0, ...relevantWork.map((row) => relevance(row.position, job)))
  const duration = expectedYears ? Math.min(1, years / expectedYears) : Number(relevantWork.length > 0)
  add('workExperience', relevantWork.length ? roleRelevance * 0.6 + duration * 0.4 : 0,
    relevantWork.length ? `${relevantWork.length} relevant role(s); ${Math.round(years * 10) / 10} recorded years (overlapping dates counted once)` : 'No relevant work experience recorded')

  const completedTraining = qualifications.technicalTraining.filter((row) => (!row.fromDate || (dateValue(row.fromDate) !== null && dateValue(row.fromDate) <= +now))
    && (!row.toDate || (dateValue(row.toDate) !== null && dateValue(row.toDate) <= +now)))
  const trainingRelevance = Math.max(0, ...completedTraining.map((row) => relevance(`${row.course} ${row.certificate}`, job)))
  add('technicalTraining', trainingRelevance, trainingRelevance ? 'Relevant technical training recorded' : 'No relevant past technical training recorded')

  const eligibilityRequired = /eligib|licen[sc]|certif|board|registration/i.test(text(job.requirements))
  const today = new Date(+now + 8 * 3600000).toISOString().slice(0, 10)
  const eligibleRows = qualifications.eligibility.filter((row) => (!row.validUntil || (dateValue(row.validUntil) !== null && row.validUntil >= today))
    && (!row.examDate || (dateValue(row.examDate) !== null && dateValue(row.examDate) <= +now)))
  const eligibilityRelevance = Math.max(0, ...eligibleRows.map((row) => relevance(text(row.eligibility), job)))
  add('eligibility', eligibilityRelevance, eligibilityRequired ? eligibilityRelevance ? 'Relevant current eligibility recorded' : 'No relevant current eligibility recorded' : 'No eligibility requirement stated in this posting', eligibilityRequired)

  const requirementText = ` ${tokens(job.requirements).join(' ')} `
  const requiredLanguages = [...new Set(LANGUAGES.filter((name) => requirementText.includes(` ${name.toLowerCase()} `)).map(languageKey))]
  const languageMatches = requiredLanguages.map((name) => Math.max(0, ...qualifications.languages.filter((row) => languageKey(row.name) === name).map((row) => ['read', 'write', 'speak', 'understand'].filter((key) => row[key]).length / 4)))
  add('languages', languageMatches.length ? languageMatches.reduce((sum, value) => sum + value, 0) / languageMatches.length : 0,
    requiredLanguages.length ? `${languageMatches.filter((count) => count > 0).length} of ${requiredLanguages.length} requested language(s) recorded` : 'No language requirement stated in this posting', requiredLanguages.length > 0)
  add('availability', qualifications.immediatelyAvailable ? 1 : 0, qualifications.immediatelyAvailable ? 'Available to work immediately' : 'Immediate availability not confirmed')

  const maximum = components.reduce((sum, item) => sum + item.maximum, 0)
  const points = components.reduce((sum, item) => sum + item.points, 0)
  return { version: SUITABILITY_VERSION, score: maximum ? Math.round(points / maximum * 100) : 0, components, qualifications, skillMatches, skillTotal }
}

export function rankJobApplicants(job, entries = [], getApplicant = (entry) => entry, options = {}) {
  return entries.map((entry, index) => ({ entry, index, suitability: assessApplicantSuitability(job, getApplicant(entry) || {}, options) }))
    .sort((a, b) => b.suitability.score - a.suitability.score || a.index - b.index)
    .map(({ entry, suitability }, index) => ({ ...entry, suitability: { ...suitability, rank: index + 1 } }))
}
