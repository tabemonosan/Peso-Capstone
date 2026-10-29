import { useMemo, useState } from 'react'

export default function JobTitlePicker({ categories = [], title, customTitle, onChange, disabled = false, id = 'job-title', onBlur, error }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const query = title === 'Other' ? customTitle : title
  const matches = useMemo(() => categories.flatMap((group) => group.titles).filter((item) => item.name.toLowerCase().includes((query || '').trim().toLowerCase())), [categories, query])
  const canAdd = Boolean(query?.trim()) && !matches.some((item) => item.name.toLowerCase() === query.trim().toLowerCase())
  const options = [...matches.map((item) => ({ label: item.name, title: item.name, customTitle: '' })), ...(canAdd ? [{ label: `Add '${query.trim()}' as new job title`, title: 'Other', customTitle: query.trim() }] : [])]
  const choose = (option) => { onChange({ title: option.title, customTitle: option.customTitle }); setOpen(false) }
  return (
    <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); onBlur?.() } }}>
      <label htmlFor={id} className="block text-sm font-medium text-black">Job title *</label>
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} required disabled={disabled} value={query || ''} maxLength={80}
        onFocus={() => setOpen(true)} onChange={(event) => { const value = event.target.value; const exact = categories.flatMap((group) => group.titles).find((item) => item.name.toLowerCase() === value.toLowerCase()); onChange({ title: exact?.name || (value ? 'Other' : ''), customTitle: exact ? '' : value }); setOpen(true); setActive(0) }}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))) } if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); choose(options[active]) } }}
        placeholder="Search or enter a job title" className="shared-form-control mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black" />
      {open && <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-300 bg-white shadow-lg">
        {options.map((option, index) => <li key={option.label} id={`${id}-option-${index}`} role="option" aria-selected={index === active} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={`cursor-pointer px-3 py-2 text-sm text-black hover:bg-cyan-50 ${index === active ? 'bg-cyan-50' : ''}`}>{option.label}</li>)}
        {!options.length && <li className="px-3 py-2 text-sm text-slate-500">Type a job title</li>}
      </ul>}
      {title === 'Other' && <p className="mt-1 text-xs text-slate-600">New titles are reviewed with your posting by PESO.</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  )
}
