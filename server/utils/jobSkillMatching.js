import { applicantJobSkills } from '../../shared/jobSkills.js'
import { escapeRegex } from './paginate.js'

export function applicantSkillQuery(skills) {
  // Anchors prevent partial words such as "Java" from matching "JavaScript".
  const patterns = applicantJobSkills(skills).map((skill) => `\\s*${skill.split(' ').map(escapeRegex).join('[-/\\s]+')}\\s*`)
  const regex = patterns.length ? `^(?:${patterns.join('|')})$` : '(?!)'
  return {
    filter: { skills: { $in: patterns.map((pattern) => new RegExp(`^${pattern}$`, 'i')) } },
    countExpression: { $size: { $filter: {
      input: { $setUnion: [{ $ifNull: ['$skills', []] }, []] }, as: 'skill',
      cond: { $regexMatch: { input: '$$skill', regex, options: 'i' } },
    } } },
  }
}
