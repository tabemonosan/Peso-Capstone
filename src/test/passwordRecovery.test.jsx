import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import InternalAccountsPage from '../components/InternalAccountsPage'
import { mutationDescription } from '../utils/actionConfirmation'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear() })
const response = (data, ok = true) => ({ ok, json: async () => data })
const submit = name => fireEvent.submit(screen.getByRole('button', { name }).closest('form'))

it('opens Forgot password from sign-in without submitting a login request', async () => {
  const fetcher = vi.fn(async () => response({}))
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Forgot password')
  expect(screen.getByLabelText('Registered email')).toBeInTheDocument()
  expect(fetcher.mock.calls.some(([input]) => input.endsWith('/api/login'))).toBe(false)
})

it('verifies an emailed code before accepting a new password, then returns to sign-in', async () => {
  const done = vi.fn(), fetcher = vi.fn(async input => response(input.endsWith('/request') ? { ok: true, retryAfter: 60, message: 'If this account exists, a code has been sent.' } : input.endsWith('/verify') ? { resetToken: 'one-time-token' } : { ok: true }))
  vi.stubGlobal('fetch', fetcher)
  render(<ForgotPasswordModal initialEmail="user@example.com" onClose={() => {}} onDone={done} />)
  submit('Send verification code')
  const code = await screen.findByLabelText('Verification code')
  expect(screen.getByRole('button', { name: 'Resend code in 60s' })).toBeDisabled()
  expect(screen.queryByLabelText('New password', { selector: 'input' })).not.toBeInTheDocument()
  fireEvent.change(code, { target: { value: '123456' } })
  submit('Verify code')
  const password = await screen.findByLabelText('New password', { selector: 'input' })
  fireEvent.change(password, { target: { value: 'NewPassword123!' } })
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: 'Mismatch123!' } })
  submit('Reset password')
  expect(screen.getByRole('alert')).toHaveTextContent('do not match')
  expect(fetcher.mock.calls.some(([input]) => input.endsWith('/reset'))).toBe(false)
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: 'NewPassword123!' } })
  submit('Reset password')
  await screen.findByRole('button', { name: 'Return to sign in' })
  const payload = JSON.parse(fetcher.mock.calls.find(([input]) => input.endsWith('/reset'))[1].body)
  expect(payload).toEqual({ email: 'user@example.com', resetToken: 'one-time-token', newPassword: 'NewPassword123!' })
  expect(localStorage.length).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Return to sign in' }))
  expect(done).toHaveBeenCalledWith('user@example.com')
})

it('preserves code entry after an incorrect code and allows resend after the cooldown', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn(async input => input.endsWith('/request') ? response({ ok: true, retryAfter: 1 }) : response({ error: 'Code is invalid or expired.' }, false))
  vi.stubGlobal('fetch', fetcher)
  render(<ForgotPasswordModal initialEmail="user@example.com" onClose={() => {}} onDone={() => {}} />)
  await act(async () => submit('Send verification code'))
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '000000' } })
  await act(async () => submit('Verify code'))
  expect(screen.getByRole('alert')).toHaveTextContent('invalid or expired')
  await act(async () => vi.advanceTimersByTime(1000))
  expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resend code' })))
  expect(screen.getByLabelText('Verification code')).toHaveValue('')
})

it('requires confirmation and a reason for Super Admin reset, then displays generated login details', async () => {
  const fetcher = vi.fn(async input => response(input.endsWith('/reset-password')
    ? { id: 'staff1', email: 'staff@example.com', adminLevel: 'staff', initialPassword: 'FreshInitial123!', mustChangePassword: true }
    : { items: [{ id: 'staff1', email: 'staff@example.com', adminLevel: 'staff', name: 'Staff User', disabled: false }], total: 1 }))
  vi.stubGlobal('fetch', fetcher)
  render(<InternalAccountsPage token="owner-token" currentId="owner1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }))
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  expect(fetcher.mock.calls.some(([input]) => input.endsWith('/reset-password'))).toBe(false)
  fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Staff member lost their password.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await screen.findByRole('heading', { name: 'Password reset' })
  expect(screen.getByLabelText('Login details').value).toContain('FreshInitial123!')
  const call = fetcher.mock.calls.find(([input]) => input.endsWith('/reset-password'))
  expect(call[0]).toContain('/internal-accounts/staff1/reset-password')
  expect(call[1].method).toBe('POST')
  expect(JSON.parse(call[1].body).reason).toBe('Staff member lost their password.')
})

it('treats code verification as validation and gives password reset a specific confirmation', () => {
  expect(mutationDescription('http://localhost:4000/api/auth/password-recovery/verify', { method: 'POST' })).toBeNull()
  expect(mutationDescription('http://localhost:4000/api/auth/password-recovery/reset', { method: 'POST' }).title).toBe('Reset your password?')
})
