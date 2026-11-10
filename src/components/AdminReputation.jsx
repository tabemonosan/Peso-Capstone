import { useAdminAccess } from './AdminAccessContext'
import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import { REPUTATION_FIELDS } from '../../shared/reputation.js'
import { workflowRequest, workflowControl, workflowDate } from '../utils/applicationWorkflow'
import ConfirmDialog from './ConfirmDialog'
import Pagination from './Pagination'

const button = 'rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50'
export function AdminReputationSettings({ token }) {
  const { can } = useAdminAccess()
  const [data, setData] = useState(null), [rules, setRules] = useState({}), [confirm, setConfirm] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => { workflowRequest(token, '/admin/reputation/settings').then(result => { if (!result?.rules) throw new Error('Reputation settings unavailable.'); setData(result); setRules(result.rules) }).catch(err => setError(err.message)) }, [token])
  const save = async reason => {
    setBusy(true); setError('')
    try { const next = await workflowRequest(token, '/admin/reputation/settings', { rules, reason }); setData(next); setRules(next.rules); setConfirm(false); setNotice('Reputation settings saved and audited. Scores and page guidance use the live settings.') }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    <h3 className="text-lg font-semibold">Reputation settings</h3><p className="mt-2 text-sm text-slate-600">Controls for graduated penalties, recovery, credits, and rolling limits. Changes require a reason and remain in the audit history.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}
    {data && <details className="mt-4"><summary className="cursor-pointer font-medium">Edit policy values</summary><form onSubmit={event => { event.preventDefault(); setConfirm(true); setError('') }}><fieldset disabled={!can('settings')} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(REPUTATION_FIELDS).map(([key, label]) => <label key={key} className="block text-sm">{label}<input type="number" required min={key.endsWith('Days') || key.endsWith('Months') || key.endsWith('Hours') ? 1 : 0} max={key.endsWith('Days') ? 3660 : key.endsWith('Months') ? 120 : key.endsWith('Hours') ? 720 : 100} step={1} value={rules[key] ?? ''} disabled={busy} onChange={event => setRules(current => ({ ...current, [key]: event.target.value === '' ? '' : Number(event.target.value) }))} className={workflowControl} /></label>)}</div>
      <button type="submit" disabled={busy} className={button}>Save reputation settings</button>
    </fieldset></form></details>}
    {data?.history?.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Reputation policy audit history</summary><ul className="mt-3 space-y-3 text-xs">{[...data.history].reverse().map((entry, index) => <li className="rounded-lg border border-slate-200 p-3" key={index}><p>{workflowDate(entry.at)} · {entry.by}</p><p className="mt-1">{entry.reason}</p><p className="mt-1">{Object.keys(REPUTATION_FIELDS).filter(key => entry.before?.[key] !== entry.after?.[key]).map(key => `${REPUTATION_FIELDS[key]}: ${entry.before?.[key]} → ${entry.after?.[key]}`).join('; ')}</p></li>)}</ul></details>}
    {confirm && <ConfirmDialog title="Change reputation policy?" note="The live settings affect score calculations, limits, recovery forecasts, and the applicant guidance. Record why these values are changing." requireReason reasonMinLength={1} busy={busy} error={error} onConfirm={save} onCancel={() => setConfirm(false)} />}
  </section>
}

