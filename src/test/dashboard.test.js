// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createDashboardService, fillDays, CHART_DAYS } from '../../server/services/dashboard.js'

const now = new Date('2026-10-26T12:00:00Z')

function makeService() {
  const agg = (rows = []) => vi.fn(async () => rows)
  const models = {
    Applicant: { countDocuments: vi.fn(async () => 5), aggregate: vi.fn(async (p) => (p[0]?.$match?.createdAt ? [{ _id: '2026-10-26', count: 2 }] : [{ documents: 7, applicants: 3 }])) },
    Employer: { countDocuments: vi.fn(async () => 2), aggregate: agg([{ _id: '2026-10-26', count: 1 }]) },
    JobPosting: {
      aggregate: agg([{ _id: 'pending', count: 4 }, { _id: 'approved', count: 6 }]),
      find: vi.fn(() => ({ select: () => ({ lean: async () => [{ _id: 'j1' }] }) })),
    },
    JobApplication: { countDocuments: vi.fn(async () => 9), aggregate: agg([{ _id: '2026-10-25', count: 3 }]) },
    Referral: { aggregate: agg([{ _id: 'pending', count: 2 }, { _id: 'accepted', count: 1 }]) },
    HireReport: { countDocuments: vi.fn(async () => 1) },
    Notification: { find: vi.fn(() => ({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [{ _id: 'n1', type: 't', title: 'T', message: 'M', createdAt: now }] }) }) }) })) },
  }
  return { service: createDashboardService(models), models }
}

describe('fillDays', () => {
  it('returns 30 continuous days with zero fill', () => {
    const days = fillDays([{ _id: '2026-10-26', count: 4 }], now)
    expect(days).toHaveLength(CHART_DAYS)
    expect(days.at(-1)).toEqual({ date: '2026-10-26', count: 4 })
    expect(days[0].count).toBe(0)
  })
})

describe('getDashboard', () => {
  it('admin gets system-wide aggregated counts', async () => {
    const { service } = makeService()
    const data = await service.getDashboard({ id: 'a', role: 'Admin', email: 'a@peso.gov' }, now)
    expect(data.stats).toMatchObject({
      applicants: 5,
      employers: 2,
      jobs: { pending: 4, approved: 6, declined: 0 },
      documentsAwaitingReview: 7,
      hires: 1,
      referrals: { total: 3, pending: 2, accepted: 1 },
    })
    expect(data.charts.registrations.at(-1).count).toBe(3)
    expect(data.activity).toHaveLength(1)
  })

  it('employer data is scoped to the employer own jobs and id', async () => {
    const { service, models } = makeService()
    const data = await service.getDashboard({ id: 'e', objectId: 'oid', role: 'Employer', email: 'e@x.com' }, now)
    expect(models.JobPosting.find).toHaveBeenCalledWith({ createdBy: 'e@x.com' })
    expect(models.JobPosting.aggregate.mock.calls[0][0][0]).toEqual({ $match: { createdBy: 'e@x.com' } })
    expect(models.Referral.aggregate.mock.calls[0][0][0]).toEqual({ $match: { employerId: 'oid' } })
    expect(data.stats.applicants).toBe(9)
    expect(data.stats).not.toHaveProperty('employers')
  })

  it('applicant data is scoped to the applicant', async () => {
    const { service, models } = makeService()
    const data = await service.getDashboard({ id: 'p', objectId: 'oid', role: 'Applicant', email: 'p@x.com', verificationStatus: 'approved' }, now)
    expect(models.JobApplication.countDocuments).toHaveBeenCalledWith({ applicantEmail: 'p@x.com' })
    expect(data.stats.verificationStatus).toBe('approved')
  })

  it('unknown roles get nothing', async () => {
    const { service } = makeService()
    expect(await service.getDashboard({ role: 'Other' }, now)).toBeNull()
  })
})
