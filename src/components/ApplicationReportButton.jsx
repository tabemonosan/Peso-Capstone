import { useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'

export default function ApplicationReportButton({ token, referralId, onSubmitted, allowNoShow = false }) {
  const [type, setType] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  if (!referralId) return null
  const report = async (reason) => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/applications/reports`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ referralId, type, reason }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setType(''); setMessage('Your report was sent to PESO.'); onSubmitted?.()
    } catch (err) { setError(err.message || 'Report failed') }
    finally { setBusy(false) }
  }
  return <div className="mt-3 text-xs text-slate-700">
    <button type="button" onClick={() => { setError(''); setType('problem') }} className="mr-3 underline">Report a problem</button>
    {allowNoShow && <button type="button" onClick={() => { setError(''); setType('no_show') }} className="underline">Report a no-show</button>}
    {message && <p role="status" className="mt-2">{message}</p>}
    {type && <ConfirmDialog title={type === 'no_show' ? 'Report a no-show' : 'Report an application problem'} note="PESO will review your report. It does not automatically change the application decision." requireReason reasonMinLength={1} busy={busy} error={error} onConfirm={report} onCancel={() => setType('')} />}
  </div>
}
