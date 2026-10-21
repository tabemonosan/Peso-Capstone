import { useCallback, useEffect, useState } from "react"
import { API_URL } from "../config"

// "Complete your registration" — the only page visible until every required
// profile field and document is done. Progress indicator + per-item links.
export default function CompleteRegistrationPage({ role, token, onNavigate, onUpdated }) {
  const [registration, setRegistration] = useState(null)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/profile`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.registration) {
        setRegistration(data.registration)
        setError("")
        onUpdated?.(data)
      } else {
        throw new Error(data?.error || "Unable to load your registration checklist.")
      }
    } catch (loadError) {
      console.error(loadError)
      setError(loadError?.message || "Unable to load your registration checklist.")
    }
  }, [token, onUpdated])

  useEffect(() => {
    load()
  }, [load])

  if (!registration) return <p role={error ? "alert" : "status"} className="text-sm text-slate-600">{error || "Loading your registration checklist…"}</p>

  const { done, total, checklist, complete } = registration

  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-6">
      <h2 className="text-xl font-semibold text-black">Complete your registration</h2>
      <p className="mt-1 text-sm text-slate-600">
        Finish the remaining steps to unlock the {role === "Employer" ? "employer dashboard" : "job listings"}.
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm font-medium text-black">
          <span>{done} of {total} steps done</span>
          <span>{Math.round((done / Math.max(total, 1)) * 100)}%</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
        </div>
      </div>

      {complete ? (
        <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3">
          <p className="text-sm font-medium text-green-700">All steps complete — you're all set!</p>
          <button
            type="button"
            onClick={() => onNavigate("continue")}
            className="mt-3 rounded-xl bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950"
          >
            Continue to the portal
          </button>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {checklist.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className={`flex items-center gap-2 text-sm ${item.done ? "text-green-700" : "text-black"}`}>
                <span aria-hidden="true">{item.done ? "✓" : "○"}</span>
                {item.label}
              </span>
              {!item.done && (
                <button
                  type="button"
                  onClick={() => onNavigate(item.link)}
                  className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  {item.link === "documents" || item.link === "dashboard" ? "Upload" : "Fill in"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
