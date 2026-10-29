import CityProvinceFields from './CityProvinceFields'
import { PH_LOCATIONS, provinceForCity } from '../../shared/phLocations.js'
import { useEffect, useMemo, useRef, useState } from "react"
import { API_URL } from "../config"
import NsrpPdfPreview from "./NsrpPdfPreview"
import NsrpSignatureInput from "./NsrpSignatureInput"
import PasswordChecklist from "./PasswordChecklist"
import { isPasswordValid } from "../utils/passwordPolicy"

const STORAGE_KEY = "peso-employer-signup-draft"
const EMPLOYER_TYPES = [
  "Government",
  "Private",
  "Recruitment & Placement Agency (Local)",
  "Licensed Recruitment Agency (Overseas)",
  "DO 174-17, Subcontractor",
]
const WORKFORCE_SIZES = ["Micro (1-9)", "Small (10-99)", "Medium (100-199)", "Large (200 and up)"]
const TITLES = ["Mr.", "Ms.", "Miss", "Others"]
const CONSENT_TEXT = "I agree to the collection and processing of my information for employer registration and PESO verification, in accordance with the Data Privacy Act of 2012 (RA 10173)."
const controlClass = "shared-form-control"

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    return draft && typeof draft === "object" ? draft : {}
  } catch (error) {
    console.error("Could not read employer sign-up draft:", error)
    return {}
  }
}

function Field({ label, id, required = false, error, children }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-800">
      {label}{required && <span className="text-rose-600"> *</span>}
      {children(error)}
      {error && <span role="alert" className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  )
}

