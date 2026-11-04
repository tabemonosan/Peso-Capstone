import { useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'
import { VERIFICATION_DOC_LABELS } from '../../shared/verificationDocs.js'
import { WAITLIST_DOCUMENTS } from '../../shared/consistencyWaitlist.js'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
const control = 'shared-form-control rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900'
const labels = { release: 'Release from waitlist', request: 'Request another document', resolve: 'Resolve waitlist flag', grant: 'Grant more chances', decline: 'Decline account' }
export default function AdminWaitlistActions({ item, token, onChanged }) {
  const [action, setAction] = useState(''), [docKey, setDocKey] = useState(item.docKey), [attempts, setAttempts] = useState(1), [compared, setCompared] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!item.waitlisted) return null
  const state = item.consistencyState || {}, issues = state.issues || []
  const perform = async reason => {
    setBusy(true); setError('')
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/admin/document-verification/waitlist/${item.accountId}/action`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, docKey, attempts: ['grant', 'request'].includes(action) ? Number(attempts) : 0, compared, unresolved: issues.length, reason }) })
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Review action unavailable.')
      setAction(''); await onChanged?.(); window.dispatchEvent(new Event('verification-reviewed'))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section aria-label="Waitlist review" className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900">
    <h3 className="font-semibold">Waitlisted · Cross-check mismatch</h3><p>{item.daysWaiting} days waiting · Since {new Date(state.waitlistedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</p>
    {item.staleWaitlist && <strong>Stale waitlist</strong>}
    <p>Explanation submitted: {state.pausedAt ? 'Yes; inactivity timer paused' : 'No'}</p>
    {issues.map((issue, index) => <p key={index}>{VERIFICATION_DOC_LABELS[issue.docKey]} · {issue.fieldGroup} · {issue.evidence} · {issue.reasonCode === 'staff_review' ? 'Staff review; no chance charged' : `${state.used?.[issue.docKey] || 0} chances used, ${Math.max(0, (item.waitlistAttempts || 3) + (state.grants?.[issue.docKey] || 0) - (state.used?.[issue.docKey] || 0))} left`}</p>)}
    <div className="mt-2 flex flex-wrap gap-2">{Object.entries(labels).map(([key, label]) => <button type="button" key={key} className={control} onClick={() => { setError(''); setCompared(false); setAction(key) }}>{label}</button>)}</div>
    {(state.history || []).map((entry, index) => <p key={index} className="mt-2 text-xs">{entry.action} · {entry.by} · {entry.reason}</p>)}
    {action && <ConfirmDialog title={labels[action]} requireReason reasonMinLength={1} reasonMaxLength={500} initialReason={action === 'request' ? 'Please submit another clear copy of the selected document for PESO review.' : ''} note={`${issues.length} flags unresolved. Record your review reason without personal document values. A release returns the account to normal review.`} busy={busy} error={error} confirmDisabled={action === 'release' && !compared} onConfirm={perform} onCancel={() => setAction('')}>
      {['grant', 'request', 'resolve'].includes(action) && <label className="my-2 block">Document<select className={`${control} block w-full`} value={docKey} onChange={event => setDocKey(event.target.value)}>{WAITLIST_DOCUMENTS.map(key => <option key={key} value={key}>{VERIFICATION_DOC_LABELS[key]}</option>)}</select></label>}
      {['grant', 'request'].includes(action) && <label className="my-2 block">Additional chances {action === 'request' && '(optional)'}<input type="number" min={action === 'request' ? 0 : 1} max={5} className={`${control} block`} value={attempts} onChange={event => setAttempts(event.target.value)} /></label>}
      {action === 'release' && <label className="my-3 block"><input type="checkbox" checked={compared} onChange={event => setCompared(event.target.checked)} /> I compared the documents</label>}
    </ConfirmDialog>}
  </section>
}
