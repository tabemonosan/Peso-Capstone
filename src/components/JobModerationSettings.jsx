import { useEffect, useState } from 'react'
import { API_URL } from '../config'

export default function JobModerationSettings({ token }) {
  const [settings, setSettings] = useState(null), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    fetch(`${API_URL}/api/admin/job-moderation/settings`, { headers: { Authorization: `Bearer ${token}` } }).then(async response => {
      const result = await response.json()
      if (!response.ok || typeof result.enabled !== 'boolean') throw new Error(result.error || 'Job screening settings unavailable.')
      if (active) setSettings(result)
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [token])
  const save = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/admin/job-moderation/settings`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !settings.enabled, reason }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setSettings(result); setReason('')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <details className="mt-4 rounded-xl border border-slate-300 bg-white p-4 text-slate-900"><summary className="cursor-pointer font-semibold">Automatic job approval{settings ? `: ${settings.enabled ? 'On' : 'Off'}` : ''}</summary>
    <p className="mt-2 text-sm">Established, verified employers can publish low-risk jobs automatically. Content concerns, new accounts, duplicate posts, and unusual posting volume go to PESO review.</p>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    {settings && <form onSubmit={save} className="mt-3"><label className="block text-sm">Reason for changing automatic job approval<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><button type="submit" disabled={busy || !reason.trim()} className="mt-3 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">{busy ? 'Saving...' : settings.enabled ? 'Turn off automatic approval' : 'Turn on automatic approval'}</button></form>}
  </details>
}
