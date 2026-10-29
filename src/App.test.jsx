import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  localStorage.clear()
  mockFetch.mockImplementation((url, options) => {
    if (url === 'http://localhost:4000/api/login') {
      const credentials = JSON.parse(options?.body || '{}')
      const role = credentials.email === 'employer@peso.gov' ? 'Employer' : 'Admin'
      return Promise.resolve({
        ok: true,
        json: async () => ({ token: `token-${role.toLowerCase()}`, user: { email: credentials.email, role, emailVerified: true, verificationStatus: role === 'Employer' ? 'approved' : undefined, profile: { name: role === 'Employer' ? 'Employer Contact' : 'Admin User' } } }),
      })
    }

    if (url === 'http://localhost:4000/api/profile') {
      const isEmployer = options?.headers?.Authorization === 'Bearer token-employer'
      return Promise.resolve({
        ok: true,
        json: async () => ({ email: isEmployer ? 'employer@peso.gov' : 'admin@peso.gov', role: isEmployer ? 'Employer' : 'Admin', emailVerified: true, verificationStatus: isEmployer ? 'approved' : undefined, profile: { name: isEmployer ? 'Employer Contact' : 'Admin User' } }),
      })
    }

    if (url.startsWith('http://localhost:4000/api/jobs?status=approved')) {
      return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } : []) })
    }

    if (url.startsWith('http://localhost:4000/api/jobs?status=applied')) {
      return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } : []) })
    }

    if (url.startsWith('http://localhost:4000/api/jobs?status=pending')) {
      return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } : []) })
    }

    if (url.startsWith('http://localhost:4000/api/jobs?status=mine')) {
      return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } : []) })
    }

    if (url.startsWith('http://localhost:4000/api/jobs?status=declined')) {
      return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } : []) })
    }

    if (url.startsWith('http://localhost:4000/api/employer-requests')) {
      return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } : []) })
    }

    if (url.startsWith('http://localhost:4000/api/notifications')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0, unreadCount: 0, page: 1, limit: 10 }) })
    }

    return Promise.resolve({ ok: true, json: async () => [] })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PESO Portal prototype', () => {
  it('shows the login screen before entering the portal', () => {
    render(<App />)
    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
  })

  it('starts applicant sign-up with account credentials and consent before the NSRP steps', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Create an account \(Applicant\)/i }))

    expect(screen.getByLabelText(/^Email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Confirm password/i)).toBeInTheDocument()
    expect(screen.getByText(/collection and processing/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/First name/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Create account$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeInTheDocument()
  })

  it('renders the portal after a successful admin login without admin role switching controls', async () => {
    render(<App />)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByRole('button', { name: /Sign in/i })

    fireEvent.change(emailInput, { target: { value: 'admin@peso.gov' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    expect(await screen.findByText(/Online Employment Services Platform/i)).toBeInTheDocument()
    expect(screen.queryByText(/Access Control/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apply Role/i })).not.toBeInTheDocument()
    expect(await screen.findByText(/All Dashboard/i)).toBeInTheDocument()
  })

  it('keeps the applicant table compact and opens review from the name or Review action', async () => {
    const applicant = {
      id: 'applicant-1',
      email: 'maria@example.com',
      role: 'Applicant',
      displayName: 'Maria Dela Cruz',
      emailVerified: true,
      phone: '09171234567',
      profile: { firstName: 'Maria', lastName: 'Dela Cruz', location: 'Quezon City, Metro Manila' },
      verificationStatus: 'under_review',
      verificationDocuments: [
        { docKey: 'nsrpForm', label: 'NSRP Registration Form', required: true, status: 'pending' },
        { docKey: 'birthCertificate', label: 'Birth Certificate', required: true, status: 'pending' },
        { docKey: 'validId1', label: 'Valid ID #1', required: true, status: 'approved' },
      ],
      createdAt: '2026-10-01T00:00:00.000Z',
    }
    mockFetch.mockImplementation((url) => {
      if (url === 'http://localhost:4000/api/login') {
        return Promise.resolve({ ok: true, json: async () => ({ token: 'token-admin', user: { email: 'admin@peso.gov', role: 'Admin', profile: { name: 'Admin' } } }) })
      }
      if (url === 'http://localhost:4000/api/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ email: 'admin@peso.gov', role: 'Admin', profile: { name: 'Admin' } }) })
      }
      if (url.startsWith('http://localhost:4000/api/admin/users?role=Applicant')) {
        return Promise.resolve({ ok: true, json: async () => ({ items: [applicant], total: 1, page: 1, limit: 10, totalPages: 1 }) })
      }
      if (url === 'http://localhost:4000/api/admin/users') {
        return Promise.resolve({ ok: true, json: async () => [applicant] })
      }
      if (url === 'http://localhost:4000/api/applicants/applicant-1/verification-documents') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            verificationStatus: 'under_review',
            basic: { firstName: 'Maria', lastName: 'Dela Cruz', phone: '09171234567', addressCity: 'Quezon City', addressProvince: 'Metro Manila' },
            nsrpData: { firstName: 'Maria', addressCity: 'Quezon City' },
            documents: [{
              docKey: 'nsrpForm',
              label: 'NSRP Registration Form',
              status: 'pending',
              sourceType: 'generated',
              latest: { version: 1, url: '/signed/nsrp' },
            }],
          }),
        })
      }
      if (url.startsWith('http://localhost:4000/api/employer-requests') || url.startsWith('http://localhost:4000/api/notifications')) {
        return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 }) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'admin@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Applicants' }))

    expect(await screen.findByText('Maria Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText('0917 123 4567')).toBeInTheDocument()
    expect(screen.getByText('1 of 3 approved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Applicant details')).toBeInTheDocument()
    expect(screen.getByText('Generated from online answers')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close verification documents' }))

    fireEvent.click(screen.getByRole('button', { name: 'Maria Dela Cruz' }))
    expect(await screen.findByText('Applicant details')).toBeInTheDocument()
  })

  it('opens an accessible admin job review modal and requires a decline reason', async () => {
    const reviewJob = {
      _id: 'review-job-1',
      title: 'Customer Service Representative',
      company: 'Review Company',
      description: 'Full job description for the review.',
      requirements: 'Two years of experience.',
      salary: '₱25,000',
      location: 'Legazpi City',
      employmentType: 'Full-time',
      slots: 3,
      deadline: '2026-12-31T00:00:00.000Z',
      status: 'pending',
      createdBy: 'employer@peso.gov',
      createdAt: '2026-10-01T00:00:00.000Z',
      employerDetails: {
        companyName: 'Review Company',
        contactName: 'Review Contact',
        email: 'employer@peso.gov',
        verificationStatus: 'approved',
      },
    }
    let reviewPayload = null
    mockFetch.mockImplementation((url, options) => {
      if (url === 'http://localhost:4000/api/login') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ token: 'token-admin', user: { email: 'admin@peso.gov', role: 'Admin', emailVerified: true, profile: { name: 'Admin' } } }),
        })
      }
      if (url === 'http://localhost:4000/api/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ email: 'admin@peso.gov', role: 'Admin', profile: { name: 'Admin' } }) })
      }
      if (url.startsWith('http://localhost:4000/api/jobs?status=pending')) {
        return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [reviewJob], total: 1, page: 1, limit: 10, totalPages: 1 } : [reviewJob]) })
      }
      if (url.startsWith('http://localhost:4000/api/jobs?status=approved') || url.startsWith('http://localhost:4000/api/jobs?status=declined')) {
        return Promise.resolve({ ok: true, json: async () => (url.includes('page=') ? { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } : []) })
      }
      if (url.startsWith('http://localhost:4000/api/employer-requests') || url.startsWith('http://localhost:4000/api/notifications')) {
        return Promise.resolve({ ok: true, json: async () => (url.includes('page=') || url.includes('limit=') ? { items: [], total: 0, unreadCount: 0, page: 1, limit: 10, totalPages: 1 } : []) })
      }
      if (url === 'http://localhost:4000/api/jobs/review-job-1/status') {
        reviewPayload = JSON.parse(options.body)
        return Promise.resolve({ ok: true, json: async () => ({ ...reviewJob, status: 'declined', reviewReason: reviewPayload.reason }) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'admin@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Job Postings' }))

    fireEvent.click(await screen.findByRole('button', { name: /View Customer Service Representative details/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Customer Service Representative' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Full job description for the review.')).toBeInTheDocument()
    expect(screen.getByText('Review Contact')).toBeInTheDocument()
    expect(screen.getByText('approved', { exact: true })).toBeInTheDocument()

    // Decline opens the shared confirm dialog; nothing is sent until confirmed
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    const confirmDialog = await screen.findByRole('alertdialog', { name: /Decline "Customer Service Representative"\?/i })
    const confirmReject = within(confirmDialog).getByRole('button', { name: 'Confirm reject' })
    expect(confirmReject).toBeDisabled() // reason required (min 5 chars)
    expect(reviewPayload).toBeNull()

    fireEvent.change(within(confirmDialog).getByLabelText('Reason'), { target: { value: 'Please add the work schedule.' } })
    fireEvent.click(confirmReject)

    await waitFor(() => expect(reviewPayload).toEqual({ status: 'declined', reason: 'Please add the work schedule.' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Customer Service Representative' })).not.toBeInTheDocument())
  })

  it('expands approved job applicants below the job row without opening a modal', async () => {
    const approvedJob = {
      _id: 'approved-job-1',
      title: 'Office Clerk',
      company: 'PESO Test Company',
      status: 'approved',
      requirements: 'Basic computer skills',
      description: 'Assist with office tasks.',
      applicants: [{ email: 'applicant@peso.gov', appliedAt: '2026-10-01T00:00:00.000Z' }],
    }
    mockFetch.mockImplementation((url) => {
      if (url === 'http://localhost:4000/api/login') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ token: 'token-admin', user: { email: 'admin@peso.gov', role: 'Admin', emailVerified: true, profile: { name: 'Admin' } } }),
        })
      }
      if (url === 'http://localhost:4000/api/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ email: 'admin@peso.gov', role: 'Admin', profile: { name: 'Admin' } }) })
      }
      if (url.startsWith('http://localhost:4000/api/jobs?status=approved')) {
        return Promise.resolve({
          ok: true,
          json: async () => (url.includes('page=')
            ? { items: [approvedJob], total: 1, page: 1, limit: 10, totalPages: 1 }
            : [approvedJob]),
        })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'admin@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Job Postings' }))
    const jobRow = await screen.findByRole('button', { name: 'View Office Clerk details' })
    expect(jobRow.querySelector('.text-slate-900')).toHaveTextContent('Office Clerk')
    expect(jobRow.querySelector('.text-slate-700')).toHaveTextContent('PESO Test Company')
    fireEvent.click(await screen.findByRole('button', { name: 'View 1 applicants' }))

    const details = await screen.findByRole('region', { name: 'Job Offer Details' })
    expect(screen.getByText(/Assist with office tasks\./)).toBeInTheDocument()
    expect(details.textContent).toContain('applicant@peso.gov')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide applicants' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Job Offer Details' })).not.toBeInTheDocument())
  })

  it('routes incomplete applicants to the registration checklist and its profile fix', async () => {
    const registration = {
      complete: false,
      done: 3,
      total: 8,
      checklist: [
        { key: 'name', label: 'Full name', done: true, link: 'profile' },
        { key: 'location', label: 'Location', done: false, link: 'profile' },
        { key: 'skills', label: 'At least one skill', done: false, link: 'profile' },
        { key: 'summary', label: 'Short bio / about me', done: true, link: 'profile' },
        { key: 'nsrpForm', label: 'NSRP Registration Form', done: false, link: 'documents' },
        { key: 'birthCertificate', label: 'Birth Certificate', done: false, link: 'documents' },
        { key: 'validId1', label: 'Valid ID', done: true, link: 'documents' },
        { key: 'resume', label: 'Resume (PDF, DOCX, JPG, or PNG)', done: false, link: 'documents' },
      ],
    }
    mockFetch.mockImplementation((url) => {
      if (url === 'http://localhost:4000/api/login') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            token: 'token-incomplete-applicant',
            user: {
              email: 'incomplete@peso.gov',
              role: 'Applicant',
              emailVerified: true,
              verificationStatus: 'under_review',
              registration,
              profile: { name: 'Incomplete Applicant' },
            },
          }),
        })
      }
      if (url === 'http://localhost:4000/api/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ registration, profile: { name: 'Incomplete Applicant' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'incomplete@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

    expect(await screen.findByText(/Complete your registration/i)).toBeInTheDocument()
    expect(await screen.findByText('3 of 8 steps done')).toBeInTheDocument()
    expect(screen.getByText('NSRP Registration Form')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Jobs$/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Fill in' })[0])
    expect(await screen.findByText('Applicant Profile')).toBeInTheDocument()
  })

  it('allows employer login and shows employer module navigation', async () => {
    render(<App />)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByRole('button', { name: /Sign in/i })

    fireEvent.change(emailInput, { target: { value: 'employer@peso.gov' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    expect(await screen.findByText(/Online Employment Services Platform/i)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /Job Postings/i })[0])
    expect(await screen.findByText(/Employer Module/i)).toBeInTheDocument()
  })

  it('restores a remembered email from storage', () => {
    localStorage.setItem('peso-portal-remembered-email', 'saved@peso.gov')

    render(<App />)

    expect(screen.getByLabelText(/Email/i)).toHaveValue('saved@peso.gov')
    expect(screen.getByLabelText(/Remember me/i)).toBeChecked()
  })

  it('opens job details when an applicant clicks a job offer card', async () => {
    mockFetch.mockImplementation((url) => {
      if (url === 'http://localhost:4000/api/login') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            token: 'token',
            user: { email: 'applicant@peso.gov', role: 'Applicant', emailVerified: true, verificationStatus: 'approved', profile: { name: 'Applicant One' } },
          }),
        })
      }

      if (url === 'http://localhost:4000/api/profile') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            email: 'applicant@peso.gov',
            role: 'Applicant',
            emailVerified: true,
            verificationStatus: 'approved',
            profile: { name: 'Applicant One', skills: ['Cleaning'] },
          }),
        })
      }

      if (url.startsWith('http://localhost:4000/api/jobs?status=approved')) {
        const job = {
          _id: 'job-1',
          title: 'Warehouse Helper',
          company: 'Acme Logistics',
          location: 'Quezon City',
          description: 'Move inventory and support operations.',
          requirements: 'Fast learner',
          skills: ['Cleaning', 'Driving'],
          salary: '₱18,000',
          createdAt: '2024-01-01T00:00:00.000Z',
        }
        return Promise.resolve({
          ok: true,
          json: async () => (url.includes('page=')
            ? { items: [job], total: 1, page: 1, limit: 10, totalPages: 1, facets: { skills: [], locations: [], locationTypes: [], employmentTypes: [] } }
            : [job]),
        })
      }

      if (url === 'http://localhost:4000/api/jobs?status=applied') {
        return Promise.resolve({ ok: true, json: async () => [] })
      }

      if (url === 'http://localhost:4000/api/notifications') {
        return Promise.resolve({ ok: true, json: async () => [] })
      }

      return Promise.resolve({ ok: true, json: async () => [] })
    })

    render(<App />)

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'applicant@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

    fireEvent.click(await screen.findByRole('button', { name: /^Jobs$/i }))

    // Clicking a card opens the job detail modal; Apply starts the wizard from there
    const card = await screen.findByRole('button', { name: /View Warehouse Helper details/i })
    fireEvent.click(card)
    const detail = await screen.findByRole('dialog', { name: 'Warehouse Helper' })
    expect(within(detail).getByText(/Move inventory/)).toBeInTheDocument()
    expect(within(detail).getByText(/Fast learner/)).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: /Apply Now/i }))
    expect(await screen.findByText(/Apply for Warehouse Helper/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Acme Logistics/i).length).toBeGreaterThan(0)
  })
})