function EmployerPrintWarnings({ warnings, onFix }) {
  if (!warnings.length) return null
  return (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Print-fit warnings</p>
      <p className="mt-1 text-xs text-amber-800">Some entries may print small or be shortened. You can still submit.</p>
      <ul className="mt-2 space-y-1">
        {warnings.map((warning) => (
          <li key={warning.field} className="flex items-center justify-between gap-2">
            <span>{warning.label || warning.field}{warning.reason === "truncated" ? " may be shortened to fit." : " may print in smaller text."}</span>
            <button type="button" onClick={() => onFix(warning.step)} className="rounded-lg border border-amber-400 bg-white px-2 py-1 text-xs font-semibold text-amber-900">Fix</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function EmployerSignupWizard({ locations = PH_LOCATIONS, onCancel }) {
  const saved = useMemo(readDraft, [])
  const [email, setEmail] = useState(saved.email || "")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [consent, setConsent] = useState(Boolean(saved.consent))
  const [mode, setMode] = useState(saved.mode || "")
  const [establishment, setEstablishment] = useState(saved.establishment || {})
  const [address, setAddress] = useState(saved.address || {})
  const [contact, setContact] = useState(saved.contact || {})
  const [basic, setBasic] = useState(saved.basic || {})
  const [representative, setRepresentative] = useState(saved.representative || "")
  const [certified, setCertified] = useState(Boolean(saved.certified))
  const [signature, setSignature] = useState("")
  const [registrationFile, setRegistrationFile] = useState(null)
  const [step, setStep] = useState(saved.step || "account")
  const [maxPos, setMaxPos] = useState(0)
  const [stepValidity, setStepValidity] = useState({})
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailProof, setEmailProof] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""])
  const [codeInfo, setCodeInfo] = useState("")
  const [codeBusy, setCodeBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [previewBlob, setPreviewBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [warnings, setWarnings] = useState([])
  const [complete, setComplete] = useState(false)
  const codeRefs = useRef([])
  const flow = mode === "upload"
    ? ["account", "form", "basic", "review"]
    : ["account", "form", "establishment", "address", "contact", "certification", "review"]
  const stepNames = {
    account: "Account",
    form: "Your NSRP Form 2",
    establishment: "Establishment details",
    address: "Address",
    contact: "Contact details",
    certification: "Certification",
    basic: "Basic information",
    review: mode === "upload" ? "Review and submit" : "Preview and submit",
  }
  const flowPos = flow.indexOf(step)
  const barangays = locations?.[address.municipality] || []
  const hasPassword = isPasswordValid(password)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        email,
        consent,
        mode,
        establishment,
        address,
        contact,
        basic,
        representative,
        certified,
        step,
      }))
    } catch (storageError) {
      console.error("Could not save employer sign-up draft:", storageError)
    }
  }, [email, consent, mode, establishment, address, contact, basic, representative, certified, step])

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  useEffect(() => () => {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const setPreview = (blob) => {
    setPreviewUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current)
      return blob ? URL.createObjectURL(blob) : ""
    })
    setPreviewBlob(blob)
  }

  const updateValue = (setter, key, value, errorKey = key) => {
    setter((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [errorKey]: undefined }))
    setStepValidity((current) => ({ ...current, [step]: false }))
    setPreview(null)
  }

  const changeEmail = (value) => {
    setEmail(value)
    setErrors((current) => ({ ...current, email: undefined }))
    if (emailVerified || codeSent) {
      setEmailVerified(false)
      setEmailProof("")
      setCodeSent(false)
      setCodeDigits(["", "", "", "", "", ""])
      setCodeInfo("")
      setResendIn(0)
    }
  }

  const sendEmailCode = async () => {
    setError("")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrors((current) => ({ ...current, email: "Enter a valid email address." }))
      return
    }
    setCodeBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/signup/email-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 429 && data?.code === "EMAIL_CODE_COOLDOWN") {
        setCodeSent(true)
        setResendIn(Number(data.retryAfter) || 60)
        setCodeInfo(`If this email can be used, a 6-digit code was sent to ${email.trim()}. Check your spam folder.`)
        return
      }
      if (!response.ok) {
        setError(data?.error || "Could not send the code. Please try again.")
        return
      }
      setCodeSent(true)
      setCodeDigits(["", "", "", "", "", ""])
      setCodeInfo(`If this email can be used, a 6-digit code was sent to ${email.trim()}. Check your spam folder.`)
      setResendIn(60)
      setTimeout(() => codeRefs.current[0]?.focus(), 0)
    } catch (sendError) {
      console.error("Employer email-code request failed:", sendError)
      setError("Could not send the code. Check your connection and try again.")
    } finally {
      setCodeBusy(false)
    }
  }

  const verifyEmailCode = async () => {
    const code = codeDigits.join("")
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.")
      return
    }
    setCodeBusy(true)
    setError("")
    try {
      const response = await fetch(`${API_URL}/api/signup/email-code/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.code === "EMAIL_CODE_EXPIRED" || data?.code === "EMAIL_CODE_LOCKED") setCodeDigits(["", "", "", "", "", ""])
        setError(data?.error || "Could not verify the code.")
        return
      }
      setEmailProof(data.proofToken)
      setEmailVerified(true)
      setCodeSent(false)
      setCodeDigits(["", "", "", "", "", ""])
      setCodeInfo("")
      setResendIn(0)
      setErrors((current) => ({ ...current, email: undefined }))
    } catch (verifyError) {
      console.error("Employer email-code verification failed:", verifyError)
      setError("Could not verify the code. Check your connection and try again.")
    } finally {
      setCodeBusy(false)
    }
  }

  const handleCodeDigit = (index, raw) => {
    const digits = raw.replace(/\D/g, "")
    if (digits.length > 1) {
      const pasted = digits.slice(0, 6 - index).split("")
      setCodeDigits((current) => current.map((value, position) => pasted[position - index] ?? value))
      codeRefs.current[Math.min(index + pasted.length, 5)]?.focus()
      return
    }
    const digit = digits.slice(-1)
    setCodeDigits((current) => current.map((value, position) => position === index ? digit : value))
    if (digit && index < 5) codeRefs.current[index + 1]?.focus()
  }

  const validateStep = () => {
    const nextErrors = {}
    if (step === "account") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "Enter a valid email address."
      if (!emailVerified) nextErrors.email = "Verify your email with the 6-digit code."
      if (!hasPassword) nextErrors.password = "Meet all password rules."
      if (password !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match."
      if (!consent) nextErrors.consent = "Data privacy consent is required."
    } else if (step === "form") {
      if (!mode) nextErrors.mode = "Choose how to provide Form 2."
      if (mode === "upload" && !registrationFile) nextErrors.registrationFile = "Upload your completed NSRP Form 2 PDF."
      if (registrationFile && (registrationFile.type !== "application/pdf" || registrationFile.size > 10 * 1024 * 1024)) {
        nextErrors.registrationFile = "Choose a PDF file no larger than 10 MB."
      }
    } else if (step === "establishment") {
      for (const [key, label] of [["companyName", "Establishment name"], ["employerType", "Employer type"], ["workforceSize", "Total work force"], ["lineOfBusiness", "Line of business/industry"]]) {
        if (!establishment[key]?.trim()) nextErrors[key] = `${label} is required.`
      }
    } else if (step === "address") {
      if (!provinceForCity(address.municipality)) nextErrors.municipality = "Choose a city/municipality from the location list."
      if (!address.barangay) nextErrors.barangay = "Barangay is required."
    } else if (step === "contact") {
      if (!contact.title) nextErrors.title = "Contact title is required."
      if (contact.title === "Others" && !contact.otherTitle?.trim()) nextErrors.otherTitle = "Specify the contact title."
      if (!contact.name?.trim()) nextErrors.contactName = "Contact name is required."
      if (!contact.position?.trim()) nextErrors.position = "Position is required."
      if (!/^09\d{9}$/.test(contact.mobile || "")) nextErrors.mobile = "Enter an 11-digit mobile number starting with 09."
    } else if (step === "certification") {
      if (!representative.trim()) nextErrors.representative = "Authorized representative name is required."
      if (!certified) nextErrors.certified = "Certification is required."
      if (!signature) nextErrors.signature = "Add the authorized representative's signature."
    } else if (step === "basic") {
      if (!basic.companyName?.trim()) nextErrors.companyName = "Establishment name is required."
      if (!basic.contactName?.trim()) nextErrors.contactName = "Contact name is required."
      if (!/^09\d{9}$/.test(basic.phone || "")) nextErrors.phone = "Enter an 11-digit mobile number starting with 09."
      if (!provinceForCity(basic.municipality)) nextErrors.municipality = "Choose a city/municipality from the location list."
      if (!basic.barangay) nextErrors.barangay = "Barangay is required."
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      const firstInvalid = Object.keys(nextErrors)[0]
      setTimeout(() => document.getElementById(`employer-${firstInvalid}`)?.focus(), 0)
      return false
    }
    setError("")
    return true
  }

  const registrationDetails = mode === "upload" ? {} : {
    acronym: establishment.acronym || "",
    taxIdentificationNumber: establishment.tin || "",
    employerType: establishment.employerType || "",
    workforceSize: establishment.workforceSize || "",
    lineOfBusiness: establishment.lineOfBusiness || "",
    address: [address.street, address.subdivision].filter(Boolean).join(", "),
    barangay: address.barangay || "",
    cityMunicipality: address.municipality || "",
    province: "Albay",
    contactTitle: contact.title || "",
    otherContactTitle: contact.otherTitle || "",
    contactPosition: contact.position || "",
    telephone: contact.telephone || "",
    fax: contact.fax || "",
  }
  const companyName = mode === "upload" ? basic.companyName || "" : establishment.companyName || ""
  const contactName = mode === "upload" ? basic.contactName || "" : contact.name || ""
  const phone = mode === "upload" ? basic.phone || "" : contact.mobile || ""
  const location = mode === "upload"
    ? [basic.street, basic.subdivision, basic.barangay && `Brgy. ${basic.barangay}`, basic.municipality, "Albay", basic.landmark && `Landmark: ${basic.landmark}`].filter(Boolean).join(", ")
    : [address.street, address.subdivision, address.barangay && `Brgy. ${address.barangay}`, address.municipality, "Albay", address.landmark && `Landmark: ${address.landmark}`].filter(Boolean).join(", ")
  const previewPayload = () => ({
    companyName,
    contactName,
    email: email.trim(),
    phone,
    location,
    registrationDetails,
    representativeName: representative.trim(),
    certified,
    signatureDataUrl: signature,
  })

  const generatePreview = async () => {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`${API_URL}/api/employer-registration/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewPayload()),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error || "Could not generate the Form 2 preview.")
        if (data?.fieldErrors) setErrors((current) => ({ ...current, ...data.fieldErrors, ...(data.fieldErrors.city ? { municipality: data.fieldErrors.city } : {}) }))
        return false
      }
      const blob = await response.blob()
      if (blob.type !== "application/pdf") throw new Error("The preview service returned an invalid document.")
      const header = response.headers.get("X-NSRP-Layout-Warnings")
      setWarnings(header ? JSON.parse(header) : [])
      setPreview(blob)
      setStepValidity((current) => ({ ...current, certification: true }))
      setMaxPos(flow.length - 1)
      setStep("review")
      return true
    } catch (previewError) {
      console.error("Employer Form 2 preview failed:", previewError)
      setError(previewError?.message || "Could not generate the Form 2 preview.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const next = async () => {
    if (!validateStep()) return
    setStepValidity((current) => ({ ...current, [step]: true }))
    if (mode !== "upload" && step === "certification") {
      await generatePreview()
      return
    }
    const nextStep = flow[flowPos + 1]
    if (!nextStep) return
    setMaxPos((current) => Math.max(current, flowPos + 1))
    setStep(nextStep)
    if (mode === "upload" && nextStep === "review" && registrationFile) setPreview(registrationFile)
  }

  const firstInvalidBefore = (position) => flow.slice(0, position).findIndex((id, index) => (
    index > maxPos || stepValidity[id] === false || (id === "account" && !emailVerified)
  ))
  const goTo = (target) => {
    const targetPos = flow.indexOf(target)
    if (targetPos < 0 || targetPos === flowPos) return
    if (targetPos < flowPos) {
      setStep(target)
      return
    }
    if (targetPos >= flow.length - 2) {
      const invalid = firstInvalidBefore(flow.length - 2)
      if (invalid >= 0) {
        if (invalid <= maxPos) setStep(flow[invalid])
        return
      }
    }
    if (targetPos <= maxPos) {
      if (firstInvalidBefore(targetPos) < 0) setStep(target)
      return
    }
    if (targetPos > maxPos + 1 || !validateStep()) return
    setStepValidity((current) => ({ ...current, [step]: true }))
    setMaxPos(targetPos)
    setStep(target)
  }

  const submit = async () => {
    if (!validateStep()) return
    setBusy(true)
    setError("")
    try {
      const payload = new FormData()
      payload.append("email", email.trim())
      payload.append("emailProof", emailProof)
      payload.append("password", password)
      payload.append("consent", String(consent))
      payload.append("mode", mode)
      payload.append("companyName", companyName)
      payload.append("contactName", contactName)
      payload.append("location", location)
      payload.append("city", mode === "upload" ? basic.municipality || "" : address.municipality || "")
      payload.append("province", provinceForCity(mode === "upload" ? basic.municipality : address.municipality))
      payload.append("phone", phone)
      payload.append("registrationDetails", JSON.stringify(registrationDetails))
      payload.append("representativeName", mode === "upload" ? "" : representative.trim())
      payload.append("certified", String(mode !== "upload" && certified))
      payload.append("signatureDataUrl", mode === "upload" ? "" : signature)
      if (registrationFile) payload.append("requirements", registrationFile)
      const response = await fetch(`${API_URL}/api/employer-requests`, { method: "POST", body: payload })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.code === "EMAIL_NOT_VERIFIED") {
          setEmailVerified(false)
          setEmailProof("")
          setStep("account")
        }
        setError(data?.error || "Employer account creation failed.")
        if (data?.fieldErrors) setErrors((current) => ({ ...current, ...data.fieldErrors, ...(data.fieldErrors.city ? { municipality: data.fieldErrors.city } : {}) }))
        return
      }
      localStorage.removeItem(STORAGE_KEY)
      setPassword("")
      setConfirmPassword("")
      setSignature("")
      setRegistrationFile(null)
      setComplete(true)
    } catch (submitError) {
      console.error("Employer registration submit failed:", submitError)
      setError(submitError?.message || "Employer account creation failed.")
    } finally {
      setBusy(false)
    }
  }

  const discard = () => {
    localStorage.removeItem(STORAGE_KEY)
    setPassword("")
    setConfirmPassword("")
    setSignature("")
    setRegistrationFile(null)
    onCancel?.()
  }

  const input = (id, value, onChange, options = {}) => (
    <input
      id={`employer-${id}`}
      type={options.type || "text"}
      value={value || ""}
      disabled={options.disabled}
      maxLength={options.maxLength || 200}
      inputMode={options.inputMode}
      aria-invalid={Boolean(errors[id]) || undefined}
      aria-describedby={errors[id] ? `employer-${id}-error` : undefined}
      className={controlClass}
      onChange={(event) => onChange(event.target.value)}
    />
  )

  const select = (id, value, options, onChange, placeholder) => (
    <select
      id={`employer-${id}`}
      value={value || ""}
      aria-invalid={Boolean(errors[id]) || undefined}
      aria-describedby={errors[id] ? `employer-${id}-error` : undefined}
      className={controlClass}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  )

  const field = (label, id, value, onChange, options = {}) => (
    <Field key={id} label={label} id={`employer-${id}`} required={options.required} error={errors[id]}>
      {(fieldError) => input(id, value, onChange, { ...options, error: fieldError })}
    </Field>
  )

  const selectField = (label, id, value, options, onChange, placeholder) => (
    <Field key={id} label={label} id={`employer-${id}`} required error={errors[id]}>
      {() => select(id, value, options, onChange, placeholder)}
    </Field>
  )

  if (complete) return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Account created</h2>
      <p className="text-sm text-slate-700"><strong>{email}</strong> is verified. Your Form 2 registration was submitted for PESO review.</p>
      <button type="button" onClick={onCancel} className="auth-primary-button">Back to sign in</button>
    </div>
  )

  return (
    <form className="auth-form auth-detail-form employer-signup-wizard" onSubmit={(event) => { event.preventDefault(); if (step === "review") submit(); else next() }}>
      <nav aria-label="Employer sign-up progress" className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {flow.map((id, index) => {
          const current = step === id
          const done = index < flowPos || (index <= maxPos && stepValidity[id] !== false)
          const tabErrors = Object.keys(errors).some((key) => errors[key] && (
            (id === "account" && ["email", "password", "confirmPassword", "consent"].includes(key))
            || (id === "form" && ["mode", "registrationFile"].includes(key))
            || (id === "establishment" && ["companyName", "employerType", "workforceSize", "lineOfBusiness"].includes(key))
            || (id === "address" && ["municipality", "barangay"].includes(key))
            || (id === "contact" && ["title", "otherTitle", "contactName", "position", "mobile"].includes(key))
            || (id === "certification" && ["representative", "certified", "signature"].includes(key))
            || (id === "basic" && ["companyName", "contactName", "phone", "municipality", "barangay"].includes(key))
          ))
          return (
            <button
              key={id}
              type="button"
              onClick={() => goTo(id)}
              disabled={!current && index > maxPos + 1}
              aria-current={current ? "step" : undefined}
              className={`rounded-lg px-2 py-2 text-left text-xs font-semibold ${current ? "bg-blue-600 text-white" : done ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-500"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {index + 1}. {stepNames[id]}
              {tabErrors && <span aria-label="has errors" className="ml-1 inline-block h-2 w-2 rounded-full bg-rose-500" />}
              {!tabErrors && done && !current && <span aria-label="completed" className="ml-1 text-green-700">✓</span>}
            </button>
          )
        })}
      </nav>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-label={`Step ${flowPos + 1} of ${flow.length}`}>
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${((flowPos + 1) / flow.length) * 100}%` }} />
      </div>
      <section aria-labelledby="employer-step-title" className="space-y-4">
        <div>
          <h2 id="employer-step-title" className="text-lg font-semibold text-slate-900">{stepNames[step]}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {step === "account" && "Verify your email and set up secure sign-in."}
            {step === "form" && "Choose to upload a completed Form 2 or fill it out online."}
            {step === "establishment" && "Provide the establishment details shown on Form 2."}
            {step === "address" && "Enter the establishment's Albay address."}
            {step === "contact" && "Provide the establishment contact person's details."}
            {step === "certification" && "Certify your information and sign as the authorized representative."}
            {step === "basic" && "Enter the account's basic establishment and contact information."}
            {step === "review" && "Review the PDF before submitting it for admin review."}
          </p>
        </div>

        {step === "account" && (
          <div className="space-y-4">
            <Field label="Email" id="employer-email" required error={errors.email}>
              {() => <input id="employer-email" type="email" autoComplete="email" value={email} onChange={(event) => changeEmail(event.target.value)} disabled={emailVerified} aria-invalid={Boolean(errors.email) || undefined} className={controlClass} />}
            </Field>
            {errors.email && <p role="alert" className="text-xs text-rose-600">{errors.email}</p>}
            {emailVerified ? (
              <p role="status" className="text-sm font-semibold text-green-700">✓ Email verified</p>
            ) : !codeSent ? (
              <button type="button" disabled={codeBusy} onClick={sendEmailCode} className="auth-secondary-button self-start">{codeBusy ? "Sending…" : "Send 6-digit code"}</button>
            ) : (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-600">{codeInfo}</p>
                <div className="flex gap-2">
                  {codeDigits.map((digit, index) => (
                    <input key={index} ref={(element) => { codeRefs.current[index] = element }} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? "one-time-code" : "off"} aria-label={`Code digit ${index + 1}`} value={digit} onChange={(event) => handleCodeDigit(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Backspace" && !digit && index > 0) codeRefs.current[index - 1]?.focus() }} className={`${controlClass} employer-code-digit w-10 text-center`} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={codeBusy || codeDigits.join("").length !== 6} onClick={verifyEmailCode} className="auth-primary-button">{codeBusy ? "Checking…" : "Verify"}</button>
                  <button type="button" disabled={codeBusy || resendIn > 0} onClick={sendEmailCode} className="auth-secondary-button">{resendIn > 0 ? `Resend code (${resendIn}s)` : "Resend code"}</button>
                  <button type="button" disabled={codeBusy} onClick={() => changeEmail(email)} className="text-sm text-blue-700 underline">Change email</button>
                </div>
              </div>
            )}
            <Field label="Password" id="employer-password" required error={errors.password}>
              {() => <input id="employer-password" type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })) }} aria-invalid={Boolean(errors.password) || undefined} className={controlClass} />}
            </Field>
            <PasswordChecklist password={password} confirmPassword={confirmPassword} />
            <Field label="Confirm password" id="employer-confirmPassword" required error={errors.confirmPassword}>
              {() => <input id="employer-confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={Boolean(errors.confirmPassword) || undefined} className={controlClass} />}
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} aria-invalid={Boolean(errors.consent) || undefined} />
              <span>{CONSENT_TEXT}<span className="text-rose-600"> *</span></span>
            </label>
            {errors.consent && <p role="alert" className="text-xs text-rose-600">{errors.consent}</p>}
          </div>
        )}

        {step === "form" && (
          <div className="space-y-3">
            <div role="radiogroup" aria-label="NSRP Form 2 options" className="grid gap-3 sm:grid-cols-2">
              {[
                ["upload", "I already have a filled NSRP Form 2", "Upload the completed PDF for review."],
                ["online", "Fill it out online", "Enter establishment and contact details in this wizard."],
              ].map(([value, title, description]) => (
                <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${mode === value ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200" : "border-slate-300 bg-white"}`}>
                  <input type="radio" name="employer-form-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setErrors((current) => ({ ...current, mode: undefined, registrationFile: undefined })); setStepValidity((current) => ({ account: current.account, form: false })); setMaxPos(1); setPreview(null) }} />
                  <span><span className="block text-sm font-semibold text-slate-900">{title}<span className="text-rose-600"> *</span></span><span className="mt-1 block text-xs text-slate-600">{description}</span></span>
                </label>
              ))}
            </div>
            {errors.mode && <p role="alert" className="text-xs text-rose-600">{errors.mode}</p>}
            {mode === "upload" && (
              <Field label="Completed NSRP Form 2 (PDF, max 10 MB)" id="employer-registrationFile" required error={errors.registrationFile}>
                {() => <input id="employer-registrationFile" type="file" accept="application/pdf,.pdf" className={controlClass} onChange={(event) => { setRegistrationFile(event.target.files?.[0] || null); setErrors((current) => ({ ...current, registrationFile: undefined })); setPreview(null) }} />}
              </Field>
            )}
            {registrationFile && <p className="text-xs text-slate-600">Selected: {registrationFile.name}</p>}
          </div>
        )}

        {step === "establishment" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Establishment name", "companyName", establishment.companyName, (value) => updateValue(setEstablishment, "companyName", value), { required: true })}
            {field("Acronym/abbreviation", "acronym", establishment.acronym, (value) => updateValue(setEstablishment, "acronym", value))}
            {field("Tax identification number (TIN)", "tin", establishment.tin, (value) => updateValue(setEstablishment, "tin", value), { maxLength: 30 })}
            {selectField("Employer type", "employerType", establishment.employerType, EMPLOYER_TYPES, (value) => updateValue(setEstablishment, "employerType", value), "Select employer type")}
            {selectField("Total work force", "workforceSize", establishment.workforceSize, WORKFORCE_SIZES, (value) => updateValue(setEstablishment, "workforceSize", value), "Select workforce size")}
            {field("Line of business/industry", "lineOfBusiness", establishment.lineOfBusiness, (value) => updateValue(setEstablishment, "lineOfBusiness", value), { required: true })}
          </div>
        )}

        {step === "address" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {field("House/unit no. & street", "street", address.street, (value) => updateValue(setAddress, "street", value))}
            {field("Subdivision/village/building", "subdivision", address.subdivision, (value) => updateValue(setAddress, "subdivision", value))}
            <CityProvinceFields id="employer-address" cityLabel="City/municipality" locations={locations} city={address.municipality || ""} province={provinceForCity(address.municipality)} errors={{ city: errors.municipality, province: errors.province }} onChange={({ city }) => { setAddress((current) => ({ ...current, municipality: city, barangay: "" })); setErrors((current) => ({ ...current, municipality: undefined, province: undefined, barangay: undefined })); setStepValidity((current) => ({ ...current, address: false })); setPreview(null); }} />
            {selectField("Barangay", "barangay", address.barangay, barangays, (value) => updateValue(setAddress, "barangay", value), address.municipality ? "Select barangay" : "Select city/municipality first")}
            {field("Landmark", "landmark", address.landmark, (value) => updateValue(setAddress, "landmark", value))}
          </div>
        )}

        {step === "contact" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {selectField("Title", "title", contact.title, TITLES, (value) => { setContact((current) => ({ ...current, title: value, otherTitle: value === "Others" ? current.otherTitle : "" })); setErrors((current) => ({ ...current, title: undefined, otherTitle: undefined })); setStepValidity((current) => ({ ...current, contact: false })); setPreview(null) }, "Select title")}
            {contact.title === "Others" && field("Specify title", "otherTitle", contact.otherTitle, (value) => updateValue(setContact, "otherTitle", value), { required: true })}
            {field("Contact person full name", "contactName", contact.name, (value) => updateValue(setContact, "name", value, "contactName"), { required: true })}
            {field("Position", "position", contact.position, (value) => updateValue(setContact, "position", value), { required: true })}
            {field("Mobile number", "mobile", contact.mobile, (value) => updateValue(setContact, "mobile", value.replace(/\D/g, "").slice(0, 11)), { required: true, inputMode: "numeric", maxLength: 11 })}
            {field("Telephone number", "telephone", contact.telephone, (value) => updateValue(setContact, "telephone", value), { maxLength: 30 })}
            {field("Fax number", "fax", contact.fax, (value) => updateValue(setContact, "fax", value), { maxLength: 30 })}
          </div>
        )}

        {step === "basic" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Establishment name", "companyName", basic.companyName, (value) => updateValue(setBasic, "companyName", value), { required: true })}
            {field("Contact name", "contactName", basic.contactName, (value) => updateValue(setBasic, "contactName", value), { required: true })}
            {field("Mobile number", "phone", basic.phone, (value) => updateValue(setBasic, "phone", value.replace(/\D/g, "").slice(0, 11)), { required: true, inputMode: "numeric", maxLength: 11 })}
            {field("House/unit no. & street", "street", basic.street, (value) => updateValue(setBasic, "street", value))}
            {field("Subdivision/village/building", "subdivision", basic.subdivision, (value) => updateValue(setBasic, "subdivision", value))}
            <CityProvinceFields id="employer-address" cityLabel="City/municipality" locations={locations} city={basic.municipality || ""} province={provinceForCity(basic.municipality)} errors={{ city: errors.municipality, province: errors.province }} onChange={({ city }) => { setBasic((current) => ({ ...current, municipality: city, barangay: "" })); setErrors((current) => ({ ...current, municipality: undefined, province: undefined, barangay: undefined })); setStepValidity((current) => ({ ...current, basic: false })); }} />
            {selectField("Barangay", "barangay", basic.barangay, locations?.[basic.municipality] || [], (value) => updateValue(setBasic, "barangay", value), basic.municipality ? "Select barangay" : "Select city/municipality first")}
            {field("Landmark", "landmark", basic.landmark, (value) => updateValue(setBasic, "landmark", value))}
          </div>
        )}

        {step === "certification" && (
          <div className="space-y-4">
            <Field label="Authorized representative full name" id="employer-representative" required error={errors.representative}>
              {() => <input id="employer-representative" value={representative} className={controlClass} aria-invalid={Boolean(errors.representative) || undefined} onChange={(event) => { setRepresentative(event.target.value); setErrors((current) => ({ ...current, representative: undefined })); setStepValidity((current) => ({ ...current, certification: false })); setPreview(null) }} />}
            </Field>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">I certify that the information provided is true and correct, and authorize DOLE to include the establishment profile in the PESO Employment Information System.</div>
            <label className="flex items-start gap-2 text-sm text-slate-700"><input id="employer-certified" type="checkbox" checked={certified} onChange={(event) => { setCertified(event.target.checked); setErrors((current) => ({ ...current, certified: undefined })); setStepValidity((current) => ({ ...current, certification: false })); setPreview(null) }} aria-invalid={Boolean(errors.certified) || undefined} /><span>I certify that this information is true and correct.<span className="text-rose-600"> *</span></span></label>
            {errors.certified && <p role="alert" className="text-xs text-rose-600">{errors.certified}</p>}
            <div>
              <p className="mb-1 text-sm font-medium text-slate-800">Signature<span className="text-rose-600"> *</span></p>
              <NsrpSignatureInput value={signature || null} error={errors.signature} onChange={(value) => { setSignature(value || ""); setErrors((current) => ({ ...current, signature: undefined })); setStepValidity((current) => ({ ...current, certification: false })); setPreview(null) }} />
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <NsrpPdfPreview blob={previewBlob} blobUrl={previewUrl} loading={busy} error={!previewUrl ? error : ""} onRetry={mode === "upload" ? next : generatePreview} viewerClassName="h-[55vh] min-h-[360px]" downloadName="NSRP-Form-2-Employer-Reg-Form.pdf" />
            {mode !== "upload" && <EmployerPrintWarnings warnings={warnings} onFix={(target) => goTo(target)} />}
            {mode !== "upload" && (
              <button type="button" onClick={generatePreview} disabled={busy} className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-800">Regenerate preview</button>
            )}
            <p className="text-xs text-slate-600">Review your Form 2 before creating your account. Admin approval is required before employer tools are available.</p>
          </div>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => flowPos <= 0 ? onCancel?.() : setStep(flow[flowPos - 1])} disabled={busy} className="auth-secondary-button">{flowPos <= 0 ? "Cancel" : "Back"}</button>
        <button type="button" onClick={discard} className="text-sm font-medium text-rose-700 underline">Discard and start over</button>
        {step === "review" ? (
          <button type="submit" disabled={busy || !previewUrl} className="auth-primary-button">{busy ? "Creating account…" : "Create account"}</button>
        ) : (
          <button type="button" disabled={busy || (step === "account" && !emailVerified)} onClick={next} className="auth-primary-button">{busy ? "Validating…" : step === "certification" ? "Generate preview" : "Next"}</button>
        )}
      </div>
    </form>
  )
}
