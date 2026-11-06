import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import AdminReportMaker from '../components/AdminReportMaker'
vi.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>
  return { Bar: Stub, BarChart: Stub, CartesianGrid: Stub, Legend: Stub, ResponsiveContainer: Stub, Tooltip: Stub, XAxis: Stub, YAxis: Stub }
})
const report = { title: 'PESO activity report', generatedAt: '2026-01-02T01:00:00Z', range: { start: '2026-01-01', end: '2026-01-02', timeZone: 'Asia/Manila' }, metrics: [{ key: 'applicants', label: 'Applicant registrations', count: 3, basis: 'Registration date', statuses: [] }], daily: [], note: 'Counts use their own date basis.' }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('admin report maker', () => {
  it('downloads the generated preview as PDF and CSV with its selected dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => report })))
    const objectUrl = vi.fn(() => 'blob:report')
    vi.stubGlobal('URL', class extends URL { static createObjectURL = objectUrl; static revokeObjectURL = vi.fn() })
    const names = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download) })
    render(<AdminReportMaker token="admin-token" />)
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download CSV' }))
    await waitFor(() => expect(names).toContain('peso-report-2026-01-01-2026-01-02.csv'))
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(names).toContain('peso-report-2026-01-01-2026-01-02.pdf'))
    expect(objectUrl.mock.calls.map(([blob]) => blob.type)).toEqual(['text/csv;charset=utf-8', 'application/pdf'])
  })

  it.each(['today', 'week', 'month'])('generates the selected %s report and offers both exports', async preset => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => report }))
    vi.stubGlobal('fetch', fetcher)
    render(<AdminReportMaker token="admin-token" />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Report period' }), { target: { value: preset } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    const preview = await screen.findByRole('article', { name: 'Generated activity report' })
    expect(within(preview).getByText('3')).toBeInTheDocument()
    expect(within(preview).getByRole('button', { name: 'Download PDF' })).toBeEnabled()
    expect(within(preview).getByRole('button', { name: 'Download CSV' })).toBeEnabled()
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-token')
    expect(within(preview).getByText('No activity recorded for this period.')).toBeInTheDocument()
  })
  it('sends custom inclusive dates and handles server errors', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Report unavailable.' }) }))
    vi.stubGlobal('fetch', fetcher)
    render(<AdminReportMaker token="admin-token" />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Report period' }), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Report unavailable.'))
    expect(fetcher.mock.calls[0][0]).toContain('start=2026-01-01&end=2026-01-02')
    expect(screen.getByRole('button', { name: 'Create report' })).toBeEnabled()
  })
})
