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

  it('shows an error when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) })
    render(<AllDashboard token="t" onNavigate={() => {}} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nope'))
  })
})
