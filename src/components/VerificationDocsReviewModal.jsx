import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL } from "../config"
import Modal from "./Modal"
import ConfirmDialog from "./ConfirmDialog"
import { formatFullName } from "../../shared/nameFields.js"

const QUICK_REJECT_REASONS = ["Blurry or unreadable", "Wrong document type", "Name doesn't match", "Expired ID"]

// Admin modal for reviewing an applicant's verification documents.
// Uses the same shell and white palette as the admin job posting detail modal:
// focus trap, Esc to close, click-outside to close, Close button top right, scrollable body.
// - Each document slot shows its latest version with a status badge and ID type.
// - Resubmitted documents (new pending version after a rejection) are flagged.
// - Version history is expandable so admins can compare with previous versions.
// - Reject requires a reason; the applicant only has to re-upload that document.
export default function VerificationDocsReviewModal({ applicant, token, onClose, onReviewed }) {
  const [documents, setDocuments] = useState(null)
  const [status, setStatus] = useState(null)
  const [expanded, setExpanded] = useState({}) // docKey -> bool
  // confirmAction: { docKey, action: 'approved' | 'rejected' | 'revert' } | null
  const [confirmAction, setConfirmAction] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const [toast, setToast] = useState("")
  const inFlightRef = useRef(false)

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

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(""), 3000)
  }

  // Runs only after the confirm dialog's confirm button — never on a single click.
  // inFlightRef blocks double submits even if the button is double-clicked fast.
  const review = async (docKey, decision, reason = "") => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setActionBusy(true)
    setActionError("")
    try {
      const isRevert = decision === "revert"
      const response = await fetch(`${API_URL}/api/applicants/${applicant.id}/verification-documents/${docKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(isRevert ? { action: "revert", reason: reason.trim() } : { status: decision, reason: reason.trim() }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        if (response.status === 409) {
          // Stale modal: the document was already decided elsewhere — refresh the row
          setConfirmAction(null)
          await load()
          onReviewed?.()
          return
        }
        setActionError(data?.error || "Review failed")
        return
      }
      const docLabel = documents?.find((doc) => doc.docKey === docKey)?.label || docKey
      showToast(isRevert ? `${docLabel} reverted to pending` : decision === "approved" ? `${docLabel} approved` : `${docLabel} rejected`)
      setConfirmAction(null)
      await load()
      onReviewed?.(data)
    } catch (err) {
      setActionError(err?.message || "Review failed")
    } finally {
      inFlightRef.current = false
      setActionBusy(false)
    }
  }

  const badge = (docStatus) => {
    const colors = {
      approved: "bg-green-100 text-green-800 border border-green-300",
      rejected: "bg-rose-100 text-rose-800 border border-rose-300",
      pending: "bg-amber-100 text-amber-800 border border-amber-300",
      missing: "bg-slate-100 text-slate-600 border border-slate-300",
      superseded: "bg-slate-100 text-slate-500 border border-slate-300",
    }
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[docStatus] || colors.pending}`}>{docStatus || "missing"}</span>
  }

  const applicantName = formatFullName(applicant.profile) || applicant.companyName || applicant.email

  return (
    <Modal onClose={onClose} labelledBy="verification-docs-review-title" describedBy="verification-docs-review-description">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="verification-docs-review-title" className="text-xl font-bold">Verification documents</h2>
            <p id="verification-docs-review-description" className="mt-1 text-sm text-slate-600">
              {applicantName} · {applicant.email}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Email: {applicant.emailVerified ? <span className="font-semibold text-green-700">verified</span> : <span className="font-semibold text-amber-700">not verified</span>}
              {status?.verificationStatus && (
                <>
                  {" · "}Account: <span className="font-semibold capitalize">{status.verificationStatus.replaceAll("_", " ")}</span>
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close verification documents" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
            Close
          </button>
        </div>

        {documents === null ? (
          <p className="mt-5 text-sm text-slate-500">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500">No verification documents found.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {documents.map((doc) => (
              <li key={doc.docKey} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {doc.label}{doc.idType ? ` — ${doc.idType}` : ""}
                    {doc.latest ? ` (v${doc.latest.version})` : ""}
                  </span>
                  {badge(doc.status)}
                  {doc.resubmitted && (
                    <span className="rounded-full border border-cyan-300 bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-800">resubmitted</span>
                  )}
                  {doc.latest?.url && (
                    <button type="button" onClick={() => viewVersion(doc.latest.url)} className="rounded-xl bg-cyan-500 px-2 py-1 text-xs font-semibold text-white">
                      View
                    </button>
                  )}
                  {doc.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setActionError(""); setConfirmAction({ docKey: doc.docKey, action: "approved" }) }}
                        className="rounded-xl bg-green-600 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => { setActionError(""); setConfirmAction({ docKey: doc.docKey, action: "rejected" }) }}
                        className="rounded-xl bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {doc.status === "approved" && (
                    <button
                      type="button"
                      onClick={() => { setActionError(""); setConfirmAction({ docKey: doc.docKey, action: "revert" }) }}
                      className="rounded-xl border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                    >
                      Revert to pending
                    </button>
                  )}
                  {doc.history?.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setExpanded((current) => ({ ...current, [doc.docKey]: !current[doc.docKey] }))}
                      className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      {expanded[doc.docKey] ? "Hide history" : `History (${doc.history.length})`}
                    </button>
                  )}
                </div>

                {doc.latest ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {doc.latest.originalName} • {doc.latest.size ? `${Math.ceil(doc.latest.size / 1024)} KB` : ""}
                    {doc.latest.uploadedAt ? ` • ${new Date(doc.latest.uploadedAt).toLocaleString()}` : ""}
                    {" • "}{doc.uploadsUsed}/5 uploads used
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">Not uploaded yet.</p>
                )}

                {doc.status === "rejected" && doc.latest?.reviewReason && (
                  <p className="mt-1 rounded-lg border border-rose-300 bg-rose-50 p-1.5 text-xs text-rose-700">Reason: {doc.latest.reviewReason}</p>
                )}

                {doc.reviewLog?.length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    Last action: {doc.reviewLog[doc.reviewLog.length - 1].action} by {doc.reviewLog[doc.reviewLog.length - 1].by}
                    {doc.reviewLog[doc.reviewLog.length - 1].reason ? ` (${doc.reviewLog[doc.reviewLog.length - 1].reason})` : ""}
                  </p>
                )}

                {expanded[doc.docKey] && doc.history?.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                    {doc.history.map((version) => (
                      <li key={version.version} className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">v{version.version}</span>
                        {badge(version.status)}
                        <span className="truncate">{version.originalName}</span>
                        {version.uploadedAt && <span>{new Date(version.uploadedAt).toLocaleString()}</span>}
                        {version.url && (
                          <button type="button" onClick={() => viewVersion(version.url)} className="rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-slate-700">
                            View
                          </button>
                        )}
                        {version.reviewReason && <span className="text-rose-700">({version.reviewReason})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {toast && (
          <p role="status" className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
            {toast}
          </p>
        )}

        {confirmAction && (() => {
          const doc = documents?.find((item) => item.docKey === confirmAction.docKey)
          const docLabel = doc ? `${doc.label}${doc.idType ? ` (${doc.idType})` : ""}` : confirmAction.docKey
          if (confirmAction.action === "approved") {
            return (
              <ConfirmDialog
                title={`Approve ${docLabel} for ${applicantName}?`}
                note="The applicant will be notified."
                confirmLabel="Yes, approve"
                busyLabel="Approving..."
                busy={actionBusy}
                error={actionError}
                onConfirm={() => review(confirmAction.docKey, "approved")}
                onCancel={() => setConfirmAction(null)}
              />
            )
          }
          if (confirmAction.action === "rejected") {
            return (
              <ConfirmDialog
                title={`Reject ${docLabel} for ${applicantName}?`}
                note="The applicant will be notified and asked to re-upload this document."
                confirmLabel="Confirm reject"
                confirmTone="danger"
                busyLabel="Rejecting..."
                busy={actionBusy}
                requireReason
                quickReasons={QUICK_REJECT_REASONS}
                error={actionError}
                onConfirm={(reason) => review(confirmAction.docKey, "rejected", reason)}
                onCancel={() => setConfirmAction(null)}
              />
            )
          }
          return (
            <ConfirmDialog
              title={`Revert ${docLabel} to pending for ${applicantName}?`}
              note="The approval is undone, the applicant is notified, and the action is recorded in the document history."
              confirmLabel="Confirm revert"
              confirmTone="danger"
              busyLabel="Reverting..."
              busy={actionBusy}
              requireReason
              error={actionError}
              onConfirm={(reason) => review(confirmAction.docKey, "revert", reason)}
              onCancel={() => setConfirmAction(null)}
            />
          )
        })()}
    </Modal>
  )
}
