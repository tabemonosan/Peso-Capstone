import { useRef, useState } from 'react'
import { API_URL } from '../config'
import { CSM_TEXT, CSM_QUESTION_KEYS, CSM_RATING_VALUES, validateCsmResponse } from '../../shared/csmQuestionnaire.js'
import { todayInManila } from '../../shared/nsrpValidation.js'
import ConfirmDialog from './ConfirmDialog'

function RadioQuestion({ id, label, value, options, onChange, error, disabled = false }) {
  return <fieldset id={`csm-${id}`} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `csm-error-${id}` : undefined} className="csm-question rounded-xl border border-slate-200 p-4">
    <legend className="px-1 text-sm font-semibold text-slate-900">{label}</legend>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option) => <label key={option.value} className={`csm-radio-option flex items-start gap-2 rounded-xl border p-3 text-sm ${value === option.value ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white'}`}>
        <input type="radio" name={`csm-${id}`} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="mt-1 shrink-0" />
        <span>{option.label}</span>
      </label>)}
    </div>
    {error && <p id={`csm-error-${id}`} role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </fieldset>
}

export default function CsmQuestionnaireForm({ language, token, onCancel, onSubmitted }) {
  const t = CSM_TEXT[language]
  const [answers, setAnswers] = useState({ language, date: todayInManila(), clientType: '', sex: '', age: '', name: '', address: '', email: '', cc1: '', cc2: '', cc3: '', ratings: {}, suggestions: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [discard, setDiscard] = useState(false)
  const [submissionKey] = useState(() => crypto.randomUUID())
  const inFlight = useRef(false)
  const change = (key, value) => {
    setDirty(true)
    setAnswers((current) => {
      if (key.startsWith('ratings.')) return { ...current, ratings: { ...current.ratings, [key.split('.')[1]]: value } }
      if (key === 'cc1') return { ...current, cc1: value, cc2: value === '4' ? '5' : '', cc3: value === '4' ? '4' : '' }
      return { ...current, [key]: value }
    })
    setErrors((current) => ({ ...current, [key]: undefined, ...(key === 'cc1' ? { cc2: undefined, cc3: undefined } : {}) }))
    setError('')
  }
  const showErrors = (fieldErrors) => {
    setErrors(fieldErrors)
    const first = Object.keys(fieldErrors)[0]
    requestAnimationFrame(() => {
      const target = document.getElementById(`csm-${first?.replace('.', '-')}`)
      target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      const input = target?.matches('input, textarea') ? target : target?.querySelector('input, textarea')
      input?.focus()
    })
  }
  const submit = async (event) => {
    event.preventDefault()
    if (inFlight.current) return
    const { values, fieldErrors } = validateCsmResponse(answers)
    if (Object.keys(fieldErrors).length) { showErrors(fieldErrors); return }
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/api/csm/responses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': submissionKey }, body: JSON.stringify(values) })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.fieldErrors) showErrors(data.fieldErrors)
        throw new Error(data?.error || (language === 'tl' ? 'Hindi naisumite ang puna. Subukan muli.' : 'Unable to submit feedback. Please try again.'))
      }
      setReceipt(data)
      setDirty(false)
      onSubmitted?.(t.success)
    } catch (err) { setError(err.message) } finally { inFlight.current = false; setBusy(false) }
  }
  const field = (key, label, type = 'text', maxLength, required = false) => <label key={key} className="block text-sm font-medium text-slate-800">
    {label}{required && <span className="text-rose-600"> *</span>}
    <input id={`csm-${key}`} type={type} value={answers[key]} onChange={(event) => change(key, key === 'age' ? event.target.value.replace(/\D/g, '').slice(0, 3) : event.target.value)} maxLength={maxLength} inputMode={key === 'age' ? 'numeric' : undefined} min={type === 'date' ? '2000-01-01' : undefined} max={type === 'date' ? todayInManila() : undefined} aria-required={required} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `csm-error-${key}` : undefined} className="shared-form-control" />
    {errors[key] && <span id={`csm-error-${key}`} role="alert" className="mt-1 block text-xs text-rose-700">{errors[key]}</span>}
  </label>
  const numbered = (options) => options.map((label, index) => ({ value: String(index + 1), label: `${index + 1}. ${label}` }))

  if (receipt) return <section lang={language === 'tl' ? 'fil' : 'en'} className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
    <h3 role="status" className="text-lg font-semibold text-emerald-900">{t.success}</h3>
    <p className="mt-3 text-sm">{t.reference}: <strong>{receipt.reference}</strong></p>
    <p className="mt-1 text-sm">{t.submitted}: {new Date(receipt.submittedAt).toLocaleString(language === 'tl' ? 'fil-PH' : 'en-PH', { timeZone: 'Asia/Manila' })}</p>
    <button type="button" onClick={onCancel} className="mt-4 rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">{t.another}</button>
  </section>

  return <div lang={language === 'tl' ? 'fil' : 'en'} className="mt-6">
    <button type="button" disabled={busy} onClick={() => dirty ? setDiscard(true) : onCancel()} className="mb-4 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">{t.back}</button>
    <h3 className="text-lg font-semibold">{t.title}</h3>
    <p className="mt-2 text-sm text-slate-600">{t.introduction}</p>
    <p className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">{t.voluntary}</p>
    <form noValidate onSubmit={submit} className="csm-online-form mt-5 space-y-6">
      <fieldset disabled={busy} className="space-y-6">
        <section className="space-y-4" aria-labelledby="csm-respondent-title">
          <h4 id="csm-respondent-title" className="font-semibold">{t.respondent}</h4>
          <p className="text-xs text-slate-600">{t.required}</p>
          <RadioQuestion id="clientType" label={t.clientType} value={answers.clientType} options={['citizen', 'business', 'government'].map((value, index) => ({ value, label: t.clientTypes[index] }))} onChange={(value) => change('clientType', value)} error={errors.clientType} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field('date', t.date, 'date', undefined, true)}{field('age', t.age, 'text', 3, true)}</div>
          <RadioQuestion id="sex" label={t.sex} value={answers.sex} options={['male', 'female'].map((value, index) => ({ value, label: t.sexes[index] }))} onChange={(value) => change('sex', value)} error={errors.sex} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field('name', t.name, 'text', 150)}{field('email', t.email, 'email', 254)}</div>
          {field('address', t.address, 'text', 250)}
        </section>
        <section className="space-y-4" aria-labelledby="csm-charter-title">
          <h4 id="csm-charter-title" className="font-semibold">{t.charter}</h4>
          <p className="text-sm text-slate-600">{t.charterInstructions}</p>
          <RadioQuestion id="cc1" label={t.cc1} value={answers.cc1} options={numbered(t.cc1Options)} onChange={(value) => change('cc1', value)} error={errors.cc1} />
          {answers.cc1 === '4' && <p role="status" className="text-sm text-cyan-800">{t.charterSkipped}</p>}
          <RadioQuestion id="cc2" label={t.cc2} value={answers.cc1 === '4' ? '5' : answers.cc2} options={numbered(t.cc2Options)} onChange={(value) => change('cc2', value)} error={errors.cc2} disabled={answers.cc1 === '4'} />
          <RadioQuestion id="cc3" label={t.cc3} value={answers.cc1 === '4' ? '4' : answers.cc3} options={numbered(t.cc3Options)} onChange={(value) => change('cc3', value)} error={errors.cc3} disabled={answers.cc1 === '4'} />
        </section>
        <section className="space-y-4" aria-labelledby="csm-quality-title">
          <h4 id="csm-quality-title" className="font-semibold">{t.quality}</h4>
          <p className="text-sm text-slate-600">{t.qualityInstructions}</p>
          {CSM_QUESTION_KEYS.map((key, index) => <RadioQuestion key={key} id={`ratings-${key}`} label={`${key}. ${t.questions[index]}`} value={answers.ratings[key]} options={CSM_RATING_VALUES.map((value, option) => ({ value, label: t.ratingLabels[option] }))} onChange={(value) => change(`ratings.${key}`, value)} error={errors[`ratings.${key}`]} />)}
        </section>
        <label className="block text-sm font-medium">{t.suggestions}<textarea id="csm-suggestions" maxLength={2000} rows={4} value={answers.suggestions} onChange={(event) => change('suggestions', event.target.value)} aria-invalid={Boolean(errors.suggestions)} className="shared-form-control" />{errors.suggestions && <span role="alert" className="mt-1 block text-xs text-rose-700">{errors.suggestions}</span>}</label>
        <p className="text-xs text-slate-500">{t.staff}</p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-full bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? t.submitting : t.submit}</button>
      </fieldset>
    </form>
    {discard && <ConfirmDialog title={language === 'tl' ? 'Iwan ang hindi pa naisumiteng sagot?' : 'Leave your unsubmitted answers?'} note={language === 'tl' ? 'Hindi mase-save ang mga sagot na ito.' : 'These answers have not been submitted and will be discarded.'} confirmLabel={language === 'tl' ? 'Oo, bumalik' : 'Leave questionnaire'} confirmTone="danger" onConfirm={onCancel} onCancel={() => setDiscard(false)} />}
  </div>
}
