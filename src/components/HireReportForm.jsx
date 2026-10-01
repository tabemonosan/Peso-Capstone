import { useState } from "react"

function HireReportForm({ token, applicantId, jobId, referralId, onCreated }) {
  const [status, setStatus] = useState("hired")
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
      const response = await fetch("${API_URL}/api/hire-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ applicantId, jobId, referralId, status }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`)
      }

      if (onCreated) onCreated(data)
    } catch (err) {
      setError(err?.message || "Failed to submit hire report")
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
        Submit Hire Report
      </h4>

      <div className="mt-3">
        <label className="block text-sm font-medium text-slate-300" htmlFor={`hire-status-${referralId}`}>
          Status
        </label>
        <select
          id={`hire-status-${referralId}`}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          disabled={submitting}
        >
          <option value="hired">Hired</option>
          <option value="deployed">Deployed</option>
        </select>
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
          {submitting ? "Submitting..." : "Submit Hire Report"}
        </button>
      </div>
    </form>
  )
}

export default HireReportForm
