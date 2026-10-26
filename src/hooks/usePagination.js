import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Debounce a changing value (e.g. a search box) by `delay` ms.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const readUrlPage = (key) => {
  try {
    const params = new URLSearchParams(window.location.search)
    const parsed = Number.parseInt(params.get(key), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  } catch {
    return 1
  }
}

// Shared pagination state for every list.
// - Resets to page 1 when any of `resetDeps` change (search text, filters).
// - Optionally mirrors the page in the URL query string (?page=3) so refresh and
//   the back button keep the user's place.
// - `paginate(items)` slices an array for client-side lists; server-side lists
//   just use { page, pageSize, setPage, setPageSize } to drive their fetch.
export function usePagination({ defaultPageSize = 10, resetDeps = [], urlKey = 'page', syncUrl = true } = {}) {
  const [page, setPageState] = useState(() => (syncUrl ? readUrlPage(urlKey) : 1))
  const [pageSize, setPageSizeState] = useState(defaultPageSize)
  const isFirstRender = useRef(true)

  const writeUrl = useCallback((nextPage) => {
    if (!syncUrl || typeof window === 'undefined') return
    try {
      const url = new URL(window.location.href)
      if (nextPage > 1) url.searchParams.set(urlKey, String(nextPage))
      else url.searchParams.delete(urlKey)
      window.history.pushState({}, '', url)
    } catch { /* history unavailable */ }
  }, [syncUrl, urlKey])

  const setPage = useCallback((nextPage) => {
    setPageState((current) => {
      const resolved = Math.max(1, typeof nextPage === 'function' ? nextPage(current) : nextPage)
      if (resolved !== current) writeUrl(resolved)
      return resolved
    })
  }, [writeUrl])

  const setPageSize = useCallback((nextSize) => {
    setPageSizeState(nextSize)
    setPage(1) // changing the page size always returns to page 1
  }, [setPage])

  // Reset to page 1 when search/filters change (skip the initial mount)
  const resetKey = JSON.stringify(resetDeps)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // Back/forward buttons restore the page from the URL
  useEffect(() => {
    if (!syncUrl || typeof window === 'undefined') return undefined
    const onPopState = () => setPageState(readUrlPage(urlKey))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [syncUrl, urlKey])

  const paginate = useCallback(
    (items) => {
      const list = Array.isArray(items) ? items : []
      return list.slice((page - 1) * pageSize, page * pageSize)
    },
    [page, pageSize],
  )

  return useMemo(
    () => ({ page, pageSize, setPage, setPageSize, paginate }),
    [page, pageSize, setPage, setPageSize, paginate],
  )
}
