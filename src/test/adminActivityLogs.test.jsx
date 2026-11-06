import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AdminActivityLogs from '../components/AdminActivityLogs'

const entry = { _id: 'log-1', actorEmail: 'admin@example.test', action: 'Approved birth certificate', method: 'POST', path: '/api/admin/document-verification/action', targetId: '000000000000000000000001', outcome: 'success', statusCode: 200, at: '2026-11-05T16:30:00Z' }
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [entry], total: 41, page: 1, limit: 20 }) })))
})
afterEach(() => vi.unstubAllGlobals())

it('shows the admin, business action, result, and Philippine date without HTTP details', async () => {
  render(<AdminActivityLogs token="admin-token" />)
  expect(await screen.findByText('Approved birth certificate')).toBeInTheDocument()
  expect(screen.getByText('admin@example.test')).toBeInTheDocument()
  expect(screen.getByText('Completed')).toBeInTheDocument()
  expect(screen.getByText(/Nov 6, 2026/)).toBeInTheDocument()
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-token')
  expect(screen.queryByText(/HTTP 200|Request details/)).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Views and downloads' })).not.toBeInTheDocument()
})

it('applies filters, moves between pages, refreshes and clears filters', async () => {
  render(<AdminActivityLogs token="admin-token" />)
  await screen.findByText('Approved birth certificate')
  fireEvent.change(screen.getByLabelText('Search admin or action'), { target: { value: 'approval' } })
  fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'failed' } })
  fireEvent.change(screen.getByLabelText('Action type'), { target: { value: 'PUT' } })
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-06' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  await waitFor(() => expect(fetch.mock.calls.at(-1)[0]).toContain('search=approval&outcome=failed&method=PUT&from=2026-11-06'))
  await screen.findByText('Approved birth certificate')
  fireEvent.click(screen.getByRole('button', { name: /Next page/i }))
  await waitFor(() => expect(fetch.mock.calls.at(-1)[0]).toContain('page=2'))
  await screen.findByText('Approved birth certificate')
  const count = fetch.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }))
  await waitFor(() => expect(fetch.mock.calls.length).toBe(count + 1))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(fetch.mock.calls.at(-1)[0]).toContain('search=&outcome=&method=&from=&to=&page=1'))
})

it('shows empty results and errors without presenting stale activity', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [], total: 0 }) })
  render(<AdminActivityLogs token="admin-token" />)
  expect(await screen.findByText('No activity logs match these filters.')).toBeInTheDocument()
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Activity logs are unavailable.' }) })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Activity logs are unavailable.')
  expect(screen.queryByText('No activity logs match these filters.')).not.toBeInTheDocument()
})
