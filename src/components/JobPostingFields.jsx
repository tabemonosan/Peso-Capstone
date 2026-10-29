import { useRef, useState } from 'react'
import CityProvinceFields from './CityProvinceFields'
import JobTitlePicker from './JobTitlePicker'
import { LOCATION_TYPES, EMPLOYMENT_TYPES, PAY_FREQUENCIES, EDUCATION_LEVELS, EXPERIENCE_LEVELS, JOB_LIMITS, deadlineBounds, validateJobPosting, formatSalary, formatLocation, parseAmount } from '../../shared/jobPosting.js'
import { minimumWageWarning } from '../../shared/minimumWage.js'

const control = 'shared-form-control mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black disabled:opacity-50'
const digits = (value) => String(value ?? '').replace(/\D/g, '')
const money = (value) => digits(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export default function JobPostingFields({ value, onChange, categories, suggestions = [], errors = {}, setErrors, disabled = false, keepDeadline = '', registeredAddress = {}, id = 'request' }) {
  const [focusedAmount, setFocusedAmount] = useState('')
  const [skill, setSkill] = useState('')
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [activeSkill, setActiveSkill] = useState(0)
  const skillInputRef = useRef(null)
  const [preview, setPreview] = useState(false)
  const set = (key, next) => onChange({ ...value, [key]: next })
  const blur = (key) => {
    const result = validateJobPosting(value, { keepDeadline })
    setErrors?.((current) => ({ ...current, [key]: result.errors[key] || '' }))
  }
  const error = (key) => errors[key] && <p id={`${id}-${key}-error`} role="alert" className="mt-1 text-xs text-rose-700">{errors[key]}</p>
  const field = (key, label, { options, textarea, required = false, ...props } = {}) => <div key={key}>
    <label htmlFor={`${id}-${key}`} className="block text-sm font-medium text-black">{label}{required ? ' *' : ''}</label>
    {options ? <select id={`${id}-${key}`} className={control} value={value[key] || ''} onChange={(e) => set(key, e.target.value)} onBlur={() => blur(key)} disabled={disabled} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} required={required}><option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}</select>
      : textarea ? <><textarea id={`${id}-${key}`} className={control} rows={3} value={value[key] || ''} onChange={(e) => set(key, e.target.value)} onBlur={() => blur(key)} disabled={disabled} aria-invalid={Boolean(errors[key])} aria-describedby={`${id}-${key}-count${errors[key] ? ` ${id}-${key}-error` : ''}`} required={required} {...props} /><p id={`${id}-${key}-count`} className="mt-1 text-right text-xs text-slate-500">{(value[key] || '').length}/{props.maxLength}</p></>
        : <input id={`${id}-${key}`} className={control}
          value={key.startsWith('salary') && focusedAmount !== key ? money(value[key]) : (value[key] ?? '')}
          onFocus={() => { if (key.startsWith('salary')) setFocusedAmount(key) }}
          onChange={(e) => set(key, key.startsWith('salary') || key === 'slots' ? digits(e.target.value) : e.target.value)}
          onPaste={key.startsWith('salary') || key === 'slots' ? (e) => {
            e.preventDefault()
            const input = e.currentTarget
            const next = input.value.slice(0, input.selectionStart ?? 0) + e.clipboardData.getData('text') + input.value.slice(input.selectionEnd ?? input.value.length)
            set(key, digits(next))
          } : undefined}
          onBlur={() => { setFocusedAmount(''); blur(key) }} disabled={disabled || (key.startsWith('salary') && value.negotiable)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} required={required} {...props} />}

    {error(key)}
  </div>
  const addSkill = (candidate = skill) => {
    const next = candidate.trim()
    if (!next) return
    if (next.length > JOB_LIMITS.skillMax || value.skills.length >= JOB_LIMITS.skillsMax) { setErrors?.((current) => ({ ...current, skills: 'Use up to 30 skills, each 60 characters or fewer.' })); return }
    if (!value.skills.some((item) => item.toLowerCase() === next.toLowerCase())) set('skills', [...value.skills, next])
    setSkill('')
    setErrors?.((current) => ({ ...current, skills: '' }))
  }
  const skillOptions = [...new Map(suggestions.filter((item) => typeof item === 'string' && item.trim()).map((item) => [item.trim().toLowerCase(), item.trim()])).values()]
    .filter((item) => item.toLowerCase().includes(skill.trim().toLowerCase()))
  const selectSkill = (item) => {
    const selected = value.skills.some((entry) => entry.toLowerCase() === item.toLowerCase())
    if (selected) set('skills', value.skills.filter((entry) => entry.toLowerCase() !== item.toLowerCase()))
    else addSkill(item)
    setSkillsOpen(true)
    skillInputRef.current?.focus()
  }
  const bounds = deadlineBounds()
  const warning = !value.negotiable ? minimumWageWarning(parseAmount(value.salaryMin), value.payFrequency, value.province) : ''
  return <div className="mt-4 space-y-6 text-black">
    <p className="text-xs text-slate-600">* Required fields</p>
    <fieldset disabled={disabled} className="space-y-4"><legend className="mb-3 text-base font-semibold">Job Details</legend>
      <JobTitlePicker id={`${id}-title`} categories={categories} title={value.title} customTitle={value.customTitle} onChange={(next) => onChange({ ...value, ...next })} disabled={disabled} onBlur={() => blur('title')} error={errors.title} />
      {field('description', 'Description', { textarea: true, required: true, maxLength: JOB_LIMITS.descriptionMax })}
      <div className="grid gap-4 sm:grid-cols-2">{field('locationType', 'Location type', { options: LOCATION_TYPES, required: true })}{field('employmentType', 'Employment type', { options: EMPLOYMENT_TYPES, required: true })}
        {value.locationType !== 'Remote' && <>
          <CityProvinceFields id={id} city={value.city} province={value.province} disabled={disabled} errors={errors} onChange={(place) => onChange({ ...value, ...place })} onBlur={(key) => { if (value[key]) blur(key) }} />
          {registeredAddress.city && registeredAddress.province && <div className="sm:col-span-2 text-xs text-slate-600">
            <p>Using your registered address. Change it if this job is in a different location.</p>
            {(value.city !== registeredAddress.city || value.province !== registeredAddress.province) && <button type="button" disabled={disabled} className="mt-1 text-cyan-700 underline" onClick={() => { onChange({ ...value, ...registeredAddress }); setErrors?.((current) => ({ ...current, city: '', province: '' })) }}>Reset to my address</button>}
          </div>}
        </>}
      </div>
    </fieldset>
    <fieldset disabled={disabled} className="space-y-4 border-t border-slate-200 pt-4"><legend className="text-base font-semibold">Requirements</legend>
      <div className="grid gap-4 sm:grid-cols-2">{field('education', 'Educational attainment', { options: EDUCATION_LEVELS })}{field('experience', 'Years of experience', { options: EXPERIENCE_LEVELS })}</div>
      {field('requirements', 'Additional requirements', { textarea: true, maxLength: JOB_LIMITS.requirementsMax })}
      <div><label htmlFor={`${id}-skills`} className="text-sm font-medium">Required skills *</label>
        <div className="mt-2 flex flex-wrap gap-2">{value.skills.map((item) => <span key={item} className="flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-sm text-cyan-900">{item}<button type="button" disabled={disabled} aria-label={`Remove ${item}`} onClick={() => set('skills', value.skills.filter((entry) => entry !== item))}>×</button></span>)}</div>
        <div className="relative" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) { setSkillsOpen(false); blur('skills') }
        }}>
          <input ref={skillInputRef} id={`${id}-skills`} value={skill} role="combobox" aria-autocomplete="list"
            aria-expanded={skillsOpen} aria-controls={`${id}-skill-suggestions`}
            aria-activedescendant={skillsOpen && skillOptions[activeSkill] ? `${id}-skill-option-${activeSkill}` : undefined}
            className={control} maxLength={JOB_LIMITS.skillMax} placeholder="Search and select skills, or type a skill and press Enter"
            disabled={disabled} aria-invalid={Boolean(errors.skills)} aria-describedby={errors.skills ? `${id}-skills-error` : undefined}
            onFocus={() => setSkillsOpen(true)} onChange={(e) => { setSkill(e.target.value); setActiveSkill(0); setSkillsOpen(true) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSkillsOpen(false)
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setSkillsOpen(true)
                setActiveSkill((current) => Math.max(0, Math.min(skillOptions.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1))))
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                const exact = skillOptions.find((item) => item.toLowerCase() === skill.trim().toLowerCase())
                const candidate = exact || (skillsOpen && skillOptions[activeSkill]) || skill
                addSkill(candidate)
                setActiveSkill(0)
                setSkillsOpen(true)
              }
            }} />
          {skillsOpen && !disabled && <ul id={`${id}-skill-suggestions`} role="listbox" aria-label="Skill suggestions" aria-multiselectable="true"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-300 bg-white p-1 shadow-lg">
            {skillOptions.map((item, index) => {
              const selected = value.skills.some((entry) => entry.toLowerCase() === item.toLowerCase())
              return <li key={item} role="option" id={`${id}-skill-option-${index}`} aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()} onClick={() => selectSkill(item)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-900 hover:bg-cyan-50 ${index === activeSkill ? 'bg-slate-50' : ''}`}>
                <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? 'border-cyan-600 bg-cyan-100 text-cyan-900' : 'border-slate-300 bg-white'}`}>{selected ? '\u2713' : ''}</span>
                {item}
              </li>
            })}
            {!skillOptions.length && <li className="px-3 py-2 text-sm text-slate-600">{skill.trim() ? 'Press Enter to add this skill.' : 'Type a skill and press Enter.'}</li>}
          </ul>}
        </div>
        <p className="mt-1 text-xs text-slate-600">Click skills to select multiple. Click a selected skill again or use its X to remove it.</p>
        {error('skills')}
      </div>
    </fieldset>
    <fieldset disabled={disabled} className="space-y-4 border-t border-slate-200 pt-4"><legend className="text-base font-semibold">Compensation &amp; Slots</legend>
      {value.salary && !value.salaryMin && !value.salaryMax && !value.negotiable && <p className="text-sm text-slate-600">Existing salary: {value.salary}. Enter a range when updating this posting.</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.negotiable} onChange={(e) => {
        const next = { ...value, negotiable: e.target.checked }
        onChange(next)
        const { errors: nextErrors } = validateJobPosting(next, { keepDeadline })
        setErrors?.((current) => ({ ...current, salaryMin: nextErrors.salaryMin || '', salaryMax: nextErrors.salaryMax || '' }))
      }} />Salary is negotiable</label>
      {!value.negotiable && <p className="text-xs text-slate-600">Salary Min and Salary Max are required when salary is not negotiable.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{field('salaryMin', 'Salary Min (₱)', { required: !value.negotiable, inputMode: 'numeric', type: 'text' })}{field('salaryMax', 'Salary Max (₱)', { required: !value.negotiable, inputMode: 'numeric', type: 'text' })}{field('payFrequency', 'Pay frequency', { options: PAY_FREQUENCIES })}</div>
      {warning && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{field('slots', 'Available slots', { type: 'text', inputMode: 'numeric', required: true })}{field('deadline', 'Application deadline', { type: 'date', min: bounds.min, max: bounds.max, required: true })}</div>
    </fieldset>
    <fieldset disabled={disabled} className="border-t border-slate-200 pt-4"><legend className="text-base font-semibold">Notes</legend>{field('notesToAdmin', 'Notes to PESO Admin (optional, private)', { textarea: true, maxLength: JOB_LIMITS.notesMax })}</fieldset>
    <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Preview posting'}</button>
    {preview && <article aria-label="Job seeker preview" className="space-y-3 rounded-2xl border border-slate-300 bg-slate-50 p-5"><h3 className="text-xl font-bold">{value.title === 'Other' ? value.customTitle : value.title || 'Job title'}</h3><p>{value.company}</p><p>{formatLocation(value)} · {value.locationType} · {value.employmentType}</p><p>{formatSalary({ ...value, salaryMin: parseAmount(value.salaryMin), salaryMax: parseAmount(value.salaryMax) }) || 'Salary not specified'}</p><p className="whitespace-pre-wrap">{value.description}</p><p>Education: {value.education || 'Not Required'} · Experience: {value.experience || 'No Experience'}</p><p className="whitespace-pre-wrap">{value.requirements}</p><p>Skills: {value.skills.join(', ')}</p><p>Slots: {value.slots || '—'} · Apply by: {value.deadline || '—'}</p></article>}
  </div>
}