export function AdminReputationReviews({ token }) {
  const { can } = useAdminAccess()
  const [data, setData] = useState({ items: [], total: 0 }), [page, setPage] = useState(1), [status, setStatus] = useState('pending'), [error, setError] = useState(''), [action, setAction] = useState(null), [publicReason, setPublicReason] = useState(''), [reducedPoints, setReducedPoints] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { const result = await workflowRequest(token, `/admin/reputation/reviews?page=${page}&status=${status}`); setData({ ...result, items: Array.isArray(result.items) ? result.items : [], total: result.total || 0 }); setError('') } catch (err) { setError(err.message) } }, [token, page, status])
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  const decide = async reason => {
    if (action.type !== 'reverse' && !publicReason.trim()) { setError('Enter the explanation for the applicant.'); return }
    setBusy(true); setError('')
    try { await workflowRequest(token, `/admin/reputation/reviews/${action.item._id}`, { action: action.type, reason, publicReason, ...(action.type === 'reduce' ? { reducedPoints: Number(reducedPoints) } : {}) }); setAction(null); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const viewFile = async item => {
    try {
      const response = await fetch(`${API_URL}/api/workflow/reputation/reviews/${item._id}/file`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Supporting file unavailable.')
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a')
      link.href = url; link.download = item.originalName || 'supporting-document'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setError(err.message) }
  }
  return <section aria-label="Reputation review queue" className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Flagged for review · Reputation</h3><p className="mt-1 text-sm text-slate-600">Review requests do not pause applications or other activity.</p></div><label className="text-sm">Review status<select className={workflowControl} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="pending">Pending</option><option value="all">All decisions</option></select></label></div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {!data.items.length && <p className="mt-4 text-sm text-slate-600">No reputation reviews in this queue.</p>}
    <ul className="mt-4 space-y-3">{data.items.map(item => <li key={item._id} className="rounded-xl border border-slate-200 p-4 text-sm"><p className="font-semibold">{item.applicantEmail} · {item.event?.label} · {item.event?.change} points</p><p className="mt-1 text-xs text-slate-500">{workflowDate(item.createdAt)} · {item.status}</p><p className="mt-3">Reason: {item.category}</p><p className="mt-1 break-words">Applicant note: {item.note}</p>{item.adminNote && <p className="mt-2">Admin note: {item.adminNote}</p>}{item.supportingVersion && <button type="button" onClick={() => viewFile(item)} className={`${button} mt-3`}>Download supporting file</button>}
      {can('decide') && ['pending', 'processing'].includes(item.status) && <div className="mt-3 flex flex-wrap gap-2">{['reverse', 'keep', 'reduce'].map(type => <button type="button" className={button} disabled={type === 'reduce' && item.event?.change >= 0} key={type} onClick={() => { setAction({ type, item }); setPublicReason(''); setReducedPoints(''); setError('') }}>{type === 'reverse' ? 'Reverse penalty' : type === 'keep' ? 'Keep penalty' : 'Reduce penalty'}</button>)}</div>}
    </li>)}</ul>
    {data.total > 0 && <Pagination page={page} pageSize={10} totalItems={data.total} onPageChange={setPage} itemLabel="reputation reviews" />}
    {action && <><div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-semibold">Decision for {action.item.applicantEmail}: {action.type}</p>{action.type === 'reduce' && <label className="mt-3 block text-sm">New penalty amount (positive number)<input type="number" min={0} max={Math.max(0, -action.item.event.change - 1)} step={1} value={reducedPoints} onChange={event => setReducedPoints(event.target.value)} className={workflowControl} /></label>}{action.type !== 'reverse' && <label className="mt-3 block text-sm">Explanation for the applicant<textarea maxLength={300} value={publicReason} onChange={event => setPublicReason(event.target.value)} className={workflowControl} /><span className="mt-1 block text-xs text-slate-600">This neutral explanation is shared with the applicant. The confirmation note is private to PESO.</span></label>}<button type="button" className={`${button} mt-3`} disabled={busy || action.type !== 'reverse' && !publicReason.trim() || action.type === 'reduce' && reducedPoints === ''} onClick={() => setAction(current => ({ ...current, confirming: true }))}>Continue to confirmation</button><button type="button" className="ml-3 text-sm underline" onClick={() => setAction(null)}>Cancel</button></div>
    {action.confirming && <ConfirmDialog title={`${action.type === 'reverse' ? 'Reverse' : action.type === 'keep' ? 'Keep' : 'Reduce'} this penalty?`} note="Record your private review note. This decision, any restored points, and your note are audited. The applicant receives a neutral notification." requireReason reasonMinLength={1} busy={busy} error={error} onConfirm={decide} onCancel={() => setAction(current => ({ ...current, confirming: false }))} />}</>}
  </section>
}

export function AdminReputationAccount({ token, applicantId }) {
  const { can } = useAdminAccess()
  const [data, setData] = useState(null), [error, setError] = useState(''), [event, setEvent] = useState(null), [busy, setBusy] = useState(false), [page, setPage] = useState(1), [expanded, setExpanded] = useState(false)
  const load = useCallback(async () => { try { const result = await workflowRequest(token, `/admin/reputation/applicants/${applicantId}`); if (!Array.isArray(result.events) || !result.settings) throw new Error('Reputation ledger unavailable.'); setData(result); setError('') } catch (err) { setError(err.message) } }, [token, applicantId])
  useEffect(() => { setPage(1); if (expanded) load() }, [load, expanded])
  const reverse = async reason => { setBusy(true); try { await workflowRequest(token, `/admin/reputation/applicants/${applicantId}/reverse`, { eventKey: event.key, reason }); setEvent(null); await load() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <details onToggle={event => setExpanded(event.currentTarget.open)} className="mt-4 border-t border-slate-200 pt-4"><summary className="cursor-pointer font-semibold">Reputation ledger (PESO only)</summary>{error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}{data && <><p className="mt-2 text-sm">{data.points} points · {data.tier} · {data.confirmedNoShows} confirmed no-shows in the last {data.settings.graduationMonths} months</p><ul className="mt-3 space-y-2">{data.events.slice((page - 1) * 10, page * 10).map(row => <li key={row.key} className="rounded-lg border border-slate-200 bg-white p-3 text-sm"><p>{row.label} · {row.change > 0 ? '+' : ''}{row.change} · {row.status}</p><p className="mt-1 text-xs text-slate-500">{workflowDate(row.at)} · {row.by || 'System recovery'}</p>{row.reason && <p className="mt-1 text-xs">Admin/event note: {row.reason}</p>}{can('decide') && !row.virtual && row.status !== 'reversed' && <button type="button" className={`${button} mt-2`} onClick={() => setEvent(row)}>Reverse event</button>}</li>)}</ul>{data.events.length > 0 && <Pagination page={page} pageSize={10} totalItems={data.events.length} onPageChange={setPage} itemLabel="ledger events" />}</>}{event && <ConfirmDialog title="Reverse reputation event?" note="This appends a reversal; the original event remains in the audit history. Enter your reason." requireReason reasonMinLength={1} busy={busy} error={error} onConfirm={reverse} onCancel={() => setEvent(null)} />}</details>
}

export function AdminNoShowReviews({ token }) {
  const { can } = useAdminAccess()
  const [data, setData] = useState({ reports: [] }), [action, setAction] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(1)
  const load = useCallback(async () => { try { const result = await workflowRequest(token, `/admin/overview?page=${page}`); setData({ ...result, reports: Array.isArray(result.reports) ? result.reports : [] }) } catch (err) { setError(err.message) } }, [token, page])
  useEffect(() => { load() }, [load])
  const decide = async reason => {
    setBusy(true); setError('')
    try { await workflowRequest(token, `/admin/reports/${encodeURIComponent(action.report._id)}/review`, { decision: action.decision, reason }); setAction(null); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const reports = data.reports.filter(report => report.type === 'no_show' && ['pending', 'responded'].includes(report.status))
  return <section className="my-4 rounded-xl border border-slate-200 bg-white p-4 text-slate-900"><h3 className="font-semibold">Interview no-show reports</h3><p className="mt-2 text-sm text-slate-600">A report never deducts points until PESO confirms it. Read the applicant response or wait for the response deadline.</p>{error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}{!reports.length && <p className="mt-3 text-sm text-slate-500">No pending no-show reports on this page.</p>}{reports.map(report => <article className="mt-3 rounded-lg border border-slate-200 p-3 text-sm" key={report._id}><p>{workflowDate(report.at)} · {report.status}</p><p className="mt-2">Employer report: {report.reason}</p><p className="mt-2">Applicant response: {report.applicantResponse || 'Not received'}</p><p className="mt-2 text-xs text-slate-500">Response deadline: {workflowDate(report.responseDeadline)}</p><fieldset disabled={!can('decide')} className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={report.status !== 'responded' && +new Date(report.responseDeadline) > Date.now()} onClick={() => setAction({ report, decision: 'confirmed' })}>Confirm no-show</button><button type="button" className={button} onClick={() => setAction({ report, decision: 'dismissed' })}>Dismiss report</button></fieldset></article>)}{data.totalReports > 20 && <Pagination page={page} pageSize={20} totalItems={data.totalReports} onPageChange={setPage} itemLabel="reports" />}{action && <ConfirmDialog title={action.decision === 'confirmed' ? 'Confirm this no-show?' : 'Dismiss this report?'} note="Read the report and applicant explanation. Your required review note and any points event are audited." requireReason reasonMinLength={1} busy={busy} error={error} onConfirm={decide} onCancel={() => setAction(null)} />}</section>
}
