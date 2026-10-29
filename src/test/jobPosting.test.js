import { describe, expect, it } from 'vitest'
import { emptyJobPosting, validateJobPosting, normalizeJobPosting, formatSalary, formatLocation, deadlineBounds, manilaDate } from '../../shared/jobPosting.js'
import { minimumWageWarning } from '../../shared/minimumWage.js'
const now = new Date('2026-10-29T15:59:00Z')
const valid = (extra = {}) => ({ ...emptyJobPosting(), title: 'Clerk', description: 'Help customers', skills: ['Excel'], city: 'Legazpi City', province: 'Albay', salaryMin: '15000', salaryMax: '20000', slots: 2, deadline: '2026-11-01', ...extra })
const check = (extra) => validateJobPosting(valid(extra), { now })
describe('job posting rules', () => {
  it('normalizes money, spaces, duplicate skills, and legacy employment values', () => {
    const { errors, value } = check({ city: '  Legazpi   City ', skills: ['Excel', 'excel', ' Sales '], employmentType: 'Contract' })
    expect(errors).toEqual({})
    expect(value).toMatchObject({ salaryMin: 15000, salaryMax: 20000, city: 'Legazpi City', skills: ['Excel', 'Sales'], employmentType: 'Contractual' })
    expect(formatLocation(value)).toBe('Legazpi City, Albay')
  })
  it.each([
    [{ title: '' }, 'title'], [{ title: 'Other', customTitle: 'a'.repeat(81) }, 'title'],
    [{ description: '' }, 'description'], [{ description: 'x'.repeat(3001) }, 'description'],
    [{ requirements: 'x'.repeat(2001) }, 'requirements'], [{ notesToAdmin: 'x'.repeat(501) }, 'notesToAdmin'],
    [{ skills: [] }, 'skills'], [{ skills: 'Excel' }, 'skills'], [{ skills: ['x'.repeat(61)] }, 'skills'],
    [{ city: '' }, 'city'], [{ province: '' }, 'province'], [{ locationType: 'Anywhere' }, 'locationType'],
    [{ employmentType: 'bad' }, 'employmentType'], [{ education: 'bad' }, 'education'], [{ experience: 'bad' }, 'experience'],
    [{ salaryMin: '' }, 'salaryMin'], [{ salaryMin: -1 }, 'salaryMin'], [{ salaryMin: Infinity }, 'salaryMin'],
    [{ salaryMax: 'abc' }, 'salaryMax'], [{ salaryMax: '14000' }, 'salaryMax'], [{ payFrequency: 'Weekly' }, 'payFrequency'],
    [{ slots: '' }, 'slots'], [{ slots: 0 }, 'slots'], [{ slots: 1.5 }, 'slots'],
    [{ deadline: '' }, 'deadline'], [{ deadline: '2026-10-28' }, 'deadline'], [{ deadline: '2027-01-28' }, 'deadline'], [{ deadline: '2026-11-31' }, 'deadline'],
  ])('rejects %j at %s', (extra, field) => expect(check(extra).errors[field]).toBeTruthy())
  it('accepts inclusive date bounds, rejects expired changed dates, and rejects expired deadlines on edit', () => {
    const { min, max } = deadlineBounds(now)
    expect(check({ deadline: min }).errors).toEqual({})
    expect(check({ deadline: max }).errors).toEqual({})
    expect(validateJobPosting(valid({ deadline: '2026-10-01' }), { now, keepDeadline: '2026-10-01' }).errors.deadline).toBeTruthy()
    expect(manilaDate(new Date('2026-10-29T16:00:00Z'))).toBe('2026-10-30')
  })
  it('clears remote locations and ignores disabled salary inputs when negotiable', () => {
    const result = check({ locationType: 'Remote', negotiable: true, salaryMin: 'bad', salaryMax: '' })
    expect(result.errors).toEqual({})
    expect(result.value).toMatchObject({ city: '', province: '', salaryMin: null, salaryMax: null })
    expect(formatLocation(result.value)).toBe('Remote')
    expect(formatSalary(result.value)).toBe('Negotiable')
  })
  it('derives legacy salary and maps employment without destroying free-text salary or location', () => {
    const old = normalizeJobPosting({ salary: '₱25,000', employmentType: 'Internship', location: 'Old address' })
    expect(old).toMatchObject({ salaryMin: 25000, salaryMax: 25000, payFrequency: 'Monthly', employmentType: 'Internship-OJT' })
    expect(formatSalary(old)).toBe('₱25,000 / month')
    expect(formatLocation(old)).toBe('Old address')
    expect(formatSalary(normalizeJobPosting({ salary: 'Competitive' }))).toBe('Competitive')
  })
  it('recovers legacy posting city and province from its own saved branch address', () => {
    expect(normalizeJobPosting({ locationType: 'On-site', location: 'rawis 119, Relocation, Brgy. Calpi, Oas, Albay, Landmark: Big Mac near Church' })).toMatchObject({ city: 'Oas', province: 'Albay' })
    expect(normalizeJobPosting({ location: 'Legazpi City' })).toMatchObject({ city: 'Legazpi City', province: 'Albay' })
    expect(normalizeJobPosting({ city: 'Daraga', province: 'Albay', location: 'Oas, Albay' })).toMatchObject({ city: 'Daraga', province: 'Albay' })
    expect(normalizeJobPosting({ locationType: 'Remote', location: 'Oas, Albay' })).toMatchObject({ city: '', province: '' })
    expect(normalizeJobPosting({ location: 'Unknown address' }).city).toBeUndefined()
  })
  it('warns only for applicable monthly Bicol wages, using effective dates', () => {
    expect(minimumWageWarning(12000, 'Monthly', 'Albay', now)).toBe('')
    expect(minimumWageWarning(12000, 'Monthly', 'Albay', new Date('2026-12-01'))).toContain('12,480')
    expect(minimumWageWarning(1000, 'Monthly', 'Cebu', now)).toBe('')
    expect(minimumWageWarning(1000, 'Daily', 'Albay', now)).toBe('')
  })
})
