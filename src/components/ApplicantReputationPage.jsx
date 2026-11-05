import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import { workflowRequest, workflowDate, workflowControl } from '../utils/applicationWorkflow'
import { REVIEW_CATEGORIES } from '../../shared/reputation.js'
import Pagination from './Pagination'
import Modal from './Modal'

const date = value => new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' })
const statusLabel = { applied: 'Applied', under_review: 'Under review', reversed: 'Reversed' }
export default function ApplicantReputationPage({ token, onOpenApplications }) {
  const [data, setData] = useState(null), [page, setPage] = useState(1), [order, setOrder] = useState('desc'), [error, setError] = useState('')
  const [review, setReview] = useState(null), [category, setCategory] = useState(''), [note, setNote] = useState(''), [file, setFile] = useState(null), [busy, setBusy] = useState(false), [reviewError, setReviewError] = useState(''), [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    try { const result = await workflowRequest(token, `/reputation?page=${page}&order=${order}`); setData(result); setError(''); if (result.total > 0 && !result.items?.length && page > 1) setPage(Math.max(1, Math.ceil(result.total / (result.pageSize || 10)))) }
    catch (err) { setError(err.message) }
  }, [token, page, order])
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  const requestReview = async event => {
    event.preventDefault(); setBusy(true); setReviewError('')
    try {
      if (file && (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024)) throw new Error('Upload one JPG, PNG, or PDF up to 5 MB.')
      const body = new FormData()
      body.append('eventId', review.id); body.append('category', category); body.append('note', note.trim())
      if (file) body.append('file', file)
      const response = await fetch(`${API_URL}/api/workflow/reputation/reviews`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to request review.')
      setReview(null); setNotice('Your review request was sent to PESO. Your other applications and activities continue normally.'); await load()
    } catch (err) { setReviewError(err.message) }
    finally { setBusy(false) }
  }
  const tier = data?.tier || 'Good standing'
  const tierStyle = tier === 'At risk' ? 'border-rose-200 bg-rose-50 text-rose-800' : tier === 'Needs improvement' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-800'
  return <section className="portal-card rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-6">
    <h2 className="text-xl font-bold">My reputation</h2>
    <p className="mt-2 text-sm text-slate-600">Your standing, points history, and ways to recover lost points.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
    {!data && !error && <p role="status" className="mt-4 text-sm">Loading reputation...</p>}
    {data && <>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5" aria-label="Your standing">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Your standing</h3><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tierStyle}`}>{tier}</span></div>
          <p className="mt-3 text-4xl font-bold text-blue-800" aria-label={`${data.points} out of ${data.maximumPoints || 100} reputation points`}>{data.points}<span className="text-lg text-slate-500"> / {data.maximumPoints || 100}</span></p>
          <progress aria-label="Reputation points" className="mt-4 h-3 w-full accent-blue-700" value={data.points} max={data.maximumPoints || 100} />
          <p className="mt-3 text-sm leading-relaxed text-slate-700">{data.lowTrustRouting ? 'Applications from the At risk tier are reviewed by PESO before reaching employers. Points alone never automatically decline or suspend an account.' : 'PESO staff see your standing when reviewing referrals. Points alone never block applying or decide an outcome.'}</p>
          <p className="mt-3 text-xs text-slate-600">Only you and PESO can view your points. Employer star ratings never change them.</p>
        </section>
        {data.points < (data.maximumPoints || 100) && <section className="rounded-xl border border-slate-200 p-5" aria-label="Your path back">
          <h3 className="font-semibold">Your path back</h3>
          <p className="mt-3 text-sm text-slate-700">{data.recovery?.expectedAt ? <>Back to {data.maximumPoints || 100} by <strong>{date(data.recovery.expectedAt)}</strong> if there are no new penalties.</> : 'Recovery depends on the current policy and your confirmed events.'}</p>
          {data.recovery?.nextAt && <><p className="mt-3 text-sm">Next recovery: +{data.recovery.amount} on {date(data.recovery.nextAt)}</p><progress aria-label="Weekly recovery progress" className="mt-2 h-2 w-full accent-blue-700" max={1} value={data.recovery.progress} /></>}
          <ul className="mt-4 list-outside list-disc space-y-2 pl-4 text-sm text-slate-600"><li>Avoid new penalties so recovery continues.</li><li>Attend your next interview (+{data.settings?.attendanceCredit ?? 5}, within the policy limits).</li><li>Request a review if a penalty was unfair.</li></ul>
        </section>}
      </div>
      <h3 className="mt-6 font-semibold">How points change</h3>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Event</th><th className="p-3">Points and limits</th></tr></thead><tbody>{(data.policy || []).map(rule => <tr key={rule.type} className="border-t border-slate-200"><th scope="row" className="p-3 align-top font-medium">{rule.label}</th><td className="p-3 leading-relaxed text-slate-600">{rule.description}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-600">Employer no-show reports after the scheduled interview time apply the reputation policy automatically. You can respond in My applications or request a penalty review below. PESO can reverse an incorrect penalty.</p>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3"><h3 className="font-semibold">Points history</h3><label className="text-sm text-slate-600">Sort history<select value={order} onChange={event => { setOrder(event.target.value); setPage(1) }} className={workflowControl}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div>
      {!data.items?.length ? <p className="mt-3 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No changes yet. You start with {data.initialPoints ?? 100} points.</p> : <ul className="mt-3 space-y-3">{data.items.map(event => <li key={event.id || `${event.type}-${event.at}`} className="rounded-xl border border-slate-200 p-4 text-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{event.label}</p><p className="mt-1 text-xs text-slate-500">{workflowDate(event.at)}</p></div><span className={`shrink-0 font-bold ${event.change < 0 ? 'text-rose-700' : 'text-green-700'}`}>{event.change > 0 ? '+' : ''}{event.change} points</span></div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs">{statusLabel[event.status] || 'Applied'}</span><span className="text-xs text-slate-500">{event.before} → {event.after} points</span>
        {event.applicationId && <a href={`/?notificationView=my-applications&applicationId=${encodeURIComponent(event.applicationId)}`} onClick={onOpenApplications ? click => { click.preventDefault(); onOpenApplications(event.applicationId) } : undefined} className="text-xs font-medium text-blue-700 underline">Open application</a>}
        {event.canRequestReview && <button type="button" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800" onClick={() => { setReview(event); setCategory(''); setNote(''); setFile(null); setReviewError('') }}>Request review</button>}</div>
        {event.explanation && <p className="mt-2 text-xs text-slate-600">{event.explanation}</p>}
        {event.review && !['pending', 'processing'].includes(event.review.status) && <p className="mt-2 text-xs text-slate-600">Review outcome: {event.review.status}.{event.review.publicReason ? ` ${event.review.publicReason}` : ''}</p>}
      </li>)}</ul>}
      {data.total > 0 && <Pagination page={page} pageSize={data.pageSize || 10} totalItems={data.total} onPageChange={setPage} itemLabel="reputation events" />}
      {onOpenApplications && <button type="button" onClick={() => onOpenApplications()} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Open My applications</button>}
    </>}
    {review && <Modal onClose={() => { if (!busy) setReview(null) }} labelledBy="reputation-review-title" maxWidth="max-w-lg"><h2 id="reputation-review-title" className="text-lg font-bold">Request a penalty review</h2><p className="mt-2 text-sm text-slate-600">{review.label} · {review.change} points. One request per penalty. Other activities continue normally.</p>
      <form className="mt-4 space-y-4" onSubmit={requestReview}>
        <label className="block text-sm font-medium">Reason<select required className={workflowControl} value={category} disabled={busy} onChange={event => setCategory(event.target.value)}><option value="">Choose a reason</option>{REVIEW_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-sm font-medium">Your note<textarea required maxLength={300} className={workflowControl} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">{note.length}/300 characters</span></label>
        <label className="block text-sm font-medium">Supporting file (optional)<input type="file" accept="image/jpeg,image/png,application/pdf" className={`${workflowControl} min-w-0`} disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} /><span className="mt-1 block text-xs font-normal text-slate-500">One JPG, PNG, or PDF, up to 5 MB. Only you and PESO can access it.</span></label>
        {reviewError && <p role="alert" className="text-sm text-rose-700">{reviewError}</p>}
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || !category || !note.trim()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send review request'}</button><button type="button" disabled={busy} onClick={() => setReview(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button></div>
      </form>
    </Modal>}
  </section>
}
