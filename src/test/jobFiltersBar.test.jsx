import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import JobFiltersBar from '../components/JobFiltersBar'
import Pagination from '../components/Pagination'
import { useJobFilters } from '../hooks/useJobFilters'
import { usePagination } from '../hooks/usePagination'

const FACETS = {
  skills: [{ value: 'Cooking', count: 3 }, { value: 'Driving', count: 1 }],
  locations: [{ value: 'Legazpi City', count: 4 }, { value: 'Daraga', count: 1 }],
  locationTypes: [{ value: 'On-site', count: 3 }, { value: 'Remote', count: 2 }],
  employmentTypes: [{ value: 'Full-time', count: 4 }, { value: 'Part-time', count: 1 }],
}

// Harness: the bar wired to the real hook + pagination, like JobsView does
function Harness() {
  const pagination = usePagination({ syncUrl: false })
  const jobFilters = useJobFilters({ onResetPage: () => pagination.setPage(1) })
  return (
    <div>
      <JobFiltersBar
        filters={jobFilters.filters}
        facets={FACETS}
        resultCount={0}
        mySkills={['Cooking']}
        onToggle={jobFilters.toggleValue}
        onDatePosted={jobFilters.setDatePosted}
        onKeyword={jobFilters.setKeyword}
        onClearGroup={jobFilters.clearGroup}
        onClearAll={jobFilters.clearAll}
      />
      <p data-testid="page">Page {pagination.page}</p>
      <Pagination page={pagination.page} pageSize={10} totalItems={30} onPageChange={pagination.setPage} />
    </div>
  )
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  sessionStorage.clear()
})

describe('JobFiltersBar', () => {
  it.each(['url', 'session'])('restores an old full address as its municipality from %s', source => {
    if (source === 'url') window.history.replaceState({}, '', '/?locations=Calpi%2C%20Oas%2C%20Albay')
    else sessionStorage.setItem('peso-job-filters', JSON.stringify({ filters: { locations: ['Calpi, Oas, Albay'] } }))
    render(<Harness />)
    expect(screen.getByRole('button', { name: /City\/Municipality.*Oas/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove filter Oas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove filter Calpi, Oas, Albay' })).not.toBeInTheDocument()
  })

  it('selecting an option updates the pill label and adds a removable chip', () => {
    render(<Harness />)
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'City/Municipality ▾' }))
    fireEvent.click(screen.getByLabelText(/Legazpi City/))

    expect(screen.getByRole('button', { name: /City\/Municipality · Legazpi City/ })).toBeInTheDocument()
    expect(screen.getAllByText('Legazpi City', { selector: 'span' }).length).toBeGreaterThan(0) // chip + checklist option
    expect(screen.getByText('Clear all')).toBeInTheDocument()

    // Remove via the chip
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter Legazpi City' }))
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument()
  })

  it('multi-select within a group shows the count on the pill', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Employment type ▾' }))
    fireEvent.click(screen.getByLabelText(/Full-time/))
    fireEvent.click(screen.getByLabelText(/Part-time/))
    expect(screen.getByRole('button', { name: /Employment type · 2/ })).toBeInTheDocument()
  })

  it('Clear all resets every filter', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'City/Municipality ▾' }))
    fireEvent.click(screen.getByLabelText(/Legazpi City/))
    fireEvent.click(screen.getByRole('button', { name: 'Employment type ▾' }))
    fireEvent.click(screen.getByLabelText(/Full-time/))
    expect(screen.getByLabelText('Active filters').children.length).toBe(2)

    fireEvent.click(screen.getByText('Clear all'))
    expect(screen.queryByLabelText('Active filters')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'City/Municipality ▾' })).toHaveTextContent('City/Municipality')
  })

  it('changing a filter resets pagination to page 1', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByTestId('page')).toHaveTextContent('Page 2')
    fireEvent.click(screen.getByRole('button', { name: 'City/Municipality ▾' }))
    fireEvent.click(screen.getByLabelText(/Daraga/))
    expect(screen.getByTestId('page')).toHaveTextContent('Page 1')
  })

  it('removes Skills on desktop and mobile and retires saved filters', () => {
    window.history.replaceState({}, '', '/?skills=Cooking&locations=Daraga')
    sessionStorage.setItem('peso-job-filters', JSON.stringify({ filters: { skills: ['Driving'] } }))
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /^Skills/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove filter (Cooking|Driving)$/ })).not.toBeInTheDocument()
    expect(window.location.search).not.toContain('skills=')
    expect(JSON.parse(sessionStorage.getItem('peso-job-filters')).filters.skills).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    const sheet = screen.getByRole('dialog', { name: 'Job filters' })
    expect(within(sheet).queryByText('Skills', { exact: true })).not.toBeInTheDocument()
    expect(within(sheet).getByText('City/Municipality')).toBeInTheDocument()
  })

  it('location options show job counts', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'City/Municipality ▾' }))
    expect(screen.getByText('(4)')).toBeInTheDocument()
  })

  it('keeps filters in the URL query string', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'City/Municipality ▾' }))
    fireEvent.click(screen.getByLabelText(/Legazpi City/))
    expect(window.location.search).toContain('locations=Legazpi')
  })
})

