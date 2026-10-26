import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Pagination, { buildPageList } from '../components/Pagination'
import { usePagination } from '../hooks/usePagination'

describe('buildPageList', () => {
  it('lists all pages when there are 7 or fewer', () => {
    expect(buildPageList(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageList(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('uses ellipsis at the start, middle, and end as needed', () => {
    expect(buildPageList(1, 10)).toEqual([1, 2, 'ellipsis-end', 10])
    expect(buildPageList(5, 10)).toEqual([1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 10])
    expect(buildPageList(10, 10)).toEqual([1, 'ellipsis-start', 9, 10])
  })
})

describe('<Pagination>', () => {
  it('renders "Showing 1–10 of 87" with numbered pages and ellipsis', () => {
    render(<Pagination page={1} pageSize={10} totalItems={87} onPageChange={() => {}} onPageSizeChange={() => {}} />)
    expect(screen.getByText('Showing 1–10 of 87 items')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 9' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Page 3' })).not.toBeInTheDocument() // collapsed into the ellipsis
  })

  it('disables Previous on page 1 and Next on the last page', () => {
    const { rerender } = render(<Pagination page={1} pageSize={10} totalItems={87} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled()
    rerender(<Pagination page={9} pageSize={10} totalItems={87} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByText('Showing 81–87 of 87 items')).toBeInTheDocument()
  })

  it('calls onPageChange and onPageSizeChange', () => {
    const onPageChange = vi.fn()
    const onPageSizeChange = vi.fn()
    render(<Pagination page={2} pageSize={10} totalItems={87} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } })
    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })

  it('shows a compact "Page X of Y" label for mobile', () => {
    render(<Pagination page={2} pageSize={10} totalItems={87} onPageChange={() => {}} />)
    expect(screen.getByText('Page 2 of 9')).toBeInTheDocument()
  })
})

describe('usePagination', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('slices items for the current page', () => {
    const { result } = renderHook(() => usePagination({ syncUrl: false }))
    const items = Array.from({ length: 25 }, (_, i) => i + 1)
    expect(result.current.paginate(items)).toEqual(items.slice(0, 10))
    act(() => result.current.setPage(3))
    expect(result.current.paginate(items)).toEqual(items.slice(20, 25))
  })

  it('resets to page 1 when a search/filter dependency changes', () => {
    let search = ''
    const { result, rerender } = renderHook(() => usePagination({ syncUrl: false, resetDeps: [search] }))
    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)
    search = 'cashier' // typing in search
    rerender()
    expect(result.current.page).toBe(1)
  })

  it('keeps the page in the URL query string', () => {
    const { result } = renderHook(() => usePagination({ urlKey: 'page' }))
    act(() => result.current.setPage(3))
    expect(window.location.search).toContain('page=3')
    act(() => result.current.setPage(1))
    expect(window.location.search).not.toContain('page=')
  })

  it('reads the initial page from the URL', () => {
    window.history.replaceState({}, '', '/?page=4')
    const { result } = renderHook(() => usePagination({ urlKey: 'page' }))
    expect(result.current.page).toBe(4)
  })

  it('changing rows-per-page returns to page 1', () => {
    const { result } = renderHook(() => usePagination({ syncUrl: false }))
    act(() => result.current.setPage(3))
    act(() => result.current.setPageSize(50))
    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(50)
  })
})
