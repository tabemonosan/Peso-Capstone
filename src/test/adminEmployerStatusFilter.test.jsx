import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})

it('sends the selected employer status and resets pagination when it changes', async () => {
  localStorage.setItem('peso-token', 'admin-token')
  localStorage.setItem('peso-active-role', 'Admin')
  localStorage.setItem('peso-active-view', 'employers')
  window.history.replaceState({}, '', '/?empPage=2')
  const fetchMock = vi.fn(async (input) => {
    const url = new URL(input)
    let data = {}
    if (url.pathname === '/api/profile') data = { role: 'Admin', email: 'admin@example.com', profile: {} }
    if (url.pathname === '/api/admin/users') {
      data = url.searchParams.has('role')
        ? { items: [{ id: 'employer-1', companyName: 'Example Works', email: 'employer@example.com', approvalStatus: url.searchParams.get('status') === 'all' ? 'approved' : url.searchParams.get('status') }], total: 21, totalPages: 3 }
        : []
    }
    if (url.pathname === '/api/notifications') data = { items: [], unreadCount: 0 }
    return { ok: true, json: async () => data }
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  const filter = await screen.findByRole('combobox', { name: 'Filter employers by status' })
  const requested = (status, page) => fetchMock.mock.calls.some(([input]) => {
    const url = new URL(input)
    return url.pathname === '/api/admin/users' && url.searchParams.get('role') === 'Employer'
      && url.searchParams.get('status') === status && url.searchParams.get('page') === page
  })
  await waitFor(() => expect(requested('all', '2')).toBe(true))
  for (const status of ['pending', 'under_review', 'approved', 'declined', 'needs_resubmission', 'all']) {
    fireEvent.change(filter, { target: { value: status } })
    await waitFor(() => expect(requested(status, '1')).toBe(true))
  }
})
