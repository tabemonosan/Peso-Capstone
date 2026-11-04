import { render, screen, fireEvent, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import JobsView from '../components/JobsView'

const applied = { _id: 'job1', title: 'Delivery Driver', company: 'PARKour', skills: ['Driving'], status: 'approved', applicants: [{ email: 'applicant@example.com', appliedAt: '2026-11-02T12:00:00Z' }] }
const notApplied = { _id: 'job2', title: 'Company Driver', company: 'Another Company', skills: ['Driving'], status: 'approved', applicants: [] }
const history = [{ id: 'application1', jobId: 'job1', referralId: 'referral1', source: 'auto', status: 'pending', submittedAt: '2026-11-02T12:00:00Z', history: [] }]
let available
beforeEach(() => {
  available = [applied, notApplied]
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, json: async () => String(url).includes('/api/applications/mine') ? history : { items: available, total: available.length, page: 1, totalPages: 1, facets: { skills: [], locations: [], locationTypes: [], employmentTypes: [] } } })))
})
afterEach(() => vi.unstubAllGlobals())
function mount() {
  render(<JobsView activeRole="Applicant" currentUser={{ email: 'applicant@example.com', profile: { skills: ['Driving'] } }} applicantSkills={['Driving']} token="token" appliedJobs={[applied]} appliedJobIds={new Set(['job1'])} jobLoading={false} availableSkills={[]} filteredPendingJobs={[]} filteredApprovedJobs={[]} filteredDeclinedJobs={[]} setSelectedJob={vi.fn()} />)
}

describe('application details beneath their job posting', () => {
  it('explains when an employer is suspended and prevents opening a new application', async () => {
    available = [{ ...notApplied, employerBranding: { receivingApplicationsSuspended: true } }]
    mount()
    const details = await screen.findByRole('article', { name: 'Company Driver job details' })
    expect(within(details).getByText('This employer is not accepting applications right now.')).toBeInTheDocument()
    expect(within(details).getByRole('button', { name: 'Applications paused' })).toBeDisabled()
  })
  it('shows details once beneath the matching posting, with no application panel for other jobs', async () => {
    mount()
    const driver = await screen.findByRole('article', { name: 'Delivery Driver job details' })
    const section = within(driver).getByRole('region', { name: 'Your application for Delivery Driver' })
    expect(await within(section).findByText('With employer')).toBeInTheDocument()
    expect(within(section).getByText(/Applied on:/)).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Withdraw application' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Company Driver details' }))
    const other = screen.getByRole('article', { name: 'Company Driver job details' })
    expect(within(other).queryByText('Your application')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Delivery Driver details' }))
    expect(screen.queryByRole('heading', { name: 'Applied', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Application history', exact: true })).not.toBeInTheDocument()
    expect(screen.getAllByText('With employer')).toHaveLength(1)
  })
  it('keeps timeline and withdrawal controls from opening the job details modal', async () => {
    mount()
    const section = await screen.findByRole('region', { name: 'Your application for Delivery Driver' })
    fireEvent.click(await within(section).findByText('Application timeline'))
    expect(screen.queryByRole('dialog', { name: 'Delivery Driver' })).not.toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Withdraw application' }))
    expect(screen.getByRole('alertdialog', { name: 'Withdraw this application?' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Delivery Driver' })).not.toBeInTheDocument()
  })
  it('retains history for applied jobs that are outside the current results', async () => {
    available = [notApplied]
    mount()
    await screen.findByRole('article', { name: 'Company Driver job details' })
    expect(screen.getByRole('heading', { name: 'Application history', exact: true })).toBeInTheDocument()
    expect(await screen.findByText('With employer')).toBeInTheDocument()
    expect(screen.getByText('Applications to jobs outside the current results.')).toBeInTheDocument()
  })
})
