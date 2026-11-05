import { JOB_LANGUAGE_OPTIONS as LANGUAGE_OPTIONS, LANGUAGE_PROFICIENCIES } from '../../shared/jobLanguages.js'

export function JobLanguageRequirementsFields({ value = [], onChange, disabled, error, errorId }) {
  const change = (index, patch) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row))
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="text-sm font-medium">Language proficiency (optional)</legend>
    <p className="text-xs text-slate-600">Choose English or Filipino and select the required proficiencies.</p>
    {value.map((row, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <label className="block text-sm">Language {index + 1}<select value={row.name} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => change(index, { name: event.target.value })} className="shared-form-control mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Select language...</option>{row.name && !LANGUAGE_OPTIONS.includes(row.name) && <option value={row.name} disabled>{row.name} (choose English or Filipino)</option>}{LANGUAGE_OPTIONS.map(name => <option key={name} value={name} disabled={value.some((other, otherIndex) => otherIndex !== index && other.name === name)}>{name}</option>)}</select></label>
      <div className="flex flex-wrap gap-4">{LANGUAGE_PROFICIENCIES.map(field => <label key={field} className="inline-flex items-center gap-2 text-sm capitalize"><input type="checkbox" aria-label={`${field} language ${index + 1}`} checked={Boolean(row[field])} onChange={event => change(index, { [field]: event.target.checked })} />{field}</label>)}</div>
      <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remove language ${index + 1}`} className="text-sm text-rose-700">Remove language</button>
    </div>)}
    {value.length < LANGUAGE_OPTIONS.length && <button type="button" onClick={() => onChange([...value, { name: '', read: false, write: false, speak: false, understand: false }])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Add language</button>}
  </fieldset>
}

export default function JobLanguageRequirements({ value = [] }) {
  if (!value.length) return null
  return <section aria-label="Required language proficiency" className="mt-4 rounded-xl bg-slate-50 p-3 text-slate-900">
    <h3 className="text-sm font-semibold">Language proficiency</h3>
    <ul className="mt-2 space-y-1 text-sm">{value.map((row, index) => <li key={index}><strong>{row.name}:</strong> {LANGUAGE_PROFICIENCIES.filter(field => row[field]).join(', ')}</li>)}</ul>
  </section>
}
