// Reusable pagination bar: Previous / numbered pages with ellipsis / Next,
// "Showing X–Y of Z" text, and a rows-per-page selector (10/20/50 by default).
// Compact on small screens: page numbers collapse to "Page X of Y".

// Page list with ellipsis: [1, '…', 4, 5, 6, '…', 10]
export function buildPageList(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = [1]
  const windowStart = Math.max(2, page - 1)
  const windowEnd = Math.min(totalPages - 1, page + 1)
  if (windowStart > 2) pages.push('ellipsis-start')
  for (let p = windowStart; p <= windowEnd; p += 1) pages.push(p)
  if (windowEnd < totalPages - 1) pages.push('ellipsis-end')
  pages.push(totalPages)
  return pages
}

const btnBase = 'rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'
const btnIdle = 'border-slate-600 bg-transparent text-slate-300 hover:border-cyan-400 hover:text-cyan-300'
const btnActive = 'border-cyan-500 bg-cyan-500 text-slate-950'

export default function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  loading = false,
  itemLabel = 'items',
  ariaLabel = 'Pagination',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(totalItems, currentPage * pageSize)
  const pages = buildPageList(currentPage, totalPages)

  return (
    <nav aria-label={ariaLabel} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
      <span aria-live="polite">
        {loading && totalItems === 0 ? 'Loading…' : `Showing ${start}–${end} of ${totalItems} ${itemLabel}`}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || loading}
          aria-label="Previous page"
          className={`${btnBase} ${btnIdle}`}
        >
          Previous
        </button>

        {/* Full page numbers on sm+ screens */}
        <span className="hidden items-center gap-1.5 sm:flex">
          {pages.map((entry) =>
            typeof entry === 'number' ? (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                disabled={loading}
                aria-label={`Page ${entry}`}
                aria-current={entry === currentPage ? 'page' : undefined}
                className={`${btnBase} ${entry === currentPage ? btnActive : btnIdle}`}
              >
                {entry}
              </button>
            ) : (
              <span key={entry} aria-hidden="true" className="px-1 text-slate-500">…</span>
            ),
          )}
        </span>
        {/* Compact label on mobile */}
        <span aria-hidden="true" className="px-1 text-xs sm:hidden">Page {currentPage} of {totalPages}</span>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || loading}
          aria-label="Next page"
          className={`${btnBase} ${btnIdle}`}
        >
          Next
        </button>
      </div>

      {onPageSizeChange && (
        <label className="flex items-center gap-2 text-xs">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Rows per page"
            className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      )}
    </nav>
  )
}
