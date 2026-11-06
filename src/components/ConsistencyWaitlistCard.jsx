import { WAITLIST_TIP } from '../../shared/consistencyWaitlist.js'
export default function ConsistencyWaitlistCard({ state }) {
  if (!state?.checking && !state?.waitlisted) return null
  return <section aria-label="Document consistency review" className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-900">
    {state.checking && <p role="status">Your documents are being checked. You can continue using My Documents while we check them.</p>}
    {state.waitlisted && <><h3 className="font-semibold">Why is my account waitlisted?</h3><p className="mt-2">Your account needs a review by PESO staff. Employment features are paused; you can still view your profile and notifications, manage documents, and explain a difference.</p>
      <ul className="mt-3 space-y-3">{state.issues?.map((issue, index) => <li key={`${issue.document}-${index}`}><strong>{issue.label} · {issue.fieldGroup}</strong><p>{issue.message}</p>{issue.chancesLeft !== null && <p>{issue.chancesLeft} chances left.{!issue.canResubmit && ' Please contact the PESO office. Staff will review your case. You can still explain a difference.'}</p>}</li>)}</ul>
      <p className="mt-3">{state.tip || WAITLIST_TIP}</p><p className="mt-2">Open Manage my documents to submit a corrected copy or use Explain a difference. Explanations do not use a chance.</p>
    </>}
    <p className="mt-3 whitespace-pre-wrap">Contact PESO: {state.contact}<br />Office hours: {state.officeHours}</p>
  </section>
}
