import { useState } from "react"
import { API_URL } from "../config"

function RatingForm({ token, toUserId, toRole, hireReportId, onCreated }) {
  const [score, setScore] = useState(5)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!token) {
      setError("Not authenticated")
      return
    }

    setSubmitting(true)
    setError("")

    try {
      const response = await fetch(`${API_URL}/api/ratings`, {
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
      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`)
      }

      if (onCreated) onCreated(data)
    } catch (err) {
      setError(err?.message || "Failed to submit rating")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-800">
        Rate Applicant
      </h4>

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
            >
              {value}
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
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
          placeholder="Share feedback about the applicant"
          disabled={submitting}
        />
      </div>

      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

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
