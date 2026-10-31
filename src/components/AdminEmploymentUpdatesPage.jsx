import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import { outcomeLabel } from '../../shared/employmentReporting.js'
import Pagination from './Pagination'

const dateLabel = (value, withTime = false) => {
  if (!value) return 'Not provided'
  const date = new Date(withTime ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return 'Not provided'
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }
  return withTime ? date.toLocaleString('en-PH', { ...options, hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString('en-PH', options)
}

function Statement({ title, report }) {
  return <section aria-label={title} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h4 className="font-semibold text-slate-900">{title}</h4>
    {!report ? <p className="mt-3 text-sm text-slate-600">No update submitted yet.</p> : <>
      <p className="mt-3 inline-block rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-900">{outcomeLabel(report.status)}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="font-semibold">{report.status === 'deployed' ? 'Deployment date' : report.status === 'hired' ? 'Date hired' : 'Outcome date'}</dt><dd>{dateLabel(report.employmentDate)}</dd></div>
        <div><dt className="font-semibold">Submitted to PESO</dt><dd>{dateLabel(report.reportedAt, true)}</dd></div>
        <div><dt className="font-semibold">Notes</dt><dd className="whitespace-pre-wrap break-words">{report.notes || 'No notes provided.'}</dd></div>
      </dl>
      {report.history?.length > 0 && <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Previous updates ({report.history.length})</summary>
        <ul className="mt-2 space-y-2">{[...report.history].reverse().map((entry, index) => <li key={index} className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="font-semibold">{outcomeLabel(entry.status)}</p>
          <p>Date: {dateLabel(entry.employmentDate)}</p>
          <p>Submitted: {dateLabel(entry.reportedAt, true)}</p>
          {entry.notes && <p className="mt-1 whitespace-pre-wrap break-words">{entry.notes}</p>}
        </li>)}</ul>
      </details>}
    </>}
  </section>
}

export default function AdminEmploymentUpdatesPage({ token, applicantId, jobId }) {
  const [filter, setFilter] = useState({ applicantId, jobId })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
    if (filter.applicantId) params.set('applicantId', filter.applicantId)
    if (filter.jobId) params.set('jobId', filter.jobId)
    fetch(`${API_URL}/api/admin/employment-updates?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load employment updates.')
        if (!cancelled) setData(body)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, filter, page, pageSize, refresh])

  return <section aria-labelledby="admin-employment-updates-title" className="portal-card min-w-0 rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="portal-page-eyebrow">Employment reports</p>
        <h2 id="admin-employment-updates-title" className="text-xl font-bold">Hiring updates</h2>
        <p id="admin-employment-updates-description" className="mt-2 text-sm text-slate-600">Compare updates submitted to PESO by the applicant and employer. Each statement is recorded separately.</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={loading} onClick={() => setRefresh((current) => current + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">Refresh updates</button>
      {(filter.applicantId || filter.jobId) && <button type="button" onClick={() => { setFilter({}); setPage(1) }} className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900">Show all updates</button>}
    </div>
    {loading && <p role="status" className="mt-5 text-sm text-slate-600">Loading hiring updates...</p>}
    {error && <p role="alert" className="mt-5 text-sm text-rose-700">{error}</p>}
    {!loading && !error && !data.items.length && <p className="mt-5 text-sm text-slate-600">No hiring updates submitted yet.</p>}
    {!loading && !error && data.items.map((item) => <article key={item.id} className="mt-5 rounded-2xl border border-slate-300 bg-white p-4">
      <h3 className="text-lg font-semibold">{item.applicant.name}</h3>
      <p className="mt-1 text-sm text-slate-700">{item.job.title} · {item.employer.name}</p>
      {item.applicant.email && <p className="mt-1 break-words text-sm text-slate-600">Applicant: {item.applicant.email}</p>}
      {item.employer.email && <p className="mt-1 break-words text-sm text-slate-600">Employer: {item.employer.email}</p>}
      {item.applicantReport && item.employerReport && item.applicantReport.status !== item.employerReport.status && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">The applicant and employer have reported different statuses. Review their dates and notes.</p>}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Statement title="Applicant / employee update" report={item.applicantReport} />
        <Statement title="Employer update" report={item.employerReport} />
      </div>
    </article>)}
    {!loading && !error && data.total > 0 && <Pagination page={page} pageSize={pageSize} totalItems={data.total} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} itemLabel="employment records" ariaLabel="Hiring updates pagination" />}
  </section>
}
