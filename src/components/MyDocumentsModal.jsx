import { useState } from "react"
import { API_URL } from "../config"
import { showNotice } from '../utils/portalNotice'
import Modal from "./Modal"
import { ID_TYPE_OPTIONS } from "./VerificationDocumentsForm"
import ApplicantSignupWizard from "./ApplicantSignupWizard"
import { NSRP_SOURCE_LABELS } from "../../shared/verificationDocs.js"
import DeclaredDocumentFields from './DeclaredDocumentFields'
import DocumentExplanationForm from './DocumentExplanationForm'
import ConsistencyWaitlistCard from './ConsistencyWaitlistCard'
import PageGuide from './PageGuide'

function DocumentFilePicker({ label, file, accept, disabled, onChange }) {
  return <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
    <input type="file" aria-label={label} accept={accept} disabled={disabled} onChange={event => onChange(event.target.files?.[0] || null)} className="sr-only" />
    <span className="shrink-0 text-sm font-semibold text-blue-700">Choose file</span>
    <span title={file?.name} className="min-w-0 truncate text-sm text-slate-500">{file?.name || 'No file selected'}</span>
  </label>
}

// Applicant-facing documents modal: one card per requirement with a status
// badge, file details, View (signed expiring URL), and Replace/Upload for
// documents that still need attention. Approved documents are locked.
export default function MyDocumentsModal({ info, token, onClose, onUpdated, guideState, onGuidesSaved }) {
  const [pendingFile, setPendingFile] = useState({})
  const [pendingBackFile, setPendingBackFile] = useState({})
  const [pendingIdType, setPendingIdType] = useState({})
  const [declared, setDeclared] = useState({})
  const [uploading, setUploading] = useState(null)
  const [error, setError] = useState("")
  const [correctionDoc, setCorrectionDoc] = useState(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [success, setSuccess] = useState('')
  const [explanationDoc, setExplanationDoc] = useState(null)
  const nsrpDocument = info.documents?.find((doc) => doc.docKey === 'nsrpForm')
  const [editingNsrp, setEditingNsrp] = useState(() => new URLSearchParams(window.location.search).get("editNsrp") === "1" && ['missing', 'rejected', 'needs_resubmission'].includes(nsrpDocument?.status) && nsrpDocument.uploadsRemaining !== 0)
  const documents = [...(info.documents || [])]
  if (!documents.some((doc) => doc.docKey === 'validId2')) documents.push({ docKey: 'validId2', label: 'Valid ID #2', required: false, status: 'missing', uploadsRemaining: 5 })
  const closeEditor = () => {
    setEditingNsrp(false)
    const url = new URL(window.location.href)
    url.searchParams.delete("editNsrp")
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
  }

  const viewVersion = (url) => {
    if (!url) return showNotice("Document link unavailable")
    window.open(`${API_URL}${url}`, "_blank")
  }

  const pickFile = (docKey, file, side = 'front') => {
    setError("")
    const setFile = side === 'back' ? setPendingBackFile : setPendingFile
    setFile(current => ({ ...current, [docKey]: null }))
    if (!file) return
    if (docKey === 'nsrpForm' && (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name))) return setError('The NSRP form must be a PDF file.')
    const acceptedTypes = ["image/jpeg", "image/png", "application/pdf"]
    if (!acceptedTypes.includes(file.type)) return setError("Only JPG, PNG, or PDF files are accepted.")
    if (file.size > 5 * 1024 * 1024) return setError(`"${file.name}" is too large. Maximum is 5 MB.`)
    setFile((current) => ({ ...current, [docKey]: file }))
  }

  const replaceDoc = async (docKey) => {
    const file = pendingFile[docKey]
    if (!file) return
    if (docKey.startsWith('validId') && !pendingBackFile[docKey]) return setError('Choose both the front and back of your ID.')
    setUploading(docKey)
    setError("")
    try {
      const payload = new FormData()
      payload.append("document", file)
      if (docKey.startsWith('validId')) payload.append('documentBack', pendingBackFile[docKey])
      payload.append('verificationDetails', JSON.stringify(declared[docKey] || {}))
      const idType = pendingIdType[docKey] || documents.find(doc => doc.docKey === docKey)?.idType
      if (docKey.startsWith("validId") && idType) payload.append("idType", idType)
      const response = await fetch(`${API_URL}/api/profile/verification-documents/${docKey}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error || "Upload failed")
      setPendingFile((current) => ({ ...current, [docKey]: null }))
      setPendingBackFile((current) => ({ ...current, [docKey]: null }))
      await onUpdated?.()
    } catch (err) {
      setError(err?.message || "Upload failed")
    } finally {
      setUploading(null)
    }
  }

  const requestCorrection = async (event) => {
    event.preventDefault()
    if (!correctionDoc || uploading) return
    setUploading(correctionDoc)
    setError('')
    setSuccess('')
    try {
      const response = await fetch(`${API_URL}/api/profile/verification-documents/${correctionDoc}/correction-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: correctionReason.trim() }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Unable to send correction request.')
      setSuccess('Your correction request was sent to PESO. Your approved document remains on file while PESO reviews it.')
      setCorrectionDoc(null)
      setCorrectionReason('')
      await onUpdated?.()
    } catch (requestError) {
      setError(requestError.message)
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
    const label = { approved: 'Verified', rejected: 'Needs correction', needs_resubmission: 'Please resubmit', pending: 'Flagged for review', checking: 'Checking', missing: 'Missing' }[status] || status || 'Missing'
    return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status] || styles.missing}`}>{label}</span>
  }

  return (
    <Modal onClose={() => { closeEditor(); onClose() }} labelledBy="my-documents-title" describedBy="my-documents-description">
      {editingNsrp ? (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="my-documents-title" className="text-xl font-bold">{info.nsrpData ? "Update NSRP" : "Fill out your NSRP online"}</h2>
            <button type="button" onClick={closeEditor} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Close</button>
          </div>
          <ApplicantSignupWizard
            mode="update"
            initialAnswers={info.nsrpData || { email: "", firstName: info.basic?.firstName || "", middleName: info.basic?.middleName || "", surname: info.basic?.lastName || "", suffix: info.basic?.suffix || "", cellphone: info.basic?.cellphone || "", addressCity: info.basic?.addressCity || "", addressProvince: info.basic?.addressProvince || "" }}
            token={token}
            onCancel={() => {
              closeEditor()
            }}
            onSaved={async () => {
              await onUpdated?.()
              closeEditor()
            }}
          />
        </div>
      ) : (
      <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="my-documents-title" className="text-xl font-bold">Verification documents</h2>
          <p id="my-documents-description" className="mt-2 text-sm text-slate-600">
            Uploaded files are scanned and compared with your NSRP automatically. Matching documents can be verified without PESO review; unresolved flags still need staff review.
          </p>
          {info.verificationStatus && (
            <p className="mt-1 text-sm text-slate-600">
              Account: <span className="font-semibold capitalize">{String(info.verificationStatus).replaceAll("_", " ")}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close verification documents" className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">
          Close
        </button>
      </div>

      {info.verificationReason && (
        <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{info.verificationReason}</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm text-green-700">{success}</p>}
      {info.consistency?.checking && <p role="status" className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">Scanning your documents. Keep this window open to see the results update automatically.</p>}

      <ConsistencyWaitlistCard state={info.consistency} />
      {guideState && <div className="mt-4"><PageGuide role="Applicant" view="documents" state={guideState} token={token} onSaved={onGuidesSaved} /></div>}
      <ul className="mt-5 space-y-3">
        {documents.map((doc) => {
          const relevant = (info.consistency?.issues || []).filter(issue => issue.chancesLeft !== null && (issue.document === doc.docKey || doc.docKey === 'nsrpForm'))
          const flagged = info.consistency?.waitlisted && relevant.length > 0
          const review = info.review?.documents?.find(item => item.docKey === doc.docKey)
          const scanning = info.consistency?.checking && doc.status === 'pending'
          const needsReview = !scanning && (flagged || review?.needsReview === true || ['rejected', 'needs_resubmission'].includes(doc.status))
          const hasChances = !flagged || relevant.every(issue => issue.chancesLeft > 0)
          const staffReviewOnly = (info.consistency?.issues || []).some(issue => issue.document === doc.docKey && issue.chancesLeft === null)
          const pendingEditable = ['under_review', 'waitlisted'].includes(info.verificationStatus) && !staffReviewOnly && (doc.status === 'pending' || doc.referenceOnly)
          const locked = (doc.referenceOnly ? doc.locked : doc.status === "approved") && !flagged
          const canReplace = !locked && (["rejected", "needs_resubmission", "missing"].includes(doc.status) || flagged || pendingEditable) && doc.uploadsRemaining !== 0 && hasChances
          const idType = pendingIdType[doc.docKey] ?? doc.idType ?? ''
          return (
            <li key={doc.docKey} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {doc.label}{doc.idType ? ` — ${doc.idType}` : ""}
                </span>
                {chip(doc.referenceOnly && doc.latest ? 'Registration reference' : doc.status === 'pending' && !needsReview ? 'checking' : doc.status)}
                {doc.required && <span className="text-xs text-slate-500">required</span>}
                {!doc.required && <span className="text-xs text-slate-500">optional</span>}
                {doc.docKey === 'nsrpForm' && <p className="w-full text-xs text-slate-600">Registration reference for your birth certificate and ID checks.</p>}
                {doc.docKey === "nsrpForm" && doc.sourceType && <span className="text-xs text-slate-500">{NSRP_SOURCE_LABELS[doc.sourceType]}</span>}
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
              </div>

              {doc.latest ? (
                <p className="mt-2 break-words text-xs text-slate-500">
                  v{doc.latest.version} • {doc.latest.originalName} • {doc.latest.size ? `${Math.ceil(doc.latest.size / 1024)} KB` : ""}
                  {doc.latest.uploadedAt ? ` • uploaded ${new Date(doc.latest.uploadedAt).toLocaleDateString()}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Not uploaded yet.</p>
              )}

              {!doc.referenceOnly && ["rejected", "needs_resubmission"].includes(doc.status) && doc.latest?.reviewReason && (
                <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700">
                  PESO feedback: {doc.latest.reviewReason}
                </p>
              )}
              {!doc.referenceOnly && (needsReview || review?.reason || doc.status === 'pending') && <p className={`mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed ${needsReview ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600'}`}>{scanning ? 'Scanning your upload and comparing it with your NSRP. Results update automatically.' : review?.reason || (needsReview ? 'PESO will review this document. You can upload a clearer copy or explain a difference.' : 'Your document is being checked.')}</p>}
              {needsReview && ['nsrpForm', 'birthCertificate', 'validId1', 'validId2'].includes(doc.docKey) && doc.latest && <button type="button" onClick={() => setExplanationDoc(doc.docKey)} className="mt-2 rounded border border-slate-300 bg-white px-3 py-1 text-xs text-cyan-800">Explain a difference</button>}
              {locked && <p className="mt-2 text-xs text-green-700">{doc.referenceOnly ? 'Request a correction to update your NSRP. Your identity documents will be checked again.' : 'Request a correction if your information changes.'}</p>}
              {doc.correctionRequest && <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Correction requested: {doc.correctionRequest.reason}. Waiting for PESO review.</p>}
              {locked && !doc.correctionRequest && <button type="button" onClick={() => { setCorrectionDoc(doc.docKey); setCorrectionReason(''); setError(''); setSuccess('') }} className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold">Request correction</button>}
              {correctionDoc === doc.docKey && <form onSubmit={requestCorrection} className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <label className="block text-sm font-medium text-slate-800">What needs to be corrected?
                  <textarea required minLength={5} maxLength={1000} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} disabled={Boolean(uploading)} className="shared-form-control mt-2 w-full rounded-xl px-3 py-2" />
                </label>
                <div className="mt-2 flex gap-2">
                  <button type="submit" disabled={Boolean(uploading) || correctionReason.trim().length < 5} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{uploading ? 'Sending...' : 'Send request to PESO'}</button>
                  <button type="button" disabled={Boolean(uploading)} onClick={() => setCorrectionDoc(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Cancel</button>
                </div>
              </form>}
              {['missing', 'rejected'].includes(doc.status) && doc.uploadsRemaining === 0 && <p className="mt-2 text-xs text-rose-700">Upload limit reached. Contact PESO for help.</p>}

              {canReplace && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  {doc.docKey === "nsrpForm" ? (
                    <div className="space-y-3">
                      <button type="button" onClick={() => setEditingNsrp(true)} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white">
                        {info.nsrpData ? "Update NSRP" : "Fill out online instead"}
                      </button>
                      {doc.sourceType !== "generated" && (
                        <div className="space-y-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <DocumentFilePicker label="Replace NSRP file" file={pendingFile[doc.docKey]} accept="application/pdf,.pdf" disabled={uploading === doc.docKey} onChange={file => pickFile(doc.docKey, file)} />
                          <button
                            type="button"
                            disabled={!pendingFile[doc.docKey] || uploading === doc.docKey}
                            onClick={() => replaceDoc(doc.docKey)}
                            className="h-11 shrink-0 rounded-lg border border-cyan-700 px-4 text-sm font-semibold text-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {uploading === doc.docKey ? "Uploading…" : doc.status === 'rejected' ? 'Resubmit file' : 'Upload file'}
                          </button>
                          </div>
                          <p className="text-xs text-slate-500">PDF up to 5 MB · {doc.uploadsRemaining} of 5 uploads left</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                  <div className="grid gap-3 sm:grid-cols-2">
                  {doc.docKey.startsWith("validId") && (
                    <label className="block min-w-0 text-sm font-medium text-slate-700 sm:col-span-2">ID type
                    <select
                      value={idType}
                      disabled={uploading === doc.docKey}
                      onChange={(e) => { setPendingIdType((current) => ({ ...current, [doc.docKey]: e.target.value })); setDeclared(current => ({ ...current, [doc.docKey]: {} })) }}
                      className="shared-form-control mt-1 block h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">ID type…</option>
                      {ID_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    </label>
                  )}
                  <DeclaredDocumentFields className="contents" docKey={doc.docKey} idType={idType} value={declared[doc.docKey]} disabled={uploading === doc.docKey} onChange={value => setDeclared(current => ({ ...current, [doc.docKey]: value }))} />
                  </div>
                  <div className="space-y-2">
                  {doc.docKey.startsWith('validId') ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-sm font-medium text-slate-700">Front of ID (required)</p>
                        <DocumentFilePicker label={`Choose ${doc.label} front file`} file={pendingFile[doc.docKey]} accept="image/jpeg,image/png,application/pdf" disabled={uploading === doc.docKey} onChange={file => pickFile(doc.docKey, file)} />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-sm font-medium text-slate-700">Back of ID (required)</p>
                        <DocumentFilePicker label={`Choose ${doc.label} back file`} file={pendingBackFile[doc.docKey]} accept="image/jpeg,image/png,application/pdf" disabled={uploading === doc.docKey} onChange={file => pickFile(doc.docKey, file, 'back')} />
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {!doc.docKey.startsWith('validId') && <DocumentFilePicker label={`Choose ${doc.label} file`} file={pendingFile[doc.docKey]} accept="image/jpeg,image/png,application/pdf" disabled={uploading === doc.docKey} onChange={file => pickFile(doc.docKey, file)} />}
                  <button
                    type="button"
                    disabled={!pendingFile[doc.docKey] || uploading === doc.docKey || (doc.docKey.startsWith("validId") && (!idType || !pendingBackFile[doc.docKey]))}
                    onClick={() => replaceDoc(doc.docKey)}
                    className="h-11 shrink-0 rounded-lg bg-cyan-500 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploading === doc.docKey ? "Uploading…" : doc.status === 'rejected' ? "Resubmit" : "Upload"}
                  </button>
                  </div>
                  <p className="text-xs text-slate-500">JPG, PNG or PDF up to 5 MB{doc.docKey.startsWith('validId') ? ' per side' : ''} · {doc.uploadsRemaining} of 5 uploads left</p>
                  </div>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {info.documentsPurgedAt && (
        <p className="mt-4 text-xs text-slate-500">Supporting document files may have expired under the retention policy. PESO retains NSRP forms; files deleted under an earlier policy cannot be restored here.</p>
      )}
      </>
      )}
      {explanationDoc && <DocumentExplanationForm token={token} docKey={explanationDoc} onClose={() => setExplanationDoc(null)} onSent={() => { setSuccess('Your explanation was sent to PESO.'); onUpdated?.() }} />}
    </Modal>
  )
}
