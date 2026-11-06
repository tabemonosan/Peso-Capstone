import { render, screen, fireEvent, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import JobsView from '../components/JobsView'
import { PH_LOCATIONS } from '../../shared/phLocations.js'

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
  it('lists every supported city and municipality even without matching job postings', async () => {
    mount()
    await screen.findByRole('article', { name: 'Delivery Driver job details' })
    fireEvent.click(screen.getByRole('button', { name: 'City/Municipality \u25be' }))
    const dropdown = screen.getByRole('dialog', { name: 'City/Municipality' })
    expect(within(dropdown).getAllByRole('checkbox')).toHaveLength(Object.keys(PH_LOCATIONS).length)
    for (const city of Object.keys(PH_LOCATIONS)) expect(within(dropdown).getByRole('checkbox', { name: new RegExp(city) })).toBeEnabled()
    fireEvent.click(within(dropdown).getByRole('checkbox', { name: /Tiwi/ }))
    expect(new URLSearchParams(window.location.search).get('locations')).toContain('Tiwi')
  })

  it('shows the employment tag and all public posting details to applicants', async () => {
    available = [{ ...notApplied, employmentType: 'Project-based', locationType: 'Hybrid', city: 'Manito', province: 'Albay', barangay: 'Nagotgot',
      salaryMin: 500, salaryMax: 700, payFrequency: 'Daily', negotiable: false, education: 'College Graduate', experience: '5+ years', slots: 8, deadline: '2026-11-30',
      description: 'Deliver orders and coordinate routes.', requirements: 'Valid license and training certificate.', skills: ['Driving'],
      languageRequirements: [{ name: 'Filipino', read: true, write: false, speak: true, understand: true }], notesToAdmin: 'PRIVATE admin note' }]
    mount()
    const details = await screen.findByRole('article', { name: 'Company Driver job details' })
    expect(within(details).getByLabelText('Employment type: Project-based')).toHaveTextContent('Project-based')
    const card = screen.getByRole('button', { name: 'View Company Driver details' })
    expect(within(card).getByLabelText('Employment type: Project-based')).toHaveTextContent('Project-based')
    expect(within(card).getByText('Hybrid')).toBeInTheDocument()
    const facts = [...details.querySelectorAll('dt')].map(term => [term.textContent, term.nextElementSibling.textContent])
    expect(Object.fromEntries(facts)).toMatchObject({ Status: 'approved', Location: 'Nagotgot, Manito, Albay', Barangay: 'Nagotgot', 'City / municipality': 'Manito', Province: 'Albay', 'Location type': 'Hybrid', 'Employment type': 'Project-based', 'Pay frequency': 'Daily', Negotiable: 'No', Education: 'College Graduate', Experience: '5+ years', Slots: '8' })
    expect(Object.fromEntries(facts).Salary).toContain('500')
    expect(Object.fromEntries(facts).Salary).toContain('/ day')
    expect(Object.fromEntries(facts)['Apply by']).toContain('2026')
    expect(within(details).getByText('Deliver orders and coordinate routes.')).toBeInTheDocument()
    expect(within(details).getByText('Valid license and training certificate.')).toBeInTheDocument()
    expect(within(details).getByText('Driving', { exact: true })).toBeInTheDocument()
    expect(within(details).getByRole('region', { name: 'Required language proficiency' })).toHaveTextContent('Filipino: read, speak, understand')
    expect(within(details).queryByText('PRIVATE admin note')).not.toBeInTheDocument()
  })

  it('explains when an employer is suspended and prevents opening a new application', async () => {
    available = [{ ...notApplied, employerBranding: { receivingApplicationsSuspended: true } }]
    mount()
    const details = await screen.findByRole('article', { name: 'Company Driver job details' })
    expect(within(details).getByText('This employer is not accepting applications right now.')).toBeInTheDocument()
    expect(within(details).getByRole('button', { name: 'Applications paused' })).toBeDisabled()
  })
  it('keeps applied badges and prevents duplicate applications without showing history in Jobs', async () => {
    mount()
    const driver = await screen.findByRole('article', { name: 'Delivery Driver job details' })
    expect(within(driver).getByRole('button', { name: 'Already applied' })).toBeDisabled()
    expect(within(screen.getByRole('button', { name: 'View Delivery Driver details' })).getByText('Applied')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Application history', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Application timeline')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw application' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Company Driver details' }))
    expect(within(screen.getByRole('article', { name: 'Company Driver job details' })).getByRole('button', { name: /Apply Now/ })).toBeEnabled()
  })
  it('does not display application history for jobs outside the current results', async () => {
    available = [notApplied]
    mount()
    await screen.findByRole('article', { name: 'Company Driver job details' })
    expect(screen.queryByRole('heading', { name: 'Application history', exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Applications to jobs outside the current results.')).not.toBeInTheDocument()
    expect(screen.queryByText('Application timeline')).not.toBeInTheDocument()
  })
})
