import PasswordInput from './PasswordInput'
import { useEffect, useMemo, useRef, useState } from "react"
import { API_URL } from "../config"
import NsrpSkillsField from './NsrpSkillsField'
import { RESUME_ACCEPT, resumeError } from '../../shared/resume.js'
import { NSRP_ROW_LIMITS } from "../../shared/nsrpTableLimits.js"
import NsrpPdfPreview from "./NsrpPdfPreview"
import NsrpWarningPanel from "./NsrpWarningPanel"
import NsrpDoubleCheckPanel from './NsrpDoubleCheckPanel'
import NsrpSignatureInput from "./NsrpSignatureInput"
import NsrpImportReview from './NsrpImportReview'
import { nsrpImportBasic } from '../../shared/nsrpImport.js'
import VerificationDocumentsForm, { emptyVerificationDocs, validateVerificationDocs } from "./VerificationDocumentsForm"
import PasswordChecklist from "./PasswordChecklist"
import { BIRTH_COPY_TYPES } from '../../shared/documentImage.js'
import { getNsrpWarningSection, getNsrpFieldLabel, NSRP_SECTION_WIZARD_STEP } from "../../shared/nsrpFieldLabels.js"
import { SUFFIX_OPTIONS } from "../../shared/nameFields.js"
import { PH_LOCATIONS, applicantCityName } from "../../shared/phLocations.js"
import {
  NSRP_TEXT_LIMITS, NSRP_NUMERIC_SPECS, NSRP_SECTION_MAX_ROWS, NSRP_REQUIRED_FIELDS, RELIGION_OPTIONS,
  EMPLOYED_TYPES, UNEMPLOYED_TYPES, EDUCATION_LEVELS, SEX_OPTIONS, CIVIL_STATUS_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS, YES_NO, DISABILITY_OPTIONS, WORK_STATUS_OPTIONS,
  digitsOnly, normalizePhMobile, normalizePassportNo, validateNsrpLanguages, requiresPassport,
} from "../../shared/nsrpValidation.js"

const STORAGE_KEY = "peso-applicant-signup-draft"
const STEP_NAMES = [
  "Account", "Personal information", "Address & contact", "Education & training",
  "Work & skills", "Employment & preferences", "Certification", "Documents", "Preview & submit",
]
const NSRP_FIELDS = [
  [
    ["surname", "Surname"], ["firstName", "First name"], ["middleName", "Middle name"],
    ["suffix", "Suffix", "select", SUFFIX_OPTIONS.filter(Boolean)], ["dob", "Date of birth", "date"], ["placeOfBirth", "Place of birth"],
    ["sex", "Sex", "select", SEX_OPTIONS], ["religion", "Religion", "select", RELIGION_OPTIONS],
    ["civilStatus", "Civil status", "select", CIVIL_STATUS_OPTIONS],
    ["height", "Height"],
  ],
  [
    ["addressStreet", "House no. / street / village"],
    ["addressCity", "Municipality / city", "select", Object.keys(PH_LOCATIONS)], ["addressProvince", "Province"],
    ["addressBarangay", "Barangay", "select", []],
    ["tin", "TIN"], ["gsisSss", "GSIS / SSS ID no."], ["pagibig", "Pag-IBIG no."],
    ["philhealth", "PhilHealth no."], ["cellphone", "Cellphone number"],
    ["landline", "Landline number"], ["disability", "Disability (if any)", "select", DISABILITY_OPTIONS],
  ],
  [],
  [],
  [
    ["employmentStatus", "Employment status", "select", EMPLOYMENT_STATUS_OPTIONS],
    ["activelyLooking", "Actively looking for work?", "select", YES_NO],
    ["lookingDuration", "How long have you been looking?"],
    ["willingImmediately", "Willing to work immediately?", "select", YES_NO],
    ["willingWhen", "If no, when?"], ["fourPs", "4Ps beneficiary?", "select", YES_NO],
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
  education: { title: "Education", fields: [["level", "Level", "select", EDUCATION_LEVELS], ["school", "School"], ["course", "Course / degree"], ["year", "Year graduated"], ["undergradLevel", "If undergraduate, what level?"], ["yearLastAttended", "Year last attended"], ["awards", "Awards received"]] },
  technicalTraining: { title: "Technical training", fields: [["course", "Course"], ["institution", "Training institution"], ["certificate", "Certificate"], ["fromDate", "From", "date"], ["toDate", "To", "date"]] },
  eligibility: { title: "Eligibility", fields: [["eligibility", "Civil service eligibility"], ["rating", "Rating"], ["examDate", "Exam date", "date"], ["license", "PRC license"], ["validUntil", "Valid until", "date"]] },
  workExperience: { title: "Work experience", fields: [["company", "Company"], ["address", "Address"], ["position", "Position"], ["fromDate", "From", "date"], ["toDate", "To", "date"], ["status", "Status", "select", WORK_STATUS_OPTIONS]] },
}

// Live input rules for scalar fields. Sanitizers run on change and paste
// (both go through onChange); the server re-checks everything.
const FIELD_RULES = {
  tin: { sanitize: (v) => digitsOnly(v).slice(0, 12), inputMode: "numeric", helper: NSRP_NUMERIC_SPECS.tin.helper },
  gsisSss: { sanitize: (v) => digitsOnly(v).slice(0, 10), inputMode: "numeric", helper: NSRP_NUMERIC_SPECS.gsisSss.helper },
  pagibig: { sanitize: (v) => digitsOnly(v).slice(0, 12), inputMode: "numeric", helper: NSRP_NUMERIC_SPECS.pagibig.helper },
  philhealth: { sanitize: (v) => digitsOnly(v).slice(0, 12), inputMode: "numeric", helper: NSRP_NUMERIC_SPECS.philhealth.helper },
  fourPsId: { sanitize: (v) => digitsOnly(v).slice(0, 20), inputMode: "numeric", helper: NSRP_NUMERIC_SPECS.fourPsId.helper },
  height: { sanitize: (v) => digitsOnly(v).slice(0, 3), inputMode: "numeric", helper: "whole number, 50–250", unit: "cm" },
  expectedSalary: { sanitize: (v) => digitsOnly(v).slice(0, 7), inputMode: "numeric", helper: "whole number, no symbols", formatOnBlur: true },
  cellphone: { sanitize: (v) => normalizePhMobile(v).slice(0, 11), inputMode: "numeric", helper: "11 digits starting with 09" },
  landline: { sanitize: (v) => digitsOnly(v).slice(0, 11), inputMode: "numeric", helper: "7–11 digits, optional" },
  passportNo: { sanitize: normalizePassportNo, helper: "7–12 uppercase letters/digits" },
}

// When a parent answer changes, dependent fields are hidden and cleared.
const CONDITIONAL_CLEARS = {
  employmentStatus: () => ["employmentTypeDetail", "terminatedAbroadCountry", "employmentTypeOther"],
  employmentTypeDetail: (value) => [
    ...(/abroad/i.test(value || "") ? [] : ["terminatedAbroadCountry"]),
    ...(/^Others/i.test(value || "") ? [] : ["employmentTypeOther"]),
  ],
  activelyLooking: (value) => (value === "Yes" ? [] : ["lookingDuration"]),
  willingImmediately: (value) => (value === "No" ? [] : ["willingWhen"]),
  fourPs: (value) => (value === "Yes" ? [] : ["fourPsId"]),
  disability: (value) => (value === "Others" ? [] : ["disabilityOthers"]),
}

// Conditional visibility for scalar fields on the Employment step.
const FIELD_VISIBLE = {
  lookingDuration: (answers) => answers.activelyLooking === "Yes",
  willingWhen: (answers) => answers.willingImmediately === "No",
  fourPsId: (answers) => answers.fourPs === "Yes",
}

// Row-level sanitizers (typing and paste share the same onChange path)
const ROW_SANITIZERS = {
  "education.year": (v) => digitsOnly(v).slice(0, 4),
  "education.yearLastAttended": (v) => digitsOnly(v).slice(0, 4),
}

// --- Server fieldError presentation ---------------------------------------
// Every server error key must become a visible, focusable message. Scalar
// inputs use id "field-<key>"; row inputs use "field-<section>-<row>-<field>"
// (education rows are keyed by level, e.g. field-education-Tertiary-course).
const ACCOUNT_FIELD_LABELS = {
  accountEmail: "Email address", email: "Email address", password: "Password",
  confirmPassword: "Confirm password", consent: "Data privacy consent",
  resume: "Resume", birthCertificate: "Birth certificate", validId1: "Valid ID #1",
  validId2: "Valid ID #2", verificationDocuments: "Verification documents",
  certified: "Certification", signatureDataUrl: "Signature", nsrpAnswers: "NSRP form",
}
// The wizard step whose UI renders each field. Content matches the tab names
// and the server step map (education/training at step 4 tab, work at step 5).
const ERROR_STEP_BY_ROOT = [
  [1, ["surname", "firstName", "middleName", "suffix", "dob", "placeOfBirth", "sex", "religion", "civilStatus", "height"]],
  [2, ["addressStreet", "addressBarangay", "addressCity", "addressProvince", "tin", "gsisSss", "pagibig", "philhealth", "email", "cellphone", "landline", "disability", "disabilityOthers"]],
  [3, ["education", "technicalTraining", "eligibility"]],
  [4, ["workExperience", "skills", "othersText", "languages"]],
  [5, ["employmentStatus", "employmentTypeDetail", "terminatedAbroadCountry", "employmentTypeOther", "activelyLooking", "lookingDuration", "willingImmediately", "willingWhen", "fourPs", "fourPsId", "occupation1", "occupation2", "occupation3", "occupation4", "localPref1", "localPref2", "localPref3", "overseasPref1", "overseasPref2", "overseasPref3", "expectedSalary", "passportNo", "passportExpiry"]],
  [6, ["certified", "signatureDataUrl"]],
  [7, ["resume", "birthCertificate", "validId1", "validId2", "verificationDocuments"]],
  [0, ["accountEmail", "password", "confirmPassword", "consent", "nsrpAnswers"]],
]
const errorKeyRoot = (key) => key.split(/[[.]/)[0]
const owningStep = (key) => {
  const root = errorKeyRoot(key)
  const entry = ERROR_STEP_BY_ROOT.find(([, roots]) => roots.includes(root))
  return entry ? entry[0] : null
}
const errorElementId = (key) => {
  const rowMatch = /^(\w+)\[([^\]]+)\]\.(\w+)$/.exec(key)
  if (rowMatch) return `field-${rowMatch[1]}-${rowMatch[2]}-${rowMatch[3]}`
  return `field-${key === "accountEmail" ? "email" : key}`
}
const errorLabel = (key) => ACCOUNT_FIELD_LABELS[errorKeyRoot(key)] || getNsrpFieldLabel(key)
const inputErrorClass = (hasError) => (hasError ? " border-rose-500 ring-1 ring-rose-300" : "")
const stepErrors = [
  ["surname", "firstName", "middleName", "suffix", "dob", "placeOfBirth", "sex", "religion", "civilStatus", "height"],
  ["addressStreet", "addressBarangay", "addressCity", "addressProvince", "tin", "gsisSss", "pagibig", "philhealth", "email", "cellphone", "landline", "disability", "disabilityOthers"],
  ["education", "technicalTraining", "eligibility"],
  ["workExperience", "skills", "othersText", "languages"],
  ["employmentStatus", "employmentTypeDetail", "activelyLooking", "lookingDuration", "willingImmediately", "willingWhen", "fourPs", "fourPsId", "occupation1", "occupation2", "occupation3", "occupation4", "localPref1", "localPref2", "localPref3", "overseasPref1", "overseasPref2", "overseasPref3", "expectedSalary", "passportNo", "passportExpiry"],
  ["certified"],
]
const inputClass = "shared-form-control mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"

// Step ids: 0 Account, 9 Your NSRP (path choice), 1-6 NSRP answer steps,
// 7 Documents, 8 Preview & submit (online), 10 Basic information and
// 11 Review and submit (upload path).
const ONLINE_FLOW = [0, 9, 1, 2, 3, 4, 5, 6, 7, 8]
const UPLOAD_FLOW = [0, 9, 10, 7, 11]
const UPDATE_FLOW = [1, 2, 3, 4, 5, 6, 8]
const UNDECIDED_FLOW = [0, 9]
const stepTitle = (id) => (id === 9 ? "Your NSRP" : id === 10 ? "Basic information" : id === 11 ? "Review and submit" : STEP_NAMES[id])
const NSRP_UPLOAD_TYPES = ["application/pdf"]
const NSRP_UPLOAD_MAX = 5 * 1024 * 1024

function safeDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    const answers = saved.answers && typeof saved.answers === "object" ? saved.answers : {}
    delete answers.signatureDataUrl
    const basicInfo = saved.basicInfo && typeof saved.basicInfo === "object" ? saved.basicInfo : {}
    const nsrpMode = ["online", "upload"].includes(saved.nsrpMode) ? saved.nsrpMode : null
    const flow = nsrpMode === "upload" ? UPLOAD_FLOW : nsrpMode === "online" ? ONLINE_FLOW : UNDECIDED_FLOW
    const rawStep = Number(saved.step) || 0
    return { email: saved.email || "", step: flow.includes(rawStep) ? rawStep : 0, answers, consent: Boolean(saved.consent), nsrpMode, basicInfo }
  } catch (error) {
    console.error("Could not load applicant sign-up draft:", error)
    return { email: "", step: 0, answers: {}, consent: false, nsrpMode: null, basicInfo: {} }
  }
}

