import { describe, it, expect } from 'vitest'
import { splitParam, canonicalize, buildJobFilter, baseApprovedJobFilter, countJobFacets } from '../../server/utils/jobFilters.js'

const ALLOWED = {
  skills: ['Cooking', 'Driving', 'Data Entry'],
  locations: ['Legazpi City', 'Daraga'],
  locationTypes: ['On-site', 'Remote', 'Hybrid'],
  employmentTypes: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship'],
}

describe('splitParam', () => {
  it('accepts comma-separated and repeated params', () => {
    expect(splitParam('Cooking,Driving')).toEqual(['Cooking', 'Driving'])
    expect(splitParam(['Cooking', 'Driving'])).toEqual(['Cooking', 'Driving'])
    expect(splitParam(['Cooking,Data Entry', 'Driving'])).toEqual(['Cooking', 'Data Entry', 'Driving'])
    expect(splitParam(undefined)).toEqual([])
  })
})

describe('buildJobFilter', () => {
  it('ORs within one filter group', () => {
    const { groups } = buildJobFilter({ employmentTypes: 'Full-time,Part-time' }, ALLOWED)
    expect(groups).toHaveLength(1)
    expect(groups[0].employmentType.$in).toHaveLength(2)
  })

  it('ANDs across different filter groups', () => {
    const { groups } = buildJobFilter({ employmentTypes: 'Full-time', locations: 'Legazpi City', skills: 'Cooking' }, ALLOWED)
    expect(groups).toHaveLength(3)
    expect(groups.some((g) => g.employmentType)).toBe(true)
    expect(groups.some((g) => g.location)).toBe(true)
    expect(groups.some((g) => g.skills)).toBe(true)
  })

  it('matches skills case-insensitively and canonicalizes casing', () => {
    const { groups, applied } = buildJobFilter({ skills: 'cooking' }, ALLOWED)
    expect(applied.skills).toEqual(['Cooking'])
    expect(groups[0].skills.$in[0]).toEqual(/^Cooking$/i)
  })

  it('drops values that are not in the whitelist', () => {
    const { groups, applied } = buildJobFilter({ skills: 'Cooking); DROP TABLE jobs;--', locations: 'Nowhere' }, ALLOWED)
    expect(groups).toHaveLength(0)
    expect(applied.skills).toEqual([])
    expect(applied.locations).toEqual([])
  })

  it('validates datePosted against the whitelist', () => {
    expect(buildJobFilter({ datePosted: 'week' }, ALLOWED).applied.datePosted).toBe('week')
    expect(buildJobFilter({ datePosted: 'year' }, ALLOWED).applied.datePosted).toBe('')
    const { groups } = buildJobFilter({ datePosted: '24h' }, ALLOWED)
    expect(groups[0].createdAt.$gte).toBeInstanceOf(Date)
  })

  it('adds a keyword search group with escaped input', () => {
    const { groups, applied } = buildJobFilter({ search: 'cashier (part)' }, ALLOWED)
    expect(applied.search).toBe('cashier (part)')
    expect(groups[0].$or).toHaveLength(4)
  })
})

describe('baseApprovedJobFilter', () => {
  it('only returns approved, non-expired jobs', () => {
    const filter = baseApprovedJobFilter(new Date('2026-10-26'))
    expect(filter.status).toBe('approved')
    expect(filter.$or).toEqual([{ deadline: null }, { deadline: { $gte: new Date('2026-10-26') } }])
  })
})

describe('countJobFacets', () => {
  const jobs = [
    { skills: ['Cooking', 'Driving'], location: 'Legazpi City', locationType: 'On-site', employmentType: 'Full-time' },
    { skills: ['Cooking'], location: 'Legazpi City', locationType: 'Remote', employmentType: 'Part-time' },
    { skills: ['Driving'], location: 'Daraga', locationType: 'On-site', employmentType: 'Full-time' },
    { skills: [], location: '', locationType: '', employmentType: '' },
  ]

  it('counts options per facet', () => {
    const facets = countJobFacets(jobs)
    expect(facets.skills).toEqual([
      { value: 'Cooking', count: 2 },
      { value: 'Driving', count: 2 },
    ])
    expect(facets.locations).toEqual([
      { value: 'Legazpi City', count: 2 },
      { value: 'Daraga', count: 1 },
    ])
    expect(facets.employmentTypes).toEqual([
      { value: 'Full-time', count: 2 },
      { value: 'Part-time', count: 1 },
    ])
  })

  it('collapses case variants and skips empty values', () => {
    const facets = countJobFacets([{ skills: ['cooking'], location: 'legazpi city' }, { skills: ['Cooking'], location: 'Legazpi City' }])
    expect(facets.skills).toHaveLength(1)
    expect(facets.skills[0].count).toBe(2)
    expect(facets.locations).toHaveLength(1)
  })
})
