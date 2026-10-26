import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import SortControl, { SortableTh } from '../components/SortControl'
import { useSort } from '../hooks/useSort'
import { usePagination } from '../hooks/usePagination'

const OPTIONS = [
  { id: 'name:asc', sortBy: 'name', order: 'asc', label: 'Name (A to Z)' },
  { id: 'name:desc', sortBy: 'name', order: 'desc', label: 'Name (Z to A)' },
  { id: 'createdAt:desc', sortBy: 'createdAt', order: 'desc', label: 'Newest first' },
  { id: 'createdAt:asc', sortBy: 'createdAt', order: 'asc', label: 'Oldest first' },
]

describe('<SortControl>', () => {
  it('renders the labeled options and fires onChange with the chosen sort', () => {
    const onChange = vi.fn()
    render(<SortControl options={OPTIONS} value={{ sortBy: 'createdAt', order: 'desc' }} onChange={onChange} onReset={() => {}} />)
    const select = screen.getByLabelText('Sort by')
    expect(select).toHaveValue('createdAt:desc')
    fireEvent.change(select, { target: { value: 'name:asc' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'name', order: 'asc' }))
  })

  it('fires onReset from the Reset button', () => {
    const onReset = vi.fn()
    render(<SortControl options={OPTIONS} value={{ sortBy: 'name', order: 'asc' }} onChange={() => {}} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onReset).toHaveBeenCalled()
  })
})

describe('<SortableTh>', () => {
  it('toggles asc/desc when the active header is clicked and exposes aria-sort', () => {
    const onSort = vi.fn()
    const { rerender } = render(
      <table><thead><tr>
        <SortableTh label="Name" sortKey="name" activeSortBy="name" order="asc" onSort={onSort} />
      </tr></thead></table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(screen.getByRole('button', { name: /Sort by Name/ }))
    expect(onSort).toHaveBeenCalledWith('name')
    rerender(
      <table><thead><tr>
        <SortableTh label="Name" sortKey="name" activeSortBy="name" order="desc" onSort={onSort} />
      </tr></thead></table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
  })

  it('has no aria-sort when the column is not the active sort', () => {
    render(
      <table><thead><tr>
        <SortableTh label="Location" sortKey="location" activeSortBy="name" order="asc" onSort={() => {}} />
      </tr></thead></table>,
    )
    expect(screen.getByRole('columnheader')).not.toHaveAttribute('aria-sort')
  })
})

describe('useSort', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('starts at the default option and toggles direction on repeated header clicks', () => {
    const { result } = renderHook(() => useSort({ options: OPTIONS, defaultId: 'createdAt:desc', urlSync: false }))
    expect(result.current.sortBy).toBe('createdAt')
    expect(result.current.order).toBe('desc')
    act(() => result.current.toggleSort('name'))
    expect(result.current.sortBy).toBe('name')
    expect(result.current.order).toBe('asc')
    act(() => result.current.toggleSort('name'))
    expect(result.current.order).toBe('desc')
  })

  it('keeps sortBy/order in the URL and restores them on load', () => {
    const { result } = renderHook(() => useSort({ options: OPTIONS, defaultId: 'createdAt:desc' }))
    act(() => result.current.setSortOption(OPTIONS[0]))
    expect(window.location.search).toContain('sortBy=name')
    expect(window.location.search).toContain('order=asc')
    act(() => result.current.resetSort())
    expect(window.location.search).not.toContain('sortBy')
  })

  it('changing the sort resets pagination to page 1', () => {
    const { result } = renderHook(() => {
      const pagination = usePagination({ syncUrl: false })
      const sort = useSort({ options: OPTIONS, defaultId: 'createdAt:desc', urlSync: false, onChange: () => pagination.setPage(1) })
      return { pagination, sort }
    })
    act(() => result.current.pagination.setPage(3))
    expect(result.current.pagination.page).toBe(3)
    act(() => result.current.sort.setSortOption(OPTIONS[0]))
    expect(result.current.pagination.page).toBe(1)
  })
})
