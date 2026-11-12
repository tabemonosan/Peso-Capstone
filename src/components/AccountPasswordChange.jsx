import { useState } from 'react'
import { API_URL } from '../config'
import PasswordInput from './PasswordInput'
import PasswordChecklist from './PasswordChecklist'
import { passwordErrorMessage } from '../utils/passwordPolicy'

export default function AccountPasswordChange({ token, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const submit = async event => {
    event.preventDefault(); setError('')
    const invalid = passwordErrorMessage(newPassword)
    if (invalid) return setError(invalid)
    if (newPassword === currentPassword) return setError('Choose a new password different from your current password.')
    if (newPassword !== confirmation) return setError('The new passwords do not match.')
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not change password.')
      onChanged()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900">
    <h2 className="text-lg font-semibold">Change password</h2>
    <p className="mt-1 text-sm text-slate-600">Choose a password different from your current password. After saving, sign in again with your new password.</p>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block text-sm">Current password<PasswordInput required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={busy} className="shared-form-control mt-1 w-full rounded-lg px-3 py-2" /></label>
      <label className="block text-sm">New password<PasswordInput required autoComplete="new-password" maxLength={64} value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={busy} className="shared-form-control mt-1 w-full rounded-lg px-3 py-2" /></label>
      <label className="block text-sm">Confirm new password<PasswordInput required autoComplete="new-password" maxLength={64} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} className="shared-form-control mt-1 w-full rounded-lg px-3 py-2" /></label>
      <PasswordChecklist password={newPassword} confirmPassword={confirmation} />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button disabled={busy} className="rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{busy ? 'Saving?' : 'Change password'}</button>
    </form>
  </section>
}
