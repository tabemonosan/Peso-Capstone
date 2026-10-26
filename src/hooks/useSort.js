import { useCallback, useEffect, useMemo, useState } from 'react'

// Shared sort state for the list pages.
// - options: flat list of { id, sortBy, order, label } where id = `${sortBy}:${order}`
// - defaultId: option used on first load and by Reset
// - Keeps sortBy/order in the URL (?sortBy=name&order=asc) when urlSync is on, so
//   refresh and the back button restore the same view
// - onChange fires whenever the sort changes (used to reset pagination to page 1)
export function useSort({ options, defaultId, urlSync = true, onChange } = {}) {
  const defaultOption = useMemo(
    () => options.find((option) => option.id === defaultId) || options[0],
    [options, defaultId],
  )

  const readUrl = useCallback(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const match = options.find((option) => option.sortBy === params.get('sortBy') && option.order === params.get('order'))
      if (match) return { sortBy: match.sortBy, order: match.order }
    } catch { /* no URL access */ }
    return { sortBy: defaultOption.sortBy, order: defaultOption.order }
  }, [options, defaultOption])

  const [sort, setSortState] = useState(() => (
    urlSync && typeof window !== 'undefined' ? readUrl() : { sortBy: defaultOption.sortBy, order: defaultOption.order }
  ))

  const setSort = useCallback((updater) => {
    setSortState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater
      if (current.sortBy === next.sortBy && current.order === next.order) return current
      if (urlSync && typeof window !== 'undefined') {
        try {
          const url = new URL(window.location.href)
          if (next.sortBy === defaultOption.sortBy && next.order === defaultOption.order) {
            url.searchParams.delete('sortBy')
            url.searchParams.delete('order')
          } else {
            url.searchParams.set('sortBy', next.sortBy)
            url.searchParams.set('order', next.order)
          }
          window.history.pushState({}, '', url)
        } catch { /* history unavailable */ }
      }
      onChange?.(next)
      return next
    })
  }, [urlSync, defaultOption, onChange])

  // Dropdown: pick a labeled option
  const setSortOption = useCallback((option) => setSort({ sortBy: option.sortBy, order: option.order }), [setSort])

  // Column header: toggle direction when already active, else use that column's default order
  const toggleSort = useCallback((sortBy) => {
    setSort((current) => {
      if (current.sortBy === sortBy) return { sortBy, order: current.order === 'asc' ? 'desc' : 'asc' }
      const fallback = options.find((option) => option.sortBy === sortBy)
      return { sortBy, order: fallback?.order || 'asc' }
    })
  }, [setSort, options])

  const resetSort = useCallback(() => setSort({ sortBy: defaultOption.sortBy, order: defaultOption.order }), [setSort, defaultOption])

  // Back/forward restores the sort from the URL
  useEffect(() => {
    if (!urlSync || typeof window === 'undefined') return undefined
    const onPopState = () => setSortState(readUrl())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [urlSync, readUrl])

  return useMemo(
    () => ({ sortBy: sort.sortBy, order: sort.order, setSortOption, toggleSort, resetSort }),
    [sort, setSortOption, toggleSort, resetSort],
  )
}
