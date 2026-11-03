import { useCallback, useEffect, useState } from 'react'
import { workflowRequest, workflowDate } from '../utils/applicationWorkflow'
import Pagination from './Pagination'

export default function ApplicantReputationPage({ token, onOpenApplications }) {
  const [data, setData] = useState(null), [page, setPage] = useState(1), [error, setError] = useState('')
  const load = useCallback(async () => {
    try { setData(await workflowRequest(token, `/reputation?page=${page}`)); setError('') }
    catch (err) { setError(err.message) }
  }, [token, page])
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  return <section className="portal-card rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-bold">My reputation</h2>
    <p className="mt-2 text-sm text-slate-600">Every applicant starts with 100 points. Your points reflect PESO-confirmed events and stay between 0 and 100.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!data && !error && <p role="status" className="mt-4 text-sm">Loading reputation...</p>}
    {data && <>
      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5"><p className="text-sm font-semibold text-blue-900">Current reputation points</p><p className="mt-2 text-4xl font-bold text-blue-800" aria-label={`${data.points} out of 100 reputation points`}>{data.points}<span className="text-lg text-slate-500"> / 100</span></p><p className="mt-3 text-xs text-slate-600">Only you and PESO can view your points. Employer star ratings do not add or deduct points.</p></div>
      <h3 className="mt-6 font-semibold">How points change</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">{(data.policy || []).map(rule => <li key={rule.type} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold"><span className={rule.delta < 0 ? 'text-rose-700' : 'text-emerald-700'}>{rule.delta > 0 ? '+' : ''}{rule.delta}</span> · {rule.label}</p><p className="mt-2 text-xs text-slate-600">{rule.description}</p></li>)}</ul>
      <p className="mt-4 text-sm text-slate-600">A no-show report alone does not deduct points. Explain a missed interview in My applications before the response deadline. PESO reviews your response and any exceptional circumstances. Contact PESO to ask for a review of a completed decision.</p>
      {onOpenApplications && <button type="button" onClick={onOpenApplications} className="mt-3 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">Open My applications</button>}
      <h3 className="mt-6 font-semibold">Points history</h3>
      {!data.items?.length ? <p className="mt-3 text-sm text-slate-600">No reputation changes yet. You start with 100 points.</p> : <ul className="mt-3 space-y-3">{data.items.map((event, index) => <li key={`${event.at}-${index}`} className="rounded-xl border border-slate-200 p-4 text-sm"><div className="flex items-start justify-between gap-3"><p className="font-semibold">{event.label}</p><span className={event.change < 0 ? 'font-bold text-rose-700' : 'font-bold text-emerald-700'}>{event.change > 0 ? '+' : ''}{event.change} points</span></div><p className="mt-2 text-xs text-slate-600">{workflowDate(event.at)} · {event.before} → {event.after} points</p></li>)}</ul>}
      <Pagination page={page} pageSize={data.pageSize || 10} totalItems={data.total || 0} onPageChange={setPage} itemLabel="reputation events" />
    </>}
  </section>
}
