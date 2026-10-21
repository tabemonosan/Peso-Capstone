import { useMemo, useState } from "react"

export default function JobTitlePicker({ categories, title, customTitle, onChange, disabled = false, id = "job-title" }) {
  const [search, setSearch] = useState("")
  const filter = search.trim().toLowerCase()
  const visibleCategories = useMemo(() => categories
    .map((group) => ({
      ...group,
      titles: group.titles.filter((item) => item.name.toLowerCase().includes(filter) || item.name === title),
    }))
    .filter((group) => group.titles.length > 0), [categories, filter, title])

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-search`} className="block text-sm font-medium text-black">Search job titles</label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={disabled}
        placeholder="Type to filter titles"
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
      />
      <label htmlFor={id} className="block text-sm font-medium text-black">Job title</label>
      <select
        id={id}
        value={title}
        onChange={(event) => onChange({ title: event.target.value, customTitle: event.target.value === "Other" ? customTitle : "" })}
        disabled={disabled}
        required
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
      >
        <option value="">Select a job title</option>
        {visibleCategories.map((group) => (
          <optgroup key={group.category} label={group.category}>
            {group.titles.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </optgroup>
        ))}
        <option value="Other">Other</option>
      </select>
      {title === "Other" && (
        <label htmlFor={`${id}-custom`} className="block text-sm font-medium text-black">
          Enter job title (80 characters maximum)
          <input
            id={`${id}-custom`}
            type="text"
            value={customTitle}
            onChange={(event) => onChange({ title: "Other", customTitle: event.target.value })}
            disabled={disabled}
            maxLength={80}
            required
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
          />
        </label>
      )}
    </div>
  )
}
