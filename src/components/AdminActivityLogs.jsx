import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import Pagination from './Pagination'

const defaults = { search: '', outcome: '', method: '', from: '', to: '' }
const control = 'shared-form-control mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50'

export default function AdminActivityLogs({ token }) {
  const [draft, setDraft] = useState(defaults)
  const [filters, setFilters] = useState(defaults)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const query = new URLSearchParams({ ...filters, page: String(page), limit: String(pageSize) })
    fetch(`${API_URL}/api/admin/activity-logs?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load activity logs.')
        if (!controller.signal.aborted) setData(body)
      }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setData(null) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, filters, page, pageSize, revision])
  const change = event => setDraft(current => ({ ...current, [event.target.name]: event.target.value }))
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-6" aria-labelledby="admin-activity-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-activity-title" className="text-xl font-bold">Activity Logs</h2><p className="mt-2 text-sm text-slate-600">Admin approvals, account deletions, job-title changes, and other record updates are recorded here. Times are shown in Philippine time.</p></div><button type="button" className={button} disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh logs</button></div>
    <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={event => { event.preventDefault(); setPage(1); setFilters({ ...draft }); setRevision(value => value + 1) }}>
      <label className="text-sm font-medium">Search admin or action<input name="search" value={draft.search} onChange={change} maxLength={100} className={control} placeholder="Admin email, action, or record ID" /></label>
      <label className="text-sm font-medium">Result<select name="outcome" value={draft.outcome} onChange={change} className={control}><option value="">All results</option><option value="success">Success</option><option value="failed">Failed</option><option value="interrupted">Interrupted</option></select></label>
      <label className="text-sm font-medium">Action type<select name="method" value={draft.method} onChange={change} className={control}><option value="">All actions</option><option value="POST">Additions and decisions</option><option value="PUT">Updates</option><option value="PATCH">Partial updates</option><option value="DELETE">Deletions</option></select></label>
      <label className="text-sm font-medium">From date<input name="from" type="date" value={draft.from} onChange={change} className={control} /></label>
      <label className="text-sm font-medium">To date<input name="to" type="date" value={draft.to} min={draft.from || undefined} onChange={change} className={control} /></label>
      <div className="flex items-end gap-2"><button type="submit" className={button}>Apply filters</button><button type="button" className={button} onClick={() => { setDraft(defaults); setFilters(defaults); setPage(1); setRevision(value => value + 1) }}>Clear</button></div>
    </form>
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    {loading && <p role="status" className="mt-5 text-sm text-slate-600">Loading activity logs…</p>}
    {!loading && !error && !data?.items?.length && <p className="mt-5 text-sm text-slate-600">No activity logs match these filters.</p>}
    {!loading && !error && data?.items?.length > 0 && <><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">Admin activity history</caption><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{['Date and time', 'Admin', 'Action', 'Result'].map(label => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{data.items.map(entry => <tr key={entry._id} className="border-b border-slate-100 align-top"><td className="whitespace-nowrap px-3 py-4"><time dateTime={entry.at}>{new Date(entry.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</time></td><td className="break-all px-3 py-4">{entry.actorEmail}</td><td className="px-3 py-4"><p>{entry.action}</p>{entry.targetId && <p className="mt-1 break-all text-xs text-slate-500">Record: {entry.targetId}</p>}</td><td className="px-3 py-4"><span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${entry.outcome === 'success' ? 'border-green-200 bg-green-50 text-green-800' : entry.outcome === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{entry.outcome === 'success' ? 'Completed' : entry.outcome}</span></td></tr>)}</tbody></table></div><Pagination page={page} pageSize={pageSize} totalItems={data.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} itemLabel="activity logs" /></>}
  </section>
}
