import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import Pagination from './Pagination'
import ConfirmDialog from './ConfirmDialog'

export default function AdminEmailDelivery({ token }) {
  const [data, setData] = useState({ items: [], total: 0 }), [page, setPage] = useState(1)
  const [status, setStatus] = useState(''), [search, setSearch] = useState('')
  const [error, setError] = useState(''), [retry, setRetry] = useState(null), [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/email-delivery?${new URLSearchParams({ status, search, page, limit: 20 })}`, { headers: { Authorization: `Bearer ${token}` } })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setData(body)
    } catch (err) { setError(err.message || 'Email delivery is unavailable.') }
  }, [token, status, search, page])
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer) }, [load])
  const resend = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/admin/email-delivery/${retry._id}/retry`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setRetry(null); await load()
    } catch (err) { setError(err.message || 'Retry failed.') } finally { setBusy(false) }
  }
  return <section className="portal-card p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Email delivery</h2>
    <p className="mt-2 text-sm text-slate-600">Track notification and verification emails. Sent means accepted by the email provider; inbox placement is not confirmed. Failed notification emails retry automatically up to five attempts.</p>
    <div className="mt-4 flex flex-wrap gap-3"><label className="text-sm">Status<select className="shared-form-control ml-2 rounded-lg px-3 py-2" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{['queued', 'sending', 'sent', 'failed', 'expired'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Search<input type="search" className="shared-form-control ml-2 rounded-lg px-3 py-2" placeholder="Recipient or subject" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></label><button type="button" className="rounded-full border border-slate-300 px-4 py-2 text-sm" onClick={load}>Refresh</button></div>
    {error && !retry && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <div className="mt-5 space-y-3">{data.items.map(entry => <article key={entry._id} className="rounded-xl border border-slate-200 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{entry.subject}</h3><span className="rounded-full bg-slate-100 px-3 py-1 capitalize">{entry.status}</span></div><p className="mt-1 break-all">To: {entry.recipientEmail}</p><p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()} · Attempts: {entry.attempts}/5</p>{entry.lastError && <p className="mt-2 text-rose-700">{entry.lastError}</p>}{entry.nextAttemptAt && entry.status === 'failed' && <p className="mt-1 text-xs">Next retry: {new Date(entry.nextAttemptAt).toLocaleString()}</p>}{entry.status === 'failed' && entry.purpose === 'verification' && <p className="mt-2 text-xs">Request a fresh code or link from the relevant account page.</p>}{entry.status === 'failed' && entry.retryable && entry.attempts < 5 && +new Date(entry.expiresAt) > Date.now() && <button type="button" className="mt-3 rounded-full border border-cyan-300 px-4 py-2 font-semibold text-cyan-900" onClick={() => { setError(''); setRetry(entry) }}>Retry email</button>}</article>)}</div>
    {!data.items.length && <p className="mt-5 text-sm text-slate-500">No email deliveries match these filters.</p>}
    {data.total > 20 && <Pagination page={page} pageSize={20} totalItems={data.total} onPageChange={setPage} itemLabel="emails" />}
    {retry && <ConfirmDialog title="Retry this email?" note="The original notification will be sent again. This action is recorded in Activity Logs." busy={busy} error={error} onConfirm={resend} onCancel={() => setRetry(null)} />}
  </section>
}
