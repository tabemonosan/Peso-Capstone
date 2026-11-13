import { normalizeSkillLabel } from './nsrpSkills.js'
import { canonicalJobSkill } from './jobSkills.js'

// "Others" is a checkbox category; the specified skills belong on the profile.
export function nsrpProfileSkills(answers = {}) {
  const skills = Array.isArray(answers.skills) ? answers.skills : []
  const specified = typeof answers.othersText === 'string'
    ? answers.othersText.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean) : []
  return [...new Map(skills.flatMap(skill => {
    if (typeof skill !== 'string' || !skill.trim()) return []
    return normalizeSkillLabel(skill) === 'others' ? specified : [skill.trim()]
  }).map(skill => {
    const label = canonicalJobSkill(skill) || skill
    return [normalizeSkillLabel(label), label]
  })).values()]
}

// Earlier online registrations copied occupation + NSRP skills into the bio.
// Only recognize that exact generated value; never rewrite a personal biography.
export function applicantProfileContent(profile = {}) {
  const selected = (Array.isArray(profile.skills) ? profile.skills : []).filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim())
  const nsrpSkills = (Array.isArray(profile.nsrp?.skills) ? profile.nsrp.skills : []).filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim())
  const summary = typeof profile.summary === 'string' ? profile.summary : ''
  const generated = [profile.nsrp?.occupation1, ...nsrpSkills].filter(Boolean).join(' · ')
  const legacy = profile.summarySource !== 'personal' && nsrpSkills.length > 0 && summary.trim() === generated.trim()
  const skills = nsrpProfileSkills({ skills: legacy ? [...selected, ...nsrpSkills] : selected, othersText: profile.nsrp?.othersText })
  return { skills, summary: legacy ? '' : summary }
}
