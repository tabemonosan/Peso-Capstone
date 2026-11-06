import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import MyApplicationsPage from '../components/MyApplicationsPage'
import { applicationActions } from '../../shared/applicationProgress.js'

const future = new Date(Date.now() + 86400000).toISOString()
const labels = { confirm: 'Confirm interview', reschedule: 'Request reschedule', decline: 'Decline invitation', withdraw: 'Withdraw application', respond_no_show: 'Respond to no-show report', report_problem: 'Report a problem', view_outcome: 'View outcome' }
const base = { id: 'application1', referralId: 'referral1', jobId: 'job1', job: { title: 'Demo Driver' }, employer: { name: 'Demo Company' }, submittedAt: '2026-01-01T01:00:00Z', lastUpdate: '2026-01-02T01:00:00Z', history: [{ by: 'PRIVATE admin', reason: 'PRIVATE note', action: 'application_submitted', status: 'pending', at: '2026-01-01T01:00:00Z' }] }
function mock(items = [], account = {}, total = items.length) {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ items, account, total }) }))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('My applications', () => {
  it('keeps past applications and timelines together regardless of job board filters', async () => {
    window.history.replaceState({}, '', '/?locations=Tiwi&skills=Cooking')
    const fetcher = mock([{ ...base, status: 'withdrawn', actions: [] }])
    render(<MyApplicationsPage token="applicant" />)
    expect(await screen.findByRole('heading', { name: 'Application history', exact: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Demo Driver' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Application timeline'))
    expect(screen.getByText('application submitted')).toBeInTheDocument()
    const call = fetcher.mock.calls.find(([url]) => url.includes('/mine?'))
    expect(call[0]).not.toMatch(/locations=|skills=/)
    window.history.replaceState({}, '', '/')
  })

  it('shows companies in a sidebar and switches the focused application', async () => {
    const history = [{ action: 'interview_confirmed', status: 'confirmed', at: future }, { action: 'interview_confirmed', status: 'interview_confirmed', at: future }]
    mock([{ ...base, status: 'interview_confirmed', actions: [], history, employer: { name: 'Demo Company', profileImage: '/company.jpg' } }, { ...base, id: 'application2', job: { title: 'Office Clerk' }, employer: { name: 'Other Company' }, status: 'pending', actions: ['withdraw'] }])
    render(<MyApplicationsPage token="applicant" />)
    const sidebar = await screen.findByRole('region', { name: 'Companies and applications' })
    const selected = within(sidebar).getByRole('button', { name: 'View application for Demo Driver at Demo Company' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected.querySelector('img')).toHaveAttribute('src', '/company.jpg')
    const details = screen.getByRole('region', { name: 'Selected application details' })
    expect(within(details).getByRole('heading', { name: 'Demo Driver' })).toBeInTheDocument()
    expect(within(details).getAllByText('interview confirmed', { exact: true })).toHaveLength(1)
    expect(within(details).queryByRole('heading', { name: 'Office Clerk' })).not.toBeInTheDocument()
    fireEvent.click(within(sidebar).getByRole('button', { name: 'View application for Office Clerk at Other Company' }))
    expect(within(details).getByRole('heading', { name: 'Office Clerk' })).toBeInTheDocument()
    expect(within(details).queryByRole('heading', { name: 'Demo Driver' })).not.toBeInTheDocument()
    expect(within(details).getByRole('button', { name: 'Withdraw application' })).toBeInTheDocument()
  })
  it.each([['reschedule', 'Request reschedule'], ['decline', 'Decline invitation']])('limits %s reasons to 50 characters', async (action, label) => {
    const fetcher = mock([{ ...base, status: 'interview_invited', interview: { id: 'meeting1', scheduledAt: future }, actions: [action] }])
    const onDeclined = vi.fn()
    render(<MyApplicationsPage token="applicant" onDeclined={onDeclined} />)
    fireEvent.click(await screen.findByRole('button', { name: label }))
    const reason = screen.getByRole('textbox', { name: 'Reason' })
    expect(reason).toHaveAttribute('maxlength', '50')
    fireEvent.change(reason, { target: { value: 'a'.repeat(51) } })
    expect(screen.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
    fireEvent.change(reason, { target: { value: 'a'.repeat(50) } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm', exact: true }))
    await waitFor(() => expect(fetcher.mock.calls.some(([url, options]) => url.endsWith('/interviews/meeting1/respond') && JSON.parse(options.body).reason.length === 50)).toBe(true))
    if (action === 'decline') await waitFor(() => expect(onDeclined).toHaveBeenCalledOnce())
  })
  it.each(['pending_admin', 'pending', 'interview_invited', 'interview_confirmed', 'interview_held', 'reschedule_requested', 'interview_declined', 'withdrawn', 'withdrawn_by_admin', 'declined', 'declined_by_admin', 'no_show_pending', 'no_show_responded', 'no_show_confirmed', 'no_show_dismissed', 'hired', 'deployed', 'not_hired'])('shows the permitted actions for %s and only factual display fields', async status => {
    const interviewStatus = { interview_invited: 'invited', interview_confirmed: 'confirmed', interview_held: 'held', reschedule_requested: 'reschedule_requested', interview_declined: 'declined' }[status]
    const interview = interviewStatus ? { id: 'meeting1', status: interviewStatus, scheduledAt: future, mode: 'In person', location: 'Demo office', message: 'Bring your resume' } : null
    const report = status.startsWith('no_show_') ? { id: 'report1', status: status.slice(8), responseDeadline: future, applicantResponse: status === 'no_show_responded' ? 'My explanation' : '' } : null
    const actions = applicationActions({ status, interview, report, referralId: base.referralId })
    mock([{ ...base, status, actions, interview, noShowReport: report, trustValue: 12, adminNotes: 'PRIVATE notes', employerContactNotes: 'PRIVATE contacts', reviewQueue: 'PRIVATE queue' }])
    render(<MyApplicationsPage token="applicant" />)
    await screen.findByRole('heading', { name: 'Demo Driver' })
    for (const [action, label] of Object.entries(labels)) expect(Boolean(screen.queryByRole('button', { name: label, exact: true }))).toBe(actions.includes(action))
    expect(screen.getByText('Demo Company')).toBeInTheDocument()
    expect(screen.getByText('Last update')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/PRIVATE|trustValue|reviewQueue/)
    if (report) expect(screen.getByText(/Response deadline:/)).toBeInTheDocument()
  })

  it('confirms an invitation through the existing confirmation dialog', async () => {
    const fetcher = mock([{ ...base, status: 'interview_invited', interview: { id: 'meeting1', scheduledAt: future }, actions: ['confirm'] }])
    render(<MyApplicationsPage token="applicant" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm interview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm', exact: true }))
    await waitFor(() => expect(fetcher.mock.calls.some(([url, options]) => url.endsWith('/interviews/meeting1/respond') && JSON.parse(options.body).action === 'confirm')).toBe(true))
  })

  it('sorts and paginates using server query parameters', async () => {
    const fetcher = mock([{ ...base, status: 'pending', actions: ['withdraw'] }], {}, 25)
    render(<MyApplicationsPage token="applicant" />)
    await screen.findByText('Demo Company')
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by last update' }), { target: { value: 'asc' } })
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('order=asc'))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true))
  })

  it('shows a friendly empty state and a suspension reason with an appeal action', async () => {
    mock([], { applyingSuspended: true, suspensionReason: 'Review required', appealPending: false })
    render(<MyApplicationsPage token="applicant" />)
    expect(await screen.findByText('Your next opportunity starts with an application')).toBeInTheDocument()
    expect(screen.getByText('Reason: Review required')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit an appeal' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Please reconsider.' } })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })
})
