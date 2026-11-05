import ApplicationStages from './ApplicationStages'
import { publicApplicationHistory } from '../../shared/employmentReporting.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_URL } from '../config'
import { APPLICATION_STATUS_LABELS } from '../../shared/applicationProgress.js'
import { workflowRequest, workflowDate, workflowControl } from '../utils/applicationWorkflow'
import { ApplicationTimeline } from './AdminReferralsPage'
import ApplicationReportButton from './ApplicationReportButton'
import ConfirmDialog from './ConfirmDialog'
import Modal from './Modal'
import Pagination from './Pagination'
import ApplicationWithdrawal from './ApplicationWithdrawal'
import PostInterviewTask from './PostInterviewTask'

export default function MyApplicationsPage({ token, onDeclined }) {
  const [focusApplicationId, setFocusApplicationId] = useState(() => new URLSearchParams(window.location.search).get('applicationId') || '')
  const [data, setData] = useState({ items: [], total: 0, account: {} }), [page, setPage] = useState(1), [limit, setLimit] = useState(10), [order, setOrder] = useState('desc')
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [action, setAction] = useState(null), [busy, setBusy] = useState(false), [outcome, setOutcome] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const detailsRef = useRef(null)
  const selectedApplication = data.items.find(item => item.id === selectedId) || data.items[0]
  useEffect(() => { if (detailsRef.current) detailsRef.current.scrollTop = 0 }, [selectedApplication?.id])
  const load = useCallback(async () => {
    try { const result = await workflowRequest(token, `/mine?page=${page}&limit=${limit}&order=${order}${focusApplicationId ? `&applicationId=${encodeURIComponent(focusApplicationId)}` : ''}`); setData(result); setError(''); if (!result.items.length && page > 1 && result.total) setPage(page - 1) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [token, page, limit, order, focusApplicationId])
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  const perform = async (reason) => {
    setBusy(true); setError('')
    try {
      const application = action.application
      if (['confirm', 'reschedule', 'decline'].includes(action.type)) await workflowRequest(token, `/interviews/${application.interview.id}/respond`, { action: action.type, reason })
      if (action.type === 'respond_no_show') await workflowRequest(token, `/reports/${encodeURIComponent(application.noShowReport.id)}/respond`, { response: reason })
      if (action.type === 'appeal') await workflowRequest(token, '/appeals', { reason })
      if (action.type === 'withdraw') {
        const response = await fetch(`${API_URL}/api/applications/${application.id}/withdraw`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        const body = await response.json(); if (!response.ok) throw new Error(body.error)
      }
      setAction(null); await load()
      if (action.type === 'decline') onDeclined?.()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const labels = { confirm: 'Confirm interview', reschedule: 'Request reschedule', decline: 'Decline invitation', withdraw: 'Withdraw application', respond_no_show: 'Respond to no-show report', appeal: 'Appeal application suspension' }
  return <section className="portal-card rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    {focusApplicationId && <button type="button" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" onClick={() => { setFocusApplicationId(''); setPage(1); const url = new URL(window.location.href); url.searchParams.delete('applicationId'); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`) }}>Show all applications</button>}
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold">My applications</h2><p className="mt-2 text-sm text-slate-600">Follow your applications, interview invitations and outcomes.</p></div><label className="text-xs text-slate-600">Sort by last update<select className={`${workflowControl} mt-1`} value={order} onChange={(e) => { setOrder(e.target.value); setPage(1) }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div>
    {data.account?.applyingSuspended && <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">PESO has paused new applications and interview confirmations.</p><p className="mt-2">Reason: {data.account.suspensionReason}</p><p className="mt-2">You can still sign in and view your data.</p><button type="button" disabled={data.account.appealPending} onClick={() => { setError(''); setAction({ type: 'appeal' }) }} className="mt-3 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold">{data.account.appealPending ? 'Appeal awaiting review' : 'Submit an appeal'}</button></div>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading && <p role="status" className="mt-6 text-sm text-slate-600">Loading applications...</p>}
    {!loading && !data.items.length && <div className="mt-6 rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-8 text-center"><h3 className="font-semibold text-blue-900">Your next opportunity starts with an application</h3><p className="mt-2 text-sm text-slate-600">You have no applications yet. Browse Jobs and apply to a matching posting; its progress will appear here.</p></div>}
    {data.items.length > 0 && <div className="applicant-job-browser my-applications-browser">
      <section className="job-browser-list" aria-label="Companies and applications" tabIndex={0}>
        {data.items.map(application => <button type="button" key={application.id} aria-label={`View application for ${application.job.title} at ${application.employer.name}`} aria-pressed={selectedApplication?.id === application.id} aria-controls="my-application-details" onClick={() => setSelectedId(application.id)} className={`job-browser-row ${selectedApplication?.id === application.id ? 'is-selected' : ''}`}>
          <span className="job-browser-company-mark">{application.employer.profileImage ? <img src={application.employer.profileImage} alt="" /> : application.employer.name.trim().charAt(0).toUpperCase()}</span>
          <span className="job-browser-row-copy"><strong>{application.employer.name}</strong><span>{application.job.title}</span><span className="job-browser-muted">Updated {workflowDate(application.lastUpdate)}</span></span>
        </button>)}
      </section>
      <section ref={detailsRef} id="my-application-details" className="job-browser-details" aria-label="Selected application details" tabIndex={0}>
      {(selectedApplication ? [selectedApplication] : []).map((application) => <article key={application.id} aria-label={`Application for ${application.job.title}`} className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{application.job.title}</h3></div><span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{APPLICATION_STATUS_LABELS[application.status] || application.status.replaceAll('_', ' ')}</span></div>
      <ApplicationStages application={application} />
      <dl className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-2"><div><dt>Applied</dt><dd className="mt-1 font-medium text-slate-800">{workflowDate(application.submittedAt)}</dd></div><div><dt>Last update</dt><dd className="mt-1 font-medium text-slate-800">{workflowDate(application.lastUpdate)}</dd></div></dl>
      {application.message && <p className="mt-4 text-sm text-slate-700">{application.message}</p>}
      {application.interview && <div className="mt-4 rounded-xl border border-blue-100 bg-slate-50 p-4 text-sm"><p className="font-semibold">Interview: {workflowDate(application.interview.scheduledAt)}</p><p className="mt-1 text-slate-600">{application.interview.mode} · {application.interview.location}</p>{application.interview.message && <p className="mt-2 text-slate-700">{application.interview.message}</p>}</div>}
      {application.noShowReport && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>{['confirmed', 'dismissed'].includes(application.noShowReport.status) ? 'PESO has completed its review of the missed-interview report.' : 'The employer reported a missed interview. PESO reviews the report and your response.'}</p>{application.noShowReport.responseDeadline && <p className="mt-2 font-semibold">Response deadline: {workflowDate(application.noShowReport.responseDeadline)}</p>}{application.noShowReport.applicantResponse && <p className="mt-2">Your response: {application.noShowReport.applicantResponse}</p>}{application.noShowReport.status === 'pending' && !application.actions.includes('respond_no_show') && <p className="mt-2">The response deadline has passed. PESO will review the record.</p>}</div>}
      <details className="mt-4 text-sm"><summary>Application timeline</summary><ApplicationTimeline history={publicApplicationHistory(application.history)} /></details>
      {application.interview && <PostInterviewTask token={token} interviewId={application.interview.id} task={application.postInterviewTask} readOnly={['withdrawn', 'withdrawn_by_admin', 'declined', 'declined_by_admin', 'hired', 'deployed', 'not_hired'].includes(application.status)} onChanged={load} />}
      <div className="mt-4 flex flex-wrap items-center gap-2">{application.actions.filter((type) => type !== 'withdraw' && labels[type]).map((type) => <button type="button" key={type} onClick={() => { setError(''); setAction({ type, application }) }} className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">{labels[type]}</button>)}{application.actions.includes('view_outcome') && <button type="button" onClick={() => setOutcome(application)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800">View outcome</button>}</div>
      <ApplicationWithdrawal application={application} onWithdraw={() => { setError(''); setAction({ type: 'withdraw', application }) }} />
      {application.actions.includes('report_problem') && <ApplicationReportButton token={token} referralId={application.referralId} onSubmitted={load} />}
    </article>)}
      </section>
    </div>}
    <Pagination page={page} pageSize={limit} totalItems={data.total} onPageChange={setPage} onPageSizeChange={(size) => { setLimit(size); setPage(1) }} itemLabel="applications" />
    {action && <ConfirmDialog title={labels[action.type]} note={action.type === 'respond_no_show' ? 'Your response goes to PESO for review. It does not decide the report.' : action.type === 'decline' ? 'This removes the active application and returns you to Jobs. You can apply again if the posting is still available.' : action.type === 'withdraw' ? 'The application stays in your history. Before an interview, withdrawing also cancels that interview.' : action.type === 'reschedule' ? 'Explain your preferred time and why you need a reschedule.' : 'Confirm this application update.'} requireReason={['reschedule', 'decline', 'respond_no_show', 'appeal'].includes(action.type)} reasonMinLength={1} reasonMaxLength={['reschedule', 'decline'].includes(action.type) ? 50 : undefined} busy={busy} error={error} onConfirm={perform} onCancel={() => setAction(null)} />}
    {outcome && <Modal onClose={() => setOutcome(null)} labelledBy="application-outcome-title"><h2 id="application-outcome-title" className="text-xl font-bold">Application outcome</h2><p className="mt-3 font-semibold">{outcome.job.title} · {outcome.employer.name}</p><p className="mt-3">{outcome.outcome?.message || 'No outcome has been recorded yet.'}</p><p className="mt-2 text-sm text-slate-600">{workflowDate(outcome.outcome?.at)}</p><button type="button" onClick={() => setOutcome(null)} className="mt-5 rounded-full border border-slate-300 px-4 py-2 text-sm">Close</button></Modal>}
  </section>
}
