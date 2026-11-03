import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import AdminNsrpAutomation, { AdminNsrpAccountDecision } from '../components/AdminNsrpAutomation'

const fetchMock = vi.fn()
const settings = { applicant: true, employer: true, auditPercent: 10, rateLimit: 5, history: [] }
const decision = { _id: 'Applicant:123:1', role: 'Applicant', result: 'Auto-approved', at: '2026-11-01T10:00:00Z', rulesVersion: '2026-11-01.1', report: { level: 'clear', summary: { critical: 0, warning: 0, info: 0 } } }
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url) => ({ ok: true, json: async () => url.includes('/settings') ? settings : { items: [decision], total: 1 } }))
})
afterEach(() => vi.unstubAllGlobals())

it('loads the ON banner, validates settings controls, and saves admin choices', async () => {
  render(<AdminNsrpAutomation token="admin-token" />)
  await screen.findByText(/Auto-approval is ON/)
  fireEvent.click(screen.getByLabelText(/Auto-approve applicant NSRPs/))
  fireEvent.change(screen.getByLabelText(/Audit sample percentage/), { target: { value: '25' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save verification rules' }))
  await screen.findByRole('status')
  const request = fetchMock.mock.calls.find(([, options]) => options.method === 'PUT')
  expect(JSON.parse(request[1].body)).toEqual({ applicant: false, employer: true, auditPercent: 25, rateLimit: 5 })
  expect(request[1].headers.Authorization).toBe('Bearer admin-token')
})

it('filters the audit log by decision and date', async () => {
  render(<AdminNsrpAutomation token="admin-token" />)
  await screen.findByRole('heading', { name: 'Auto-approval log' })
  fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'Audit sample' } })
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } })
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('result=Audit+sample') && url.includes('from=2026-11-01'))).toBe(true))
})

it('requires confirmation and a reason before revoking an automatic approval', async () => {
  render(<AdminNsrpAccountDecision token="admin-token" accountId="123" role="Applicant" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke auto-approval' }))
  const confirm = screen.getByRole('button', { name: 'Confirm revoke' })
  expect(confirm).toBeDisabled()
  expect(fetchMock.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Supervisor review requested' } })
  fireEvent.click(confirm)
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/revoke') && JSON.parse(options.body).reason === 'Supervisor review requested')).toBe(true))
})
