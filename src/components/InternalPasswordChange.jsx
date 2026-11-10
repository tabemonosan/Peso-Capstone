import { useState } from 'react'
import { API_URL } from '../config'
import PasswordInput from './PasswordInput'
import PasswordChecklist from './PasswordChecklist'
import { passwordErrorMessage } from '../utils/passwordPolicy'

export default function InternalPasswordChange({ token, email, onChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault(); setError('')
    const invalid = passwordErrorMessage(newPassword)
    if (invalid) return setError(invalid)
    if (confirmation !== newPassword) return setError('The new passwords do not match.')
    if (newPassword === currentPassword) return setError('Choose a password different from your initial password.')
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/change-password`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not change your password.')
      onChanged(result.token)
    } catch (err) { setError(err.message || 'Could not change your password.') } finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900"><section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-2xl font-bold">Choose your password</h1><p className="mt-2 text-sm text-slate-600">Welcome, {email}. Set your own password to continue to the portal.</p>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">Initial password<PasswordInput required autoComplete="current-password" className="shared-form-control mt-1 w-full rounded-lg px-3 py-2" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={busy} /></label>
      <label className="block text-sm font-medium">New password<PasswordInput required autoComplete="new-password" maxLength={64} className="shared-form-control mt-1 w-full rounded-lg px-3 py-2" value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={busy} /></label>
      <label className="block text-sm font-medium">Confirm new password<PasswordInput required autoComplete="new-password" maxLength={64} className="shared-form-control mt-1 w-full rounded-lg px-3 py-2" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
      <PasswordChecklist password={newPassword} confirmPassword={confirmation} />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className="rounded-full bg-cyan-700 px-5 py-2 font-semibold text-white">{busy ? 'Saving password...' : 'Save password and continue'}</button><button type="button" disabled={busy} className="rounded-full border border-slate-300 px-4 py-2" onClick={onLogout}>Sign out</button></div>
    </form>
  </section></main>
}
