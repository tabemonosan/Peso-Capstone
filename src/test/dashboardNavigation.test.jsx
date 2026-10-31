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
    else if (url.endsWith('/api/dashboard')) data = { ...dashboard(role), stats: { ...dashboard(role).stats, verificationStatus: user.verificationStatus } }
    else if (url.includes('/api/admin/employment-updates')) data = { items: [], total: 0 }
    else if (url.includes('/api/notifications')) data = { items: [], unreadCount: 0 }
    else if (url.endsWith('/api/employer/verification')) data = { verificationStatus: 'approved' }
    return { ok: true, json: async () => data }
  }))
}
describe('one dashboard per role', () => {
  it('opens the admin hiring updates page from the Hires card', async () => {
    mockRole('Admin')
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-role', 'Admin')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Hires 2' }))
    expect(await screen.findByRole('heading', { name: 'Hiring updates' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hiring Updates', exact: true })).toHaveClass('is-active')
    expect(await screen.findByText('No hiring updates submitted yet.')).toBeInTheDocument()
  })
  it('opens Hiring Updates through the sidebar and returns to Dashboard normally', async () => {
    mockRole('Admin')
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-role', 'Admin')
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: 'Admin navigation' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Hiring Updates', exact: true }))
    expect(await screen.findByRole('region', { name: 'Hiring updates' })).toBeInTheDocument()
    expect(localStorage.getItem('peso-active-view')).toBe('employment-updates')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(within(nav).getByRole('button', { name: 'Dashboard', exact: true }))
    expect(await screen.findByRole('heading', { name: 'Dashboard', exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Hiring updates' })).not.toBeInTheDocument()
  })
  it('restores the Hiring Updates page on refresh', async () => {
    mockRole('Admin')
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-role', 'Admin')
    localStorage.setItem('peso-active-view', 'employment-updates')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Hiring updates' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('keeps documents inside Profile and off the applicant sidebar and landing page', async () => {
    mockRole('Applicant', { verificationStatus: 'under_review', attentionCount: 1 })
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-view', 'home')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Home', exact: true })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Applicant navigation' })
    expect(within(nav).queryByRole('button', { name: /My Documents/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My Documents' })).not.toBeInTheDocument()
    expect(screen.queryByText('Documents awaiting review')).not.toBeInTheDocument()
    expect(screen.queryByText(/document.*need.*attention/)).not.toBeInTheDocument()
    await screen.findByRole('button', { name: /Account status under review/ })
    expect(screen.queryByRole('button', { name: /^(Applications|Referrals|Open jobs|Notifications) \d/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recent activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Browse Jobs' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Profile', exact: true }))
    expect(await screen.findByRole('heading', { name: 'Documents submitted to PESO' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Manage my documents' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
  it.each(['saved', 'link'])('opens the profile documents modal for a %s document destination', async (destination) => {
    mockRole('Applicant')
    localStorage.setItem('peso-token', 'token')
    if (destination === 'saved') localStorage.setItem('peso-active-view', 'documents')
    else window.history.replaceState({}, '', '/profile?documents=1')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Applicant Profile' })).toBeInTheDocument()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(localStorage.getItem('peso-active-view')).toBe('profile')
  })
  it.each(['Admin', 'Employer', 'Applicant'])('gives %s one overview with role-relevant information', async (role) => {
    mockRole(role)
    render(<App />)
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
    fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }).closest('form'))
    const nav = await screen.findByRole('navigation', { name: `${role} navigation` })
    const overviewName = role === 'Applicant' ? 'Home' : 'Dashboard'
    expect(within(nav).getAllByRole('button', { name: overviewName, exact: true })).toHaveLength(1)
    expect(screen.queryByText('All Dashboard', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: overviewName, exact: true })).toBeInTheDocument()
    await screen.findByText('Recent activity')
    if (role === 'Admin') expect(screen.getByRole('button', { name: /Employers 2/ })).toBeInTheDocument()
    if (role === 'Employer') {
      expect(screen.getByRole('button', { name: /Jobs pending 3/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Approved Job Postings' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Account status/ })).not.toBeInTheDocument()
    }
    if (role === 'Applicant') {
      expect(within(nav).queryByRole('button', { name: 'Dashboard', exact: true })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Browse Jobs' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Update My Profile' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open jobs 0' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Applications 5' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Account status/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Jobs pending/ })).not.toBeInTheDocument()
    }
    if (role !== 'Admin') {
      fireEvent.click(within(nav).getByRole('button', { name: 'Reviews', exact: true }))
      expect(screen.getByRole('heading', { name: 'Reviews', exact: true })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Open English PDF/ })).toHaveAttribute('href', '/CSM-Questionnaire-English-Online-v2.pdf')
      expect(screen.getByRole('link', { name: /Open Tagalog PDF/ })).toHaveAttribute('href', '/CSM-Questionnaire-TAGALOG-Online-v2.pdf')
      expect(screen.getByRole('link', { name: 'Download English PDF' })).toHaveAttribute('download', 'CSM-Questionnaire-English-Online-v2.pdf')
      expect(screen.getByRole('link', { name: 'Download Tagalog PDF' })).toHaveAttribute('download', 'CSM-Questionnaire-TAGALOG-Online-v2.pdf')
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
    expect(within(nav).getByRole('button', { name: role === 'Applicant' ? 'Home' : 'Dashboard', exact: true })).toBeInTheDocument()
  })
  it.each(['Employer', 'Applicant'])('moves a completed %s off a saved registration checklist on refresh', async (role) => {
    mockRole(role)
    localStorage.setItem('peso-token', 'token')
    localStorage.setItem('peso-active-view', 'complete')
    render(<App />)
    expect(await screen.findByRole('heading', { name: role === 'Applicant' ? 'Home' : 'Dashboard', exact: true })).toBeInTheDocument()
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
