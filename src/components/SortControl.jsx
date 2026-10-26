// Shared sort UI used by every admin list.
// - <SortControl>: one "Sort by" dropdown with labeled options (e.g. "Name (A to Z)")
//   plus a Reset button. On mobile this is the only control shown.
// - <SortableTh>: clickable table header with a direction arrow and aria-sort.

export function SortableTh({ label, sortKey, activeSortBy, order, onSort, className = '' }) {
  const active = activeSortBy === sortKey
  return (
    <th aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined} className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}${active ? (order === 'asc' ? ', currently ascending' : ', currently descending') : ''}`}
        className="inline-flex items-center gap-1 uppercase tracking-[1px] hover:text-cyan-600"
      >
        {label}
        <span aria-hidden="true">{active ? (order === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

export default function SortControl({ options, value, onChange, onReset, ariaLabel = 'Sort by' }) {
  const currentId = `${value.sortBy}:${value.order}`
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-2 text-slate-500">
        <span className="whitespace-nowrap">Sort by</span>
        <select
          value={options.some((option) => option.id === currentId) ? currentId : ''}
          onChange={(event) => {
            const option = options.find((item) => item.id === event.target.value)
            if (option) onChange(option)
          }}
          aria-label={ariaLabel}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        >
          {!options.some((option) => option.id === currentId) && <option value="" disabled>Custom</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onReset}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-cyan-400 hover:text-cyan-600"
      >
        Reset
      </button>
    </div>
  )
}
