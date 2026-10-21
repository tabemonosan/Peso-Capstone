import { useCallback, useEffect, useState } from "react"
import { API_URL } from "../config"

// Admin review panel for an applicant's verification documents.
// - Each document slot shows its latest version with a status badge and ID type.
// - Resubmitted documents (new pending version after a rejection) are flagged.
// - Version history is expandable so admins can compare with previous versions.
// - Reject prompts for a reason; the applicant only has to re-upload that document.
export default function AdminVerificationDocs({ applicant, token, onReviewed }) {
  const [documents, setDocuments] = useState(null)
  const [status, setStatus] = useState(null)
  const [rejecting, setRejecting] = useState(null) // docKey being rejected
  const [rejectReason, setRejectReason] = useState("")
  const [expanded, setExpanded] = useState({}) // docKey -> bool

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicant.id}/verification-documents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data) {
        setDocuments(data.documents || [])
        setStatus({ verificationStatus: data.verificationStatus, verificationReason: data.verificationReason })
      }
    } catch {
      setDocuments([])
    }
  }, [applicant.id, token])

  useEffect(() => {
    setDocuments(null)
    load()
  }, [load])

  const viewVersion = (url) => {
    if (!url) return alert("Document link unavailable")
    window.open(`${API_URL}${url}`, "_blank")
  }

  const review = async (docKey, decision, reason = "") => {
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicant.id}/verification-documents/${docKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: decision, reason }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) return alert(data?.error || "Review failed")
      setRejecting(null)
      setRejectReason("")
      await load()
      onReviewed?.(data)
    } catch (err) {
      alert(err?.message || "Review failed")
    }
  }

  const badge = (docStatus) => {
    const colors = {
      approved: "bg-green-600 text-white",
      rejected: "bg-rose-600 text-white",
      pending: "bg-amber-500 text-slate-950",
      missing: "bg-slate-600 text-white",
      superseded: "bg-slate-500 text-white",
    }
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[docStatus] || colors.pending}`}>{docStatus || "missing"}</span>
  }

  return (
    <div className="mt-3 rounded-2xl border border-slate-600 bg-slate-900 p-3">
      <p className="text-sm font-semibold text-white">
        Verification documents
        {status?.verificationStatus && <span className="ml-2 text-xs font-medium text-slate-400">Account: {status.verificationStatus.replace("_", " ")}</span>}
      </p>
      {documents === null ? (
        <p className="mt-2 text-xs text-slate-400">Loading…</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {documents.map((doc) => (
            <li key={doc.docKey} className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">
                  {doc.label}{doc.idType ? ` — ${doc.idType}` : ""}
                  {doc.latest ? ` (v${doc.latest.version})` : ""}
                </span>
                {badge(doc.status)}
                {doc.resubmitted && (
                  <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-semibold text-white">resubmitted</span>
                )}
                {doc.latest?.url && (
                  <button type="button" onClick={() => viewVersion(doc.latest.url)} className="rounded-xl bg-cyan-500 px-2 py-1 text-xs font-semibold text-slate-950">
                    View
                  </button>
                )}
                {doc.status === "pending" && (
                  <>
                    <button type="button" onClick={() => review(doc.docKey, "approved")} className="rounded-xl bg-green-500 px-2 py-1 text-xs font-semibold text-white">
                      Approve
                    </button>
                    <button type="button" onClick={() => { setRejecting(doc.docKey); setRejectReason("") }} className="rounded-xl bg-red-500 px-2 py-1 text-xs font-semibold text-white">
                      Reject
                    </button>
                  </>
                )}
                {doc.history?.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => ({ ...current, [doc.docKey]: !current[doc.docKey] }))}
                    className="rounded-xl border border-slate-500 px-2 py-1 text-xs text-slate-300"
                  >
                    {expanded[doc.docKey] ? "Hide history" : `History (${doc.history.length})`}
                  </button>
                )}
              </div>

              {doc.latest ? (
                <p className="mt-1 text-xs text-slate-400">
                  {doc.latest.originalName} • {doc.latest.size ? `${Math.ceil(doc.latest.size / 1024)} KB` : ""}
                  {doc.latest.uploadedAt ? ` • ${new Date(doc.latest.uploadedAt).toLocaleString()}` : ""}
                  {" • "}{doc.uploadsUsed}/5 uploads used
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Not uploaded yet.</p>
              )}

              {doc.status === "rejected" && doc.latest?.reviewReason && (
                <p className="mt-1 rounded-lg border border-rose-400 bg-rose-950/40 p-1.5 text-xs text-rose-300">Reason: {doc.latest.reviewReason}</p>
              )}

              {rejecting === doc.docKey && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={`Reason for rejecting ${doc.label} (re-upload request)`}
                    className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                  />
                  <button type="button" onClick={() => review(doc.docKey, "rejected", rejectReason)} className="rounded-xl bg-red-500 px-2 py-1 text-xs font-semibold text-white">
                    Confirm reject
                  </button>
                  <button type="button" onClick={() => setRejecting(null)} className="rounded-xl border border-slate-500 px-2 py-1 text-xs text-slate-300">
                    Cancel
                  </button>
                </div>
              )}

              {expanded[doc.docKey] && doc.history?.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-slate-700 pt-2">
                  {doc.history.map((version) => (
                    <li key={version.version} className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">v{version.version}</span>
                      {badge(version.status)}
                      <span className="truncate">{version.originalName}</span>
                      {version.uploadedAt && <span>{new Date(version.uploadedAt).toLocaleString()}</span>}
                      {version.url && (
                        <button type="button" onClick={() => viewVersion(version.url)} className="rounded-lg border border-slate-500 px-1.5 py-0.5 text-slate-300">
                          View
                        </button>
                      )}
                      {version.reviewReason && <span className="text-rose-300">({version.reviewReason})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
