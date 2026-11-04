import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import AdminDocumentVerification, { VerificationQueueBadge } from '../components/AdminDocumentVerification'

const fetchMock = vi.fn()
const item = { role: 'Applicant', accountId: 'abc', email: 'demo@example.invalid', docKey: 'validId1', label: 'Valid ID #1', version: 1, status: 'pending', at: '2026-01-01T00:00:00Z', overdue: true, unresolved: 1, reasons: ['Flagged'], findings: [{ ruleId: 'name_difference', fieldGroup: 'name', evidence: 'independent', severity: 'warning', status: 'open' }], audit: [] }
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset()
  fetchMock.mockImplementation(async (url, options) => ({ ok: true, json: async () => url.endsWith('/counts') ? { flagged: 8 } : options?.method === 'POST' ? { ok: true } : { items: [item], total: 26, limit: 25 } }))
})
afterEach(() => vi.unstubAllGlobals())

it('shows reason tags and aged documents, and sends filters, sorting and pagination to the server', async () => {
  render(<AdminDocumentVerification token="admin-token" />)
  await screen.findByText('Waiting at least 7 days')
  expect(screen.getByText('Flagged')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'validId1' } })
  fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'desc' } })
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('docKey=validId1') && url.includes('order=desc'))).toBe(true))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true))
})

it('requires a reason and explicit unresolved flag confirmation before approving', async () => {
  render(<AdminDocumentVerification token="admin-token" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).getByText('1 flags unresolved. Approve anyway?')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Original document reviewed' } })
  within(dialog).getAllByRole('checkbox').forEach(checkbox => fireEvent.click(checkbox))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await screen.findByText('Approve recorded.')
  const [, options] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
  expect(JSON.parse(options.body)).toMatchObject({ action: 'approve', version: 1, unresolved: 1, reason: 'Original document reviewed' })
  expect(options.headers.Authorization).toBe('Bearer admin-token')
})

it('prefills resubmission reasons from field groups without inserting document values', async () => {
  render(<AdminDocumentVerification token="admin-token" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Request resubmission' }))
  expect(screen.getByRole('textbox', { name: 'Reason' })).toHaveValue('Please review name')
})

it('opens findings in the existing modal shell and requires a note to resolve a flag', async () => {
  render(<AdminDocumentVerification token="admin-token" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Review details' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resolve flag' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Checked with original record' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST' && JSON.parse(options.body).ruleId === 'name_difference')).toBe(true))
})

it('offers checked/unchecked filters and Mark checked on automatic approvals', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [{ ...item, status: 'approved', autoApproved: true }], total: 1, limit: 25 }) })
  render(<AdminDocumentVerification token="admin-token" queue="auto" />)
  await screen.findByRole('button', { name: 'Mark checked' })
  fireEvent.change(screen.getByLabelText('Admin confirmation'), { target: { value: 'false' } })
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('checked=false') && url.includes('queue=auto'))).toBe(true))
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
})

it('shows a sidebar count and displays queue failures without hiding them', async () => {
  const badge = render(<VerificationQueueBadge token="admin-token" />)
  expect(await screen.findByLabelText('8 documents flagged for review')).toBeInTheDocument()
  badge.unmount()
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Document review tools are switched off' }) })
  render(<AdminDocumentVerification token="admin-token" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Document review tools are switched off')
})
