import { useEffect, useRef, useState } from "react"

// LinkedIn-style filter bar for the applicant job board: pill buttons that open
// checkbox popovers, active-filter chips, and a mobile bottom sheet.
// All state lives in the parent via the useJobFilters hook.

const DATE_POSTED_LABELS = { '24h': 'Last 24 hours', week: 'Last week', month: 'Last month' }

// Arrow keys move between checkboxes in a popover
function onChecklistKeyDown(event) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const items = [...event.currentTarget.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
  const index = items.indexOf(document.activeElement)
  if (index === -1) return
  event.preventDefault()
  const next = event.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1)
  items[next]?.focus()
}

function Checklist({ options, selected, onToggle, namePrefix }) {
  return (
    <ul className="max-h-52 space-y-1 overflow-y-auto" onKeyDown={onChecklistKeyDown}>
      {options.length === 0 && <li className="px-1 py-2 text-sm text-black">No options found.</li>}
      {options.map((option) => {
        const value = typeof option === 'string' ? option : option.value
        const count = typeof option === 'string' ? undefined : option.count
        const checked = selected.includes(value)
        return (
          <li key={value}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-black hover:bg-blue-50">
              <input
                type="checkbox"
                checked={checked}
                aria-checked={checked}
                onChange={() => onToggle(value)}
                name={`${namePrefix}-${value}`}
                className="h-4 w-4 accent-cyan-500"
              />
              <span className="flex-1 truncate">{value}</span>
              {count !== undefined && <span className="text-xs text-black">({count})</span>}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function Popover({ title, onClear, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute left-0 top-full z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-black shadow-xl"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-black">{title}</p>
      {children}
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
        <button type="button" onClick={onClear} className="text-xs font-medium text-black hover:underline">
          Clear
        </button>
        <button type="button" onClick={onClose} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
          Show results
        </button>
      </div>
    </div>
  )
}

function SkillChips({ skills, onToggle }) {
  if (skills.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {skills.map((skill) => (
        <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-black">
          {skill}
          <button type="button" aria-label={`Remove ${skill}`} onClick={() => onToggle(skill)} className="hover:text-blue-700">×</button>
        </span>
      ))}
    </div>
  )
}

export default function JobFiltersBar({ filters, facets, resultCount, mySkills = [], onToggle, onDatePosted, onKeyword, onClearGroup, onClearAll }) {
  const [openPill, setOpenPill] = useState(null) // 'skills' | 'locations' | 'locationTypes' | 'employmentTypes' | 'posted' | null
  const [skillQuery, setSkillQuery] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const barRef = useRef(null)

  // Esc / click outside closes the open popover
  useEffect(() => {
    if (!openPill) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpenPill(null) }
    const onMouseDown = (event) => { if (barRef.current && !barRef.current.contains(event.target)) setOpenPill(null) }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [openPill])

  useEffect(() => {
    if (!sheetOpen) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setSheetOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [sheetOpen])

  const pillLabel = (base, values) => {
    if (!values.length) return base
    if (values.length === 1) return `${base} · ${values[0]}`
    return `${base} · ${values.length}`
  }

  const pillCls = (active, open) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'border-blue-500 bg-white text-black ring-1 ring-blue-500'
        : open
          ? 'border-blue-500 bg-white text-black'
          : 'border-slate-300 bg-white text-black hover:border-blue-500 hover:bg-blue-50'
    }`

  const skillOptions = facets.skills
    .filter((entry) => !skillQuery.trim() || entry.value.toLowerCase().includes(skillQuery.trim().toLowerCase()))
  const locationOptions = facets.locations
    .filter((entry) => !locationQuery.trim() || entry.value.toLowerCase().includes(locationQuery.trim().toLowerCase()))

  const postedLabel = filters.datePosted ? `Posted · ${DATE_POSTED_LABELS[filters.datePosted] || filters.datePosted}` : 'Posted'

  const activeChips = [
    ...filters.skills.map((value) => ({ group: 'skills', value })),
    ...filters.locations.map((value) => ({ group: 'locations', value })),
    ...filters.locationTypes.map((value) => ({ group: 'locationTypes', value })),
    ...filters.employmentTypes.map((value) => ({ group: 'employmentTypes', value })),
    ...(filters.datePosted ? [{ group: 'datePosted', value: DATE_POSTED_LABELS[filters.datePosted] || filters.datePosted }] : []),
    ...(filters.keyword ? [{ group: 'keyword', value: `"${filters.keyword}"` }] : []),
  ]

  const sections = [
    { id: 'skills', title: 'Skills', options: skillOptions, selected: filters.skills, searchable: true },
    { id: 'locations', title: 'Location', options: locationOptions, selected: filters.locations, searchable: true },
    { id: 'locationTypes', title: 'Location type', options: facets.locationTypes, selected: filters.locationTypes },
    { id: 'employmentTypes', title: 'Employment type', options: facets.employmentTypes, selected: filters.employmentTypes },
  ]

  return (
    <div ref={barRef}>
      {/* Desktop / tablet: pill row */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex" role="toolbar" aria-label="Job filters">
        <input
          type="search"
          value={filters.keyword}
          onChange={(event) => onKeyword(event.target.value)}
          placeholder="Keyword (title, company)"
          aria-label="Keyword search"
          className="w-44 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm text-black"
        />

        {sections.map((section) => {
          const active = section.selected.length > 0
          const open = openPill === section.id
          return (
            <span key={section.id} className="relative">
              <button
                type="button"
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpenPill(open ? null : section.id)}
                className={pillCls(active, open)}
              >
                {pillLabel(section.title, section.selected)} {open ? '▴' : '▾'}
              </button>
              {open && (
                <Popover
                  title={section.title}
                  onClear={() => onClearGroup(section.id)}
                  onClose={() => setOpenPill(null)}
                >
                  {section.id === 'skills' && (
                    <>
                      <SkillChips skills={filters.skills} onToggle={(value) => onToggle('skills', value)} />
                      {mySkills.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            mySkills.forEach((skill) => { if (!filters.skills.includes(skill)) onToggle('skills', skill) })
                          }}
                          className="mb-2 w-full rounded-xl border border-blue-200 bg-white px-2 py-1.5 text-xs font-semibold text-black hover:bg-blue-50"
                        >
                          Use my skills ({mySkills.length})
                        </button>
                      )}
                    </>
                  )}
                  {section.searchable && (
                    <input
                      type="text"
                      value={section.id === 'skills' ? skillQuery : locationQuery}
                      onChange={(event) => (section.id === 'skills' ? setSkillQuery(event.target.value) : setLocationQuery(event.target.value))}
                      placeholder={`Search ${section.title.toLowerCase()}…`}
                      aria-label={`Search ${section.title}`}
                      className="mb-2 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-black"
                    />
                  )}
                  <Checklist
                    options={section.options}
                    selected={section.selected}
                    onToggle={(value) => onToggle(section.id, value)}
                    namePrefix={section.id}
                  />
                </Popover>
              )}
            </span>
          )
        })}

        {/* Date posted pill */}
        <span className="relative">
          <button
            type="button"
            aria-expanded={openPill === 'posted'}
            aria-haspopup="dialog"
            onClick={() => setOpenPill(openPill === 'posted' ? null : 'posted')}
            className={pillCls(Boolean(filters.datePosted), openPill === 'posted')}
          >
            {postedLabel} {openPill === 'posted' ? '▴' : '▾'}
          </button>
          {openPill === 'posted' && (
            <Popover title="Date posted" onClear={() => onClearGroup('datePosted')} onClose={() => setOpenPill(null)}>
              <ul className="space-y-1" onKeyDown={onChecklistKeyDown}>
                {Object.entries(DATE_POSTED_LABELS).map(([value, label]) => (
                  <li key={value}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-black hover:bg-blue-50">
                      <input
                        type="radio"
                        name="date-posted"
                        checked={filters.datePosted === value}
                        aria-checked={filters.datePosted === value}
                        onChange={() => onDatePosted(value)}
                        className="h-4 w-4 accent-cyan-500"
                      />
                      {label}
                    </label>
                  </li>
                ))}
              </ul>
            </Popover>
          )}
        </span>

        {activeChips.length > 0 && (
          <button type="button" onClick={onClearAll} className="text-sm font-medium text-cyan-700 underline-offset-2 hover:underline">
            Clear all
          </button>
        )}
      </div>

      {/* Mobile: single Filters button */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          className={pillCls(activeChips.length > 0, sheetOpen)}
        >
          Filters{activeChips.length > 0 ? ` · ${activeChips.length}` : ''} ▾
        </button>
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-slate-950/60 sm:hidden" role="dialog" aria-modal="true" aria-label="Job filters" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheetOpen(false) }}>
          <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white p-5 pb-24 text-black">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-black">Filters</h3>
              <button type="button" onClick={onClearAll} className="text-sm font-medium text-black hover:underline">Clear all</button>
            </div>
            <input
              type="search"
              value={filters.keyword}
              onChange={(event) => onKeyword(event.target.value)}
              placeholder="Keyword (title, company)"
              aria-label="Keyword search"
              className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
            />
            {sections.map((section) => (
              <div key={section.id} className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-black">{section.title}</p>
                <Checklist options={section.options} selected={section.selected} onToggle={(value) => onToggle(section.id, value)} namePrefix={`sheet-${section.id}`} />
              </div>
            ))}
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-black">Date posted</p>
              <ul className="space-y-1">
                {Object.entries(DATE_POSTED_LABELS).map(([value, label]) => (
                  <li key={value}>
                    <label className="flex items-center gap-2 py-1.5 text-sm text-black">
                      <input type="radio" name="sheet-date-posted" checked={filters.datePosted === value} onChange={() => onDatePosted(value)} className="h-4 w-4 accent-cyan-500" />
                      {label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="sticky bottom-0 border-t border-slate-200 bg-white p-4 text-black">
            <button type="button" onClick={() => setSheetOpen(false)} className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950">
              Show {resultCount} job{resultCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {activeChips.map((chip) => (
            <span key={`${chip.group}-${chip.value}`} className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300 bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-900">
              {chip.value}
              <button
                type="button"
                aria-label={`Remove filter ${chip.value}`}
                onClick={() => (chip.group === 'keyword' || chip.group === 'datePosted' ? onClearGroup(chip.group) : onToggle(chip.group, chip.value))}
                className="text-cyan-700 hover:text-cyan-950"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
