import { normalizeSkillLabel } from './nsrpSkills.js'

// Earlier online registrations copied occupation + NSRP skills into the bio.
// Only recognize that exact generated value; never rewrite a personal biography.
export function applicantProfileContent(profile = {}) {
  const selected = (Array.isArray(profile.skills) ? profile.skills : []).filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim())
  const nsrpSkills = (Array.isArray(profile.nsrp?.skills) ? profile.nsrp.skills : []).filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim())
  const summary = typeof profile.summary === 'string' ? profile.summary : ''
  const generated = [profile.nsrp?.occupation1, ...nsrpSkills].filter(Boolean).join(' · ')
  const legacy = profile.summarySource !== 'personal' && nsrpSkills.length > 0 && summary.trim() === generated.trim()
  const skills = [...new Map((legacy ? [...selected, ...nsrpSkills] : selected).map((skill) => [normalizeSkillLabel(skill), skill])).values()]
  return { skills, summary: legacy ? '' : summary }
}
