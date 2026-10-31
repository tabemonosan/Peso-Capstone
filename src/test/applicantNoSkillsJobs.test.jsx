import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const mockFetch = vi.fn()

const applicantUser = {
  id: 'app-1',
  email: 'noskills@peso.gov',
  role: 'Applicant',
  emailVerified: true,
  verificationStatus: 'approved',
  // Registration complete per the server: 7 of 7 steps, no skills required
  registration: {
    complete: true,
    done: 7,
    total: 7,
    checklist: [
      { key: 'name', label: 'Full name', done: true, link: 'profile' },
      { key: 'location', label: 'Location', done: true, link: 'profile' },
      { key: 'summary', label: 'Short bio / about me', done: true, link: 'profile' },
      { key: 'nsrpForm', label: 'NSRP Registration Form', done: true, link: 'documents' },
      { key: 'birthCertificate', label: 'Birth Certificate', done: true, link: 'documents' },
      { key: 'validId1', label: 'Valid ID', done: true, link: 'documents' },
      { key: 'resume', label: 'Resume (PDF, DOCX, JPG, or PNG)', done: true, link: 'documents' },
    ],
  },
  profile: {
    firstName: 'No',
    lastName: 'Skills',
    name: 'No Skills',
    location: 'Legazpi City',
    summary: 'Hardworking applicant.',
    skills: [],
  },
}

const approvedJobs = [
  { _id: 'job-1', title: 'Cashier', company: 'Test Corp', location: 'Legazpi City', skills: ['Customer service'], status: 'approved', createdAt: '2026-01-01' },
  { _id: 'job-2', title: 'Encoder', company: 'Data Inc', location: 'Daraga', skills: ['Data entry'], status: 'approved', createdAt: '2026-02-01' },
]

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  localStorage.clear()
  mockFetch.mockImplementation((url) => {
    if (url === 'http://localhost:4000/api/login') {
      return Promise.resolve({ ok: true, json: async () => ({ token: 'token-applicant', user: applicantUser }) })
    }
    if (url === 'http://localhost:4000/api/profile') {
      return Promise.resolve({ ok: true, json: async () => applicantUser })
    }
    if (url.startsWith('http://localhost:4000/api/jobs?status=approved')) {
      return Promise.resolve({
        ok: true,
        json: async () => (url.includes('page=')
          ? { items: approvedJobs, total: approvedJobs.length, page: 1, limit: 10, totalPages: 1, facets: { skills: [], locations: [], locationTypes: [], employmentTypes: [] } }
          : approvedJobs),
      })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function loginAsApplicant() {
  render(<App />)
  fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'noskills@peso.gov' } })
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
  fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }).closest('form'))
  await screen.findByRole('heading', { name: 'Home', exact: true })
}

describe('Job listings for an applicant with no skills', () => {
  it('loads job listings and shows the dismissible skills hint without blocking', async () => {
    await loginAsApplicant()

    fireEvent.click(await screen.findByRole('button', { name: 'Jobs' }))

    // Jobs render normally even with an empty skills list
    await waitFor(() => expect(screen.getAllByText('Cashier').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Encoder').length).toBeGreaterThan(0)

    // The hint is shown and does not block the listings
    const hint = screen.getByText('Add your skills to see jobs that match you.')
    expect(hint).toBeInTheDocument()

    // Dismissing hides it (and persists via localStorage)
    fireEvent.click(screen.getByRole('button', { name: /Dismiss skills hint/i }))
    expect(screen.queryByText('Add your skills to see jobs that match you.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Cashier').length).toBeGreaterThan(0)
  })

  it('does not show the registration gate when all 7 required steps are done', async () => {
    await loginAsApplicant()
    expect(screen.queryByText(/Complete your registration/i)).not.toBeInTheDocument()
  })
})
