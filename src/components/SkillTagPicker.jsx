import { useEffect, useId, useRef, useState } from "react"
import { JOB_SKILL_OPTIONS as availableSkills, addJobSkill, canonicalJobSkill, coveringJobSkill } from '../../shared/jobSkills.js'

// Browse skills on focus; typing optionally filters the available choices.
export default function SkillTagPicker({ selected, onChange, disabled = false, theme = 'dark' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const [notice, setNotice] = useState('')
  const listId = useId(), inputRef = useRef(null)
  const normalized = Array.isArray(selected) ? selected : []
  const trimmed = query.trim()
  const suggestions = availableSkills.filter(skill => !normalized.some(entry => canonicalJobSkill(entry) === skill) && (!trimmed || skill.toLowerCase().includes(trimmed.toLowerCase())))
  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' }) }, [active, open, listId, trimmed])
  const choose = skill => {
    const result = addJobSkill(normalized, skill)
    if (result.error) { setNotice(result.error); return }
    onChange(result.skills)
    setNotice(result.removed.length ? `${canonicalJobSkill(skill)} already includes ${result.removed.join(', ')}. Redundant selections were removed.` : '')
    setQuery(''); setActive(0); inputRef.current?.focus()
  }
  const inputCls = 'shared-form-control w-full rounded-2xl px-3 py-2 text-sm'
  const suggestionCls = theme === 'dark'
    ? 'cursor-pointer px-3 py-2 text-sm text-slate-200 hover:bg-slate-700'
    : 'cursor-pointer px-3 py-2 text-sm text-black hover:bg-slate-100'
  const chipCls = theme === 'dark'
    ? 'inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-sm font-medium text-cyan-200'
    : 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-black'
  return (
    <div className="skill-tag-picker mt-2 space-y-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      {normalized.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalized.map((skill) => (
            <span key={skill} className={`skill-tag-chip ${chipCls}`}>
              {skill}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${skill}`}
                  onClick={() => onChange(normalized.filter((item) => item !== skill))}
                  className={`skill-tag-remove ${theme === 'dark' ? 'text-cyan-300 hover:text-white' : 'text-slate-500 hover:text-black'}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search or select skills"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && suggestions[active] ? `${listId}-${active}` : undefined}
            value={query}
            onFocus={() => { setOpen(true); setActive(0) }}
            onClick={() => setOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0) }}
            onKeyDown={event => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(suggestions.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))) }
              if (event.key === 'Enter' && open && suggestions[active]) { event.preventDefault(); choose(suggestions[active]) }
            }}
            placeholder="Click to browse skills or type to filter"
            className={`skill-tag-input ${inputCls}`}
          />
          {open && (
            <div id={listId} role="listbox" aria-label="Available skills" className={`skill-tag-suggestions absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'} shadow-lg`}>
              {!suggestions.length && <p className="px-3 py-2 text-sm">{trimmed ? 'No matching skills.' : 'All available skills are already selected.'}</p>}
              {suggestions.map((skill, index) => (
                <button
                  key={skill}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active && !coveringJobSkill(skill, normalized)}
                  disabled={Boolean(coveringJobSkill(skill, normalized))}
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => choose(skill)}
                  className={`skill-tag-suggestion block w-full text-left ${suggestionCls} ${index === active ? theme === 'dark' ? 'bg-slate-700' : 'bg-blue-50' : ''}`}
                >
                  {skill}
                  {coveringJobSkill(skill, normalized) && <span className="ml-2 text-xs opacity-70">Covered by {coveringJobSkill(skill, normalized)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!disabled && <p className="text-xs text-slate-500">Broader skills include their related skills. For example, Full-Stack Developer covers Frontend Developer and Backend Developer.</p>}
      {!disabled && notice && <p role="status" className="text-xs text-blue-800">{notice}</p>}
    </div>
  )
}

