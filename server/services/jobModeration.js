import mongoose from 'mongoose'

export const JOB_POLICY_VERSION = '2026-11-04.2'
export const JOB_MODERATION_DEFAULTS = { enabled: true }
const DAY = 86400000
const normalize = value => String(value || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase()
const rules = [
  ['prohibited_mlm', 'Prohibited content', 'Possible MLM or recruitment-based earning scheme.', /\b(?:mlm|multi[ -]?level marketing|pyramid scheme|downlines?|recruit (?:members|recruits) to earn)\b/],
  ['applicant_payment', 'Prohibited content', 'Possible applicant payment or investment requirement.', /\b(?:(?:pay|send|deposit|invest|magbayad)\b.{0,45}\b(?:fee|deposit|investment|registration|gcash|money|bayad)|(?:registration|placement|processing|joining|training) fee|buy (?:a |the )?starter kit)\b/],
  ['illegal_activity', 'Prohibited content', 'Possible illegal activity or document fraud.', /\b(?:money laundering|money mule|fake (?:ids?|documents?|passports?)|sell(?:ing)? illegal drugs|drug trafficking|illegal gambling|identity theft|stolen (?:accounts|credit cards))\b/],
  ['explicit_content', 'Prohibited content', 'Possible explicit sexual services or content.', /\b(?:porn(?:ography|ographic)?|sexual services|escort services|nude (?:model|photos?|videos?)|adult (?:cam|entertainment)|cybersex)\b/],
  ['age_restriction', 'Equal opportunity', 'Age preference or restriction requires PESO review.', /\b(?:(?:ages?|aged|edad)\s*:?\s*(?:\d{1,3}\s*(?:[-–—]|to|hanggang)\s*\d{1,3}|(?:under|below|above|over)\s*\d{1,3})|\d{1,3}\s*(?:[-–—]|to)\s*\d{1,3}\s*(?:years? old|y\/?o)|(?:at least|at most|under|below|above|over|no older than|no younger than|not older than|not younger than)\s*\d{1,3}\s*(?:years?(?:\s+old)?|y\/?o|only)|(?:minimum|maximum|min|max)\s+age\s*(?:of|is|:)?\s*\d{1,3}|\d{1,3}\s*(?:\+|and (?:above|below|older|younger))\s*(?:years?(?:\s+old)?|y\/?o)|young (?:and energetic|applicants?))\b/],
  ['gender_restriction', 'Equal opportunity', 'Gender or civil-status restriction requires PESO review.', /\b(?:(?:male|female|men|women|single|unmarried)\s+(?:only|required|preferred|applicants?)|only\s+(?:male|female|men|women)|(?:must be|looking for|seeking)\s+(?:male|female|single|unmarried)|(?:lalaki|babae|binata|dalaga)\s+(?:lamang|lang|only))\b/],
  ['protected_trait_restriction', 'Equal opportunity', 'Possible exclusion based on protected or personal characteristics.', /\b(?:(?:no|not accepting|exclude)\s+(?:pwd|disabled|pregnant|muslims?|christians?|lgbt\w*)|(?:christian|catholic|muslim)\s+(?:only|required|preferred)|(?:must be|looking for)\s+(?:beautiful|pretty|fair.skinned)|pleasing personality)\b/],
  ['high_risk_job', 'Higher-risk work', 'Recruitment or earnings claims need additional verification.', /\b(?:overseas|work abroad|crypto(?:currency)?|investment trader|guaranteed (?:income|earnings|returns)|earn\b.{0,25}\b(?:daily|per day)|no work permit|tourist visa)\b/],
]

export function screenJobContent(job) {
  const findings = []
  for (const field of ['title', 'company', 'description', 'requirements', 'notesToAdmin']) {
    const clauses = normalize(job[field]).split(/[.!?;\n]|\bbut\b|\bhowever\b/).filter(Boolean)
    for (const [code, category, message, pattern] of rules) {
      if (clauses.some(clause => {
        // Negation applies to one occurrence, not every later match in a clause.
        for (const match of clause.matchAll(new RegExp(pattern.source, 'g'))) {
          const before = clause.slice(Math.max(0, match.index - 45), match.index)
          const negated = ['prohibited_mlm', 'applicant_payment', 'illegal_activity', 'explicit_content'].includes(code) && /\b(?:no|never|without|do not require|does not require|not a|not an|walang|bawal ang)\s*$/.test(before)
          if (!negated) return true
        }
        return false
      })) findings.push({ code, category, message, field })
    }
  }
  const content = normalize([job.title, job.description, job.requirements].join(' '))
  if (content.replace(/[^a-z]/g, '').length < 20 || /[\u0400-\u052f\u0600-\u06ff\u4e00-\u9fff]/.test(content)) findings.push({ code: 'content_uncertain', category: 'Manual review', message: 'Insufficient or unsupported-language content requires manual review.' })
  return findings
}

export function decideJobModeration({ job, employer, enabled = true, dailyCount = 1, hourlyCount = 1, duplicate = false, now = new Date() }) {
  const findings = screenJobContent(job)
  if (Number(job.slots) >= 100 || !job.negotiable && Number(job.salaryMax) >= ({ Hourly: 5000, Daily: 30000, Monthly: 500000 }[job.payFrequency] || 500000)) findings.push({ code: 'unusual_job_terms', category: 'Higher-risk work', message: 'Unusually high vacancy count or advertised pay requires verification.' })
  const add = (code, message) => findings.push({ code, category: 'Account behavior', message })
  if (!employer?.emailVerified || employer.verificationStatus !== 'approved') add('unverified_account', 'Employer verification is incomplete.')
  if (employer?.receivingApplicantsSuspendedAt || employer?.deletedAt) add('restricted_account', 'Employer account requires PESO attention.')
  if (normalize(job.company).trim() !== normalize(employer?.companyName || employer?.profile?.companyName).trim()) add('company_mismatch', 'Posting company differs from the verified employer company.')
  if (!employer?.createdAt || +new Date(employer.createdAt) > +now - 7 * DAY) add('new_account', 'Employer account is less than seven days old or has no creation date.')
  if (dailyCount > 10 || hourlyCount > 3) add('posting_volume', 'Posting volume exceeded three submissions per hour or ten per day.')
  if (duplicate) add('duplicate_posting', 'An identical active posting already exists for this employer.')
  return { rulesVersion: JOB_POLICY_VERSION, checkedAt: now, decision: enabled && !findings.length ? 'auto_approved' : 'manual_review', findings: enabled ? findings : [{ code: 'automation_disabled', category: 'Manual review', message: 'Automatic job approval is disabled.' }, ...findings] }
}

export function createJobModeration({ JobPosting, Employer, now = () => new Date() }) {
  const settings = () => mongoose.connection.db.collection('job_moderation_settings')
  const counters = () => mongoose.connection.db.collection('job_posting_counters')
  async function getSettings() { return { ...JOB_MODERATION_DEFAULTS, ...await settings().findOne({ _id: 'global' }) } }
  async function updateSettings(input, actor) {
    if (typeof input.enabled !== 'boolean' || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) throw new Error('Choose enabled or disabled and provide a reason of up to 500 characters.')
    await settings().updateOne({ _id: 'global' }, { $set: { enabled: input.enabled, updatedBy: actor, updatedAt: now() }, $push: { history: { $each: [{ enabled: input.enabled, by: actor, reason: input.reason.trim(), at: now() }], $slice: -100 } } }, { upsert: true })
    return getSettings()
  }
  async function assess(job, email, excludeId) {
    try {
      const at = now()
      const [config, employer] = await Promise.all([getSettings(), Employer.findOne({ email }).lean()])
      // Atomic counters count edits and flagged attempts too. Fixed UTC windows
      // prevent concurrent requests from all observing the same low volume.
      await counters().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      const reserve = async size => {
        const start = Math.floor(+at / size) * size
        const key = `${email}:${size}:${start}`
        const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(start + size + DAY) } }
        try { return await counters().findOneAndUpdate({ _id: key }, update, { upsert: true, returnDocument: 'after' }) }
        catch (err) { if (err.code !== 11000) throw err; return counters().findOneAndUpdate({ _id: key }, { $inc: { count: 1 } }, { returnDocument: 'after' }) }
      }
      const [daily, hourly, duplicate] = await Promise.all([reserve(DAY), reserve(3600000), JobPosting.exists({ createdBy: email, status: { $in: ['pending', 'approved'] }, title: job.title, description: job.description, requirements: job.requirements, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })])
      return decideJobModeration({ job, employer, enabled: config.enabled, dailyCount: daily.count, hourlyCount: hourly.count, duplicate: Boolean(duplicate), now: at })
    } catch {
      return { rulesVersion: JOB_POLICY_VERSION, checkedAt: now(), decision: 'manual_review', findings: [{ code: 'screening_unavailable', category: 'Manual review', message: 'Automatic screening is unavailable. PESO review is required.' }] }
    }
  }
  return { getSettings, updateSettings, assess }
}
