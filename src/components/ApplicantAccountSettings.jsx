import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'

export default function ApplicantAccountSettings({ token, onMessage }) {
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [action, setAction] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('accountSettings') === '1') document.getElementById('account-settings')?.scrollIntoView?.({ block: 'start' })
    let cancelled = false
    fetch(`${API_URL}/api/account-deletion/current`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load account settings.')
        if (!cancelled) setRecord(data)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/api/account-deletion/requests${action === 'cancel' ? `/${record._id}` : ''}`, {
        method: action === 'cancel' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(action !== 'cancel' ? { body: JSON.stringify({ password, reason }) } : {}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update deletion request.')
      setRecord(data)
      setPassword('')
      setReason('')
      setAction(null)
      onMessage?.(action === 'cancel' ? 'Account deletion request cancelled.' : 'Account deletion request sent to PESO.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const awaitingReview = ['pending', 'processing'].includes(record?.status)
  return (
    <section id="account-settings" aria-labelledby="account-settings-title" className="mt-6 rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
      <h3 id="account-settings-title" className="text-xl font-semibold">Account settings</h3>
      <p className="mt-2 text-sm text-slate-600">Request account deletion for PESO review. Approval closes this account and ends existing sessions. PESO retains your NSRP registration and employment records separately; this request does not erase those records.</p>
      <p className="mt-2 text-sm text-slate-600">After approval, you can use the same email to register a fresh account. Your old login will stop working. The new account will need new registration and verification and will not inherit your previous documents, applications, or referrals.</p>
      {loading && <p className="mt-3 text-sm">Loading account settings...</p>}
      {error && !action && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {!loading && record?.status && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-semibold">{({ pending: 'Pending admin review', processing: 'PESO is processing account closure', declined: 'Deletion request declined', cancelled: 'Deletion request cancelled', approved: 'Account deletion approved' })[record.status]}</p>
        {record.reviewReason && <p className="mt-1">PESO feedback: {record.reviewReason}</p>}
        {record.status === 'pending' && <p className="mt-1">You can keep using your account or cancel this request until PESO begins approval.</p>}
        {record.status === 'pending' && <button type="button" onClick={() => { setError(''); setAction('cancel') }} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold">Cancel deletion request</button>}
      </div>}
      {!loading && !awaitingReview && record?.status !== 'approved' && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); setError(''); setAction('request') }}>
        <label className="block text-sm font-medium">Current password
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="shared-form-control mt-1 w-full rounded-xl px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">Reason for deletion (optional)
          <textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className="shared-form-control mt-1 w-full rounded-xl px-3 py-2" />
        </label>
        <button type="submit" disabled={!password || Boolean(error)} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Request account deletion</button>
      </form>}
      {action && <ConfirmDialog
        title={action === 'cancel' ? 'Cancel your account deletion request?' : 'Request account deletion?'}
        note={action === 'cancel' ? 'Your account will stay active and PESO will no longer review this request.' : 'Your account stays active while pending. After PESO approval, this login and existing sessions stop working. PESO records are retained separately, and your email can be used for a fresh registration.'}
        confirmLabel={action === 'cancel' ? 'Yes, cancel request' : 'Send deletion request'}
        confirmTone={action === 'cancel' ? 'primary' : 'danger'}
        busy={busy} error={error} onConfirm={submit}
        onCancel={() => { if (!busy) { setAction(null); setError('') } }}
      />}
    </section>
  )
}
