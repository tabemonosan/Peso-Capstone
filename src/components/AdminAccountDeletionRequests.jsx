import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'
import Pagination from './Pagination'
import { usePagination } from '../hooks/usePagination'

export default function AdminAccountDeletionRequests({ token, onMessage, onViewRetained }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState(null)
  const [busy, setBusy] = useState(false)
  const { page, pageSize, setPage, setPageSize } = usePagination({ syncUrl: false })
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/api/account-deletion/requests?status=${status}&page=${page}&limit=${pageSize}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load deletion requests.')
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [token, status, page, pageSize])
  useEffect(() => { load() }, [load])

  const review = async (reason) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/api/account-deletion/requests/${decision.record._id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: decision.status, reason }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to review request.')
      setDecision(null)
      onMessage?.(decision.status === 'approved' ? 'Account deletion approved. The email can now be used for a fresh registration.' : 'Account deletion request declined.')
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <section className="portal-card rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
      <h2 className="text-xl font-semibold">Account deletion requests</h2>
      <p className="mt-2 text-sm text-slate-600">Approval closes the applicant account, ends its sessions, and releases the email for a new registration. PESO registration and employment records stay associated with the old account.</p>
      <label className="mt-4 block text-sm font-medium">Request status
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="shared-form-control mt-1 rounded-xl px-3 py-2">
          {['pending', 'approved', 'declined', 'cancelled', 'all'].map((value) => <option key={value} value={value}>{value === 'pending' ? 'Awaiting review / processing' : value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
        </select>
      </label>
      {loading && <p className="mt-4">Loading requests...</p>}
      {error && !decision && <p role="alert" className="mt-4 text-rose-700">{error}</p>}
      {!loading && !items.length && !error && <p className="mt-4">No account deletion requests in this view.</p>}
      {!loading && items.map((record) => <article key={record._id} className="mt-4 rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold">{record.applicantName || record.email}</h3>
        <p className="text-sm">{record.email}</p>
        <p className="mt-1 text-sm">Status: {record.status} · Requested: {new Date(record.createdAt).toLocaleString()}</p>
        <p className="mt-2 text-sm">Applicant reason: {record.reason || 'Not provided'}</p>
        {record.reviewReason && <p className="mt-2 text-sm">Review reason: {record.reviewReason}</p>}
        {record.status === 'approved' && onViewRetained && <button type="button" onClick={() => onViewRetained(record)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">View retained PESO record</button>}
        {record.status === 'processing' && <p className="mt-2 text-sm text-amber-800">Approval was started. Retry to finish closing the account and releasing its email.</p>}
        {['pending', 'processing'].includes(record.status) && <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => { setError(''); setDecision({ record, status: 'approved' }) }} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white">{record.status === 'processing' ? 'Retry approval' : 'Approve deletion'}</button>
          {record.status === 'pending' && <button type="button" onClick={() => { setError(''); setDecision({ record, status: 'declined' }) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Decline request</button>}
        </div>}
      </article>)}
      {!loading && total > 0 && <Pagination page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="deletion requests" ariaLabel="Account deletion requests pagination" />}
      {decision && <ConfirmDialog
        title={`${decision.status === 'approved' ? 'Approve account deletion' : 'Decline deletion request'} for ${decision.record.applicantName || decision.record.email}?`}
        note={decision.status === 'approved' ? 'The old account and its sessions will stop working. Its PESO records are retained separately. The same email will be available for a fresh registration.' : 'The account stays active. Give the applicant a reason for declining.'}
        confirmLabel={decision.status === 'approved' ? 'Yes, approve deletion' : 'Confirm decline'}
        confirmTone={decision.status === 'approved' ? 'danger' : 'primary'}
        requireReason={decision.status === 'declined'} busy={busy} error={error}
        onConfirm={review} onCancel={() => { if (!busy) { setDecision(null); setError('') } }}
      />}
    </section>
  )
}
