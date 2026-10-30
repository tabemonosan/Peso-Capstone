import { useCallback, useEffect, useState } from "react"
import { API_URL } from "../config"
import MyDocumentsModal from "./MyDocumentsModal"

// Document details open only after the applicant chooses to manage them.
export default function MyDocumentsPage({ applicantId, token, onUpdated, open, onOpenChange }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [showDocsModal, setShowDocsModal] = useState(() => new URLSearchParams(window.location.search).get("editNsrp") === "1")
  const setDocumentsOpen = (value) => {
    setShowDocsModal(value)
    onOpenChange?.(value)
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicantId}/verification-documents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) throw new Error(data?.error || 'Unable to load your documents.')
      setInfo(data)
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load your documents.')
    }
  }, [applicantId, token])

  useEffect(() => {
    load()
  }, [load])

  if (!info) return <p role={error ? 'alert' : 'status'} className="text-sm text-slate-600">{error || 'Loading your documents…'}</p>

  const documents = info.documents || []
  const requiredDocuments = documents.filter((doc) => doc.required)
  const approvedCount = requiredDocuments.filter((doc) => doc.status === "approved").length
  const statusStyles = {
    approved: "border-green-300 bg-green-100 text-green-800",
    declined: "border-rose-300 bg-rose-100 text-rose-800",
    restricted: "border-rose-300 bg-rose-100 text-rose-800",
    under_review: "border-amber-300 bg-amber-100 text-amber-800",
  }

  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-6">
      <h3 className="text-xl font-semibold text-black">Documents submitted to PESO</h3>
      <p className="mt-1 text-sm font-semibold text-cyan-800">Submitted to PESO</p>
      <p className="mt-1 text-sm text-slate-600">
        These documents are submitted to PESO for registration and verification. Employers receive your contact details and job-related qualifications. Your NSRP form and verification documents are not shared with employers.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {info.verificationStatus && (
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusStyles[info.verificationStatus] || "border-slate-300 bg-slate-100 text-slate-600"}`}>
            {String(info.verificationStatus).replaceAll("_", " ")}
          </span>
        )}
        <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {approvedCount} of {requiredDocuments.length} required documents approved
        </span>
        {info.attentionCount > 0 && (
          <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" role="alert">
            Needs attention ({info.attentionCount})
          </span>
        )}
      </div>

      {info.verificationReason && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{info.verificationReason}</p>
      )}

      <button
        type="button"
        onClick={() => setDocumentsOpen(true)}
        className="mt-5 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white"
      >
        Manage my documents
      </button>

      {(open ?? showDocsModal) && (
        <MyDocumentsModal
          info={info}
          token={token}
          onClose={() => setDocumentsOpen(false)}
          onUpdated={async () => {
            await load()
            onUpdated?.()
          }}
        />
      )}
    </div>
  )
}
