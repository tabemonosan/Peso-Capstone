// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decideJobModeration, screenJobContent } from '../services/jobModeration.js'

const now = new Date('2026-11-04T00:00:00Z')
const employer = { emailVerified: true, verificationStatus: 'approved', companyName: 'Example Works', createdAt: new Date('2026-01-01') }
const job = { company: 'Example Works', title: 'Office Clerk', description: 'Assist clients and organize office documents.', requirements: 'Excel skills. All genders welcome.', slots: 2, salaryMax: 20000, payFrequency: 'Monthly' }
const decide = extra => decideJobModeration({ job, employer, now, ...extra })
describe('job policy screening', () => {
  it('approves a low-risk job for an established verified employer', () => expect(decide()).toMatchObject({ decision: 'auto_approved', findings: [] }))
  it.each([
    ['Join our MLM and build your downline.', 'prohibited_mlm'],
    ['Multi-level marketing opportunity.', 'prohibited_mlm'],
    ['Pay a registration fee to apply.', 'applicant_payment'],
    ['Magbayad ng registration fee.', 'applicant_payment'],
    ['Buy a starter kit before starting.', 'applicant_payment'],
    ['Make fake passports for customers.', 'illegal_activity'],
    ['Money mule accounts wanted.', 'illegal_activity'],
    ['Produce nude videos.', 'explicit_content'],
    ['Adult entertainment performers wanted.', 'explicit_content'],
    ['Age: 18-30 only.', 'age_restriction'],
    ['Applicants must be at least 25 years old.', 'age_restriction'],
    ['Applicants must be at most 40 years old.', 'age_restriction'],
    ['Maximum age: 45.', 'age_restriction'],
    ['No older than 35 years old.', 'age_restriction'],
    ['Applicants aged 18–30 only.', 'age_restriction'],
    ['Applicants must be 21 to 35 years old.', 'age_restriction'],
    ['Female only.', 'gender_restriction'],
    ['Must be male.', 'gender_restriction'],
    ['Babae lamang.', 'gender_restriction'],
    ['No PWD applicants.', 'protected_trait_restriction'],
    ['Christian only.', 'protected_trait_restriction'],
    ['Pleasing personality required.', 'protected_trait_restriction'],
    ['Work abroad on a tourist visa.', 'high_risk_job'],
    ['Guaranteed income with crypto trading.', 'high_risk_job'],
  ])('routes %s to manual review', (description, code) => {
    const result = decide({ job: { ...job, description } })
    expect(result.decision).toBe('manual_review')
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code })]))
  })
  it('screens private notes and normalizes full-width and invisible characters', () => {
    expect(screenJobContent({ ...job, notesToAdmin: 'ＭＬＭ' }).some(f => f.code === 'prohibited_mlm')).toBe(true)
    expect(screenJobContent({ ...job, description: 'Join M\u200bLM today.' }).some(f => f.code === 'prohibited_mlm')).toBe(true)
  })
  it('does not flag explicit rejection of fees or MLM, or inclusive language', () => {
    expect(screenJobContent({ ...job, description: 'No placement fee. No MLM. All genders welcome. PWD applicants welcome.' })).toEqual([])
  })
  it('does not let negation hide a separate payment requirement', () => {
    expect(screenJobContent({ ...job, description: 'No placement fee but pay a registration fee.' }).some(f => f.code === 'applicant_payment')).toBe(true)
  })
  it.each([
    ['No placement fee, pay a registration fee to apply.', 'applicant_payment'],
    ['No MLM, recruit members to earn.', 'prohibited_mlm'],
    ['No fake IDs, money laundering opportunities available.', 'illegal_activity'],
  ])('checks later matches after a negated first occurrence: %s', (description, code) => {
    expect(decide({ job: { ...job, description } })).toMatchObject({ decision: 'manual_review', findings: expect.arrayContaining([expect.objectContaining({ code })]) })
  })
  it.each([
    [{ employer: { ...employer, emailVerified: false } }, 'unverified_account'],
    [{ employer: { ...employer, createdAt: now } }, 'new_account'],
    [{ employer: { ...employer, receivingApplicantsSuspendedAt: now } }, 'restricted_account'],
    [{ hourlyCount: 4 }, 'posting_volume'],
    [{ dailyCount: 11 }, 'posting_volume'],
    [{ duplicate: true }, 'duplicate_posting'],
    [{ job: { ...job, company: 'Other Company' } }, 'company_mismatch'],
    [{ job: { ...job, slots: 100 } }, 'unusual_job_terms'],
  ])('reviews suspicious context %j', (extra, code) => {
    expect(decide(extra).findings).toEqual(expect.arrayContaining([expect.objectContaining({ code })]))
    expect(decide(extra).decision).toBe('manual_review')
  })
  it('allows the exact posting and account-age boundaries', () => {
    expect(decide({ hourlyCount: 3, dailyCount: 10, employer: { ...employer, createdAt: new Date(+now - 7 * 86400000) } }).decision).toBe('auto_approved')
  })
  it('honors the admin kill switch', () => expect(decide({ enabled: false }).decision).toBe('manual_review'))
})
