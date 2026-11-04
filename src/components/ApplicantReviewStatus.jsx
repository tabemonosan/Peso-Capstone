import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

export default function ApplicantReviewStatus({ token, onManageDocuments }) {
  const [review, setReview] = useState(null), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetchWithTimeout(`${API_URL}/api/profile/review-status`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await response.json()
        if (!response.ok || !data?.status || !Array.isArray(data.documents)) throw new Error('Review details unavailable')
        if (active) {
          setReview(data); setError('')
          window.dispatchEvent(new CustomEvent('applicant-consistency', { detail: { status: data.status } }))
        }
      } catch { if (active) setError('Review details are temporarily unavailable. You can still review and update your documents.') }
    }
    load(); const timer = setInterval(load, 10000)
    return () => { active = false; clearInterval(timer) }
  }, [token])
  return <section aria-labelledby="applicant-review-status-title" className="mt-5 rounded-2xl border border-blue-200 bg-white p-5 text-slate-900">
    <h3 id="applicant-review-status-title" className="text-lg font-semibold">{review?.status === 'waitlisted' ? 'Why your account needs PESO review' : 'Why your account is under review'}</h3>
    {review?.checking && <p role="status" className="mt-2 text-sm text-blue-800">Your documents are being checked.</p>}
    <p className="mt-2 text-sm text-slate-600">{review?.message || 'PESO is checking your registration and required documents. You can open My Documents to check or correct your submission.'}</p>
    {review?.documents.length > 0 && <ul className="mt-4 space-y-3">{review.documents.map(doc => <li key={doc.docKey} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><p className="font-semibold">{doc.label}</p><p className="mt-1 text-slate-700">{doc.reason}</p><p className="mt-2 text-xs text-slate-600">{doc.canUpdate ? `You can update this document. ${doc.uploadsRemaining} of 5 uploads left.` : 'Open My Documents for the available next steps.'}</p></li>)}</ul>}
    {error && <p role="status" className="mt-3 text-sm text-slate-600">{error}</p>}
    <button type="button" onClick={onManageDocuments} className="mt-4 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Review and update documents</button>
    <p className="mt-2 text-xs text-slate-500">You can edit a pending NSRP or replace pending documents. Updates are sent to PESO for review. Approved documents require a correction request.</p>
  </section>
}
