import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AdminEmailDelivery from '../components/AdminEmailDelivery'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const entry = { _id: 'delivery1', recipientEmail: 'user@example.test', subject: 'Interview invitation', status: 'failed', retryable: true, purpose: 'notification', attempts: 1, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), lastError: 'The email provider did not accept the message.' }
it('filters deliveries and confirms a manual retry before contacting the server', async () => {
  let retried = false
  const fetcher = vi.fn(async (_url, options) => {
    if (options?.method === 'POST') { retried = true; return { ok: true, json: async () => ({ delivered: true }) } }
    return { ok: true, json: async () => ({ items: [{ ...entry, status: retried ? 'sent' : 'failed' }], total: 1 }) }
  })
  vi.stubGlobal('fetch', fetcher)
  render(<AdminEmailDelivery token="admin-token" />)
  await screen.findByText('Interview invitation')
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } })
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get('status') === 'failed')).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: 'Retry email' }))
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry email' })).not.toBeInTheDocument())
})
it('directs verification failures to request a fresh code instead of retrying an old message', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [{ ...entry, purpose: 'verification', retryable: false }], total: 1 }) })))
  render(<AdminEmailDelivery token="admin-token" />)
  expect(await screen.findByText(/Request a fresh code or link/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry email' })).not.toBeInTheDocument()
})
