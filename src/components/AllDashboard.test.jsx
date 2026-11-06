import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AllDashboard from './AllDashboard'

vi.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>
  return { ResponsiveContainer: Stub, LineChart: Stub, BarChart: Stub, Line: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, CartesianGrid: Stub }
})

const adminData = {
  role: 'Admin',
  stats: { applicants: 5, employers: 2, jobs: { pending: 4, approved: 6, declined: 1 }, documentsAwaitingReview: 7, hires: 1, referrals: { total: 3 } },
  charts: { registrations: [{ date: '2026-10-26', count: 1 }], applications: [{ date: '2026-10-26', count: 2 }] },
  activity: [{ id: '1', title: 'New applicant registration', message: 'Ann registered', createdAt: '2026-10-26T00:00:00Z' }],
}

afterEach(() => vi.restoreAllMocks())

describe('AllDashboard', () => {
  it('shows a skeleton, then read-only cards that navigate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => adminData })
    const onNavigate = vi.fn()
    render(<AllDashboard token="t" onNavigate={onNavigate} />)
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument()

    await screen.findByText('Recent activity')
    expect(screen.getByText('Ann registered')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(approve|decline|delete|edit|save)/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Jobs pending/ }))
    expect(onNavigate).toHaveBeenCalledWith('jobs')
    expect(globalThis.fetch.mock.calls[0][1].method).toBeUndefined()
  })

  it.each([
    ['Employer', { jobs: { pending: 2, approved: 3, declined: 1 }, applicants: 4, referrals: { total: 5 }, hires: 1 }, 'Jobs pending', 'employer'],
    ['Applicant', { verificationStatus: 'approved', documentsAwaitingReview: 1, applications: 4, referrals: { total: 2 } }, 'Applications', 'my-applications'],
  ])('shows only %s metrics and navigates to its own role pages', async (role, stats, label, destination) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ role, stats, charts: { applications: [] }, activity: [] }) })
    const navigate = vi.fn()
    render(<AllDashboard token="t" onNavigate={navigate} />)
    await screen.findByText('Recent activity')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
    expect(navigate).toHaveBeenCalledWith(destination)
    expect(screen.queryByRole('button', { name: /Employers/ })).not.toBeInTheDocument()
    if (role === 'Applicant') expect(screen.queryByRole('button', { name: /Jobs pending/ })).not.toBeInTheDocument()
  })

  it('shows an error when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) })
    render(<AllDashboard token="t" onNavigate={() => {}} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nope'))
  })

  it('filters calendar periods and joins registration and application series by date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ...adminData, charts: {
      registrations: [{ date: '2026-10-01', count: 10 }, { date: '2026-10-25', count: 3 }, { date: '2026-10-30', count: 4 }],
      applications: [{ date: '2026-10-29', count: 2 }, { date: '2026-10-30', count: 1 }],
    } }) })
    render(<AllDashboard token="t" onNavigate={() => {}} />)
    await screen.findByText('Recent activity')
    expect(screen.getByRole('img', { name: /Last 30 days: 17 registrations and 3 applications/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '7 days', exact: true }))
    expect(screen.getByRole('img', { name: /Last 7 days: 7 registrations and 3 applications/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7 days', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const rows = screen.getByText('2026-10-29').closest('tr')
    expect(rows).toHaveTextContent('2026-10-2902')
  })

  it('keeps every workflow total available in the full report without mutation controls', async () => {
    const workflow = { applications: 6, applicationsByStatus: { delivered: 4, pending_admin: 2 }, interviews: { scheduled: 1 }, reports: { noShowPending: 2, problemPending: 1 }, referralsBySource: { auto: 4, admin: 2 }, suspendedApplicants: 1 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ...adminData, stats: { ...adminData.stats, workflow } }) })
    const navigate = vi.fn()
    render(<AllDashboard token="t" onNavigate={navigate} />)
    await screen.findByText('Recent activity')
    expect(screen.getByRole('img', { name: '11 job postings: 6 approved, 4 pending, 1 declined' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '4 automatic referrals and 2 admin referrals' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No-show reports pending 2' }))
    expect(navigate).toHaveBeenCalledWith('peso-referrals')
    expect(screen.getByRole('button', { name: 'Applicants suspended 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(approve|decline|delete|save)/i })).toBeNull()
  })

  it('shows empty breakdowns without invalid percentages when all totals are zero', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ...adminData, stats: { applicants: 0, employers: 0, jobs: {}, hires: 0, referrals: {} }, charts: {}, activity: [] }) })
    render(<AllDashboard token="t" onNavigate={() => {}} />)
    expect(await screen.findByText('No activity data is available for this period.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '0 job postings: 0 approved, 0 pending, 0 declined' }).getAttribute('style')).not.toMatch(/NaN|Infinity/)
    expect(screen.getByText('An application breakdown is not available.')).toBeInTheDocument()
  })
})
