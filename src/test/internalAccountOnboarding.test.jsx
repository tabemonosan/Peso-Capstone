import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import InternalAccountsPage from '../components/InternalAccountsPage'
import InternalPasswordChange from '../components/InternalPasswordChange'
import App from '../App'

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor); else delete navigator.clipboard; localStorage.clear(); window.history.replaceState({}, '', '/') })
const response = (data, ok = true) => ({ ok, json: async () => data })

it('creates a Staff account without entering a password and copies the generated details', async () => {
  const clipboard = vi.fn().mockRejectedValueOnce(new Error('Clipboard unavailable')).mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
  const fetcher = vi.fn(async (_input, options) => response(options?.method === 'POST'
    ? { id: 'new1', email: 'new@example.com', adminLevel: 'staff', initialPassword: 'Generated123!a', mustChangePassword: true }
    : { items: [], total: 0 }))
  vi.stubGlobal('fetch', fetcher)
  render(<InternalAccountsPage token="super-token" currentId="super1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(screen.getByLabelText('Access level')).toHaveValue('staff')
  expect(screen.queryByLabelText('Initial password')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('name'), { target: { value: 'New Staff' } })
  fireEvent.change(screen.getByLabelText('email'), { target: { value: 'new@example.com' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).queryByLabelText('Reason')).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await screen.findByRole('heading', { name: 'Account created' })
  const payload = JSON.parse(fetcher.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
  expect(payload).toMatchObject({ name: 'New Staff', email: 'new@example.com', adminLevel: 'staff' })
  expect(payload.password).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Copy login details' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Select and copy')
  expect(screen.getByLabelText('Login details').value).toContain('Generated123!a')
  fireEvent.click(screen.getByRole('button', { name: 'Copy login details' }))
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('Initial password: Generated123!a')))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(localStorage.length).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss login details' }))
  expect(screen.queryByLabelText('Login details')).not.toBeInTheDocument()
})

it('validates password confirmation and displays server errors without continuing', async () => {
  const changed = vi.fn(), fetcher = vi.fn(async () => response({ error: 'The current password is incorrect.' }, false))
  vi.stubGlobal('fetch', fetcher)
  render(<InternalPasswordChange token="initial-token" email="new@example.com" onChanged={changed} onLogout={() => {}} />)
  fireEvent.change(screen.getByLabelText('Initial password', { selector: 'input' }), { target: { value: 'Initial123!' } })
  fireEvent.change(screen.getByLabelText('New password', { selector: 'input' }), { target: { value: 'OwnPassword123!' } })
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: 'Mismatch123!' } })
  const form = screen.getByRole('button', { name: 'Save password and continue' }).closest('form')
  fireEvent.submit(form)
  expect(screen.getByRole('alert')).toHaveTextContent('do not match')
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: 'OwnPassword123!' } })
  fireEvent.submit(form)
  expect(await screen.findByRole('alert')).toHaveTextContent('current password is incorrect')
  expect(changed).not.toHaveBeenCalled()
})

it('restores a first-sign-in session to password setup and uses the replacement session to enter the portal', async () => {
  localStorage.setItem('peso-token', 'initial-token')
  const fetcher = vi.fn(async input => {
    const path = new URL(input).pathname
    if (path === '/api/profile') return response({ id: 'staff1', email: 'new@example.com', role: 'Admin', adminLevel: 'staff', mustChangePassword: true, profile: {} })
    if (path === '/api/admin/change-password') return response({ token: 'replacement-token', mustChangePassword: false })
    if (path === '/api/dashboard') return response({ role: 'Admin', adminLevel: 'staff', tasks: { applicants: 1, employers: 2, jobs: 3, hiringUpdates: 4 } })
    if (path === '/api/notifications') return response({ items: [], unreadCount: 0 })
    if (path === '/api/admin/users') return response([])
    return response({})
  })
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  await screen.findByRole('heading', { name: 'Choose your password' })
  expect(screen.queryByRole('navigation', { name: 'Admin navigation' })).not.toBeInTheDocument()
  for (const [label, value] of [['Initial password', 'Initial123!'], ['New password', 'OwnPassword123!'], ['Confirm new password', 'OwnPassword123!']]) fireEvent.change(screen.getByLabelText(label, { selector: 'input' }), { target: { value } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save password and continue' }).closest('form'))
  await screen.findByRole('heading', { name: 'Staff work queue' })
  expect(localStorage.getItem('peso-token')).toBe('replacement-token')
  expect(fetcher.mock.calls.some(([input, options]) => new URL(input).pathname === '/api/dashboard' && options?.headers?.Authorization === 'Bearer replacement-token')).toBe(true)
})
