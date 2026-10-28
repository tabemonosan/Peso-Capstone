import { useEffect, useMemo, useState } from "react"
import { API_URL } from "../config"
import { NSRP_SKILL_LABELS } from "../../shared/nsrpSkills.js"
import { NSRP_ROW_LIMITS } from "../../shared/nsrpTableLimits.js"
import NsrpPdfPreview from "./NsrpPdfPreview"
import NsrpWarningPanel from "./NsrpWarningPanel"
import NsrpSignatureInput from "./NsrpSignatureInput"
import VerificationDocumentsForm, { emptyVerificationDocs, validateVerificationDocs } from "./VerificationDocumentsForm"
import PasswordChecklist from "./PasswordChecklist"
import { getNsrpWarningSection, NSRP_SECTION_WIZARD_STEP } from "../../shared/nsrpFieldLabels.js"

const STORAGE_KEY = "peso-applicant-signup-draft"
const STEP_NAMES = [
  "Account", "Personal information", "Address & contact", "Education & training",
  "Work & skills", "Employment & preferences", "Certification", "Documents", "Preview & submit",
]
const NSRP_FIELDS = [
  [
    ["surname", "Surname"], ["firstName", "First name"], ["middleName", "Middle name"],
    ["suffix", "Suffix"], ["dob", "Date of birth", "date"], ["placeOfBirth", "Place of birth"],
    ["sex", "Sex", "select", ["Male", "Female"]], ["religion", "Religion"],
    ["civilStatus", "Civil status", "select", ["Single", "Married", "Widowed", "Separated", "Live-in"]],
    ["height", "Height"],
  ],
  [
    ["addressStreet", "House no. / street / village"], ["addressBarangay", "Barangay"],
    ["addressCity", "Municipality / city"], ["addressProvince", "Province"],
    ["tin", "TIN"], ["gsisSss", "GSIS / SSS ID no."], ["pagibig", "Pag-IBIG no."],
    ["philhealth", "PhilHealth no."], ["cellphone", "Cellphone number"],
    ["landline", "Landline number"], ["disability", "Disability (if any)", "select", ["Visual", "Hearing", "Speech", "Physical", "Others"]],
  ],
  [],
  [],
  [
    ["employmentStatus", "Employment status", "select", ["Employed", "Unemployed"]],
    ["activelyLooking", "Actively looking for work?", "select", ["Yes", "No"]],
    ["lookingDuration", "How long have you been looking?"],
    ["willingImmediately", "Willing to work immediately?", "select", ["Yes", "No"]],
    ["willingWhen", "If no, when?"], ["fourPs", "4Ps beneficiary?", "select", ["Yes", "No"]],
    ["fourPsId", "4Ps household ID no."], ["occupation1", "Preferred occupation 1"],
    ["occupation2", "Preferred occupation 2"], ["occupation3", "Preferred occupation 3"],
    ["occupation4", "Preferred occupation 4"], ["localPref1", "Local work location 1"],
    ["localPref2", "Local work location 2"], ["localPref3", "Local work location 3"],
    ["overseasPref1", "Overseas country 1"], ["overseasPref2", "Overseas country 2"],
    ["overseasPref3", "Overseas country 3"], ["expectedSalary", "Expected salary range"],
    ["passportNo", "Passport no."], ["passportExpiry", "Passport expiry", "date"],
  ],
  [],
]
const ARRAY_SECTIONS = {
  education: { title: "Education", fields: [["level", "Level", "select", ["Elementary", "Secondary", "Tertiary", "Graduate Studies"]], ["school", "School"], ["course", "Course / degree"], ["year", "Year graduated"], ["undergradLevel", "If undergraduate, what level?"], ["yearLastAttended", "Year last attended"], ["awards", "Awards received"]] },
  technicalTraining: { title: "Technical training", fields: [["course", "Course"], ["institution", "Training institution"], ["certificate", "Certificate"], ["fromDate", "From", "date"], ["toDate", "To", "date"]] },
  eligibility: { title: "Eligibility", fields: [["eligibility", "Civil service eligibility"], ["rating", "Rating"], ["examDate", "Exam date", "date"], ["license", "PRC license"], ["validUntil", "Valid until", "date"]] },
  workExperience: { title: "Work experience", fields: [["company", "Company"], ["address", "Address"], ["position", "Position"], ["fromDate", "From", "date"], ["toDate", "To", "date"], ["status", "Status", "select", ["Permanent", "Contractual", "Part-time", "Probationary"]]] },
}
const EMPLOYED_TYPES = ["Wage Employed", "Self Employed"]
const UNEMPLOYED_TYPES = ["New Entrant/Fresh Graduate", "Finished Contract", "Resigned", "Retired", "Terminated/Laidoff (local)", "Terminated/Laidoff (abroad)", "Others"]
const stepErrors = [
  ["surname", "firstName", "middleName", "suffix", "dob", "placeOfBirth", "sex", "religion", "civilStatus", "height"],
  ["addressStreet", "addressBarangay", "addressCity", "addressProvince", "tin", "gsisSss", "pagibig", "philhealth", "email", "cellphone", "landline", "disability", "disabilityOthers"],
  ["education", "technicalTraining", "eligibility"],
  ["workExperience", "skills", "othersText", "languages"],
  ["employmentStatus", "employmentTypeDetail", "activelyLooking", "lookingDuration", "willingImmediately", "willingWhen", "fourPs", "fourPsId", "occupation1", "occupation2", "occupation3", "occupation4", "localPref1", "localPref2", "localPref3", "overseasPref1", "overseasPref2", "overseasPref3", "expectedSalary", "passportNo", "passportExpiry"],
  ["certified"],
]
const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"

function safeDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    const answers = saved.answers && typeof saved.answers === "object" ? saved.answers : {}
    delete answers.signatureDataUrl
    return { email: saved.email || "", step: Math.min(Math.max(Number(saved.step) || 0, 0), 8), answers, consent: Boolean(saved.consent) }
  } catch (error) {
    console.error("Could not load applicant sign-up draft:", error)
    return { email: "", step: 0, answers: {}, consent: false }
  }
}

export default function ApplicantSignupWizard({ onCancel, mode = "signup", initialAnswers = {}, token, onSaved }) {
  const isUpdate = mode === "update"
  const saved = useMemo(safeDraft, [])
  const [email, setEmail] = useState(saved.email)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState(isUpdate ? 1 : saved.step)
  const [answers, setAnswers] = useState(() => isUpdate ? { ...initialAnswers, signatureDataUrl: "" } : saved.answers)
  const [consent, setConsent] = useState(saved.consent)
  const [docs, setDocs] = useState(emptyVerificationDocs)
  const [resume, setResume] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [previewBlob, setPreviewBlob] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    const safeAnswers = { ...answers }
    delete safeAnswers.signatureDataUrl
    if (!isUpdate) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, step, answers: safeAnswers, consent }))
      } catch (storageError) {
        console.error("Could not save applicant sign-up draft:", storageError)
      }
    }
  }, [email, step, answers, consent, isUpdate])
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const updateAnswer = (key, value) => {
    setAnswers((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl("")
    setPreviewBlob(null)
  }
  const updateRow = (section, index, field, value) => {
    setAnswers((current) => ({
      ...current,
      [section]: (current[section] || []).map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
    }))
    setFieldErrors((current) => ({ ...current, [`${section}[${index}].${field}`]: undefined }))
  }
  const validateCurrent = async () => {
    setError("")
    if (step === 0) {
      const localErrors = {}
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) localErrors.email = "Enter a valid email address."
      if (password.length < 8 || password.length > 64 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) localErrors.password = "Meet all password rules."
      if (password !== confirmPassword) localErrors.confirmPassword = "Passwords do not match."
      if (!consent) localErrors.consent = "Data privacy consent is required."
      setFieldErrors(localErrors)
      return Object.keys(localErrors).length === 0
    }
    if (step >= 1 && step <= 6) {
      const bodyAnswers = { ...answers, email }
      const response = await fetch(`${API_URL}/api/nsrp/validate-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: step - 1, answers: bodyAnswers }),
      })
      const data = await response.json().catch(() => null)
      setFieldErrors(data?.fieldErrors || {})
      if (!response.ok) setError(data?.error || "Check the highlighted fields.")
      return response.ok
    }
    if (step === 7) {
      const localErrors = {}
      if (!resume) localErrors.resume = "Resume is required."
      if (!validateVerificationDocs(docs)) localErrors.validId2 = "Add a birth certificate and complete Valid ID #1."
      if (docs.id1.type && docs.id2.type && docs.id1.type === docs.id2.type) localErrors.validId2 = "Choose a different type for Valid ID #2."
      setFieldErrors(localErrors)
      return Object.keys(localErrors).length === 0
    }
    return true
  }
  const next = async () => {
    if (!(await validateCurrent())) return
    if ((isUpdate && step === 6) || (!isUpdate && step === 7)) {
      await generatePreview()
      return
    }
    setStep((current) => Math.min(current + 1, 8))
  }
  const generatePreview = async () => {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`${API_URL}/api/nsrp/preview-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { ...answers, email } }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        if (response.status === 429) {
          setError(data?.error || "Too many previews. Please wait a few minutes.")
          return false
        }
        setFieldErrors(data?.fieldErrors || {})
        setError(data?.error || "Could not generate the NSRP PDF.")
        const firstStep = stepErrors.findIndex((fields) => Object.keys(data?.fieldErrors || {}).some((key) => fields.some((field) => key === field || key.startsWith(`${field}[`))))
        if (data?.fieldErrors?.accountEmail || data?.fieldErrors?.password || data?.fieldErrors?.consent) setStep(0)
        else if (firstStep >= 0) setStep(firstStep + 1)
        return false
      }
      const blob = await response.blob()
      if (blob.type !== "application/pdf") throw new Error("The preview service returned an invalid document.")
      const warningHeader = response.headers.get("X-NSRP-Layout-Warnings")
      setWarnings(warningHeader ? JSON.parse(warningHeader) : [])
      setPreviewBlob(blob)
      setPreviewUrl(URL.createObjectURL(blob))
      setStep(8)
      return true
    } catch (previewError) {
      console.error(previewError)
      setError(previewError?.message || "The NSRP PDF could not be generated.")
      return false
    } finally {
      setBusy(false)
    }
  }
  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      const payload = new FormData()
      const requestAnswers = { ...answers, email: isUpdate ? answers.email : email }
      let response
      if (isUpdate) {
        response = await fetch(`${API_URL}/api/profile/nsrp`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ answers: requestAnswers }),
        })
      } else {
        payload.append("email", email.trim())
        payload.append("password", password)
        payload.append("consent", "true")
        payload.append("nsrpAnswers", JSON.stringify(requestAnswers))
        payload.append("id1Type", docs.id1.type)
        payload.append("id2Type", docs.id2.type)
        payload.append("birthCertificate", docs.birthCertificate)
        payload.append("validId1Front", docs.id1.front)
        if (docs.id1.back) payload.append("validId1Back", docs.id1.back)
        if (docs.id2.front) payload.append("validId2Front", docs.id2.front)
        if (docs.id2.back) payload.append("validId2Back", docs.id2.back)
        payload.append("resume", resume)
        response = await fetch(`${API_URL}/api/signup`, { method: "POST", body: payload })
      }
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        setFieldErrors(data?.fieldErrors || {})
        const firstStep = stepErrors.findIndex((fields) => Object.keys(data?.fieldErrors || {}).some((key) => fields.some((field) => key === field || key.startsWith(`${field}[`))))
        if (data?.fieldErrors?.accountEmail || data?.fieldErrors?.password || data?.fieldErrors?.consent) setStep(0)
        else if (firstStep >= 0) setStep(firstStep + 1)
        else if (data?.fieldErrors?.birthCertificate || data?.fieldErrors?.resume || data?.fieldErrors?.validId1 || data?.fieldErrors?.validId2 || data?.fieldErrors?.verificationDocuments) setStep(7)
        setError(data?.error || "Account creation failed.")
        return
      }
      if (isUpdate) {
        onSaved?.(data)
      } else {
        localStorage.removeItem(STORAGE_KEY)
        setPassword("")
        setConfirmPassword("")
      }
      setComplete(true)
    } catch (submitError) {
      console.error(submitError)
      setError(submitError?.message || "Account creation failed.")
    } finally {
      setBusy(false)
    }
  }
  const discard = () => {
    if (!isUpdate) localStorage.removeItem(STORAGE_KEY)
    setEmail("")
    setPassword("")
    setConfirmPassword("")
    setAnswers({})
    setDocs(emptyVerificationDocs)
    setResume(null)
    setConsent(false)
    setStep(0)
    onCancel?.()
  }
  const renderTextField = ([key, label, type, options]) => (
    <label key={key} className="block text-sm font-medium text-slate-800">
      {label}{stepErrors.some((fields) => fields.includes(key)) && step !== 0 ? <span className="text-rose-600"> *</span> : null}
      {type === "select" ? (
        <select value={answers[key] || ""} onChange={(event) => updateAnswer(key, event.target.value)} className={inputClass}>
          <option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}
        </select>
      ) : (
        <input type={type || "text"} value={answers[key] || ""} onChange={(event) => updateAnswer(key, event.target.value)} className={inputClass} />
      )}
      {fieldErrors[key] && <span role="alert" className="mt-1 block text-xs text-rose-600">{fieldErrors[key]}</span>}
    </label>
  )
  const visibleStepNames = isUpdate ? [...STEP_NAMES.slice(1, 7), STEP_NAMES[8]] : STEP_NAMES
  const targetStep = (index) => isUpdate ? (index === visibleStepNames.length - 1 ? 8 : index + 1) : index
  const fixWarning = (field) => {
    const section = getNsrpWarningSection(field)
    setStep((NSRP_SECTION_WIZARD_STEP[section] ?? 0) + 1)
  }

  if (complete && isUpdate) return (
    <div className="space-y-3">
      <p className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">Your NSRP was updated and submitted for review.</p>
      <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Close</button>
    </div>
  )
  if (complete) return (
    <div className="auth-form">
      <h2 className="text-xl font-semibold text-slate-900">Check your email</h2>
      <p className="text-sm text-slate-700">We sent a verification link to <strong>{email}</strong>. Complete registration from that message, then sign in.</p>
      <button type="button" onClick={onCancel} className="auth-primary-button">Back to sign in</button>
    </div>
  )

  return (
    <form className="auth-form auth-detail-form" onSubmit={(event) => { event.preventDefault(); if (step === 8) submit(); else next() }}>
      <nav aria-label={isUpdate ? "NSRP progress" : "Sign-up progress"} className="grid grid-cols-3 gap-1 sm:grid-cols-5">
        {visibleStepNames.map((name, index) => {
          const target = targetStep(index)
          return <button key={name} type="button" onClick={() => target < step && setStep(target)} className={`rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold ${target === step ? "bg-cyan-500 text-slate-950" : target < step ? "bg-cyan-100 text-cyan-900" : "bg-slate-100 text-slate-500"}`}>
            {index + 1}. {name}
          </button>
        })}
      </nav>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-label={`Step ${isUpdate ? (step === 8 ? 7 : step) : step + 1} of ${visibleStepNames.length}`}>
        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${(isUpdate ? (step === 8 ? 7 : step) / 7 : (step + 1) / 9) * 100}%` }} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{STEP_NAMES[step]}</h2>
      {step === 0 && !isUpdate && (
        <>
          <label className="block text-sm font-medium text-slate-800">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
          {(fieldErrors.accountEmail || fieldErrors.email) && <p role="alert" className="text-xs text-rose-600">{fieldErrors.accountEmail || fieldErrors.email}</p>}
          <label className="block text-sm font-medium text-slate-800">Password<input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></label>
          <PasswordChecklist password={password} confirmPassword={confirmPassword} />
          <label className="block text-sm font-medium text-slate-800">Confirm password<input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} /></label>
          {fieldErrors.password && <p role="alert" className="text-xs text-rose-600">{fieldErrors.password}</p>}
          {fieldErrors.confirmPassword && <p role="alert" className="text-xs text-rose-600">{fieldErrors.confirmPassword}</p>}
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="self-start text-sm text-cyan-800">{showPassword ? "Hide password" : "Show password"}</button>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
            <span>I agree to the collection and processing of my personal information and documents for account verification, in accordance with the Data Privacy Act of 2012 (RA 10173).</span>
          </label>
          {fieldErrors.consent && <p role="alert" className="text-xs text-rose-600">{fieldErrors.consent}</p>}
        </>
      )}
      {step >= 1 && step <= 6 && (
        <section className="space-y-4">
          {NSRP_FIELDS[step - 1].length > 0 && <div className="grid gap-3 sm:grid-cols-2">{NSRP_FIELDS[step - 1].map(renderTextField)}</div>}
          {step === 2 && answers.disability === "Others" && <div className="grid gap-3 sm:grid-cols-2">{renderTextField(["disabilityOthers", "Specify disability"])}</div>}
          {step === 3 && (
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Work experience (optional)</h3>
              {(answers.workExperience || []).map((row, index) => (
                <div key={`work-${index}`} className="grid gap-2 sm:grid-cols-2">
                  {ARRAY_SECTIONS.workExperience.fields.map(([key, label, type, options]) => (
                    <label key={key} className="text-xs font-medium text-slate-700">{label}
                      {type === "select" ? (
                        <select value={row[key] || ""} onChange={(event) => updateRow("workExperience", index, key, event.target.value)} className={inputClass}>
                          <option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input type={type || "text"} maxLength={NSRP_ROW_LIMITS.workExperience[key]} value={row[key] || ""} onChange={(event) => updateRow("workExperience", index, key, event.target.value)} className={inputClass} />
                      )}
                    </label>
                  ))}
                  <button type="button" onClick={() => setAnswers((current) => ({ ...current, workExperience: current.workExperience.filter((_, rowIndex) => rowIndex !== index) }))} className="text-left text-xs text-rose-700">Remove row</button>
                </div>
              ))}
              <button type="button" disabled={(answers.workExperience || []).length >= 5} onClick={() => setAnswers((current) => ({ ...current, workExperience: [...(current.workExperience || []), Object.fromEntries(ARRAY_SECTIONS.workExperience.fields.map(([key]) => [key, ""]))] }))} className="text-xs font-semibold text-cyan-800">Add work experience</button>
            </section>
          )}
          {step === 2 && Object.entries(ARRAY_SECTIONS).filter(([section]) => section !== "workExperience").map(([section, config]) => (
            <fieldset key={section} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-800">{config.title}</legend>
              {(answers[section] || []).map((row, index) => (
                <div key={`${section}-${index}`} className="grid gap-2 sm:grid-cols-2">
                  {config.fields.map(([key, label, type, options]) => (
                    <label key={key} className="text-xs font-medium text-slate-700">{label}
                      {type === "select" ? (
                        <select value={row[key] || ""} onChange={(event) => updateRow(section, index, key, event.target.value)} className={inputClass}>
                          <option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input type={type || "text"} maxLength={NSRP_ROW_LIMITS[section]?.[key]} value={row[key] || ""} onChange={(event) => updateRow(section, index, key, event.target.value)} className={inputClass} />
                      )}
                      {fieldErrors[`${section}[${index}].${key}`] && <span role="alert" className="text-rose-600">{fieldErrors[`${section}[${index}].${key}`]}</span>}
                    </label>
                  ))}
                  <button type="button" onClick={() => setAnswers((current) => ({ ...current, [section]: current[section].filter((_, rowIndex) => rowIndex !== index) }))} className="text-left text-xs text-rose-700">Remove row</button>
                </div>
              ))}
              <button type="button" disabled={(answers[section] || []).length >= 5} onClick={() => setAnswers((current) => ({ ...current, [section]: [...(current[section] || []), Object.fromEntries(config.fields.map(([key]) => [key, ""]))] }))} className="text-xs font-semibold text-cyan-800">Add {config.title.toLowerCase()} row</button>
            </fieldset>
          ))}
          {step === 4 && (
            <>
            <section className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Language / dialect proficiency</h3>
              <div className="space-y-2">
                {["English", "Filipino", "Others"].map((name) => {
                  const row = (answers.languages || []).find((entry) => entry.name === name) || { name }
                  const setLanguage = (key, value) => {
                    const next = [...(answers.languages || [])]
                    const index = next.findIndex((entry) => entry.name === name)
                    const updated = { ...row, name, [key]: value }
                    if (index >= 0) next[index] = updated
                    else next.push(updated)
                    updateAnswer("languages", next)
                  }
                  return <div key={name} className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                    <span className="w-16 font-medium">{name}</span>
                    {name === "Others" && <input value={row.otherName || ""} maxLength={NSRP_ROW_LIMITS.languages.name} onChange={(event) => setLanguage("otherName", event.target.value)} placeholder="Other language" className="rounded border border-slate-300 px-2 py-1" />}
                    {["read", "write", "speak", "understand"].map((key) => <label key={key} className="flex items-center gap-1"><input type="checkbox" checked={Boolean(row[key])} onChange={(event) => setLanguage(key, event.target.checked)} />{key}</label>)}
                  </div>
                })}
              </div>
            </section>
            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-800">Skills (optional)</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {NSRP_SKILL_LABELS.map((skill) => <label key={skill} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={(answers.skills || []).includes(skill)} onChange={(event) => updateAnswer("skills", event.target.checked ? [...(answers.skills || []), skill] : (answers.skills || []).filter((item) => item !== skill))} />{skill}</label>)}
              </div>
              {(answers.skills || []).includes("Others") && <label className="mt-3 block text-xs font-medium text-slate-700">Other skills, specify<input maxLength={60} value={answers.othersText || ""} onChange={(event) => updateAnswer("othersText", event.target.value)} className={inputClass} /></label>}
            </fieldset>
            </>
          )}
          {step === 5 && answers.employmentStatus && (
            <div className="grid gap-3 sm:grid-cols-2">
              {renderTextField(["employmentTypeDetail", "Employment type", "select", answers.employmentStatus === "Employed" ? EMPLOYED_TYPES : UNEMPLOYED_TYPES])}
              {/abroad/i.test(answers.employmentTypeDetail || "") && renderTextField(["terminatedAbroadCountry", "Specify country"])}
              {/^Others/i.test(answers.employmentTypeDetail || "") && renderTextField(["employmentTypeOther", "Others, specify"])}
            </div>
          )}
          {step === 6 && (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">I certify that the information I provided is true and correct, and I authorize DOLE to include my profile in the PESO Employment Information System.</div>
              <label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" checked={Boolean(answers.certified)} onChange={(event) => updateAnswer("certified", event.target.checked)} />I certify that this information is true and correct.</label>
              {fieldErrors.certified && <p role="alert" className="text-xs text-rose-600">{fieldErrors.certified}</p>}
              <NsrpSignatureInput value={answers.signatureDataUrl || null} onChange={(value) => updateAnswer("signatureDataUrl", value || "")} error={fieldErrors.signatureDataUrl} />
            </>
          )}
          <p className="text-xs text-slate-500">The server validates each step before you continue.</p>
        </section>
      )}
      {step === 7 && !isUpdate && (
        <>
          <label className="block text-sm font-medium text-slate-800">Resume (PDF, DOCX, JPG, or PNG; max 5 MB)<input type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,.jpg,.jpeg,image/png,.png" onChange={(event) => setResume(event.target.files?.[0] || null)} className="mt-2 block w-full text-sm" /></label>
          {fieldErrors.resume && <p role="alert" className="text-xs text-rose-600">{fieldErrors.resume}</p>}
          <VerificationDocumentsForm docs={docs} setDocs={setDocs} disabled={busy} fieldErrors={fieldErrors} />
        </>
      )}
      {step === 8 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Review your generated NSRP PDF. Use Edit to return to a step. Print-fit warnings are informational and won't block submission.</p>
          {!answers.signatureDataUrl && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">No signature added; you can sign the printed copy by hand.</p>}
          <NsrpPdfPreview blob={previewBlob} blobUrl={previewUrl} loading={busy} error={!previewUrl ? error : ""} onRetry={generatePreview} viewerClassName="h-[55vh] min-h-[360px]" downloadName="NSRP-Registration-Form.pdf" />
          <NsrpWarningPanel warnings={warnings} onFix={fixWarning} onFixAllCutOff={() => fixWarning(warnings.find((warning) => warning.reason === "truncated")?.field || "")} />
          <div className="flex flex-wrap gap-2">{STEP_NAMES.slice(1, 7).map((name, index) => <button key={name} type="button" onClick={() => { setStep(index + 1); setPreviewUrl(""); setPreviewBlob(null) }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-cyan-800">Edit {name}</button>)}</div>
          <button type="button" onClick={generatePreview} disabled={busy} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm font-semibold text-cyan-800">Regenerate preview</button>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" disabled={busy} onClick={() => step === (isUpdate ? 1 : 0) ? (isUpdate ? onCancel?.() : discard()) : setStep((current) => current - 1)} className="auth-secondary-button">{step === (isUpdate ? 1 : 0) ? "Cancel" : "Back"}</button>
        {!isUpdate && <button type="button" onClick={discard} className="text-sm font-medium text-rose-700 underline">Discard and start over</button>}
        {step < 8 ? (
          <button type="button" disabled={busy} onClick={next} className="auth-primary-button">{busy ? "Validating…" : (isUpdate ? step === 6 : step === 7) ? "Generate preview" : "Next"}</button>
        ) : (
          <button type="submit" disabled={busy || !previewUrl} className="auth-primary-button">{busy ? (isUpdate ? "Saving…" : "Creating account…") : isUpdate ? "Save NSRP" : "Create account"}</button>
        )}
      </div>
    </form>
  )
}
