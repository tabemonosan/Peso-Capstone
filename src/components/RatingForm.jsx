import { useState } from "react"

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
      const response = await fetch("http://localhost:4000/api/ratings", {
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
      className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
    >
      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        Rate Applicant
      </h4>

      <div className="mt-3">
        <label className="block text-sm font-medium text-slate-300" htmlFor={`rating-score-${hireReportId}`}>
          Score (1-5)
        </label>
        <div className="mt-2 flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScore(value)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                score >= value ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300"
              }`}
              disabled={submitting}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-sm font-medium text-slate-300" htmlFor={`rating-comment-${hireReportId}`}>
          Comment
        </label>
        <textarea
          id={`rating-comment-${hireReportId}`}
          rows="3"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          placeholder="Share feedback about the applicant"
          disabled={submitting}
        />
      </div>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <div className="mt-4">
        <button
          type="submit"
          disabled={submitting}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
            submitting ? "bg-slate-700 text-slate-400" : "bg-cyan-500 text-slate-950"
          }`}
        >
          {submitting ? "Submitting..." : "Submit Rating"}
        </button>
      </div>
    </form>
  )
}

export default RatingForm
