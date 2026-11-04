import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmployerInterviewPanel from '../components/EmployerInterviewPanel'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
function mount({ future = false, status = 'confirmed', report = null, outcome, stallReports = false } = {}) {
  let meeting = { id: 'meeting1', status, scheduledAt: new Date(Date.now() + (future ? 86400000 : -3600000)).toISOString(), mode: 'In person', location: 'Demo office', noShowReport: report }
  const fetcher = vi.fn(async (url, options) => {
    if (options?.method === 'POST') {
      if (url.endsWith('/reports') && stallReports) return new Promise(() => {})
      if (url.endsWith('/held')) meeting = { ...meeting, status: 'held', history: [{ action: 'employer_recorded_interview_held', at: new Date().toISOString() }] }
      if (url.endsWith('/reports')) meeting = { ...meeting, noShowReport: { status: 'pending', reportedAt: new Date().toISOString() } }
    }
    return { ok: true, json: async () => meeting }
  })
  vi.stubGlobal('fetch', fetcher)
  render(<EmployerInterviewPanel token="employer" referralId="referral1" outcome={outcome} />)
  return fetcher
}
describe('employer interview results', () => {
  it('allows updated invitations and normal progress after a dismissed no-show', async () => {
    mount({ future: true, report: { status: 'dismissed' } })
    expect(await screen.findByRole('button', { name: 'Send updated invitation' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Interview completed' })).toBeEnabled()
    expect(screen.getByText('2. Invitation accepted').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByText('3. Interview result review')).not.toBeInTheDocument()
  })
  it('recovers from a stalled no-show POST and checks saved state before retrying', async () => {
    vi.useFakeTimers()
    let fetcher
    await act(async () => { fetcher = mount({ stallReports: true }) })
    fireEvent.click(screen.getByRole('button', { name: 'Report no-show' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Report no-show' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Applicant did not attend.' } })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(30001) })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('timed out')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeEnabled()
    const sent = fetcher.mock.calls.find(([url, options]) => url.endsWith('/reports') && options?.method === 'POST')
    expect(sent[1].signal.aborted).toBe(true)
    fetcher.mockImplementation(async () => ({ ok: true, json: async () => ({ id: 'meeting1', status: 'confirmed', scheduledAt: new Date(Date.now() - 3600000).toISOString(), noShowReport: { status: 'pending' } }) }))
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' })) })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    expect(screen.getByText(/PESO is reviewing/)).toBeInTheDocument()
  })

  it('enables early decisions but cancellation never sends a result', async () => {
    const fetcher = mount({ future: true })
    expect(await screen.findByRole('button', { name: 'Interview completed' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Report no-show' })).toBeEnabled()
    expect(screen.getByText(/You can record a result ahead of time/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send updated invitation' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Interview completed' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Record this interview result ahead of time?' })
    expect(within(dialog).getByRole('button', { name: 'Yes, record early' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })
  it.each([['Interview completed', '/held'], ['Report no-show', '/reports']])('requires explicit early confirmation for %s and displays the recorded time', async (label, suffix) => {
    const fetcher = mount({ future: true })
    fireEvent.click(await screen.findByRole('button', { name: label }))
    const dialog = screen.getByRole('alertdialog', { name: 'Record this interview result ahead of time?' })
    expect(within(dialog).getByText(/Are you sure/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Interview arrangements changed by agreement.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, record early' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const sent = fetcher.mock.calls.find(([url, options]) => url.endsWith(suffix) && options?.method === 'POST')
    expect(JSON.parse(sent[1].body)).toMatchObject({ confirmEarly: true, reason: 'Interview arrangements changed by agreement.' })
    expect(await screen.findByText(/Decision confirmed:/)).toHaveTextContent('Philippine time')
    expect(screen.getByText(/Decision confirmed:/)).toHaveTextContent('Recorded ahead of the scheduled interview')
  })
  it('confirms completion, sends the result, and advances to step 3', async () => {
    const fetcher = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Interview completed' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Mark interview as completed?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('3. Post-interview task').closest('li')).toHaveAttribute('aria-current', 'step'))
    expect(fetcher.mock.calls.some(([url, options]) => url.endsWith('/interviews/meeting1/held') && options?.method === 'POST')).toBe(true)
    expect(screen.getByText('Status: Interview completed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report no-show' })).not.toBeInTheDocument()
  })
  it('requires a no-show explanation and advances to step 3 review', async () => {
    const fetcher = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Report no-show' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Report no-show' })
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Applicant did not arrive for the interview.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('3. Interview result review').closest('li')).toHaveAttribute('aria-current', 'step'))
    const sent = fetcher.mock.calls.find(([url, options]) => url.endsWith('/applications/reports') && options?.method === 'POST')
    expect(JSON.parse(sent[1].body)).toMatchObject({ referralId: 'referral1', type: 'no_show', reason: 'Applicant did not arrive for the interview.' })
    expect(screen.getByText(/PESO is reviewing/)).toBeInTheDocument()
  })
  it.each([{ status: 'invited' }, { report: { status: 'pending' } }, { outcome: 'hired' }])('hides result controls for unavailable states %j', async options => {
    mount(options)
    await screen.findByText(/Status:/)
    expect(screen.queryByRole('button', { name: 'Interview completed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report no-show' })).not.toBeInTheDocument()
  })
})
