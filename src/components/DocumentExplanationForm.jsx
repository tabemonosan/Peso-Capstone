import { useState } from 'react'
import { API_URL } from '../config'
import { EXPLANATION_CATEGORIES } from '../../shared/crossChecks.js'
import Modal from './Modal'
export default function DocumentExplanationForm({ token, docKey, onClose, onSent }) {
  const [category, setCategory] = useState(EXPLANATION_CATEGORIES[0]), [note, setNote] = useState(''), [file, setFile] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <Modal onClose={busy ? undefined : onClose} labelledBy="document-explanation-title"><h2 id="document-explanation-title" className="text-lg font-semibold">Explain a difference</h2><p className="my-2 text-sm">An explanation helps PESO review your document. You may continue without submitting one.</p><form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const body = new FormData(); body.append('category', category); body.append('note', note); if (file) body.append('supportingDocument', file)
      const response = await fetch(`${API_URL}/api/profile/document-explanations/${docKey}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Explanation unavailable')
      onSent?.(); onClose()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }} className="space-y-3 text-sm text-slate-900"><label className="block">Reason<select className="block w-full rounded border border-slate-300 bg-white p-2" value={category} onChange={e => setCategory(e.target.value)}>{EXPLANATION_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label className="block">Note (optional, 300 characters)<textarea className="block w-full rounded border border-slate-300 bg-white p-2" maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></label><label className="block">Supporting document (optional, one PDF, JPG or PNG)<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFile(e.target.files?.[0] || null)} /></label>{error && <p role="alert" className="text-rose-700">{error}</p>}<button type="submit" disabled={busy} className="rounded border border-cyan-600 bg-cyan-50 p-2 text-cyan-900">Send explanation</button><button type="button" disabled={busy} onClick={onClose} className="ml-2 rounded border bg-white p-2">Cancel</button></form></Modal>
}
