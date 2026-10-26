import { useState } from "react"
import { API_URL } from "../config"
import Modal from "./Modal"
import { ID_TYPE_OPTIONS } from "./VerificationDocumentsForm"

// Applicant-facing documents modal: one card per requirement with a status
// badge, file details, View (signed expiring URL), and Replace/Upload for
// documents that still need attention. Approved documents are locked.
export default function MyDocumentsModal({ info, token, onClose, onUpdated }) {
  const [pendingFile, setPendingFile] = useState({})
  const [pendingIdType, setPendingIdType] = useState({})
  const [uploading, setUploading] = useState(null)
  const [error, setError] = useState("")

  const viewVersion = (url) => {
    if (!url) return alert("Document link unavailable")
    window.open(`${API_URL}${url}`, "_blank")
  }

  const pickFile = (docKey, file) => {
    setError("")
    if (!file) return setPendingFile((current) => ({ ...current, [docKey]: null }))
    const acceptedTypes = docKey === "resume"
      ? ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
      : ["image/jpeg", "image/png", "application/pdf"]
    if (!acceptedTypes.includes(file.type)) return setError(docKey === "resume" ? "Resume must be a PDF, DOCX, JPG, or PNG file." : "Only JPG, PNG, or PDF files are accepted.")
    if (file.size > 5 * 1024 * 1024) return setError(`"${file.name}" is too large. Maximum is 5 MB.`)
    setPendingFile((current) => ({ ...current, [docKey]: file }))
  }

  const replaceDoc = async (docKey) => {
    const file = pendingFile[docKey]
    if (!file) return
    setUploading(docKey)
    setError("")
    try {
      const payload = new FormData()
      payload.append("document", file)
      if (docKey.startsWith("validId") && pendingIdType[docKey]) payload.append("idType", pendingIdType[docKey])
      const response = await fetch(`${API_URL}/api/profile/verification-documents/${docKey}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error || "Upload failed")
      setPendingFile((current) => ({ ...current, [docKey]: null }))
      await onUpdated?.()
    } catch (err) {
      setError(err?.message || "Upload failed")
    } finally {
      setUploading(null)
    }
  }

  const chip = (status) => {
    const styles = {
      approved: "border-green-300 bg-green-100 text-green-800",
      rejected: "border-rose-300 bg-rose-100 text-rose-800",
      pending: "border-amber-300 bg-amber-100 text-amber-800",
      missing: "border-slate-300 bg-slate-100 text-slate-600",
    }
    return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status] || styles.missing}`}>{status || "missing"}</span>
  }

  return (
    <Modal onClose={onClose} labelledBy="my-documents-title" describedBy="my-documents-description">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="my-documents-title" className="text-xl font-bold">Verification documents</h2>
          <p id="my-documents-description" className="mt-1 text-sm text-slate-600">
            An admin reviews each document before you can browse jobs. Rejected or missing documents can be replaced below (up to 5 uploads each).
          </p>
          {info.verificationStatus && (
            <p className="mt-1 text-sm text-slate-600">
              Account: <span className="font-semibold capitalize">{String(info.verificationStatus).replaceAll("_", " ")}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close verification documents" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
          Close
        </button>
      </div>

      {info.verificationReason && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{info.verificationReason}</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

      <ul className="mt-5 space-y-3">
        {(info.documents || []).map((doc) => {
          const canReplace = ["pending", "rejected", "missing"].includes(doc.status)
          const locked = doc.status === "approved"
          return (
            <li key={doc.docKey} className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {doc.label}{doc.idType ? ` — ${doc.idType}` : ""}
                </span>
                {chip(doc.status)}
                {doc.required && <span className="text-xs text-slate-500">required</span>}
                {doc.latest?.url && (
                  <button type="button" onClick={() => viewVersion(doc.latest.url)} className="rounded-xl bg-cyan-500 px-2 py-1 text-xs font-semibold text-white">
                    View
                  </button>
                )}
              </div>

              {doc.latest ? (
                <p className="mt-1 text-xs text-slate-500">
                  v{doc.latest.version} • {doc.latest.originalName} • {doc.latest.size ? `${Math.ceil(doc.latest.size / 1024)} KB` : ""}
                  {doc.latest.uploadedAt ? ` • uploaded ${new Date(doc.latest.uploadedAt).toLocaleDateString()}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Not uploaded yet.</p>
              )}

              {doc.status === "rejected" && doc.latest?.reviewReason && (
                <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700">
                  Admin: {doc.latest.reviewReason}
                </p>
              )}
              {locked && <p className="mt-2 text-xs text-green-700">Approved — this document is locked.</p>}

              {canReplace && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {doc.docKey.startsWith("validId") && (
                    <select
                      value={pendingIdType[doc.docKey] || ""}
                      onChange={(e) => setPendingIdType((current) => ({ ...current, [doc.docKey]: e.target.value }))}
                      className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                    >
                      <option value="">ID type…</option>
                      {ID_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="file"
                    accept={doc.docKey === "resume" ? "image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "image/jpeg,image/png,application/pdf"}
                    onChange={(e) => pickFile(doc.docKey, e.target.files?.[0] || null)}
                    className="text-xs text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-900"
                  />
                  <button
                    type="button"
                    disabled={!pendingFile[doc.docKey] || uploading === doc.docKey || (doc.docKey.startsWith("validId") && !pendingIdType[doc.docKey])}
                    onClick={() => replaceDoc(doc.docKey)}
                    className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploading === doc.docKey ? "Uploading…" : doc.latest ? "Replace" : "Upload"}
                  </button>
                  <span className="text-xs text-slate-500">{doc.uploadsRemaining} of 5 uploads left</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {info.documentsPurgedAt && (
        <p className="mt-4 text-xs text-slate-500">Older document versions were deleted after verification, in line with our retention policy.</p>
      )}
    </Modal>
  )
}
