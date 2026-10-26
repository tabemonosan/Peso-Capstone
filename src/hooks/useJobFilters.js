import { useCallback, useEffect, useMemo, useState } from 'react'

// Applicant job-board filter state.
// - Filters, keyword, and sort live in the URL query string (refresh/back-safe)
// - When the URL has no params, the last filters are restored from sessionStorage
// - Every change calls onResetPage (lists go back to page 1)

const STORAGE_KEY = 'peso-job-filters'

export const JOB_SORT_OPTIONS = [
  { id: 'relevant', label: 'Most relevant', params: { sortBy: 'relevant', order: 'desc' } },
  { id: 'newest', label: 'Newest', params: { sortBy: 'createdAt', order: 'desc' } },
  { id: 'salary', label: 'Salary (high to low)', params: { sortBy: 'salary', order: 'desc' } },
  { id: 'deadline', label: 'Deadline (soonest)', params: { sortBy: 'deadline', order: 'asc' } },
]

const EMPTY_FILTERS = { skills: [], locations: [], locationTypes: [], employmentTypes: [], datePosted: '', keyword: '' }

const readUrlState = () => {
  try {
    const params = new URLSearchParams(window.location.search)
    const list = (key) => (params.get(key) || '').split(',').map((v) => v.trim()).filter(Boolean)
    const hasAny = ['skills', 'locations', 'types', 'employment', 'posted', 'q', 'jobSort'].some((key) => params.get(key))
    if (!hasAny) return null
    return {
      filters: {
        skills: list('skills'),
        locations: list('locations'),
        locationTypes: list('types'),
        employmentTypes: list('employment'),
        datePosted: params.get('posted') || '',
        keyword: params.get('q') || '',
      },
      sortId: params.get('jobSort') || 'relevant',
    }
  } catch {
    return null
  }
}

const readStoredState = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      filters: { ...EMPTY_FILTERS, ...(parsed.filters || {}) },
      sortId: typeof parsed.sortId === 'string' ? parsed.sortId : 'relevant',
    }
  } catch {
    return null
  }
}

const writeUrl = (filters, sortId) => {
  try {
    const url = new URL(window.location.href)
    const set = (key, value) => {
      const text = Array.isArray(value) ? value.join(',') : value
      if (text) url.searchParams.set(key, text)
      else url.searchParams.delete(key)
    }
    set('skills', filters.skills)
    set('locations', filters.locations)
    set('types', filters.locationTypes)
    set('employment', filters.employmentTypes)
    set('posted', filters.datePosted)
    set('q', filters.keyword)
    set('jobSort', sortId === 'relevant' ? '' : sortId)
    window.history.pushState({}, '', url)
  } catch { /* history unavailable */ }
}

export function useJobFilters({ onResetPage } = {}) {
  const [initial] = useState(() => (typeof window !== 'undefined' ? (readUrlState() || readStoredState()) : null))
  const [filters, setFilters] = useState(initial?.filters || EMPTY_FILTERS)
  const [sortId, setSortId] = useState(initial?.sortId || 'relevant')

  const commit = useCallback((nextFilters, nextSortId) => {
    setFilters(nextFilters)
    setSortId(nextSortId)
    writeUrl(nextFilters, nextSortId)
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filters: nextFilters, sortId: nextSortId })) } catch { /* storage unavailable */ }
    onResetPage?.()
  }, [onResetPage])

  const toggleValue = useCallback((group, value) => {
    const current = filters[group] || []
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
    commit({ ...filters, [group]: next }, sortId)
  }, [filters, sortId, commit])

  const setDatePosted = useCallback((value) => {
    commit({ ...filters, datePosted: filters.datePosted === value ? '' : value }, sortId)
  }, [filters, sortId, commit])

  const setKeyword = useCallback((value) => {
    commit({ ...filters, keyword: value }, sortId)
  }, [filters, sortId, commit])

  const setSort = useCallback((nextSortId) => {
    commit(filters, nextSortId)
  }, [filters, commit])

  const clearGroup = useCallback((group) => {
    commit({ ...filters, [group]: group === 'datePosted' ? '' : group === 'keyword' ? '' : [] }, sortId)
  }, [filters, sortId, commit])

  const clearAll = useCallback(() => {
    commit(EMPTY_FILTERS, 'relevant')
  }, [commit])

  // Back/forward restores filters from the URL
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onPopState = () => {
      const state = readUrlState()
      setFilters(state?.filters || EMPTY_FILTERS)
      setSortId(state?.sortId || 'relevant')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const activeCount = filters.skills.length + filters.locations.length + filters.locationTypes.length
    + filters.employmentTypes.length + (filters.datePosted ? 1 : 0) + (filters.keyword ? 1 : 0)

  const queryParams = useMemo(() => {
    const sortOption = JOB_SORT_OPTIONS.find((option) => option.id === sortId) || JOB_SORT_OPTIONS[0]
    return {
      skills: filters.skills.join(','),
      locations: filters.locations.join(','),
      locationTypes: filters.locationTypes.join(','),
      employmentTypes: filters.employmentTypes.join(','),
      datePosted: filters.datePosted,
      search: filters.keyword,
      sortBy: sortOption.params.sortBy,
      order: sortOption.params.order,
    }
  }, [filters, sortId])

  return {
    filters,
    sortId,
    activeCount,
    queryParams,
    toggleValue,
    setDatePosted,
    setKeyword,
    setSort,
    clearGroup,
    clearAll,
  }
}
