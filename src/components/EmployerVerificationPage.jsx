import { useCallback, useEffect, useMemo, useState } from "react"
import { API_URL } from "../config"
import { digits, mobileInput, validMobile, validLandline, MOBILE_ERROR, LANDLINE_ERROR } from '../../shared/employerNumbers.js'
import { EMPLOYER_VERIFICATION_STATUS as STATUS } from "../../shared/employerVerification.js"
import { NSRP_SOURCE_LABELS } from "../../shared/verificationDocs.js"
import NsrpSignatureInput from "./NsrpSignatureInput"
import OverlayModal from "./OverlayModal"

const TIN_ERROR = "Enter a TIN with 9 or 12 digits."
const VERIFICATION_FORM_ID = "employer-verification-form"

const EMPLOYER_TYPES = [
  "Government",
  "Private",
  "Recruitment & Placement Agency (Local)",
  "Licensed Recruitment Agency (Overseas)",
  "DO 174-17, Subcontractor",
]
const WORKFORCE_SIZES = ["Micro (1-9)", "Small (10-99)", "Medium (100-199)", "Large (200 and up)"]
const TITLES = ["Mr.", "Ms.", "Miss", "Others"]

const emptyForm = {
  companyName: "",
  acronym: "",
  taxIdentificationNumber: "",
  employerType: "",
  workforceSize: "",
  lineOfBusiness: "",
  address: "",
  barangay: "",
  cityMunicipality: "",
  contactTitle: "",
  otherContactTitle: "",
  contactName: "",
  contactPosition: "",
  telephone: "",
  phone: "",
  fax: "",
  representativeName: "",
}

