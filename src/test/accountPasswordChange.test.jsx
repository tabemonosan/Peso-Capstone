import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AccountPasswordChange from '../components/AccountPasswordChange'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const fill = (current, next) => {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: next } })
}
it('rejects the current password before sending a request', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  render(<AccountPasswordChange token="token" onChanged={() => {}} />)
  fill('SamePassword123!', 'SamePassword123!')
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
  expect(screen.getByRole('alert')).toHaveTextContent('different from your current password')
  expect(fetcher).not.toHaveBeenCalled()
})
it('submits a different password and ends the signed-in flow only after success', async () => {
  const onChanged = vi.fn(), fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  vi.stubGlobal('fetch', fetcher)
  render(<AccountPasswordChange token="token" onChanged={onChanged} />)
  fill('OldPassword123!', 'NewPassword456!')
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ currentPassword: 'OldPassword123!', newPassword: 'NewPassword456!' })
})
