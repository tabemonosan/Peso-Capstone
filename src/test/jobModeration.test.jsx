import { AdminAccessContext } from '../components/AdminAccessContext'
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JobModerationSettings from '../components/JobModerationSettings'
import JobScreeningSummary from '../components/JobScreeningSummary'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('job safety controls', () => {
  it('loads the current admin setting and requires a reason before changing it', async () => {
    const fetcher = vi.fn(async (_url, options) => ({ ok: true, json: async () => ({ enabled: options?.method === 'PUT' ? false : true }) }))
    vi.stubGlobal('fetch', fetcher)
    render(<JobModerationSettings token="admin" />)
    const toggle = await screen.findByRole('button', { name: 'Turn off automatic approval', hidden: true })
    fireEvent.click(screen.getByText('Automatic job approval: On'))
    expect(toggle).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for changing automatic job approval' }), { target: { value: 'PESO requires manual review during maintenance.' } })
    fireEvent.click(toggle)
    await screen.findByText('Automatic job approval: Off')
    const [, options] = fetcher.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(JSON.parse(options.body)).toEqual({ enabled: false, reason: 'PESO requires manual review during maintenance.' })
  })
  it('keeps a failed settings update visible and retains the previous setting', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: options?.method !== 'PUT', json: async () => options?.method === 'PUT' ? { error: 'Settings could not be saved.' } : { enabled: true } })))
    render(<JobModerationSettings token="admin" />)
    await screen.findByText('Automatic job approval: On')
    fireEvent.click(screen.getByText('Automatic job approval: On'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Maintenance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off automatic approval' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Settings could not be saved.'))
    expect(screen.getByText('Automatic job approval: On')).toBeInTheDocument()
  })
  it('shows the reason a job requires PESO review', () => {
    render(<JobScreeningSummary moderation={{ decision: 'manual_review', findings: [{ code: 'prohibited_mlm', message: 'Possible MLM or recruitment-based earning scheme.' }] }} />)
    expect(screen.getByText('PESO review required')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Possible MLM')
  })
})

// These existing workflows exercise privileges now reserved for Super Admin.
function render(ui, options) { return rtlRender(<AdminAccessContext.Provider value={{ adminLevel: 'super_admin' }}>{ui}</AdminAccessContext.Provider>, options) }