export default function ApplicantSignupWizard({ onCancel, onComplete, mode = "signup", initialAnswers = {}, token, onSaved }) {
  const isUpdate = mode === "update"
  const isPublic = mode === "public"
  const formStepTitle = (id) => isPublic && id === 8 ? 'Preview & download' : stepTitle(id)
  const saved = useMemo(() => isPublic ? { email: '', answers: {}, basicInfo: {} } : safeDraft(), [isPublic])
  const [email, setEmail] = useState(saved.email)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [step, setStep] = useState(isUpdate || isPublic ? 1 : saved.step)
  const [answers, setAnswers] = useState(() => isUpdate ? { ...initialAnswers, signatureDataUrl: "" } : saved.answers)
  const [consent, setConsent] = useState(saved.consent)
  const [docs, setDocs] = useState(emptyVerificationDocs)
  const [resume, setResume] = useState(null)
  const resumeInputRef = useRef(null)
  // NSRP path: 'online' (fill out) or 'upload' (pre-filled form). The uploaded
  // file itself stays in memory only — never in browser storage.
  const [nsrpMode, setNsrpMode] = useState(isUpdate ? "online" : saved.nsrpMode)
  const [basicInfo, setBasicInfo] = useState(saved.basicInfo || {})
  const [nsrpUpload, setNsrpUpload] = useState(null)
  const [nsrpImportToken, setNsrpImportToken] = useState('')
  const [nsrpFileRevision, setNsrpFileRevision] = useState(0)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [previewBlob, setPreviewBlob] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [complete, setComplete] = useState(false)
  // Section navigation is unrestricted; completion tracks actual validation.
  const flow = isUpdate || isPublic ? UPDATE_FLOW : nsrpMode === "upload" ? UPLOAD_FLOW : nsrpMode === "online" ? ONLINE_FLOW : UNDECIDED_FLOW
  const flowPos = flow.indexOf(step)
  const [stepValidity, setStepValidity] = useState({})
  const [focusedField, setFocusedField] = useState(null)
  // Email-code verification (step 1). The code and proof token live in memory
  // only — never in localStorage/sessionStorage — so a refresh requires
  // verifying again.
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailProof, setEmailProof] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""])
  const [codeInfo, setCodeInfo] = useState("")
  const [codeBusy, setCodeBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const codeRefs = useRef([])

  useEffect(() => { setStepValidity(current => ({ ...current, 0: false })) }, [email, password, confirmPassword, consent, emailVerified])
  useEffect(() => { setStepValidity(current => ({ ...current, 7: false })) }, [docs])

  useEffect(() => {
    const safeAnswers = { ...answers }
    delete safeAnswers.signatureDataUrl
    // Files and signatures stay in memory only; both paths' answers are kept.
    if (!isUpdate && !isPublic) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, step, answers: safeAnswers, consent, nsrpMode, basicInfo }))
      } catch (storageError) {
        console.error("Could not save applicant sign-up draft:", storageError)
      }
    }
  }, [email, step, answers, consent, isUpdate, isPublic, nsrpMode, basicInfo])
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])
  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])
  // Courses apply only to Tertiary/Graduate Studies: clear any value left in
  // Elementary/Secondary rows (e.g. from an old draft).
  useEffect(() => {
    const rows = answers.education || []
    if (rows.some((row) => ["Elementary", "Secondary"].includes(row.level) && row.course)) {
      setAnswers((current) => ({
        ...current,
        education: (current.education || []).map((row) => (["Elementary", "Secondary"].includes(row.level) && row.course ? { ...row, course: "" } : row)),
      }))
    }
  }, [answers.education])

  // Editing (or changing) the email discards any verification or pending code.
  const changeEmail = (value) => {
    setEmail(value)
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
      setFieldErrors((current) => ({ ...current, email: "Enter a valid email address." }))
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
      if (response.status === 429) {
        if (data?.code === "EMAIL_CODE_COOLDOWN") {
          // A fresh code was sent very recently; let the user enter it.
          setCodeSent(true)
          setResendIn(Number(data?.retryAfter) || 60)
          setCodeInfo(`If this email can be used, we sent a 6-digit code to ${email.trim()}. It expires in 10 minutes. Check your spam folder.`)
        } else {
          setError(data?.error || "Too many requests. Please try again later.")
        }
        return
      }
      if (!response.ok) {
        if (data?.fieldErrors?.email) setFieldErrors((current) => ({ ...current, email: data.fieldErrors.email }))
        setError(data?.error || "Could not send the code. Please try again.")
        return
      }
      setCodeSent(true)
      setCodeDigits(["", "", "", "", "", ""])
      setCodeInfo(`If this email can be used, we sent a 6-digit code to ${email.trim()}. It expires in 10 minutes. Check your spam folder.`)
      setResendIn(60)
      setTimeout(() => codeRefs.current[0]?.focus(), 0)
    } catch {
      setError("Could not send the code. Check your connection and try again.")
    } finally {
      setCodeBusy(false)
    }
  }

  const verifyEmailCode = async () => {
    const code = codeDigits.join("")
    setError("")
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.")
      return
    }
    setCodeBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/signup/email-code/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.code === "EMAIL_CODE_EXPIRED" || data?.code === "EMAIL_CODE_LOCKED") {
          setCodeDigits(["", "", "", "", "", ""])
        }
        setError(data?.error || "Could not verify the code.")
        return
      }
      setEmailProof(data.proofToken)
      setEmailVerified(true)
      setCodeSent(false)
      setCodeDigits(["", "", "", "", "", ""])
      setCodeInfo("")
      setResendIn(0)
    } catch {
      setError("Could not verify the code. Check your connection and try again.")
    } finally {
      setCodeBusy(false)
    }
  }

  const handleCodeDigit = (index, raw) => {
    const digit = raw.replace(/\D/g, "").slice(-1)
    setCodeDigits((current) => {
      const next = [...current]
      next[index] = digit
      return next
    })
    if (digit && index < 5) codeRefs.current[index + 1]?.focus()
  }

  const handleCodeKeyDown = (index, event) => {
    if (event.key === "Backspace" && !codeDigits[index] && index > 0) codeRefs.current[index - 1]?.focus()
  }

  const handleCodePaste = (event) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!pasted) return
    event.preventDefault()
    setCodeDigits([...pasted.split(""), ...Array(6).fill("")].slice(0, 6))
    codeRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const markStepInvalid = () => setStepValidity((current) => ({ ...current, [step]: false }))

  // Basic-information editor (upload path). "No middle name" clears the field.
  const updateBasic = (key, value) => {
    setBasicInfo((current) => ({
      ...current,
      [key]: value,
      ...(key === "addressCity" ? { addressProvince: value ? "Albay" : "" } : {}),
      ...(key === "noMiddleName" && value ? { middleName: "" } : {}),
    }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    markStepInvalid()
  }

  const updateAnswer = (key, value) => {
    const rule = FIELD_RULES[key]
    const sanitized = rule?.sanitize ? rule.sanitize(value) : value
    setAnswers((current) => {
      const next = { ...current, [key]: sanitized }
      if (key === "addressCity") {
        next.addressProvince = sanitized ? "Albay" : ""
        next.addressBarangay = ""
      }
      // Changing a parent answer clears and hides its dependent fields
      for (const dependent of CONDITIONAL_CLEARS[key]?.(sanitized) || []) next[dependent] = ""
      return next
    })
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    markStepInvalid()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl("")
    setPreviewBlob(null)
  }
  const updateRow = (section, index, field, value) => {
    const sanitizer = ROW_SANITIZERS[`${section}.${field}`]
    setAnswers((current) => ({
      ...current,
      [section]: (current[section] || []).map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const next = { ...row, [field]: sanitizer ? sanitizer(value) : value }
        // "If undergraduate" fields apply only when the level was not finished
        if (section === "education" && field === "year" && next.year) {
          next.undergradLevel = ""
          next.yearLastAttended = ""
        }
        return next
      }),
    }))
    setFieldErrors((current) => ({ ...current, [`${section}[${index}].${field}`]: undefined }))
    markStepInvalid()
  }
  // Banner text naming every problem; keys we cannot map to a field show their
  // raw message so nothing is ever hidden.
  const buildErrorBanner = (errors) => {
    const entries = Object.entries(errors || {}).filter(([, message]) => Boolean(message))
    if (!entries.length) return ""
    const parts = entries.map(([key, message]) => {
      const known = owningStep(key) !== null || errorKeyRoot(key) in ACCOUNT_FIELD_LABELS
      return known ? `${errorLabel(key)} — ${message}` : message
    })
    return `${entries.length} field${entries.length === 1 ? " needs" : "s need"} attention: ${parts.join("; ")}`
  }

  // Jump to the step that owns the first error (if needed), then scroll to and
  // focus the first invalid input.
  const focusFirstError = (errors) => {
    const keys = Object.keys(errors || {}).filter((key) => errors[key])
    if (!keys.length) return
    const targetStep = keys.map((key) => owningStep(key)).find((target) => target !== null && flow.includes(target) && !(isUpdate && target === 0))
    const jumping = targetStep !== undefined && targetStep !== step
    if (jumping) setStep(targetStep)
    setTimeout(() => {
      for (const key of keys) {
        const element = document.getElementById(errorElementId(key))
        if (element) {
          element.scrollIntoView?.({ block: "center" })
          element.focus({ preventScroll: true })
          return
        }
      }
    }, jumping ? 80 : 0)
  }

  const showErrors = (errors) => {
    setFieldErrors(errors || {})
    setError(buildErrorBanner(errors) || "Check the highlighted fields.")
    focusFirstError(errors || {})
  }

  const validateCurrent = async (validationStep = step) => {
    setError("")
    if (validationStep === 0) {
      const localErrors = {}
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) localErrors.email = "Enter a valid email address."
      if (!emailVerified) localErrors.email = "Verify your email with the 6-digit code before continuing."
      if (password.length < 8 || password.length > 64 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) localErrors.password = "Meet all password rules."
      if (password !== confirmPassword) localErrors.confirmPassword = "Passwords do not match."
      if (!consent) localErrors.consent = "Data privacy consent is required."
      if (Object.keys(localErrors).length) showErrors(localErrors)
      return Object.keys(localErrors).length === 0
    }
    if (validationStep >= 1 && validationStep <= 6) {
      if (validationStep === 4) {
        const languageErrors = validateNsrpLanguages(answers.languages)
        if (Object.keys(languageErrors).length) {
          showErrors(languageErrors)
          return false
        }
      }
      const bodyAnswers = { ...answers, email }
      const response = await fetch(`${API_URL}/api/nsrp/validate-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: validationStep - 1, answers: bodyAnswers }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) showErrors(data?.fieldErrors || { nsrpAnswers: data?.error || "Validation failed." })
      else setFieldErrors({})
      return response.ok
    }
    if (validationStep === 9) {
      // Path choice: required; the upload path needs the file up front.
      const localErrors = {}
      if (!nsrpMode) localErrors.nsrpMode = "Choose how you want to provide your NSRP."
      if (nsrpMode === "upload") {
        if (!nsrpUpload) localErrors.nsrpFile = "Upload your filled NSRP form (PDF only)."
        else if (!NSRP_UPLOAD_TYPES.includes(nsrpUpload.type) || !/\.pdf$/i.test(nsrpUpload.name)) localErrors.nsrpFile = "The NSRP form must be a PDF file."
        else if (nsrpUpload.size > NSRP_UPLOAD_MAX) localErrors.nsrpFile = "The NSRP form must be 5 MB or smaller."
      }
      if (Object.keys(localErrors).length) showErrors(localErrors)
      return Object.keys(localErrors).length === 0
    }
    if (validationStep === 10) {
      const response = await fetch(`${API_URL}/api/nsrp/validate-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "upload", step: "basic", basic: basicInfo }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) showErrors(data?.fieldErrors || { nsrpAnswers: data?.error || "Validation failed." })
      else setFieldErrors({})
      return response.ok
    }
    if (validationStep === 7) {
      // A resume is optional and independent of identity verification.
      const localErrors = {}
      if (resume && resumeError(resume)) localErrors.resume = resumeError(resume)
      if (!BIRTH_COPY_TYPES.includes(docs.birthDetails?.copyType)) localErrors.birthCertificate = 'Select the birth certificate copy type.'
      if (!validateVerificationDocs(docs)) localErrors.validId2 = "Add a birth certificate and complete Valid ID #1."
      if (docs.id1.type && docs.id2.type && docs.id1.type === docs.id2.type) localErrors.validId2 = "Choose a different type for Valid ID #2."
      if (Object.keys(localErrors).length) showErrors(localErrors)
      return Object.keys(localErrors).length === 0
    }
    return true
  }
  // Visiting a section does not mark it complete.
  const posOk = (p) => {
    const id = flow[p]
    return stepValidity[id] === true && (id !== 0 || emailVerified)
  }
  const validateRequiredSections = async () => {
    for (const id of flow.filter(id => id !== 8 && id !== 11)) {
      const valid = await validateCurrent(id)
      setStepValidity(current => ({ ...current, [id]: valid }))
      if (!valid) { setStep(id); return false }
    }
    return true
  }
  const openFinalStep = async () => {
    setBusy(true)
    try {
      if (!(await validateRequiredSections())) return
      if (flow.includes(8)) await generatePreview()
      else setStep(11)
    } catch (validationError) { setError(validationError.message || 'Could not validate your information. Please try again.') }
    finally { setBusy(false) }
  }
  const goToStep = async (targetId) => {
    if (busy) return
    const targetPos = flow.indexOf(targetId)
    if (targetPos < 0 || targetPos === flowPos) return
    if (isPublic) {
      if (targetId === 8) await generatePreview()
      else setStep(targetId)
      return
    }
    if (targetId === 8 || targetId === 11) await openFinalStep()
    else setStep(targetId)
  }
  const next = async () => {
    if (isPublic) {
      const target = flow[flowPos + 1]
      if (target === 8) await generatePreview()
      else if (target !== undefined) setStep(target)
      return
    }
    const target = flow[flowPos + 1]
    if (target === 8 || target === 11) { await openFinalStep(); return }
    if (!(await validateCurrent())) return
    setStepValidity((current) => ({ ...current, [step]: true }))
    if (target === undefined) return
    setStep(target)
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
        if (data?.fieldErrors && Object.keys(data.fieldErrors).length) {
          showErrors(data.fieldErrors)
        } else {
          setError(data?.error || "Could not generate the NSRP PDF.")
        }
        return false
      }
      const blob = await response.blob()
      if (blob.type !== "application/pdf") throw new Error("The preview service returned an invalid document.")
      const warningHeader = response.headers.get("X-NSRP-Layout-Warnings")
      setWarnings(warningHeader ? JSON.parse(warningHeader) : [])
      setPreviewBlob(blob)
      setPreviewUrl(URL.createObjectURL(blob))
      if (isPublic) {
        setFieldErrors({})
        setStepValidity(Object.fromEntries(flow.map((id) => [id, true])))
      }
      setStepValidity((current) => ({ ...current, [step]: true }))
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
    if (isPublic) return
    setBusy(true)
    setError("")
    try {
      if (!(await validateRequiredSections())) return
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
        payload.append("emailProof", emailProof)
        payload.append("password", password)
        payload.append("consent", "true")
        payload.append("nsrpMode", nsrpMode || "online")
        if (nsrpMode === "upload") {
          // Upload path: the file plus basic information; answers are not sent.
          payload.append("nsrpFile", nsrpUpload)
          if (nsrpImportToken) payload.append('nsrpImportToken', nsrpImportToken)
          for (const key of ["firstName", "middleName", "lastName", "suffix", "dob", "cellphone", "addressCity", "addressProvince"]) {
            payload.append(key, basicInfo[key] || "")
          }
          payload.append("noMiddleName", basicInfo.noMiddleName ? "true" : "false")
        } else {
          payload.append("nsrpAnswers", JSON.stringify(requestAnswers))
        }
        payload.append("id1Type", docs.id1.type)
        payload.append('verificationDetails', JSON.stringify({ birthCertificate: docs.birthDetails || {}, validId1: { number: docs.id1.number, expiry: docs.id1.expiry, format: docs.id1.format }, validId2: { number: docs.id2.number, expiry: docs.id2.expiry, format: docs.id2.format } }))
        payload.append("id2Type", docs.id2.type)
        payload.append("birthCertificate", docs.birthCertificate)
        payload.append("validId1Front", docs.id1.front)
        if (docs.id1.back) payload.append("validId1Back", docs.id1.back)
        if (docs.id2.front) payload.append("validId2Front", docs.id2.front)
        if (docs.id2.back) payload.append("validId2Back", docs.id2.back)
        if (resume) payload.append('resume', resume)
        response = await fetch(`${API_URL}/api/signup`, { method: "POST", body: payload })
      }
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        if (data?.code === "EMAIL_NOT_VERIFIED") {
          // Proof missing/expired/reused: back to step 1 to verify again.
          setEmailVerified(false)
          setEmailProof("")
          setCodeSent(false)
          setStep(0)
          setError(data?.error || "Verify your email address with the 6-digit code.")
          return
        }
        if (data?.fieldErrors && Object.keys(data.fieldErrors).length) {
          showErrors(data.fieldErrors)
        } else {
          setError(data?.error || "Account creation failed.")
        }
        return
      }
      if (isUpdate) {
        onSaved?.(data)
      } else {
        localStorage.removeItem(STORAGE_KEY)
        setPassword("")
        setConfirmPassword("")
        setNsrpUpload(null)
        onComplete?.()
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
    setNsrpMode(null)
    setBasicInfo({})
    setNsrpUpload(null)
    setConsent(false)
    setEmailVerified(false)
    setEmailProof("")
    setCodeSent(false)
    setCodeDigits(["", "", "", "", "", ""])
    setCodeInfo("")
    setResendIn(0)
    setStep(0)
    onCancel?.()
  }
  const renderTextField = ([key, label, type, options]) => {
    if (key === "addressBarangay") options = PH_LOCATIONS[applicantCityName(answers.addressCity)] || []
    const rule = FIELD_RULES[key] || {}
    const limit = NSRP_TEXT_LIMITS[key]
    const rawValue = answers[key] || ""
    const required = NSRP_REQUIRED_FIELDS.includes(key) || key === 'passportNo' && requiresPassport(answers) || key === 'passportExpiry' && Boolean(answers.passportNo || requiresPassport(answers))
    // Salary: show thousands separators once the field loses focus; the stored
    // value stays a plain digit string.
    const displayValue = rule.formatOnBlur && focusedField !== key && rawValue
      ? Number(rawValue).toLocaleString("en-US")
      : rawValue
    return (
      <label key={key} className="block text-sm font-medium text-slate-800">
        {label}{required ? <span className="text-rose-600"> *</span> : null}
        {type === "select" ? (
          <select id={`field-${key}`} required={required} value={key === "addressCity" ? applicantCityName(rawValue) : rawValue} disabled={key === "addressBarangay" && !applicantCityName(answers.addressCity)} onChange={(event) => updateAnswer(key, event.target.value)} aria-invalid={Boolean(fieldErrors[key]) || undefined} aria-describedby={fieldErrors[key] ? `error-${key}` : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors[key]))}`}>
            <option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}
            {key === "religion" && rawValue && !options.includes(rawValue) && <option>{rawValue}</option>}
          </select>
        ) : (
          <span className="relative block">
            <input
              id={`field-${key}`}
              required={required}
              type={type || "text"}
              readOnly={key === "addressProvince"}
              inputMode={rule.inputMode}
              maxLength={rule.sanitize ? undefined : limit}
              value={displayValue}
              onChange={(event) => updateAnswer(key, event.target.value)}
              onFocus={() => setFocusedField(key)}
              onBlur={() => setFocusedField(null)}
              aria-invalid={Boolean(fieldErrors[key]) || undefined}
              aria-describedby={fieldErrors[key] ? `error-${key}` : undefined}
              className={`${inputClass}${inputErrorClass(Boolean(fieldErrors[key]))}`}
            />
            {rule.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{rule.unit}</span>}
          </span>
        )}
        {rule.helper && <span className="mt-1 block text-[11px] font-normal text-slate-500">{rule.helper}</span>}
        {typeof rawValue === "string" && limit && rawValue.length >= limit - 10 && (
          <span className="mt-1 block text-[11px] font-normal text-slate-500">{rawValue.length}/{limit}</span>
        )}
        {fieldErrors[key] && <span id={`error-${key}`} role="alert" className="mt-1 block text-xs text-rose-600">{fieldErrors[key]}</span>}
      </label>
    )
  }
  const fixWarning = (field) => {
    const section = getNsrpWarningSection(field)
    setStep((NSRP_SECTION_WIZARD_STEP[section] ?? 0) + 1)
  }
  // Per-tab error keys for the badge.
  const BASIC_INFO_ERROR_KEYS = ["firstName", "middleName", "noMiddleName", "lastName", "suffix", "dob", "cellphone", "addressCity", "addressProvince"]
  const tabErrorKeysFor = (id) => (id === 0
    ? ["accountEmail", "email", "password", "confirmPassword", "consent"]
    : id >= 1 && id <= 6
      ? stepErrors[id - 1]
      : id === 7
        ? ["birthCertificate", "validId1", "validId2", "verificationDocuments"]
        : id === 9
          ? ["nsrpMode", "nsrpFile"]
          : id === 10
            ? BASIC_INFO_ERROR_KEYS
            : [])

  if (complete && isUpdate) return (
    <div className="space-y-3">
      <p className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">Your NSRP was updated and submitted for review.</p>
      <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Close</button>
    </div>
  )
  if (complete) return (
    <div className="auth-form">
      <h2 className="text-xl font-semibold text-slate-900">Account created</h2>
      <p className="text-sm text-slate-700"><strong>{email}</strong> is verified. Your registration and documents were submitted for PESO review — you can sign in now.</p>
      <button type="button" onClick={onCancel} className="auth-primary-button">Back to sign in</button>
    </div>
  )

  return (
    <form className="auth-form auth-detail-form" onSubmit={(event) => { event.preventDefault(); if (step === 8 || step === 11) { if (!isPublic) submit() } else next() }}>
      <nav aria-label={isUpdate || isPublic ? "NSRP progress" : "Sign-up progress"} className="grid grid-cols-3 gap-1 sm:grid-cols-5">
        {flow.map((id, index) => {
          const name = formStepTitle(id)
          const tabErrorKeys = tabErrorKeysFor(id)
          const hasErrors = Object.keys(fieldErrors).some((key) => fieldErrors[key] && tabErrorKeys.some((field) => key === field || key.startsWith(`${field}[`)))
          const done = posOk(index)
          return <button key={id} type="button" disabled={busy} onClick={() => goToStep(id)} aria-current={id === step ? "step" : undefined} className={`rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold disabled:opacity-50 ${id === step ? "bg-cyan-500 text-slate-950" : done ? "bg-cyan-100 text-cyan-900" : "bg-slate-100 text-slate-700 hover:bg-cyan-50"}`}>
            {index + 1}. {name}
            {hasErrors && <span role="img" aria-label="has errors" className="ml-1 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" />}
            {!hasErrors && done && id !== step && <span aria-label="completed" className="ml-1 text-[10px] text-green-700">✓</span>}
          </button>
        })}
      </nav>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-label={`Step ${flowPos + 1} of ${flow.length}`}>
        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${((flowPos + 1) / flow.length) * 100}%` }} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{formStepTitle(step)}</h2>
      <p className="text-sm text-slate-600">{isPublic ? 'You can jump between sections. Complete all required fields before previewing or downloading your PDF.' : 'You can jump between sections and complete them in any order. All required sections must be valid before previewing or submitting.'}</p>
      {step === 9 && !isUpdate && (
        <section aria-label="Choose how to provide your NSRP" className="space-y-3">
          <p className="text-sm text-slate-600">The NSRP form is required for your PESO registration. Choose one option:</p>
          <div role="radiogroup" aria-label="NSRP options" className="grid gap-3 sm:grid-cols-2">
            {[
              { value: "upload", title: "I already have a filled NSRP form", text: "Upload a PDF only (max 5 MB)." },
              { value: "online", title: "Fill out my NSRP online", text: "Answer the form step by step and we generate the PDF for you." },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={nsrpMode === option.value}
                onClick={() => {
                  setNsrpMode(option.value)
                  setFieldErrors((current) => ({ ...current, nsrpMode: undefined, nsrpFile: undefined }))
                  markStepInvalid()
                }}
                className={`rounded-xl border p-4 text-left ${nsrpMode === option.value ? "border-cyan-600 bg-cyan-50 ring-1 ring-cyan-300" : "border-slate-300 bg-white"}`}
              >
                <span className="block text-sm font-semibold text-slate-900">{option.title}</span>
                <span className="mt-1 block text-xs text-slate-600">{option.text}</span>
              </button>
            ))}
          </div>
          {fieldErrors.nsrpMode && <p id="error-nsrpMode" role="alert" className="text-xs text-rose-600">{fieldErrors.nsrpMode}</p>}
          {nsrpMode === "upload" && (
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="block text-sm font-medium text-slate-800">Filled NSRP form (PDF only; max 5 MB)
                <input
                  id="field-nsrpFile"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    setNsrpUpload(file)
                    setNsrpImportToken('')
                    setNsrpFileRevision(value => value + 1)
                    setFieldErrors((current) => ({ ...current, nsrpFile: undefined }))
                    markStepInvalid()
                  }}
                  aria-invalid={Boolean(fieldErrors.nsrpFile) || undefined}
                  aria-describedby={fieldErrors.nsrpFile ? "error-nsrpFile" : undefined}
                  className="mt-2 block w-full text-sm"
                />
              </label>
              {nsrpUpload && <p className="mt-1 text-xs text-slate-500">{nsrpUpload.name} • {Math.ceil(nsrpUpload.size / 1024)} KB</p>}
              {nsrpUpload && <NsrpImportReview key={`${nsrpFileRevision}:${emailProof}`} file={nsrpUpload} emailProof={emailProof} onUse={result => {
                setBasicInfo(current => ({ ...current, ...nsrpImportBasic(result.answers), noMiddleName: false }))
                setNsrpImportToken(result.importToken)
                markStepInvalid()
              }} />}
              {fieldErrors.nsrpFile && <p id="error-nsrpFile" role="alert" className="mt-1 text-xs text-rose-600">{fieldErrors.nsrpFile}</p>}
            </div>
          )}
          {nsrpMode && ((Object.keys(answers).length > 0 && nsrpMode === "upload") || (nsrpMode === "online" && (basicInfo.firstName || nsrpUpload))) && (
            <p className="text-xs text-slate-500">Your other answers are kept until you submit.</p>
          )}
        </section>
      )}
      {step === 10 && !isUpdate && (
        <section aria-label="Basic information" className="grid gap-3 sm:grid-cols-2">
          {[
            ["firstName", "First name"],
            ["middleName", "Middle name"],
            ["lastName", "Last name"],
          ].map(([key, label]) => (
            <label key={key} className="block text-sm font-medium text-slate-800">{label}
              <input id={`field-${key}`} value={basicInfo[key] || ""} disabled={key === "middleName" && Boolean(basicInfo.noMiddleName)}
                onChange={(event) => updateBasic(key, event.target.value)}
                aria-invalid={Boolean(fieldErrors[key]) || undefined} aria-describedby={fieldErrors[key] ? `error-${key}` : undefined}
                className={`${inputClass}${inputErrorClass(Boolean(fieldErrors[key]))} disabled:bg-slate-100`} />
              {fieldErrors[key] && <span id={`error-${key}`} role="alert" className="mt-1 block text-xs text-rose-600">{fieldErrors[key]}</span>}
            </label>
          ))}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(basicInfo.noMiddleName)} onChange={(event) => updateBasic("noMiddleName", event.target.checked)} />
            No middle name
          </label>
          <label className="block text-sm font-medium text-slate-800">Suffix
            <select id="field-suffix" value={basicInfo.suffix || ""} onChange={(event) => updateBasic("suffix", event.target.value)} className={inputClass}>
              {SUFFIX_OPTIONS.map((option) => <option key={option} value={option}>{option || "None"}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-800">Date of birth
            <input id="field-dob" type="date" value={basicInfo.dob || ""} onChange={(event) => updateBasic("dob", event.target.value)} aria-invalid={Boolean(fieldErrors.dob) || undefined} aria-describedby={fieldErrors.dob ? "error-dob" : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors.dob))}`} />
            {fieldErrors.dob && <span id="error-dob" role="alert" className="mt-1 block text-xs text-rose-600">{fieldErrors.dob}</span>}
          </label>
          <label className="block text-sm font-medium text-slate-800">Cellphone number
            <input id="field-cellphone" inputMode="numeric" value={basicInfo.cellphone || ""} onChange={(event) => updateBasic("cellphone", normalizePhMobile(event.target.value).slice(0, 11))} aria-invalid={Boolean(fieldErrors.cellphone) || undefined} aria-describedby={fieldErrors.cellphone ? "error-cellphone" : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors.cellphone))}`} />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">11 digits starting with 09</span>
            {fieldErrors.cellphone && <span id="error-cellphone" role="alert" className="mt-1 block text-xs text-rose-600">{fieldErrors.cellphone}</span>}
          </label>
          {[
            ["addressCity", "City / Municipality"],
            ["addressProvince", "Province"],
          ].map(([key, label]) => (
            <label key={key} className="block text-sm font-medium text-slate-800">{label}
              {key === "addressCity" ? (
                <select id={`field-${key}`} value={applicantCityName(basicInfo[key])} onChange={(event) => updateBasic(key, event.target.value)} aria-invalid={Boolean(fieldErrors[key]) || undefined} aria-describedby={fieldErrors[key] ? `error-${key}` : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors[key]))}`}>
                  <option value="">Select…</option>
                  {Object.keys(PH_LOCATIONS).map((city) => <option key={city}>{city}</option>)}
                </select>
              ) : (
                <input id={`field-${key}`} value={basicInfo[key] || ""} readOnly aria-invalid={Boolean(fieldErrors[key]) || undefined} aria-describedby={fieldErrors[key] ? `error-${key}` : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors[key]))}`} />
              )}
              {fieldErrors[key] && <span id={`error-${key}`} role="alert" className="mt-1 block text-xs text-rose-600">{fieldErrors[key]}</span>}
            </label>
          ))}
        </section>
      )}
      {step === 11 && !isUpdate && (
        <section aria-label="Review and submit" className="space-y-3">
          <p className="text-sm text-slate-600">Review your uploaded NSRP form and basic information before creating your account.</p>
          {nsrpUpload && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{nsrpUpload.name}</p>
              <p className="text-xs text-slate-500">{nsrpUpload.type || "file"} • {Math.ceil(nsrpUpload.size / 1024)} KB</p>
              {nsrpUpload.type?.startsWith("image/") ? (
                <img src={URL.createObjectURL(nsrpUpload)} alt="Preview of your uploaded NSRP form" className="mt-2 max-h-72 rounded-lg border border-slate-200 object-contain" />
              ) : (
                <NsrpPdfPreview blob={nsrpUpload} blobUrl={URL.createObjectURL(nsrpUpload)} viewerClassName="mt-2 h-[40vh] min-h-[240px]" downloadName={nsrpUpload.name} />
              )}
              <button type="button" onClick={() => goToStep(9)} className="mt-2 rounded-lg border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-800">Replace file</button>
            </div>
          )}
          <dl className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
            <div><dt className="inline font-semibold">Name: </dt><dd className="inline">{[basicInfo.firstName, basicInfo.middleName, basicInfo.lastName, basicInfo.suffix].filter(Boolean).join(" ")}</dd></div>
            <div><dt className="inline font-semibold">Date of birth: </dt><dd className="inline">{basicInfo.dob}</dd></div>
            <div><dt className="inline font-semibold">Cellphone: </dt><dd className="inline">{basicInfo.cellphone}</dd></div>
            <div><dt className="inline font-semibold">Location: </dt><dd className="inline">{[basicInfo.addressCity, basicInfo.addressProvince].filter(Boolean).join(", ")}</dd></div>
          </dl>
          <button type="button" onClick={() => goToStep(10)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit basic information</button>
        </section>
      )}
      {step === 0 && !isUpdate && (
        <>
          <label className="block text-sm font-medium text-slate-800">Email<input id="field-email" type="email" autoComplete="email" value={email} onChange={(event) => changeEmail(event.target.value)} disabled={emailVerified} aria-invalid={Boolean(fieldErrors.accountEmail || fieldErrors.email) || undefined} aria-describedby={(fieldErrors.accountEmail || fieldErrors.email) ? "error-email" : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors.accountEmail || fieldErrors.email))} disabled:bg-slate-100 disabled:text-slate-500`} /></label>
          {(fieldErrors.accountEmail || fieldErrors.email) && <p id="error-email" role="alert" className="text-xs text-rose-600">{fieldErrors.accountEmail || fieldErrors.email}</p>}
          {emailVerified ? (
            <div className="flex items-center gap-3">
              <p role="status" className="flex items-center gap-1 text-sm font-semibold text-green-700">
                <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs text-white">✓</span>
                Email verified
              </p>
              <button type="button" onClick={() => changeEmail(email)} className="text-sm text-cyan-800">Change email</button>
            </div>
          ) : !codeSent ? (
            <button type="button" disabled={codeBusy} onClick={sendEmailCode} className="auth-secondary-button self-start">{codeBusy ? "Sending…" : "Send code"}</button>
          ) : (
            <section aria-label="Email verification code" className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-600">{codeInfo}</p>
              <div className="flex gap-2" onPaste={handleCodePaste}>
                {codeDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => { codeRefs.current[index] = element }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    aria-label={`Code digit ${index + 1}`}
                    value={digit}
                    onChange={(event) => handleCodeDigit(index, event.target.value)}
                    onKeyDown={(event) => handleCodeKeyDown(index, event)}
                    className="h-11 w-10 rounded-lg border border-slate-300 bg-white text-center text-lg font-semibold text-black"
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={codeBusy || codeDigits.join("").length !== 6} onClick={verifyEmailCode} className="auth-primary-button">{codeBusy ? "Checking…" : "Verify"}</button>
                <button type="button" disabled={codeBusy || resendIn > 0} onClick={sendEmailCode} className="auth-secondary-button">
                  {resendIn > 0 ? `Resend code (${resendIn}s)` : "Resend code"}
                </button>
                <button type="button" disabled={codeBusy} onClick={() => changeEmail(email)} className="text-sm text-cyan-800">Change email</button>
              </div>
            </section>
          )}
          <div><label htmlFor="field-password" className="block text-sm font-medium text-slate-800">Password</label><PasswordInput id="field-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fieldErrors.password) || undefined} aria-describedby={fieldErrors.password ? "error-password" : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors.password))}`} /></div>
          <PasswordChecklist password={password} confirmPassword={confirmPassword} />
          <div><label htmlFor="field-confirmPassword" className="block text-sm font-medium text-slate-800">Confirm password</label><PasswordInput id="field-confirmPassword" visibilityLabel="confirm password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={Boolean(fieldErrors.confirmPassword) || undefined} aria-describedby={fieldErrors.confirmPassword ? "error-confirmPassword" : undefined} className={`${inputClass}${inputErrorClass(Boolean(fieldErrors.confirmPassword))}`} /></div>
          {fieldErrors.password && <p id="error-password" role="alert" className="text-xs text-rose-600">{fieldErrors.password}</p>}
          {fieldErrors.confirmPassword && <p id="error-confirmPassword" role="alert" className="text-xs text-rose-600">{fieldErrors.confirmPassword}</p>}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
            <span>I agree to the collection and processing of my personal information and documents for account verification, including automatic image and consistency checks, in accordance with the Data Privacy Act of 2012 (RA 10173). These checks assess consistency and evidence, not authenticity.</span>
          </label>
          {fieldErrors.consent && <p role="alert" className="text-xs text-rose-600">{fieldErrors.consent}</p>}
        </>
      )}
      {step >= 1 && step <= 6 && (
        <section className="space-y-4">
          {NSRP_FIELDS[step - 1].length > 0 && <div className="grid gap-3 sm:grid-cols-2">{NSRP_FIELDS[step - 1].filter(([key]) => !FIELD_VISIBLE[key] || FIELD_VISIBLE[key](answers)).map(renderTextField)}</div>}
          {step === 2 && isPublic && <label className="block text-sm font-medium text-slate-800">Email *<input id="field-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); markStepInvalid(); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); setPreviewBlob(null) }} className={inputClass} aria-invalid={Boolean(fieldErrors.email) || undefined} />{fieldErrors.email && <span role="alert" className="text-xs text-rose-600">{fieldErrors.email}</span>}</label>}
          {step === 2 && answers.disability === "Others" && <div className="grid gap-3 sm:grid-cols-2">{renderTextField(["disabilityOthers", "Specify disability"])}</div>}
          {step === 4 && (
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Work experience (optional)</h3>
              {(answers.workExperience || []).map((row, index) => (
                <div key={`work-${index}`} className="grid gap-2 sm:grid-cols-2">
                  {ARRAY_SECTIONS.workExperience.fields.map(([key, label, type, options]) => {
                    if (key === "toDate" && row.toDate === "Present") return null
                    const rowError = fieldErrors[`workExperience[${index}].${key}`]
                    return (
                    <label key={key} className="text-xs font-medium text-slate-700">{label}
                      {type === "select" ? (
                        <select id={`field-workExperience-${index}-${key}`} value={row[key] || ""} onChange={(event) => updateRow("workExperience", index, key, event.target.value)} aria-invalid={Boolean(rowError) || undefined} aria-describedby={rowError ? `error-workExperience-${index}-${key}` : undefined} className={`${inputClass}${inputErrorClass(Boolean(rowError))}`}>
                          <option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input id={`field-workExperience-${index}-${key}`} type={type || "text"} maxLength={NSRP_ROW_LIMITS.workExperience[key]} value={row[key] || ""} onChange={(event) => updateRow("workExperience", index, key, event.target.value)} aria-invalid={Boolean(rowError) || undefined} aria-describedby={rowError ? `error-workExperience-${index}-${key}` : undefined} className={`${inputClass}${inputErrorClass(Boolean(rowError))}`} />
                      )}
                      {rowError && <span id={`error-workExperience-${index}-${key}`} role="alert" className="text-rose-600">{rowError}</span>}
                    </label>
                  )})}
                  <label className="flex items-center gap-1 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={row.toDate === "Present"} onChange={(event) => updateRow("workExperience", index, "toDate", event.target.checked ? "Present" : "")} />
                    Present (current job)
                  </label>
                  <button type="button" onClick={() => setAnswers((current) => ({ ...current, workExperience: current.workExperience.filter((_, rowIndex) => rowIndex !== index) }))} className="text-left text-xs text-rose-700">Remove row</button>
                </div>
              ))}
              {(answers.workExperience || []).length >= NSRP_SECTION_MAX_ROWS.workExperience ? (
                <p className="text-xs text-slate-500">Maximum of {NSRP_SECTION_MAX_ROWS.workExperience} entries</p>
              ) : (
                <button type="button" onClick={() => setAnswers((current) => ({ ...current, workExperience: [...(current.workExperience || []), Object.fromEntries(ARRAY_SECTIONS.workExperience.fields.map(([key]) => [key, ""]))] }))} className="text-xs font-semibold text-cyan-800">Add work experience</button>
              )}
              {fieldErrors.workExperience && <p role="alert" className="text-xs text-rose-600">{fieldErrors.workExperience}</p>}
            </section>
          )}
          {step === 3 && (
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Education</h3>
              {EDUCATION_LEVELS.map((level) => {
                const rows = answers.education || []
                const index = rows.findIndex((row) => row.level === level)
                const row = index >= 0 ? rows[index] : { level }
                const setEdu = (key, value) => {
                  const sanitizer = ROW_SANITIZERS[`education.${key}`]
                  const cleaned = sanitizer ? sanitizer(value) : value
                  const nextRows = [...rows]
                  const nextRow = { ...row, level, [key]: cleaned }
                  // "If undergraduate" fields apply only when the level was not finished
                  if (key === "year" && cleaned) {
                    nextRow.undergradLevel = ""
                    nextRow.yearLastAttended = ""
                  }
                  if (index >= 0) nextRows[index] = nextRow
                  else nextRows.push(nextRow)
                  setAnswers((current) => ({ ...current, education: nextRows }))
                  // Server errors are level-keyed: education[Tertiary].year
                  setFieldErrors((current) => ({ ...current, [`education[${level}].${key}`]: undefined }))
                  markStepInvalid()
                }
                const err = (key) => fieldErrors[`education[${level}].${key}`]
                const errId = (key) => `error-education-${level}-${key}`
                const eduInputProps = (key) => ({
                  id: `field-education-${level}-${key}`,
                  "aria-invalid": Boolean(err(key)) || undefined,
                  "aria-describedby": err(key) ? errId(key) : undefined,
                })
                const eduClass = (key) => `${inputClass}${inputErrorClass(Boolean(err(key)))}`
                const graduated = Boolean(row.year)
                // Courses apply only to Tertiary and Graduate Studies
                const courseApplicable = level === "Tertiary" || level === "Graduate Studies"
                return (
                  <fieldset key={level} className="space-y-2 rounded-lg border border-slate-200 p-2">
                    <legend className="px-1 text-xs font-semibold text-slate-700">{level}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-medium text-slate-700">School
                        <input {...eduInputProps("school")} maxLength={NSRP_ROW_LIMITS.education.school} value={row.school || ""} onChange={(event) => setEdu("school", event.target.value)} className={eduClass("school")} />
                        {err("school") && <span id={errId("school")} role="alert" className="text-rose-600">{err("school")}</span>}
                      </label>
                      <label className={`text-xs font-medium ${courseApplicable ? "text-slate-700" : "text-slate-400"}`}>Course / degree{courseApplicable && row.school ? <span className="text-rose-600"> *</span> : null}
                        <input
                          {...eduInputProps("course")}
                          disabled={!courseApplicable}
                          placeholder={courseApplicable ? undefined : "Not applicable"}
                          maxLength={NSRP_ROW_LIMITS.education.course}
                          value={courseApplicable ? row.course || "" : ""}
                          onChange={(event) => courseApplicable && setEdu("course", event.target.value)}
                          className={`${eduClass("course")} ${courseApplicable ? "" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}
                        />
                        {err("course") && <span id={errId("course")} role="alert" className="text-rose-600">{err("course")}</span>}
                      </label>
                      <label className="text-xs font-medium text-slate-700">Year graduated
                        <input {...eduInputProps("year")} inputMode="numeric" maxLength={4} value={row.year || ""} onChange={(event) => setEdu("year", event.target.value)} className={eduClass("year")} />
                        {err("year") && <span id={errId("year")} role="alert" className="text-rose-600">{err("year")}</span>}
                      </label>
                      {!graduated && (
                        <>
                          <label className="text-xs font-medium text-slate-700">If undergraduate, what level?
                            <input {...eduInputProps("undergradLevel")} maxLength={NSRP_ROW_LIMITS.education.undergradLevel} value={row.undergradLevel || ""} onChange={(event) => setEdu("undergradLevel", event.target.value)} className={eduClass("undergradLevel")} />
                          </label>
                          <label className="text-xs font-medium text-slate-700">Year last attended
                            <input {...eduInputProps("yearLastAttended")} inputMode="numeric" maxLength={4} value={row.yearLastAttended || ""} onChange={(event) => setEdu("yearLastAttended", event.target.value)} className={eduClass("yearLastAttended")} />
                            {err("yearLastAttended") && <span id={errId("yearLastAttended")} role="alert" className="text-rose-600">{err("yearLastAttended")}</span>}
                          </label>
                        </>
                      )}
                      <label className="text-xs font-medium text-slate-700">Awards received
                        <input {...eduInputProps("awards")} maxLength={NSRP_ROW_LIMITS.education.awards} value={row.awards || ""} onChange={(event) => setEdu("awards", event.target.value)} className={eduClass("awards")} />
                        {err("awards") && <span id={errId("awards")} role="alert" className="text-rose-600">{err("awards")}</span>}
                      </label>
                    </div>
                  </fieldset>
                )
              })}
              {fieldErrors.education && <p role="alert" className="text-xs text-rose-600">{fieldErrors.education}</p>}
            </section>
          )}
          {step === 3 && Object.entries(ARRAY_SECTIONS).filter(([section]) => section !== "workExperience" && section !== "education").map(([section, config]) => (
            <fieldset key={section} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-800">{config.title} (max {NSRP_SECTION_MAX_ROWS[section]})</legend>
              {(answers[section] || []).map((row, index) => (
                <div key={`${section}-${index}`} className="grid gap-2 sm:grid-cols-2">
                  {config.fields.map(([key, label, type, options]) => {
                    const rowError = fieldErrors[`${section}[${index}].${key}`]
                    return (
                    <label key={key} className="text-xs font-medium text-slate-700">{label}
                      {type === "select" ? (
                        <select id={`field-${section}-${index}-${key}`} value={row[key] || ""} onChange={(event) => updateRow(section, index, key, event.target.value)} aria-invalid={Boolean(rowError) || undefined} aria-describedby={rowError ? `error-${section}-${index}-${key}` : undefined} className={`${inputClass}${inputErrorClass(Boolean(rowError))}`}>
                          <option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input id={`field-${section}-${index}-${key}`} type={type || "text"} maxLength={NSRP_ROW_LIMITS[section]?.[key]} value={row[key] || ""} onChange={(event) => updateRow(section, index, key, event.target.value)} aria-invalid={Boolean(rowError) || undefined} aria-describedby={rowError ? `error-${section}-${index}-${key}` : undefined} className={`${inputClass}${inputErrorClass(Boolean(rowError))}`} />
                      )}
                      {rowError && <span id={`error-${section}-${index}-${key}`} role="alert" className="text-rose-600">{rowError}</span>}
                    </label>
                  )})}
                  <button type="button" onClick={() => setAnswers((current) => ({ ...current, [section]: current[section].filter((_, rowIndex) => rowIndex !== index) }))} className="text-left text-xs text-rose-700">Remove row</button>
                </div>
              ))}
              {(answers[section] || []).length >= NSRP_SECTION_MAX_ROWS[section] ? (
                <p className="text-xs text-slate-500">Maximum of {NSRP_SECTION_MAX_ROWS[section]} entries</p>
              ) : (
                <button type="button" onClick={() => setAnswers((current) => ({ ...current, [section]: [...(current[section] || []), Object.fromEntries(config.fields.map(([key]) => [key, ""]))] }))} className="text-xs font-semibold text-cyan-800">Add {config.title.toLowerCase()} row</button>
              )}
              {fieldErrors[section] && <p role="alert" className="text-xs text-rose-600">{fieldErrors[section]}</p>}
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
                    const updated = key === 'all' ? { ...row, name, read: value, write: value, speak: value, understand: value } : { ...row, name, [key]: value }
                    if (index >= 0) next[index] = updated
                    else next.push(updated)
                    updateAnswer("languages", next)
                    if (!Object.keys(validateNsrpLanguages(next)).length) setFieldErrors((current) => ({ ...current, 'languages[Others].otherName': undefined }))
                  }
                  const otherError = name === 'Others' ? fieldErrors['languages[Others].otherName'] : undefined
                  return <div key={name} role="group" aria-label={`${name} proficiency`} className="grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-[4rem_minmax(0,1fr)]">
                    <span className="font-medium sm:pt-1">{name}</span>
                    <div className="min-w-0 space-y-2">
                      {name === "Others" && <label className="block">
                        <span className="sr-only">Other language</span>
                        <input id="field-languages-Others-otherName" value={row.otherName || ""} maxLength={NSRP_ROW_LIMITS.languages.name} onChange={(event) => setLanguage("otherName", event.target.value)} placeholder="Specify other language" aria-invalid={Boolean(otherError)} aria-describedby={otherError ? 'other-language-error' : undefined} className={`shared-form-control w-full min-w-0 rounded border border-slate-300 px-2 py-1${inputErrorClass(otherError)}`} />
                      </label>}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 min-[480px]:grid-cols-4">
                        <label className="col-span-2 inline-flex items-center gap-1.5 font-medium min-[480px]:col-span-4"><input type="checkbox" aria-label={`Select all ${name} proficiencies`} checked={['read', 'write', 'speak', 'understand'].every(key => Boolean(row[key]))} onChange={event => setLanguage('all', event.target.checked)} />Select all</label>
                        {["read", "write", "speak", "understand"].map((key) => <label key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={Boolean(row[key])} onChange={(event) => setLanguage(key, event.target.checked)} className="shrink-0" />{key}</label>)}
                      </div>
                      {otherError && <p id="other-language-error" role="alert" className="text-xs text-rose-700">{otherError}</p>}
                    </div>
                  </div>
                })}
              </div>
            </section>
            <NsrpSkillsField skills={answers.skills || []} othersText={answers.othersText || ''} onChange={next => { updateAnswer('skills', next.skills); updateAnswer('othersText', next.othersText) }} />
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
          <VerificationDocumentsForm docs={docs} setDocs={setDocs} disabled={busy} fieldErrors={fieldErrors} nsrp={answers} />
          <section className="mt-4 rounded-xl border border-slate-200 p-3">
            <label className="block text-sm font-semibold">Resume (optional)<input ref={resumeInputRef} type="file" accept={RESUME_ACCEPT} disabled={busy} onChange={event => { const next = event.target.files?.[0] || null; setResume(next); setFieldErrors(current => ({ ...current, resume: next ? resumeError(next) : undefined })) }} className="mt-2 block w-full text-sm" /></label>
            <p className="mt-2 text-xs text-slate-500">PDF or DOCX, up to 5 MB. Employers reviewing your profile can view it. You can also add or replace it later from the Profile menu.</p>
            {resume && <button type="button" disabled={busy} onClick={() => { setResume(null); if (resumeInputRef.current) resumeInputRef.current.value = ''; setFieldErrors(current => ({ ...current, resume: undefined })) }} className="mt-2 text-sm text-rose-700">Remove selected resume</button>}
            {fieldErrors.resume && <p role="alert" className="mt-2 text-xs text-rose-700">{fieldErrors.resume}</p>}
          </section>
        </>
      )}
      {step === 8 && (
        <div className="space-y-3">
          {(() => {
            if (isPublic) return null
            const previewPos = flow.indexOf(8)
            const invalidSteps = []
            for (let p = 0; p < previewPos; p += 1) if (!posOk(p)) invalidSteps.push(flow[p])
            if (invalidSteps.length === 0) return null
            const fixStep = (target) => {
              setStep(target)
              setPreviewUrl("")
              setPreviewBlob(null)
              setTimeout(() => {
                const keys = target >= 1 && target <= 6 ? stepErrors[target - 1] : []
                const firstKey = keys.find((key) => fieldErrors[key]) || keys[0]
                if (firstKey) document.getElementById(`field-${firstKey}`)?.focus()
              }, 50)
            }
            return (
              <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
                <p className="font-semibold">Some steps need attention before you can submit:</p>
                <ul className="mt-1 space-y-1">
                  {invalidSteps.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-2">
                      <span>{stepTitle(id)}</span>
                      <button type="button" onClick={() => fixStep(id)} className="rounded border border-rose-400 px-2 py-0.5 text-xs font-semibold text-rose-700">Fix</button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}
          <p className="text-sm text-slate-600">Review your generated NSRP PDF. Use Edit to return to a step. Print-fit warnings are informational and won't block submission.</p>
          {!answers.signatureDataUrl && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">No signature added; you can sign the printed copy by hand.</p>}
          <NsrpPdfPreview blob={previewBlob} blobUrl={previewUrl} loading={busy} error={!previewUrl ? error : ""} onRetry={generatePreview} viewerClassName="h-[55vh] min-h-[360px]" downloadName="NSRP-Registration-Form.pdf" />
          <NsrpWarningPanel warnings={warnings} onFix={fixWarning} onFixAllCutOff={() => fixWarning(warnings.find((warning) => warning.reason === "truncated")?.field || "")} />
          <NsrpDoubleCheckPanel answers={{ ...answers, email }} onFix={target => { setStep(target); setPreviewUrl(''); setPreviewBlob(null) }} />
          <div className="flex flex-wrap gap-2">{STEP_NAMES.slice(1, 7).map((name, index) => <button key={name} type="button" onClick={() => { setStep(index + 1); setPreviewUrl(""); setPreviewBlob(null) }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-cyan-800">Edit {name}</button>)}</div>
          <button type="button" onClick={isPublic ? generatePreview : openFinalStep} disabled={busy} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm font-semibold text-cyan-800">Regenerate preview</button>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" disabled={busy} onClick={() => flowPos <= 0 ? (isUpdate || isPublic ? onCancel?.() : discard()) : setStep(flow[flowPos - 1])} className="auth-secondary-button">{flowPos <= 0 ? "Cancel" : "Back"}</button>
        {!isUpdate && !isPublic && <button type="button" onClick={discard} className="text-sm font-medium text-rose-700 underline">Discard and start over</button>}
        {step !== 8 && step !== 11 ? (
          <button type="button" disabled={busy || (step === 0 && !isUpdate && !emailVerified)} onClick={next} className="auth-primary-button">{busy ? "Validating…" : (((isUpdate || isPublic) && step === 6) || (!isUpdate && step === 7 && nsrpMode !== "upload")) ? "Generate preview" : "Next"}</button>
        ) : isPublic ? <button type="button" onClick={onCancel} className="auth-secondary-button">Back to home</button> : (
          <button type="submit" disabled={busy || (step === 8 && !previewUrl)} className="auth-primary-button">{busy ? (isUpdate ? "Saving…" : "Creating account…") : isUpdate ? "Save NSRP" : "Create account"}</button>
        )}
      </div>
    </form>
  )
}
