import { useState } from 'react'
import { API_URL } from '../config'

export default function ApplicationResumeButton({ token, application }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!application?.resume) return null
  const download = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/applications/${application.id}/resume`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error((await response.json()).error || 'Resume unavailable.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = application.resume.name; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div className="mt-3 text-sm"><button type="button" disabled={busy} onClick={download} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-800 disabled:opacity-50">{busy ? 'Downloading...' : 'Download resume'}</button>{error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}</div>
}
