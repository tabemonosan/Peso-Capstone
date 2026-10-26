import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import JobsView from '../components/JobsView'

const mockFetch = vi.fn()

const EMPTY_FACETS = { skills: [], locations: [], locationTypes: [], employmentTypes: [] }

function renderJobsView() {
  return render(
    <JobsView
      activeRole="Applicant"
      jobLoading={false}
      availableSkills={[]}
      appliedJobs={[]}
      appliedJobIds={new Set()}
      filteredPendingJobs={[]}
      filteredApprovedJobs={[]}
      filteredDeclinedJobs={[]}
      currentUser={{ email: 'a@peso.gov', profile: { skills: [] } }}
      token="token"
      applicantSkills={[]}
      onGoToProfile={() => {}}
    />,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  mockFetch.mockImplementation((url) => {
    if (url.startsWith('http://localhost:4000/api/jobs')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0, page: 1, limit: 10, totalPages: 1, facets: EMPTY_FACETS }) })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Applicant job board empty states', () => {
  it('shows "No approved jobs" when there are no jobs and no active filters', async () => {
    renderJobsView()
    expect(await screen.findByText(/No approved jobs are available yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Clear all filters/i })).not.toBeInTheDocument()
  })

  it('shows "No jobs match these filters" with a Clear all button when filters return nothing', async () => {
    window.history.replaceState({}, '', '/?locations=Legazpi%20City')
    renderJobsView()
    expect(await screen.findByText(/No jobs match these filters/i)).toBeInTheDocument()
    const clearButton = screen.getByRole('button', { name: /Clear all filters/i })
    fireEvent.click(clearButton)
    await waitFor(() => expect(window.location.search).not.toContain('locations='))
    expect(await screen.findByText(/No approved jobs are available yet/i)).toBeInTheDocument()
  })
})
