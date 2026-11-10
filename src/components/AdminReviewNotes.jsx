import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'
import Pagination from './Pagination'

export default function AdminReviewNotes({ token, entityType, entityId }) {
  const [items, setItems] = useState([]), [page, setPage] = useState(1), [total, setTotal] = useState(0)
  const [note, setNote] = useState(''), [recommendation, setRecommendation] = useState('note')
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/review-notes?${new URLSearchParams({ ...(entityType ? { entityType, entityId } : {}), page, limit: 10 })}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setItems(data.items || []); setTotal(data.total || 0)
    } catch (err) { setError(err.message || 'Notes unavailable.') }
  }, [token, entityType, entityId, page])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/admin/review-notes`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType, entityId, recommendation, note }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setConfirm(false); setNote(''); setPage(1); await load()
    } catch (err) { setError(err.message || 'Could not save note.') } finally { setBusy(false) }
  }
  return <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
    <h3 className="font-semibold">Review notes and recommendations</h3>
    <p className="mt-1 text-xs text-slate-600">Internal PESO notes. Recommendations do not change account, document, or hiring status.</p>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    {entityId && <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); setError(''); setConfirm(true) }}>
      <label className="block text-sm">Recommendation<select className="shared-form-control mt-1 block w-full rounded-lg px-3 py-2" value={recommendation} onChange={event => setRecommendation(event.target.value)}>{[['note', 'Review note'], ['approve', 'Recommend approval'], ['decline', 'Recommend decline'], ['correction', 'Recommend correction'], ['follow_up', 'Hiring / record follow-up']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm">Note<textarea className="shared-form-control mt-1 block w-full rounded-lg px-3 py-2" required maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
      <button type="submit" disabled={busy || !note.trim()} className="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">Add note</button>
    </form>}
    <ul className="mt-3 space-y-3">{items.map(item => <li key={item._id} className="border-t border-slate-200 pt-3 text-sm"><p className="font-medium">{item.recommendation.replaceAll('_', ' ')} · {item.authorEmail}</p><p className="mt-1 whitespace-pre-wrap break-words">{item.note}</p><p className="mt-1 text-xs text-slate-500">{item.entityType}: {item.entityLabel || item.entityId} · {new Date(item.createdAt).toLocaleString()}</p></li>)}</ul>
    {!items.length && <p className="mt-3 text-sm text-slate-500">No review notes yet.</p>}
    {total > 10 && <Pagination page={page} pageSize={10} totalItems={total} onPageChange={setPage} itemLabel="notes" />}
    {confirm && <ConfirmDialog title="Add this internal recommendation?" note="This note is recorded with your account. A final decision must be made by an authorized reviewer." busy={busy} error={error} onConfirm={save} onCancel={() => setConfirm(false)} />}
  </section>
}
