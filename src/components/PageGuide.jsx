import { useId, useState } from 'react'
import { API_URL } from '../config'
import { pageGuide } from '../../shared/pageGuides.js'

export default function PageGuide({ role, view, state, token, onSaved }) {
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const guide = pageGuide(role, view)
  if (!state || state.dismissedAll || !guide || state.seenPages?.includes(guide.key)) return null

  const dismiss = async (all = false) => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/profile/page-guides`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(all ? { dismissAll: true } : { page: guide.key }),
      })
      const body = await response.json()
      if (!response.ok || !body.pageGuides) throw new Error('Unable to save')
      onSaved?.(body.pageGuides)
    } catch { setError('Could not save your preference. Please try again.') }
    finally { setBusy(false) }
  }

  return <aside aria-labelledby={titleId} className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-slate-900">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Quick guide</p>
        <h3 id={titleId} className="mt-1 text-base font-semibold">{guide.title}</h3>
        <ul className="mt-2 list-outside list-disc space-y-1 pl-4 text-sm leading-relaxed text-slate-700">{guide.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
        <button type="button" disabled={busy} onClick={() => dismiss()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Got it'}</button>
        <button type="button" disabled={busy} onClick={() => dismiss(true)} className="text-xs text-slate-600 underline underline-offset-2 disabled:opacity-50">Hide all guides</button>
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
  </aside>
}
