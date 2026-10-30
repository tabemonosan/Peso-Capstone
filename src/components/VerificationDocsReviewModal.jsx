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
export default function VerificationDocsReviewModal({ applicant, token, onClose, onReviewed, onRestrict, onUnrestrict, readOnly = false }) {
  const [documents, setDocuments] = useState(null)
  const [status, setStatus] = useState(null)
  const [details, setDetails] = useState(null)
  const [expanded, setExpanded] = useState({}) // docKey -> bool
  // confirmAction: { docKey, action: 'approved' | 'rejected' | 'revert' } | null
  const [confirmAction, setConfirmAction] = useState(null)
  const [accountAction, setAccountAction] = useState(null)
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
        setDetails({ basic: data.basic || {}, nsrpData: data.nsrpData || null })
      }
    } catch {
      setDocuments([])
    }
  }, [applicant.id, token])

  useEffect(() => {
    setDocuments(null)
    setDetails(null)
    setStatus(null)
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

  const applicantName = applicant.displayName || formatFullName(applicant.profile) || applicant.companyName || applicant.email
  const accountStatus = status?.verificationStatus || applicant.verificationStatus
  const changeRestriction = async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setActionBusy(true)
    setActionError('')
    try {
      const change = accountAction === 'unrestrict' ? onUnrestrict : onRestrict
      const result = await change(applicant.id || applicant._id)
      if (result?.error) { setActionError(result.error); return }
      setAccountAction(null)
      await load()
      onReviewed?.()
      showToast(accountAction === 'unrestrict' ? 'Applicant unrestricted' : 'Applicant restricted')
    } catch (err) {
      setActionError(err?.message || 'Failed to update applicant')
    } finally {
      inFlightRef.current = false
      setActionBusy(false)
    }
  }
  const profile = applicant.profile || {}
  const basic = details?.basic || {}
  const nsrp = details?.nsrpData || profile.nsrp || {}
  const fullName = formatFullName({
    firstName: basic.firstName || profile.firstName || nsrp.firstName,
    middleName: basic.middleName || profile.middleName || nsrp.middleName,
    lastName: basic.lastName || profile.lastName || nsrp.surname,
    suffix: basic.suffix || profile.suffix || nsrp.suffix,
  }) || profile.name || ""
  const phone = basic.phone || basic.cellphone || applicant.phone || profile.phone || nsrp.cellphone
  const city = basic.addressCity || profile.addressCity || nsrp.addressCity
  const province = basic.addressProvince || profile.addressProvince || nsrp.addressProvince
  const location = [city, province].filter(Boolean).join(", ") || basic.location || profile.location
  const dob = basic.dob || profile.dob || nsrp.dob
  const registrationDate = (() => {
    if (!applicant.createdAt) return ""
    const date = new Date(applicant.createdAt)
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString()
  })()
  const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : []
  const nsrpDocument = documents?.find((doc) => doc.docKey === "nsrpForm")
  const hasNsrpDocument = Boolean(nsrpDocument?.latest)
  const nsrpSource = nsrpDocument?.sourceType === "generated" || (!nsrpDocument?.sourceType && Object.keys(nsrp).length > 0)
    ? "Generated from online answers"
    : "Uploaded by applicant"
  const displayValue = (value) => value
    ? <span className="text-slate-900">{value}</span>
    : <span className="text-slate-400">Not provided</span>

  return (
    <Modal onClose={onClose} labelledBy="verification-docs-review-title" describedBy="verification-docs-review-description">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="verification-docs-review-title" className="text-xl font-bold">Verification documents</h2>
            <p id="verification-docs-review-description" className="mt-1 text-sm text-slate-600">
              {applicantName} · {applicant.email}
            </p>
            {status?.verificationStatus && (
              <p className="mt-1 text-sm text-slate-600">
                Account: <span className="font-semibold capitalize">{status.verificationStatus.replaceAll("_", " ")}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close verification documents" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
            Close
          </button>
        </div>

        <section aria-labelledby="applicant-details-heading" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 id="applicant-details-heading" className="font-semibold text-slate-900">Applicant details</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-slate-500">Full name</dt>
              <dd>{displayValue(fullName)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Email</dt>
              <dd className="break-all">
                {displayValue(applicant.email)}
                {" "}
                {applicant.emailVerified
                  ? <span className="text-xs font-semibold text-green-700">(verified)</span>
                  : <span className="text-xs font-semibold text-amber-700">(not verified)</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Phone</dt>
              <dd>{displayValue(phone)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Location (city/municipality, province)</dt>
              <dd>{displayValue(location)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Date of birth</dt>
              <dd>{displayValue(dob)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">Registration date</dt>
              <dd>{displayValue(registrationDate)}</dd>
            </div>
            {skills.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold text-slate-500">Skills</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <span key={skill} className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-800">{skill}</span>
                  ))}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold text-slate-500">NSRP</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                {documents === null ? (
                  <span className="text-xs text-slate-500">Loading…</span>
                ) : hasNsrpDocument ? (
                  <>
                    {badge(nsrpDocument.status)}
                    <span className="text-xs text-slate-600">{nsrpSource}</span>
                    {nsrpDocument.latest.url && (
                      <button type="button" onClick={() => viewVersion(nsrpDocument.latest.url)} className="rounded-lg bg-cyan-500 px-2 py-1 text-xs font-semibold text-white">View</button>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-slate-500">Not submitted</span>
                )}
              </dd>
            </div>
          </dl>
          {readOnly && <p className="mt-3 text-sm font-semibold text-slate-700">Account closed. This retained PESO record is read-only and separate from any new registration.</p>}
          {!readOnly && accountStatus === "approved" && onRestrict && (
            <button type="button" onClick={() => { setActionError(''); setAccountAction('restrict') }} className="mt-3 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white">
              Restrict applicant
            </button>
          )}
          {!readOnly && accountStatus === 'restricted' && onUnrestrict && (
            <button type="button" onClick={() => { setActionError(''); setAccountAction('unrestrict') }} className="mt-3 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white">Unrestrict applicant</button>
          )}
        </section>

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
                  {doc.docKey === "nsrpForm" && doc.sourceType && (
                    <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {doc.sourceType === "uploaded" ? "Uploaded file" : "Generated online"}
                    </span>
                  )}
                  {doc.resubmitted && (
                    <span className="rounded-full border border-cyan-300 bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-800">resubmitted</span>
                  )}
                  {doc.correctionRequest && <p className="w-full rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Applicant correction request: {doc.correctionRequest.reason}. Use Revert to pending to reopen this document for review.</p>}
                  {doc.docKey.startsWith("validId") ? (
                    (doc.latest?.url || doc.latest?.back?.url) && (
                      <div role="group" aria-label={`${doc.label} file views`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                        {doc.latest?.url && (
                          <button type="button" onClick={() => viewVersion(doc.latest.url)} className="rounded-md bg-cyan-500 px-2 py-1 text-xs font-semibold text-white">
                            View front
                          </button>
                        )}
                        {doc.latest?.back?.url && (
                          <button type="button" onClick={() => viewVersion(doc.latest.back.url)} className="rounded-md border border-cyan-700 px-2 py-1 text-xs font-semibold text-cyan-800">
                            View back
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    doc.latest?.url && (
                      <button type="button" onClick={() => viewVersion(doc.latest.url)} className="rounded-xl bg-cyan-500 px-2 py-1 text-xs font-semibold text-white">
                        View
                      </button>
                    )
                  )}
                  {!readOnly && doc.status === "pending" && (
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
                  {!readOnly && doc.status === "approved" && (
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
                        {doc.docKey.startsWith("validId") ? (
                          (version.url || version.back?.url) && (
                            <div role="group" aria-label={`${doc.label} version ${version.version} file views`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
                              {version.url && (
                                <button type="button" onClick={() => viewVersion(version.url)} className="rounded px-1.5 py-0.5 text-cyan-800">
                                  View front
                                </button>
                              )}
                              {version.back?.url && (
                                <button type="button" onClick={() => viewVersion(version.back.url)} className="rounded border-l border-slate-200 px-1.5 py-0.5 text-cyan-800">
                                  View back
                                </button>
                              )}
                            </div>
                          )
                        ) : (
                          version.url && (
                            <button type="button" onClick={() => viewVersion(version.url)} className="rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-slate-700">
                              View
                            </button>
                          )
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

        {accountAction && <ConfirmDialog
          title={`${accountAction === 'unrestrict' ? 'Unrestrict' : 'Restrict'} ${applicantName}?`}
          note={accountAction === 'unrestrict' ? 'The restriction will be removed. Access will follow the applicant’s document verification status.' : 'This applicant will be unable to sign in or use protected employment features until an admin removes the restriction.'}
          confirmLabel={accountAction === 'unrestrict' ? 'Yes, unrestrict' : 'Yes, restrict'}
          confirmTone={accountAction === 'unrestrict' ? 'primary' : 'danger'}
          busyLabel={accountAction === 'unrestrict' ? 'Unrestricting...' : 'Restricting...'}
          busy={actionBusy}
          error={actionError}
          onConfirm={changeRestriction}
          onCancel={() => { if (!actionBusy) setAccountAction(null) }}
        />}
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
