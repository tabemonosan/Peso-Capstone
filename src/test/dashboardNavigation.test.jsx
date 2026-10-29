import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
vi.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>
  return { ResponsiveContainer: Stub, LineChart: Stub, BarChart: Stub, Line: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, CartesianGrid: Stub }
})
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, '', '/') })
afterEach(() => vi.unstubAllGlobals())
const dashboard = (role) => ({ role, stats: { applicants: 4, employers: 2, jobs: { pending: 3, approved: 2, declined: 1 }, documentsAwaitingReview: 1, hires: 2, referrals: { total: 3 }, applications: 5, verificationStatus: 'approved' }, charts: { applications: [], registrations: [] }, activity: [] })
function mockRole(role, overrides = {}) {
  const user = { id: 'user-1', role, email: 'user@example.com', emailVerified: true, verificationStatus: 'approved', registration: { complete: true }, companyName: 'Example Works', profile: {}, ...overrides }
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    let data = []
    if (url.endsWith('/api/login')) data = { token: 'token', user }
    else if (url.endsWith('/api/profile')) data = user
    else if (url.endsWith('/api/dashboard')) data = dashboard(role)
    else if (url.includes('/api/notifications')) data = { items: [], unreadCount: 0 }
    else if (url.endsWith('/api/employer/verification')) data = { verificationStatus: 'approved' }
    return { ok: true, json: async () => data }
  }))
}
describe('one dashboard per role', () => {
  it.each(['Admin', 'Employer', 'Applicant'])('gives %s one Dashboard with role-relevant information', async (role) => {
    mockRole(role)
    render(<App />)
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
    fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }).closest('form'))
    const nav = await screen.findByRole('navigation', { name: `${role} navigation` })
    expect(within(nav).getAllByRole('button', { name: 'Dashboard', exact: true })).toHaveLength(1)
    expect(screen.queryByText('All Dashboard', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard', exact: true })).toBeInTheDocument()
    await screen.findByText('Recent activity')
    if (role === 'Admin') expect(screen.getByRole('button', { name: /Employers 2/ })).toBeInTheDocument()
    if (role === 'Employer') {
      expect(screen.getByRole('button', { name: /Jobs pending 3/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Approved Job Postings' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Account status/ })).not.toBeInTheDocument()
    }
    if (role === 'Applicant') {
      expect(screen.getByRole('button', { name: /Account status approved/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Jobs pending/ })).not.toBeInTheDocument()
    }
  })
  it.each(['Employer', 'Applicant'])('keeps Complete Registration hidden for a completed %s after refresh', async (role) => {
    mockRole(role)
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-view', 'dashboard')
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: `${role} navigation` })
    await screen.findByText('Recent activity')
    expect(within(nav).queryByRole('button', { name: 'Complete Registration' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Dashboard', exact: true })).toBeInTheDocument()
  })
  it.each(['Employer', 'Applicant'])('moves a completed %s off a saved registration checklist on refresh', async (role) => {
    mockRole(role)
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-view', 'complete')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard', exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete Registration' })).not.toBeInTheDocument()
  })
  it('still shows Complete Registration when the server reports an incomplete account', async () => {
    mockRole('Applicant', { registration: { complete: false, done: 0, total: 1, checklist: [{ key: 'name', label: 'Full name', done: false, link: 'profile' }] } })
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-view', 'complete')
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: 'Applicant navigation' })
    expect(within(nav).getByRole('button', { name: 'Complete Registration' })).toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument()
  })
  it('restores saved All Dashboard navigation to the single Dashboard', async () => {
    mockRole('Employer')
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-view', 'all-dashboard')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard', exact: true })).toBeInTheDocument()
    await screen.findByText('Recent activity')
    expect(localStorage.getItem('peso-active-view')).toBe('dashboard')
    expect(screen.queryByText('All Dashboard', { exact: true })).not.toBeInTheDocument()
  })
})
