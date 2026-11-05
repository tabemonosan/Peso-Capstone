import { describe, it, expect } from 'vitest'
import { jobArchiveAt, isJobArchived, partitionJobArchive } from '../../shared/jobArchive.js'
describe('expired job archive', () => {
  const job = { deadline: '2026-11-04T15:59:59.999Z', status: 'approved', applicants: [{ email: 'test@example.test' }] }
  it('archives exactly three full days after expiration', () => {
    expect(jobArchiveAt(job)).toBe('2026-11-07T15:59:59.999Z')
    expect(isJobArchived(job, '2026-11-07T15:59:59.998Z')).toBe(false)
    expect(isJobArchived(job, '2026-11-07T15:59:59.999Z')).toBe(true)
    expect(jobArchiveAt({ deadline: '2026-11-04' })).toBe(jobArchiveAt(job))
  })
  it('preserves records, skips missing deadlines, and reopens extended deadlines', () => {
    const original = JSON.stringify(job)
    const result = partitionJobArchive([job, { deadline: null }, { deadline: 'invalid' }, { ...job, deadline: '2026-12-01' }], '2026-11-08')
    expect(result.archived).toEqual([job])
    expect(result.active).toHaveLength(3)
    expect(JSON.stringify(job)).toBe(original)
  })
})