function StatusBadge({ status }) {
  const styles = {
    [STATUS.UNDER_REVIEW]: "border-amber-300 bg-amber-100 text-amber-900",
    [STATUS.APPROVED]: "border-green-300 bg-green-100 text-green-900",
    [STATUS.DECLINED]: "border-rose-300 bg-rose-100 text-rose-800",
    [STATUS.NEEDS_RESUBMISSION]: "border-rose-300 bg-rose-100 text-rose-800",
  }
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status] || "border-slate-300 bg-slate-100 text-slate-700"}`}>
      {String(status || STATUS.UNDER_REVIEW).replaceAll("_", " ")}
    </span>
  )
}

function FormField({ label, children }) {
  return <label className="block text-sm font-medium text-slate-800">{label}{children}</label>
}

export default function EmployerVerificationPage({ token, onStatusChange }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState("")
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState("online")
  const [form, setForm] = useState(emptyForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const [certified, setCertified] = useState(false)
  const [signature, setSignature] = useState("")

  const load = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/employer/verification`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || "Could not load employer verification.")
    setInfo(data)
    onStatusChange?.(data)
  }, [token, onStatusChange])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        await load()
        if (active) setError("")
      } catch (loadError) {
        if (active) setError(loadError?.message || "Could not load employer verification.")
      }
    }
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [load])

  useEffect(() => {
    if (!info) return
    setForm({
      ...emptyForm,
      ...(info.registrationDetails || {}),
      taxIdentificationNumber: String(info.registrationDetails?.taxIdentificationNumber || "").replace(/\D/g, ""),
      companyName: info.companyName || "",
      contactName: info.contactName || "",
      phone: info.phone || "",
      address: info.registrationDetails?.address || info.location || "",
      representativeName: info.representativeName || info.contactName || "",
    })
  }, [info])

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const canReplace = info?.verificationStatus === STATUS.NEEDS_RESUBMISSION
  const declined = [STATUS.DECLINED, STATUS.NEEDS_RESUBMISSION].includes(info?.verificationStatus)
  const isResubmission = useMemo(() => (info?.versions || []).length > 1, [info?.versions])
  const openEditor = (mode) => {
    setEditorMode(mode)
    setSelectedFile(null)
    setFieldErrors({})
    setError("")
    setEditorOpen(true)
  }
  const closeEditor = useCallback(() => setEditorOpen(false), [])

  const openVersion = async (version) => {
    setError("")
    try {
      const url = version
        ? `/api/employer-requirements/current/versions/${version}/view`
        : "/api/employer-requirements/current/view"
      const response = await fetch(`${API_URL}${url}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || "The NSRP Form 2 could not be opened.")
      }
      const blobUrl = URL.createObjectURL(await response.blob())
      window.open(blobUrl, "_blank", "noopener")
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch (viewError) {
      setError(viewError?.message || "The NSRP Form 2 could not be opened.")
    }
  }

  const uploadFile = async (file, sourceType, registrationDetails) => {
    if (!file) throw new Error("Choose an NSRP Form 2 PDF first.")
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      throw new Error("Choose a PDF file no larger than 10 MB.")
    }
    const payload = new FormData()
    payload.append("requirements", file)
    payload.append("sourceType", sourceType)
    if (registrationDetails) payload.append("registrationDetails", JSON.stringify(registrationDetails))
    payload.append("companyName", form.companyName)
    payload.append("contactName", form.contactName)
    payload.append("phone", form.phone)
    payload.append("location", [form.address, form.barangay, form.cityMunicipality, "Albay"].filter(Boolean).join(", "))
    payload.append("representativeName", form.representativeName)
    const response = await fetch(`${API_URL}/api/employer-requirements`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 403 && data?.code === "EMPLOYER_NOT_VERIFIED") onStatusChange?.(data)
      setFieldErrors(data?.fieldErrors || {})
      throw new Error(data?.error || "The NSRP Form 2 could not be submitted.")
    }
    setSelectedFile(null)
    setEditorOpen(false)
    setFieldErrors({})
    setSignature("")
    setCertified(false)
    await load()
  }

  const submitUpload = async () => {
    setUploading(true)
    setError("")
    setFieldErrors({})
    try {
      await uploadFile(selectedFile, "uploaded")
    } catch (uploadError) {
      setError(uploadError?.message || "The NSRP Form 2 could not be submitted.")
    } finally {
      setUploading(false)
    }
  }

  const submitOnline = async (event) => {
    event.preventDefault()
    const tin = form.taxIdentificationNumber.trim()
    if (!validMobile(form.phone)) { setError(MOBILE_ERROR); return }
    if (!validLandline(form.telephone) || !validLandline(form.fax)) { setError(LANDLINE_ERROR); return }
    if (tin && !/^(?:\d{9}|\d{12})$/.test(tin)) {
      setFieldErrors({ taxIdentificationNumber: TIN_ERROR })
      return
    }
    setUploading(true)
    setError("")
    setFieldErrors({})
    try {
      if (!certified || !signature) throw new Error("Certification and signature are required.")
      const details = {
        acronym: form.acronym,
        taxIdentificationNumber: form.taxIdentificationNumber,
        employerType: form.employerType,
        workforceSize: form.workforceSize,
        lineOfBusiness: form.lineOfBusiness,
        address: form.address,
        barangay: form.barangay,
        cityMunicipality: form.cityMunicipality,
        province: "Albay",
        contactTitle: form.contactTitle,
        otherContactTitle: form.otherContactTitle,
        contactPosition: form.contactPosition,
        telephone: form.telephone,
        fax: form.fax,
      }
      const preview = await fetch(`${API_URL}/api/employer-registration/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          email: info.email,
          phone: form.phone,
          location: [form.address, form.barangay, form.cityMunicipality, "Albay"].filter(Boolean).join(", "),
          representativeName: form.representativeName,
          certified,
          signatureDataUrl: signature,
          registrationDetails: details,
        }),
      })
      if (!preview.ok) {
        const data = await preview.json().catch(() => null)
        setFieldErrors(data?.fieldErrors || {})
        throw new Error(data?.error || "Could not generate the NSRP Form 2.")
      }
      const pdf = await preview.blob()
      if (pdf.type !== "application/pdf") throw new Error("The generated Form 2 is not a PDF.")
      const file = new File([pdf], "NSRP-Form-2-Employer-Reg-Form.pdf", { type: "application/pdf" })
      await uploadFile(file, "generated", details)
    } catch (submitError) {
      setError(submitError?.message || "The NSRP Form 2 could not be submitted.")
    } finally {
      setUploading(false)
    }
  }

  if (!info) {
    return (
      <section className="rounded-2xl border border-slate-300 bg-white p-6 text-slate-700">
        <h2 className="text-xl font-semibold text-slate-900">Account verification</h2>
        <p className="mt-2">{error || "Loading your verification status…"}</p>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      {info.verificationStatus === STATUS.UNDER_REVIEW ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">You&apos;re on the waitlist</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-700">Your account is waiting for admin verification. You can post jobs once it&apos;s approved.</p>
            </div>
            <StatusBadge status={info.verificationStatus} />
          </div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-600">Establishment</dt><dd className="font-semibold text-slate-900">{info.companyName || "Not provided"}</dd></div>
            <div><dt className="text-slate-600">Submitted</dt><dd className="font-semibold text-slate-900">{info.submittedAt ? new Date(info.submittedAt).toLocaleDateString() : "Date unavailable"}</dd></div>
          </dl>
          <ol className="mt-5 space-y-2 text-sm text-slate-800">
            <li>✓ Email verified</li>
            <li>✓ NSRP Form 2 submitted</li>
            <li>◷ Admin review — waiting</li>
          </ol>
        </section>
      ) : declined ? (
        <section className="rounded-2xl border border-rose-300 bg-rose-50 p-6" role="alert">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-rose-900">{info.verificationStatus === STATUS.NEEDS_RESUBMISSION ? "NSRP Form 2 needs resubmission" : "Account declined"}</h2>
            <StatusBadge status={info.verificationStatus} />
          </div>
          <p className="mt-3 text-sm text-rose-800">Admin reason: {info.verificationReason || "Please update your NSRP Form 2 and resubmit it for review."}</p>
          {canReplace && (
            <button type="button" onClick={() => openEditor("online")} className="mt-4 rounded-lg border border-rose-400 bg-white px-4 py-2 text-sm font-semibold text-rose-900">
              Update NSRP Form 2
            </button>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-green-300 bg-green-50 p-6">
          <h2 className="text-xl font-bold text-green-900">Account approved</h2>
          <p className="mt-2 text-sm text-green-800">Your employer account is approved.</p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-300 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">NSRP Form 2</h2>
            <p className="mt-1 text-sm text-slate-600">
              {info.document ? (NSRP_SOURCE_LABELS[info.document.sourceType] || "Submitted document") : "No document submitted"}
            </p>
          </div>
          <StatusBadge status={info.document?.status || "missing"} />
        </div>

        {info.document && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">v{info.document.version} · {info.document.originalName || "NSRP Form 2"}</span>
            <button type="button" onClick={() => openVersion()} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-semibold text-blue-800">View</button>
            {canReplace && (
              <>
                <button type="button" onClick={() => openEditor("online")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800">Fill out online instead</button>
                <button type="button" onClick={() => openEditor("upload")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800">Replace file</button>
              </>
            )}
          </div>
        )}

        {(info.versions || []).length > 1 && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Document history</h3>
            <ul className="mt-2 space-y-2">
              {info.versions.map((version) => (
                <li key={version.version} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span>v{version.version} · {version.originalName} · {String(version.status).replaceAll("_", " ")}</span>
                  <button type="button" onClick={() => openVersion(version.version)} className="text-blue-700 underline">View</button>
                  {version.reviewReason && <span className="text-rose-700">Reason: {version.reviewReason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {editorOpen && canReplace && (
        <OverlayModal
          onClose={closeEditor}
          labelledBy="employer-verification-modal-title"
          closeDisabled={uploading}
          header={
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="employer-verification-modal-title" className="text-lg font-semibold text-slate-900">
                  {editorMode === "online" ? "Update NSRP Form 2 online" : "Replace NSRP Form 2 file"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {editorMode === "online"
                    ? "Update the establishment information, certify it, and sign before resubmitting."
                    : "Choose the updated NSRP Form 2 PDF to resubmit for admin review."}
                </p>
              </div>
              <button type="button" disabled={uploading} onClick={() => setEditorOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Close</button>
            </div>
          }
          footer={
            <div className="flex justify-end">
              <button
                type="submit"
                form={VERIFICATION_FORM_ID}
                disabled={uploading || (editorMode === "online" ? !certified || !signature : !selectedFile)}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {uploading
                  ? editorMode === "online" ? "Generating and submitting…" : "Submitting…"
                  : editorMode === "online" ? "Resubmit for review" : "Replace file"}
              </button>
            </div>
          }
        >
          <form
            id={VERIFICATION_FORM_ID}
            onSubmit={editorMode === "online" ? submitOnline : (event) => { event.preventDefault(); submitUpload() }}
            className={editorMode === "online" ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}
          >
            {editorMode === "online" ? (
              <>
                <FormField label="Establishment name *"><input required value={form.companyName} onChange={(event) => updateForm("companyName", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="Acronym/abbreviation"><input value={form.acronym} onChange={(event) => updateForm("acronym", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="Tax identification number (TIN)">
                  <input
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="4500"
                    value={form.taxIdentificationNumber}
                    aria-invalid={Boolean(fieldErrors.taxIdentificationNumber)}
                    aria-describedby={fieldErrors.taxIdentificationNumber ? "employer-tin-error" : undefined}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, "").slice(0, 12)
                      updateForm("taxIdentificationNumber", value)
                      setFieldErrors((current) => ({
                        ...current,
                        taxIdentificationNumber: value && !/^(?:\d{9}|\d{12})$/.test(value) ? TIN_ERROR : "",
                      }))
                    }}
                    className="shared-form-control"
                  />
                  {fieldErrors.taxIdentificationNumber && <span id="employer-tin-error" role="alert" className="mt-1 block text-sm text-rose-700">{fieldErrors.taxIdentificationNumber}</span>}
                </FormField>
                <FormField label="Employer type *"><select required value={form.employerType} onChange={(event) => updateForm("employerType", event.target.value)} className="shared-form-control"><option value="">Select employer type</option>{EMPLOYER_TYPES.map((value) => <option key={value}>{value}</option>)}</select></FormField>
                <FormField label="Total work force *"><select required value={form.workforceSize} onChange={(event) => updateForm("workforceSize", event.target.value)} className="shared-form-control"><option value="">Select workforce size</option>{WORKFORCE_SIZES.map((value) => <option key={value}>{value}</option>)}</select></FormField>
                <FormField label="Line of business/industry *"><input required value={form.lineOfBusiness} onChange={(event) => updateForm("lineOfBusiness", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="House/unit no. & street *"><input required value={form.address} onChange={(event) => updateForm("address", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="Barangay *"><input required value={form.barangay} onChange={(event) => updateForm("barangay", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="City/municipality *"><input required value={form.cityMunicipality} onChange={(event) => updateForm("cityMunicipality", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="Contact title *"><select required value={form.contactTitle} onChange={(event) => updateForm("contactTitle", event.target.value)} className="shared-form-control"><option value="">Select title</option>{TITLES.map((value) => <option key={value}>{value}</option>)}</select></FormField>
                {form.contactTitle === "Others" && <FormField label="Specify title *"><input required value={form.otherContactTitle} onChange={(event) => updateForm("otherContactTitle", event.target.value)} className="shared-form-control" /></FormField>}
                <FormField label="Contact person full name *"><input required value={form.contactName} onChange={(event) => updateForm("contactName", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="Position *"><input required value={form.contactPosition} onChange={(event) => updateForm("contactPosition", event.target.value)} className="shared-form-control" /></FormField>
                <FormField label="Mobile number *"><input required type="tel" pattern="(09[0-9]{9}|\+639[0-9]{9})" maxLength={13} placeholder="09XXXXXXXXX or +639XXXXXXXXX" value={form.phone} onChange={(event) => updateForm("phone", mobileInput(event.target.value))} className="shared-form-control" /></FormField>
                <FormField label="Telephone number"><input inputMode="tel" maxLength={15} placeholder="7–15 digits including area code" value={form.telephone} onChange={(event) => updateForm("telephone", digits(event.target.value, 15))} className="shared-form-control" /></FormField>
                <FormField label="Fax number"><input inputMode="tel" maxLength={15} placeholder="7–15 digits including area code" value={form.fax} onChange={(event) => updateForm("fax", digits(event.target.value, 15))} className="shared-form-control" /></FormField>
                <FormField label="Authorized representative full name *"><input required value={form.representativeName} onChange={(event) => updateForm("representativeName", event.target.value)} className="shared-form-control" /></FormField>
                <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" checked={certified} onChange={(event) => setCertified(event.target.checked)} /><span>I certify that this information is true and correct. *</span></label>
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-slate-800">Signature *</p>
                  <NsrpSignatureInput value={signature || null} error="" onChange={(value) => setSignature(value || "")} />
                </div>
              </>
            ) : (
              <>
                <FormField label="NSRP Form 2 PDF">
                  <input required type="file" accept="application/pdf,.pdf" className="shared-form-control" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
                </FormField>
                {selectedFile && <p className="text-sm text-slate-600">Selected: {selectedFile.name}</p>}
              </>
            )}
            {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2">{error}</p>}
          </form>
        </OverlayModal>
      )}

      {!editorOpen && error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {isResubmission && info.verificationStatus === STATUS.UNDER_REVIEW && <p role="status" className="text-sm font-semibold text-blue-800">Resubmitted for admin review.</p>}
    </div>
  )
}
