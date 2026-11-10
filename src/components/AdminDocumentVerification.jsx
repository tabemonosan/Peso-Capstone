import { useCallback, useEffect, useState } from 'react'
import { AdminReputationReviews, AdminNoShowReviews } from './AdminReputation'
import AdminWaitlistActions from './AdminWaitlistActions'
import { API_URL } from '../config'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { DOCUMENT_LABELS, openFlags } from '../../shared/verification.js'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { useAdminAccess } from './AdminAccessContext'
import AdminReviewNotes from './AdminReviewNotes'
import VerificationDocsReviewModal from './VerificationDocsReviewModal'
import AdminDocumentImageViewer from './AdminDocumentImageViewer'
import ManualDocumentChecklist from './ManualDocumentChecklist'
import { needsManualChecklist, completeChecklist } from '../../shared/manualDocumentReview.js'

const control = 'shared-form-control rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const labels = { approve: 'Approve', resubmit: 'Request resubmission', decline: 'Decline', resolve: 'Resolve flag', explain: 'Ask for explanation', checked: 'Mark checked', revoke: 'Revoke', hold: 'Hold auto-approval', 'release-hold': 'Release auto-approval hold' }

export function VerificationQueueBadge({ token }) {
  const [count, setCount] = useState(0)
  const [waitlisted, setWaitlisted] = useState(0)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/document-verification/counts`, { headers: { Authorization: `Bearer ${token}` } })
        if (response.ok) { const body = await response.json(); if (active) { setCount(body.flagged || 0); setWaitlisted(body.waitlisted || 0) } }
      } catch { /* The queue displays its own availability error. */ }
    }
    load(); const timer = setInterval(load, 30000)
    window.addEventListener('verification-reviewed', load)
    return () => { active = false; clearInterval(timer); window.removeEventListener('verification-reviewed', load) }
  }, [token])
  return <>{count > 0 && <span aria-label={`${count} documents flagged for review`} className="ml-auto rounded-full border border-amber-300 bg-amber-50 px-2 text-xs text-amber-900">{count}</span>}{waitlisted > 0 && <span aria-label={`${waitlisted} waitlisted accounts`} className="ml-1 rounded-full border border-amber-300 bg-white px-2 text-xs text-amber-900">{waitlisted} waitlisted</span>}</>
}

export default function AdminDocumentVerification({ token, queue = 'flagged' }) {
  const { can } = useAdminAccess()
  const [filters, setFilters] = useState({ docKey: '', from: '', to: '', checked: '', sort: 'at', order: 'asc', waitlisted: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, limit: 25 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [checklist, setChecklist] = useState({})
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/admin/document-verification/queue?${new URLSearchParams({ ...filters, page, queue })}`, { headers: { Authorization: `Bearer ${token}` } })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Review queue unavailable')
      setData(body)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [filters, page, queue, token])
  useEffect(() => { load() }, [load])
  const changeFilter = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1) }
  const confirm = async reason => {
    if (busy) return
    setBusy(true); setError('')
    const { item, action, ruleId } = confirmation
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/admin/document-verification/action`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: item.role, accountId: item.accountId, docKey: item.docKey, version: item.version, action, reason, ruleId, unresolved: openFlags(item.findings).length, checklist }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Review action unavailable')
      setConfirmation(null); setSelected(null); setNotice(`${labels[action]} recorded.`)
      window.dispatchEvent(new Event('verification-reviewed')); await load()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const actionButton = (item, action, ruleId) => can('decide') && <button type="button" className={`${control} text-cyan-800`} onClick={() => { setError(''); setChecklist({}); setConfirmation({ item, action, ruleId }) }}>{labels[action]}</button>
  return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
    <h1 className="text-xl font-semibold">{queue === 'auto' ? 'Auto-approved' : 'Flagged for review'}</h1>
    {queue !== 'auto' && <div className="my-4"><AdminReputationReviews token={token} /></div>}
    {queue !== 'auto' && <AdminNoShowReviews token={token} />}
    <p className="mt-1 text-sm text-slate-600">Checks assess consistency and evidence, not authenticity. Review reasons and notes stay with PESO.</p>
    <div className="my-4 flex flex-wrap gap-3">
      {queue !== 'auto' && <label>Account status<select className={`${control} block`} value={filters.waitlisted} onChange={event => changeFilter('waitlisted', event.target.value)}><option value="">All accounts</option><option value="true">Waitlisted</option></select></label>}
      <label>Document type<select className={`${control} block`} value={filters.docKey} onChange={e => changeFilter('docKey', e.target.value)}><option value="">All types</option>{Object.entries(DOCUMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {['from', 'to'].map(key => <label key={key}>{key === 'from' ? 'From date' : 'To date'}<input type="date" className={`${control} block`} value={filters[key]} onChange={e => changeFilter(key, e.target.value)} /></label>)}
      {queue === 'auto' && <label>Admin confirmation<select className={`${control} block`} value={filters.checked} onChange={e => changeFilter('checked', e.target.value)}><option value="">Checked and unchecked</option><option value="true">Checked</option><option value="false">Unchecked</option></select></label>}
      <label>Sort by<select className={`${control} block`} value={filters.sort} onChange={e => changeFilter('sort', e.target.value)}><option value="at">Submission date</option><option value="approvedAt">Approval date</option><option value="docKey">Document type</option><option value="email">Account</option></select></label>
      <label>Order<select className={`${control} block`} value={filters.order} onChange={e => changeFilter('order', e.target.value)}><option value="asc">Oldest first / A–Z</option><option value="desc">Newest first / Z–A</option></select></label>
      <button type="button" className={control} onClick={load}>Refresh queue</button>
    </div>
    <p className="text-sm">{data.total} documents. Dates use Asia/Manila.</p>
    {loading && <p role="status">Loading review queue…</p>}
    {error && !confirmation && <p role="alert" aria-label="Document review error" className="text-rose-700">{error}</p>}
    {notice && <p role="status" className="text-green-800">{notice}</p>}
    {!loading && !error && !data.items.length && <p className="my-4">No documents match these filters.</p>}
    {data.items.map(item => <article key={`${item.role}:${item.accountId}:${item.docKey}`} className={`my-3 rounded-xl border p-4 ${queue !== 'auto' && item.overdue ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <p className="font-semibold">{item.email} · {item.label} · v{item.version}</p>
      <p className="text-sm text-slate-600">{item.role} · {new Date(item.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · {item.status}</p>
      {item.provider && <p className="text-sm text-slate-600">{item.provider} · {item.assurance} assurance · Rules {item.rulesVersion}</p>}
      {queue !== 'auto' && item.overdue && <p className="text-sm font-semibold text-amber-900">Waiting at least 7 days</p>}
      <div className="my-2 flex flex-wrap gap-2">{item.reasons.map(reason => <span key={reason} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">{reason}</span>)}</div>
      {item.adminConfirmedAt && <p className="text-sm text-green-800">Checked by {item.adminConfirmedBy}</p>}
      <AdminWaitlistActions item={item} token={token} onChanged={load} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} onClick={() => setSelected(item)}>Review details</button>
        {item.role === 'Applicant' && <button type="button" className={control} onClick={() => setViewer({ id: item.accountId, email: item.email })}>View documents</button>}
        {item.role === 'Employer' && <button type="button" className={control} onClick={async () => {
          try {
            const response = await fetch(`${API_URL}/api/employers/${item.recordId}/nsrp/view`, { headers: { Authorization: `Bearer ${token}` } })
            if (!response.ok) throw new Error('Document unavailable')
            const url = URL.createObjectURL(await response.blob()); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000)
          } catch (err) { setError(err.message) }
        }}>View Form 2</button>}
        {item.docKey !== 'nsrpForm' && ['pending', 'needs_resubmission'].includes(item.status) && <>{actionButton(item, 'approve')}{actionButton(item, 'resubmit')}{actionButton(item, 'decline')}</>}
        {item.docKey !== 'nsrpForm' && item.status === 'approved' && <>{!item.adminConfirmedAt && (item.autoApproved || item.reviewedBy?.startsWith('System (')) && actionButton(item, 'checked')}{actionButton(item, 'revoke')}</>}
        {actionButton(item, 'explain')}{actionButton(item, item.holdAutoApproval ? 'release-hold' : 'hold')}
      </div>
    </article>)}
    <div className="mt-4 flex items-center gap-4"><button type="button" className={control} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span><button type="button" className={control} disabled={page * data.limit >= data.total || loading} onClick={() => setPage(page + 1)}>Next</button></div>
    {selected && <Modal onClose={() => setSelected(null)} labelledBy="document-review-details"><h2 id="document-review-details" className="text-lg font-semibold">{selected.label}: review details</h2>
      {selected.role === 'Applicant' && <AdminDocumentImageViewer token={token} accountId={selected.accountId} docKey={selected.docKey} />}
      <p className="my-2">{selected.email} · {selected.unresolved} unresolved flags</p>
      {selected.findings.map(f => <div key={f.ruleId} className="my-3 rounded-lg border border-slate-200 bg-white p-3"><p>{f.ruleId} · {f.severity} · {f.fieldGroup} · {f.evidence} · {f.status}</p>{f.note && <p>{f.note}</p>}{f.status !== 'dismissed' && actionButton(selected, 'resolve', f.ruleId)}</div>)}
      {selected.explanation && <div className="my-3"><h3 className="font-semibold">Explanation</h3><p>{selected.explanation.status} · {selected.explanation.category}</p><p>{selected.explanation.note}</p></div>}
      {selected.findings.some(f => f.ruleId === 'agency_manual_license') && <p className="rounded border border-cyan-200 bg-cyan-50 p-2 text-sm">Verify the agency license manually.</p>}
      <h3 className="mt-4 font-semibold">Audit history</h3>{selected.audit.map((entry, index) => <p key={index} className="my-2 text-sm">{entry.action} · {entry.by} · {new Date(entry.at).toLocaleString()} · {entry.reason}</p>)}
      <AdminReviewNotes token={token} entityType={selected.role === 'Employer' ? 'EmployerRequest' : 'Applicant'} entityId={selected.role === 'Employer' ? selected.recordId : selected.accountId} />
      <button type="button" className={`${control} mt-4`} onClick={() => setSelected(null)}>Close review details</button>
    </Modal>}
    {viewer && <VerificationDocsReviewModal applicant={viewer} token={token} readOnly onClose={() => setViewer(null)} />}
    {confirmation && <ConfirmDialog title={labels[confirmation.action]}
      note={confirmation.action === 'approve' ? `${openFlags(confirmation.item.findings).length} flags unresolved. Approve anyway?` : 'A reason is required and will be recorded for PESO. Do not enter personal document values in notes.'}
      requireReason reasonMinLength={1} reasonMaxLength={500} busy={busy} error={error}
      initialReason={confirmation.action === 'resubmit' ? openFlags(confirmation.item.findings).map(f => `Please review ${f.fieldGroup || 'document details'}`).filter((value, index, values) => values.indexOf(value) === index).join('; ') : ''}
      confirmDisabled={confirmation.action === 'approve' && needsManualChecklist(confirmation.item.docKey) && !completeChecklist(checklist)}
      onConfirm={confirm} onCancel={() => { if (!busy) { setConfirmation(null); setError('') } }}>
      {confirmation.action === 'approve' && needsManualChecklist(confirmation.item.docKey) && <ManualDocumentChecklist value={checklist} onChange={setChecklist} />}
    </ConfirmDialog>}
  </section>
}
