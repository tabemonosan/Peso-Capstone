import { useCallback, useEffect, useState } from "react"
import { API_URL } from "../config"
import MyDocumentsModal from "./MyDocumentsModal"

// "My Documents" — the only page unverified applicants can access.
// Shows a compact verification summary (status chip + attention count);
// the document cards themselves open in a modal via the button below.
export default function MyDocumentsPage({ applicantId, token, onUpdated }) {
  const [info, setInfo] = useState(null)
  const [showDocsModal, setShowDocsModal] = useState(() => new URLSearchParams(window.location.search).get("editNsrp") === "1")

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicantId}/verification-documents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data) setInfo(data)
    } catch {
      /* keep previous state */
    }
  }, [applicantId, token])

  useEffect(() => {
    load()
  }, [load])

  if (!info) return <p className="text-sm text-slate-400">Loading your documents…</p>

  const documents = info.documents || []
  const approvedCount = documents.filter((doc) => doc.status === "approved").length
  const statusStyles = {
    approved: "border-green-300 bg-green-100 text-green-800",
    declined: "border-rose-300 bg-rose-100 text-rose-800",
    restricted: "border-rose-300 bg-rose-100 text-rose-800",
    under_review: "border-amber-300 bg-amber-100 text-amber-800",
  }

  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-6">
      <h2 className="text-xl font-semibold text-black">My Documents</h2>
      <p className="mt-1 text-sm text-slate-600">
        An admin reviews each document before you can browse jobs.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {info.verificationStatus && (
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyles[info.verificationStatus] || "border-slate-300 bg-slate-100 text-slate-600"}`}>
            {String(info.verificationStatus).replaceAll("_", " ")}
          </span>
        )}
        <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {approvedCount} of {documents.length} approved
        </span>
        {info.attentionCount > 0 && (
          <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" role="alert">
            {info.attentionCount} need{info.attentionCount === 1 ? "s" : ""} attention
          </span>
        )}
      </div>

      {info.verificationReason && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{info.verificationReason}</p>
      )}

      <button
        type="button"
        onClick={() => setShowDocsModal(true)}
        className="mt-5 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white"
      >
        Verification documents
      </button>

      {showDocsModal && (
        <MyDocumentsModal
          info={info}
          token={token}
          onClose={() => setShowDocsModal(false)}
          onUpdated={async () => {
            await load()
            onUpdated?.()
          }}
        />
      )}
    </div>
  )
}
