import AdminApplicationWorkflow from './AdminApplicationWorkflow'
import { APPLICATION_STATUS_LABELS } from '../../shared/applicationProgress.js'
import { mergeApplicationHistory } from '../../shared/employmentReporting.js'
import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'
import Modal from './Modal'
import Pagination from './Pagination'
import PesoReferralPanel from './PesoReferralPanel'

const base = '/api/admin/referral-workflow'
const control = 'shared-form-control rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const statusLabel = (status) => ({ pending: 'With employer', pending_admin: 'Awaiting PESO referral', withdrawn_by_admin: 'Returned to PESO review', withdrawn: 'Withdrawn' }[status] || APPLICATION_STATUS_LABELS[status] || String(status || '').replaceAll('_', ' '))
export function ApplicationTimeline({ history = [] }) {
  const events = mergeApplicationHistory(history)
  return <ol className="mt-3 space-y-3 border-l border-cyan-200 pl-4 text-sm text-slate-800">{events.map((entry, index) => <li key={index}><strong>{String(entry.action || entry.status || 'Update').replaceAll('_', ' ')}</strong><p className="text-xs text-slate-600">{entry.at ? new Date(entry.at).toLocaleString() : ''} · {statusLabel(entry.status)}{entry.by ? ` · ${entry.by}` : ''}</p>{entry.reason && <p>{entry.reason}</p>}</li>)}</ol>
}

