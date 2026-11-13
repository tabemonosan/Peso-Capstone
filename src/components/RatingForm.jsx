import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL } from "../config"
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

function RatingForm({ token, toUserId, toRole, hireReportId, onCreated }) {
  const [score, setScore] = useState(5)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(true), [checkFailed, setCheckFailed] = useState(false), [ratedKey, setRatedKey] = useState('')
  const key = `${toUserId}:${hireReportId}`
  const callback = useRef(onCreated), inFlight = useRef(false), requestVersion = useRef(0)
  callback.current = onCreated
  const check = useCallback(async () => {
    const version = ++requestVersion.current
    setChecking(true); setCheckFailed(false); setError('')
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/ratings/${toUserId}`, { headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json()
      if (!response.ok || !Array.isArray(result.ratings)) throw new Error(result.error || 'Could not check your saved rating. Please try again.')
      if (version !== requestVersion.current) return
      const exists = result.ratings.some(rating => toRole === 'applicant' ? rating.fromRole !== 'applicant' : rating.fromRole === 'applicant' && String(rating.hireReportId) === String(hireReportId))
      if (exists) { setRatedKey(`${toUserId}:${hireReportId}`); callback.current?.({ alreadyExists: true }) }
    } catch (err) {
      if (version === requestVersion.current) { setCheckFailed(true); setError(err.message) }
    } finally { if (version === requestVersion.current) setChecking(false) }
  }, [token, toUserId, hireReportId, toRole])
  useEffect(() => { check(); return () => { requestVersion.current += 1 } }, [check])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (inFlight.current || checking || checkFailed || ratedKey === key) return
    if (!token) {
      setError("Not authenticated")
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setError("")

    try {
      const response = await fetchWithTimeout(`${API_URL}/api/ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          toUserId,
          toRole,
          hireReportId,
          score,
          comment,
        }),
      })

      const data = await response.json().catch(() => null)
      if (data?.code === 'RATING_ALREADY_EXISTS' || response.status === 400 && /rating already exists/i.test(data?.error || '')) {
        setRatedKey(key); callback.current?.({ alreadyExists: true }); return
      }
      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`)
      }

      setRatedKey(key)
      callback.current?.(data)
    } catch (err) {
      setError(err?.message || "Failed to submit rating")
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (ratedKey === key) return toRole === 'employer' ? <p role="status" className="mt-3 text-sm text-slate-600">You have already rated this company.</p> : null
  if (checking) return <p role="status" className="mt-3 text-xs text-slate-600">Checking whether you already submitted a rating...</p>
  if (checkFailed) return <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3"><p role="alert" className="text-sm text-rose-800">{error}</p><button type="button" onClick={check} className="mt-2 text-sm text-blue-800 underline">Retry rating check</button></div>
  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-800">
        {toRole === 'applicant' ? 'Rate Applicant' : 'Rate company'}
      </h4>
      <p className="mt-2 text-xs text-slate-600">You can submit this rating only once. Ratings do not change reputation points.</p>

      <div className="mt-3">
        <label className="block text-sm font-medium text-slate-700" htmlFor={`rating-score-${hireReportId}`}>
          Score (1-5)
        </label>
        <div className="mt-2 flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScore(value)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                score >= value ? "bg-cyan-500 text-slate-950" : "bg-slate-100 text-slate-600"
              }`}
              disabled={submitting}
              aria-pressed={score === value}
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
            >
              <span aria-hidden="true">{score >= value ? '★' : '☆'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-sm font-medium text-slate-600" htmlFor={`rating-comment-${hireReportId}`}>
          Comment
        </label>
        <textarea
          id={`rating-comment-${hireReportId}`}
          rows="3"
          maxLength={1000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
          placeholder="Share feedback about the applicant"
          disabled={submitting}
        />
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}

      <div className="mt-4">
        <button
          type="submit"
          disabled={submitting}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
            submitting ? "bg-slate-100 text-slate-500" : "bg-cyan-500 text-slate-950"
          }`}
        >
          {submitting ? "Submitting..." : "Submit Rating"}
        </button>
      </div>
    </form>
  )
}

export default RatingForm
