import { useState } from 'react'
import { NSRP_SKILL_LABELS } from '../../shared/nsrpSkills.js'
import { JOB_SKILL_OPTIONS } from '../../shared/jobSkills.js'
import SkillTagPicker from './SkillTagPicker'

const fixedSkills = new Set(NSRP_SKILL_LABELS)
const otherOptions = JOB_SKILL_OPTIONS.filter(skill => !fixedSkills.has(skill))

export default function NsrpSkillsField({ skills = [], othersText = '', onChange }) {
  const [error, setError] = useState('')
  const change = next => {
    if (next.skills.length > 18) { setError('You can select up to 18 items, including Others. Remove an item before adding another.'); return }
    setError('')
    onChange(next)
  }
  const extraSkills = skills.filter(skill => !fixedSkills.has(skill))
  const hasOthers = skills.includes('Others')
  return <fieldset className="rounded-xl border border-slate-200 p-3">
    <legend className="px-1 text-sm font-semibold text-slate-800">Skills (optional)</legend>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {NSRP_SKILL_LABELS.map(skill => <label key={skill} className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={skills.includes(skill)} onChange={event => {
          const next = event.target.checked ? [...skills, skill] : skills.filter(item => item !== skill)
          change({ skills: skill === 'Others' && !event.target.checked ? next.filter(item => fixedSkills.has(item)) : next, othersText: skill === 'Others' && !event.target.checked ? '' : othersText })
        }} />{skill}
      </label>)}
    </div>
    {hasOthers && <section aria-label="Other skills" className="mt-3">
      <p className="text-xs font-medium text-slate-700">Other skills and job types</p>
      <p className="mt-1 text-xs text-slate-600">Choose from the allowed list below. Selected skills will appear on your profile.</p>
      <SkillTagPicker theme="light" options={otherOptions} selected={extraSkills} onChange={next => change({ skills: [...skills.filter(skill => fixedSkills.has(skill)), ...next], othersText: '' })} />
      {othersText && <p className="mt-2 text-xs text-slate-600">Previously entered: {othersText}. Choose matching items from the list to add them to your profile.</p>}
    </section>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </fieldset>
}