export function AutomaticReferralBanner({ token, onOpen }) {
  const [state, setState] = useState({ off: false, lowTrust: false })
  useEffect(() => {
    let cancelled = false
    const load = () => fetch(`${API_URL}${base}/settings`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => { if (response.ok && !cancelled) { const settings = await response.json(); setState({ off: settings.automaticReferral === false, lowTrust: settings.lowTrustRouting === true }) } }).catch(() => {})
    load()
    const timer = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [token])
  return <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{state.off ? 'Automatic referral is OFF. New applications wait for PESO referral. ' : 'Automatic referral is ON. '}{state.lowTrust ? 'Low-trust review routing is ON. Flagged applications wait for admin review. ' : 'Low-trust review routing is OFF. '}<button type="button" onClick={onOpen} className="ml-2 font-semibold underline">Open referrals and applications</button></div>
}

export default function AdminReferralsPage({ token, ...legacyProps }) {
  const [settings, setSettings] = useState(null)
  const [options, setOptions] = useState({ employers: [], jobs: [], applicants: [] })
  const [data, setData] = useState({ items: [], total: 0 })
  const [filters, setFilters] = useState({ employer: '', job: '', status: '', source: '', from: '', to: '', sortBy: 'date', order: 'desc' })
  const [page, setPage] = useState(1), [limit, setLimit] = useState(10)
  const [detail, setDetail] = useState(null), [action, setAction] = useState(null)
  const [manual, setManual] = useState({ employerId: '', jobId: '', applicantId: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const request = useCallback(async (path, method = 'GET', body) => {
    const response = await fetch(`${API_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Request failed')
    return result
  }, [token])
  const loadOptions = useCallback(async () => { setOptions(await request(`${base}/options`)) }, [request])
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ ...filters, page, limit })
      const result = await request(`${base}/applications?${query}`)
      setData(result)
      if (!result.items.length && result.total > 0 && page > 1) setPage(page - 1)
    } catch (err) { setError(err.message) }
  }, [request, filters, page, limit])
  useEffect(() => { request(`${base}/settings`).then(setSettings).catch((err) => setError(err.message)); loadOptions().catch((err) => setError(err.message)) }, [request, loadOptions])
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  const changeFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }
  const confirmAction = async (reason) => {
    setBusy(true); setError('')
    try {
      if (action.type === 'pullback') await request(`${base}/applications/${action.id}/pull-back`, 'POST', { reason })
      if (action.type === 'suspend' || action.type === 'resume') await request(`${base}/employers/${action.id}/suspension`, 'POST', { suspended: action.type === 'suspend', reason })
      if (['approve_review', 'decline_review'].includes(action.type)) await request(`/api/workflow/admin/applications/${action.id}/review`, 'POST', { decision: action.type === 'approve_review' ? 'approved' : 'declined', reason })
      if (action.type === 'manual') await request('/api/referrals', 'POST', { jobId: manual.jobId, applicantIds: [manual.applicantId], reason })
      setAction(null); setDetail(null); setNotice('Action completed and recorded in the audit history.'); await load(); await loadOptions()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const selectedEmployer = options.employers.find((entry) => entry._id === manual.employerId)
  const settingsChange = async (enabled, key = 'automaticReferral') => {
    setBusy(true); setError('')
    try { setSettings(await request(`${base}/settings`, 'PUT', { [key]: enabled })); setNotice('Routing setting saved. Existing applications are unchanged.') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
      <h2 className="text-xl font-bold">Referrals and applications</h2>
      <p className="mt-2 text-sm text-slate-600">Live oversight of applications and referrals. Automatic delivery needs no PESO approval. Refreshes every 10 seconds.</p>
      {settings && <label className="my-4 flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold"><input type="checkbox" checked={settings.automaticReferral} disabled={busy} onChange={(event) => settingsChange(event.target.checked)} />Automatic referral {settings.automaticReferral ? 'ON' : 'OFF'}</label>}
      {settings && <label className="my-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm"><input type="checkbox" checked={settings.lowTrustRouting === true} disabled={busy} onChange={(event) => settingsChange(event.target.checked, 'lowTrustRouting')} />Send applications from applicants with a low trust flag to admin review first</label>}
      {settings?.automaticReferral === false && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">Automatic referral is OFF. The manual queue is available below.</p>}
      {error && <p role="alert" className="my-2 text-rose-700">{error}</p>}{notice && <p role="status" className="my-2 text-sm text-cyan-900">{notice}</p>}
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <label>Employer<select className={`${control} block w-full`} value={filters.employer} onChange={(event) => changeFilter('employer', event.target.value)}><option value="">All employers</option>{options.employers.map((entry) => <option key={entry._id} value={entry._id}>{entry.companyName}</option>)}</select></label>
        <label>Job<select className={`${control} block w-full`} value={filters.job} onChange={(event) => changeFilter('job', event.target.value)}><option value="">All jobs</option>{options.jobs.map((entry) => <option key={entry._id} value={entry._id}>{entry.title}</option>)}</select></label>
        <label>Status<select className={`${control} block w-full`} value={filters.status} onChange={(event) => changeFilter('status', event.target.value)}><option value="">All statuses</option>{['pending', 'accepted', 'declined', 'pending_admin', 'withdrawn_by_admin', 'withdrawn', 'declined_by_admin'].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
        <label>Source<select className={`${control} block w-full`} value={filters.source} onChange={(event) => changeFilter('source', event.target.value)}><option value="">All sources</option><option value="auto">Automatic</option><option value="admin">Admin</option></select></label>
        {['from', 'to'].map((key) => <label key={key}>{key === 'from' ? 'From date' : 'To date'}<input type="date" className={`${control} block w-full`} value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)} /></label>)}
        <label>Sort by<select className={`${control} block w-full`} value={`${filters.sortBy}:${filters.order}`} onChange={(event) => { const [sortBy, order] = event.target.value.split(':'); setFilters((current) => ({ ...current, sortBy, order })); setPage(1) }}><option value="date:desc">Newest first</option><option value="date:asc">Oldest first</option><option value="employer:asc">Employer</option><option value="job:asc">Job</option><option value="status:asc">Status</option><option value="source:asc">Source</option></select></label>
        <button type="button" onClick={load} className="self-end rounded-full border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm">Refresh</button>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Applicant', 'Employer / job', 'Status / source', 'Submitted', 'Actions'].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map((entry) => <tr key={entry._id} className="border-t border-slate-200">
        <td className="p-3">{[entry.applicant.firstName, entry.applicant.lastName].filter(Boolean).join(' ') || entry.applicant.name || entry.applicant.email}<p className="text-xs text-slate-500">{entry.applicant.email}</p>{entry.findings?.length > 0 && <span className="text-xs text-amber-800">Info: application burst</span>}</td>
        <td className="p-3">{entry.employer.name}<p>{entry.job.title}</p>{entry.employer.suspendedAt && <span className="text-xs text-amber-800">Receiving suspended</span>}</td>
        <td className="p-3">{statusLabel(entry.status)}<p className="text-xs">{entry.source === 'auto' ? 'Automatic' : 'Admin'}</p></td><td className="p-3">{entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : ''}</td>
        <td className="p-3">{entry.reviewQueue === 'low_trust' && entry.status === 'pending_admin' && <div className="mb-2 flex gap-2"><button type="button" onClick={() => setAction({ type: 'approve_review', id: entry._id })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-blue-800">Approve delivery</button><button type="button" onClick={() => setAction({ type: 'decline_review', id: entry._id })} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">Decline application</button></div>}<button type="button" onClick={async () => { try { setDetail(await request(`${base}/applications/${entry._id}`)) } catch (err) { setError(err.message) } }} className="mr-2 rounded-lg border border-slate-300 px-3 py-1">Timeline</button>{entry.referralId && !['withdrawn', 'withdrawn_by_admin'].includes(entry.status) && <button type="button" onClick={() => { setError(''); setAction({ type: 'pullback', id: entry._id }) }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1">Pull back</button>}</td>
      </tr>)}</tbody></table></div>
      {!data.items.length && <p className="my-4 text-sm text-slate-600">No applications match these filters.</p>}
      <Pagination page={page} pageSize={limit} totalItems={data.total} onPageChange={setPage} onPageSizeChange={(size) => { setLimit(size); setPage(1) }} itemLabel="applications" />
      <details className="mt-4 text-sm"><summary>Referral settings history</summary>{settings?.history?.map((entry, index) => <p className="mt-2" key={index}>{new Date(entry.at).toLocaleString()} · {entry.by} · {entry.action === 'low_trust_routing_changed' ? 'Low-trust routing' : 'Automatic referral'} · {entry.enabled ? 'ON' : 'OFF'}</p>)}</details>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
      <h3 className="font-semibold">Employer controls and manual referral</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label>Employer for action<select className={`${control} block w-full`} value={manual.employerId} onChange={(event) => setManual({ ...manual, employerId: event.target.value, jobId: '' })}><option value="">Select employer</option>{options.employers.map((entry) => <option key={entry._id} value={entry._id}>{entry.companyName}{entry.receivingApplicantsSuspendedAt ? ' (suspended)' : ''}</option>)}</select></label>
        <label>Job for referral<select className={`${control} block w-full`} value={manual.jobId} onChange={(event) => setManual({ ...manual, jobId: event.target.value })}><option value="">Select approved job</option>{options.jobs.filter((entry) => entry.status === 'approved' && (!selectedEmployer || entry.createdBy === selectedEmployer.email)).map((entry) => <option key={entry._id} value={entry._id}>{entry.title}</option>)}</select></label>
        <label>Applicant for referral<select className={`${control} block w-full`} value={manual.applicantId} onChange={(event) => setManual({ ...manual, applicantId: event.target.value })}><option value="">Select verified applicant</option>{options.applicants.map((entry) => <option key={entry._id} value={entry._id}>{[entry.profile?.firstName, entry.profile?.lastName].filter(Boolean).join(' ') || entry.profile?.name || entry.email}</option>)}</select></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={!manual.employerId || busy} onClick={() => { setError(''); setAction({ type: selectedEmployer?.receivingApplicantsSuspendedAt ? 'resume' : 'suspend', id: manual.employerId }) }} className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm">{selectedEmployer?.receivingApplicantsSuspendedAt ? 'Resume receiving applicants' : 'Suspend receiving applicants'}</button><button type="button" disabled={!manual.jobId || !manual.applicantId || busy} onClick={() => { setError(''); setAction({ type: 'manual' }) }} className="rounded-full border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm">Create referral</button></div>
    </section>
    <AdminApplicationWorkflow token={token} />
    {settings?.automaticReferral === false && <PesoReferralPanel token={token} {...legacyProps} />}
    {detail && <Modal onClose={() => setDetail(null)} labelledBy="application-timeline-title"><div className="flex justify-between gap-3"><h2 id="application-timeline-title" className="text-xl font-bold">Application timeline</h2><button type="button" onClick={() => setDetail(null)}>Close</button></div><p className="mt-3">{detail.applicant.email} · {detail.job.title} · {statusLabel(detail.status)} · {detail.source}</p><ApplicationTimeline history={detail.history} /></Modal>}
    {action && <ConfirmDialog title={{ pullback: 'Pull back application', suspend: 'Suspend employer from receiving applicants', resume: 'Resume receiving applicants', manual: 'Create referral', approve_review: 'Approve application delivery', decline_review: 'Decline application' }[action.type]} note="This action is recorded in the audit history. A reason is required." requireReason reasonMinLength={1} busy={busy} error={error} onConfirm={confirmAction} onCancel={() => setAction(null)} />}
  </div>
}
