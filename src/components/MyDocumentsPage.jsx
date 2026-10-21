import { useCallback, useEffect, useState } from "react"
import { API_URL } from "../config"
import { ID_TYPE_OPTIONS } from "./VerificationDocumentsForm"

// "My Documents" — the only page unverified applicants can access.
// Each requirement shows a status badge (missing / pending / approved / rejected),
// the admin's rejection reason, and a Replace button (pending + rejected only;
// approved documents are locked). Uploads are capped at 5 per document server-side.
export default function MyDocumentsPage({ applicantId, token, onUpdated }) {
  const [info, setInfo] = useState(null)
  const [pendingFile, setPendingFile] = useState({})
  const [pendingIdType, setPendingIdType] = useState({})
  const [uploading, setUploading] = useState(null)
  const [error, setError] = useState("")

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
      await load()
      onUpdated?.()
    } catch (err) {
      setError(err?.message || "Upload failed")
    } finally {
      setUploading(null)
    }
  }

  if (!info) return <p className="text-sm text-slate-400">Loading your documents…</p>

  const chip = (status) => {
    const styles = {
      approved: "border-green-500 bg-green-950/50 text-green-300",
      rejected: "border-rose-500 bg-rose-950/50 text-rose-300",
      pending: "border-amber-500 bg-amber-950/50 text-amber-300",
      missing: "border-slate-500 text-slate-400",
    }
    return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status] || styles.missing}`}>{status || "missing"}</span>
  }

  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-6">
      <h2 className="text-xl font-semibold text-black">My Documents</h2>
      <p className="mt-1 text-sm text-slate-600">
        An admin reviews each document before you can browse jobs. Rejected or missing documents can be replaced below (up to 5 uploads each).
      </p>

      {info.attentionCount > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-800" role="alert">
          {info.attentionCount} document{info.attentionCount === 1 ? "" : "s"} need{info.attentionCount === 1 ? "s" : ""} your attention.
        </div>
      )}
      {info.verificationReason && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{info.verificationReason}</p>
      )}
      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

      <ul className="mt-5 space-y-4">
        {(info.documents || []).map((doc) => {
          const canReplace = ["pending", "rejected", "missing"].includes(doc.status)
          const locked = doc.status === "approved"
          return (
            <li key={doc.docKey} className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-black">
                  {doc.docKey === "resume" && <span className="mr-2" aria-hidden="true">📄</span>}
                  {doc.label}{doc.idType ? ` — ${doc.idType}` : ""}
                </span>
                {chip(doc.status)}
                {doc.required && <span className="text-xs text-slate-500">required</span>}
              </div>

              {doc.latest ? (
                <p className="mt-1 text-xs text-slate-600">
                  v{doc.latest.version} • {doc.latest.originalName} • {doc.latest.size ? `${Math.ceil(doc.latest.size / 1024)} KB` : ""}
                  {doc.latest.uploadedAt ? ` • uploaded ${new Date(doc.latest.uploadedAt).toLocaleDateString()}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Not uploaded yet.</p>
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
                      className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-black"
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
                    className="text-xs text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-black"
                  />
                  <button
                    type="button"
                    disabled={!pendingFile[doc.docKey] || uploading === doc.docKey || (doc.docKey.startsWith("validId") && !pendingIdType[doc.docKey])}
                    onClick={() => replaceDoc(doc.docKey)}
                    className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  )
}
