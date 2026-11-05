import { resumeError } from '../../shared/resume.js'
import { useEffect, useState } from 'react'
import OverlayModal from './OverlayModal'
import { APPLICATION_STEPS, validateJobApplication, bachelorDegreeFromNsrp } from '../../shared/jobApplication.js'
import { API_URL } from '../config'
import { applicationDraftKey, readApplicationDraft, saveApplicationDraft, loadApplicationResume, saveApplicationResume, clearApplicationDraft } from '../utils/jobApplicationDraft'

const control = 'shared-form-control mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900'
const fields = [['email', 'mobile'], ['resume'], ['hasExperience', 'experience']]

export default function JobApplicationWizard({ job, currentUser, token, onClose, onSubmit }) {
  const draftKey = applicationDraftKey(currentUser, job)
  const [draft] = useState(() => readApplicationDraft(draftKey))
  const [step, setStep] = useState(draft.step || 0)
  const [answers, setAnswers] = useState({ email: currentUser?.email || '', mobile: currentUser?.phone || currentUser?.profile?.phone || currentUser?.profile?.nsrp?.cellphone || '', hasExperience: '', experience: '', ...draft.answers })
  const [resume, setResume] = useState(null)
  const [usingProfileResume, setUsingProfileResume] = useState(false)
  const [restoringResume, setRestoringResume] = useState(Boolean((draftKey && globalThis.indexedDB) || token))
  const [draftWarning, setDraftWarning] = useState(''), [resumeWarning, setResumeWarning] = useState('')
  const [errors, setErrors] = useState({}), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [checkedEmail, setCheckedEmail] = useState('')
  const [degree, setDegree] = useState(() => bachelorDegreeFromNsrp(currentUser?.profile))
  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch(`${API_URL}/api/profile/qualifications`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        if (!response.ok) return
        const result = await response.json()
        if (!cancelled && ['Yes', 'No'].includes(result.bachelorDegree)) setDegree(result.bachelorDegree)
      }).catch(() => {})
    return () => { cancelled = true }
  }, [token])
  useEffect(() => {
    setDraftWarning(saveApplicationDraft(draftKey, answers, step) ? '' : 'Your draft could not be saved on this device. Keep this form open to retain your answers.')
  }, [draftKey, answers, step])
  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      if (draftKey && globalThis.indexedDB) {
        try {
          const saved = await loadApplicationResume(draftKey)
          if (saved) { if (resumeError(saved)) throw new Error('Invalid saved resume'); if (!cancelled) setResume(saved); return }
        } catch {
          if (!cancelled) setResumeWarning('Your saved resume could not be restored. Please check the selected resume before submitting.')
        }
      }
      if (!token) return
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const response = await fetch(`${API_URL}/api/profile/resume`, { headers })
        if (!response.ok) throw new Error()
        const { resumeFile } = await response.json()
        if (!resumeFile) return
        const applicantId = currentUser?.id || currentUser?._id
        if (!applicantId) throw new Error()
        const download = await fetch(`${API_URL}/api/applicants/${applicantId}/resume`, { headers })
        if (!download.ok) throw new Error()
        const file = new File([await download.blob()], resumeFile.originalName, { type: resumeFile.mimetype })
        if (resumeError(file)) throw new Error('Invalid profile resume')
        if (!cancelled) { setResume(file); setUsingProfileResume(true) }
      } catch {
        if (!cancelled) setResumeWarning('Your profile resume could not be loaded. You can choose a file below to continue.')
      }
    }
    restore().finally(() => { if (!cancelled) setRestoringResume(false) })
    return () => { cancelled = true }
  }, [draftKey, token, currentUser?.id, currentUser?._id])
  const selectResume = (file) => {
    if (!file) return
    setResume(file); setUsingProfileResume(false); setErrors({}); setError(''); setResumeWarning('')
    saveApplicationResume(draftKey, file).catch(() => setResumeWarning('Your resume could not be saved on this device. Please select it again if you reopen or refresh the form.'))
  }
  const change = (field, value) => {
    if (field === 'email') setCheckedEmail('')
    setAnswers((old) => ({ ...old, [field]: value, ...(field === 'hasExperience' && value === 'No' ? { experience: '' } : {}) }))
    setErrors((old) => ({ ...old, [field]: undefined })); setError('')
  }
  const move = async (target) => {
    const validation = validateJobApplication(answers, resume, currentUser?.profile)
    const relevant = target === 3 ? Object.keys(validation.errors) : target > step ? fields[step] || [] : []
    const invalid = relevant.filter((key) => validation.errors[key])
    setErrors(Object.fromEntries(invalid.map((key) => [key, validation.errors[key]])))
    setError('')
    if (invalid.length) {
      if (target === 3) setStep(Math.max(0, fields.findIndex((keys) => keys.includes(invalid[0]))))
      return
    }
    if (target > step && validation.value.email !== checkedEmail) {
      setBusy(true)
      try {
        const response = await fetch(`${API_URL}/api/applications/validate-email`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: validation.value.email }) })
        const result = await response.json()
        if (!response.ok || result.valid !== true) {
          setErrors({ email: result.error || 'The email domain could not be checked. Please try again.' }); setStep(0); return
        }
        setCheckedEmail(validation.value.email)
      } catch { setErrors({ email: 'The email domain could not be checked. Please try again.' }); setStep(0); return }
      finally { setBusy(false) }
    }
    setStep(target)
  }
  const submit = async () => {
    const validation = validateJobApplication(answers, resume, currentUser?.profile)
    if (Object.keys(validation.errors).length) { move(3); return }
    setBusy(true); setError('')
    try {
      const result = await onSubmit(job._id, { ...validation.value, bachelorDegree: degree, resume })
      if (result === true || result?.ok) { await clearApplicationDraft(draftKey); onClose() }
      else {
        setError(result?.error || 'Your application could not be submitted. Try again.')
        if (result?.fieldErrors) {
          setErrors(result.fieldErrors)
          const firstInvalidStep = fields.findIndex((keys) => keys.some((key) => result.fieldErrors[key]))
          if (firstInvalidStep >= 0) setStep(firstInvalidStep)
        }
      }
    } catch { setError('Your application could not be submitted. Try again.') }
    finally { setBusy(false) }
  }
  const fieldError = (key) => errors[key] ? <p id={`application-error-${key}`} role="alert" className="mt-1 text-xs text-rose-700">{errors[key]}</p> : null
  const attributes = (key) => ({ 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? `application-error-${key}` : undefined })
  return <OverlayModal onClose={onClose} closeDisabled={busy} labelledBy="job-application-title" header={<>
    <div className="flex items-start justify-between gap-4"><div><h2 id="job-application-title" className="text-xl font-bold text-slate-900">Apply for {job.title}</h2><p className="mt-1 text-sm text-slate-600">Complete your contact details, upload your resume, and review your application.</p></div><button type="button" disabled={busy} onClick={onClose} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">Close</button></div>
    <nav aria-label="Application steps" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{APPLICATION_STEPS.map((name, index) => <button type="button" key={name} aria-current={step === index ? 'step' : undefined} disabled={busy} onClick={() => move(index)} className={`rounded-xl px-3 py-3 text-sm font-semibold ${step === index ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{index + 1}. {name}</button>)}</nav>
  </>} footer={<div className="flex items-center justify-between gap-3"><button type="button" disabled={busy} onClick={() => step ? move(step - 1) : onClose()} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800">{step ? 'Back' : 'Cancel'}</button><button type="button" disabled={busy || restoringResume} onClick={step === 3 ? submit : () => move(step + 1)} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{restoringResume ? 'Restoring resume...' : busy ? (step === 3 ? 'Submitting...' : 'Checking email...') : step === 3 ? 'Submit application' : 'Next'}</button></div>}>
    <div className="space-y-5 text-slate-900">
      {draftWarning || resumeWarning ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{draftWarning || resumeWarning}</p> : <p className="text-xs text-slate-600">Your progress is saved automatically on this device for this job.</p>}
      <h3 className="font-semibold">Step {step + 1}: {APPLICATION_STEPS[step]}</h3>
      {step === 0 && <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="application-email" className="text-sm font-medium">Email</label><input id="application-email" disabled={busy} type="email" autoComplete="email" value={answers.email} onChange={(e) => change('email', e.target.value)} {...attributes('email')} className={control} />{fieldError('email')}</div><div><label htmlFor="application-mobile" className="text-sm font-medium">Mobile number</label><input id="application-mobile" disabled={busy} type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[0-9]{11}" maxLength={11} value={answers.mobile} onChange={(e) => change('mobile', e.target.value.replace(/\D/g, '').slice(0, 11))} {...attributes('mobile')} className={control} /><p className="mt-1 text-xs text-slate-600">Exactly 11 digits, numbers only.</p>{fieldError('mobile')}</div></div>}
      {step === 1 && <div>
        {resume && <p className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">{usingProfileResume ? 'Using your profile resume' : 'Selected resume'}: <strong>{resume.name}</strong></p>}
        <label htmlFor="application-resume" className="text-sm font-medium">Resume</label><input id="application-resume" type="file" accept=".pdf,.docx" disabled={busy || restoringResume} onChange={(e) => selectResume(e.target.files?.[0] || null)} {...attributes('resume')} className={control} />
        <p className="mt-2 text-xs text-slate-600">{resume ? 'Choose another file to replace it for this application. Your profile resume will stay the same. ' : ''}PDF or DOCX, up to 5 MB. Your resume will be shared with this job's employer.</p>{fieldError('resume')}
      </div>}
      {step === 2 && <div className="space-y-5">{[['hasExperience', 'Do you have work experience?']].map(([key, label]) => <div key={key}><label htmlFor={`application-${key}`} className="text-sm font-medium">{label}</label><select id={`application-${key}`} value={answers[key]} onChange={(e) => change(key, e.target.value)} {...attributes(key)} className={control}><option value="">Select...</option><option>Yes</option><option>No</option></select>{fieldError(key)}</div>)}{answers.hasExperience === 'Yes' && <div><label htmlFor="application-experience" className="text-sm font-medium">Briefly describe your experience</label><input id="application-experience" value={answers.experience} maxLength={20} onChange={(e) => change('experience', e.target.value)} {...attributes('experience')} className={control} /><p className="mt-1 text-xs text-slate-600">{answers.experience.length}/20 characters</p>{fieldError('experience')}</div>}</div>}
      {step === 3 && <><dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">{[['Email', answers.email], ['Mobile number', answers.mobile], ['Resume', resume?.name], ['College graduate (NSRP)', degree], ['Work experience', answers.hasExperience], ...(answers.hasExperience === 'Yes' ? [['Experience', answers.experience]] : [])].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}</dl><p className="text-sm text-slate-600">By submitting, you agree that your contact details, resume, qualifications, and verified profile summary will be shared with this job's employer when your application is delivered.</p></>}
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </div>
  </OverlayModal>
}
