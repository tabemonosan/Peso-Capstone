import { fireEvent, render, screen } from '@testing-library/react'
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
        json: async () => ({ token: `token-${role.toLowerCase()}`, user: { email: credentials.email, role, verificationStatus: role === 'Employer' ? 'approved' : undefined, profile: { name: role === 'Employer' ? 'Employer Contact' : 'Admin User' } } }),
      })
    }

    if (url === 'http://localhost:4000/api/profile') {
      const isEmployer = options?.headers?.Authorization === 'Bearer token-employer'
      return Promise.resolve({
        ok: true,
        json: async () => ({ email: isEmployer ? 'employer@peso.gov' : 'admin@peso.gov', role: isEmployer ? 'Employer' : 'Admin', profile: { name: isEmployer ? 'Employer Contact' : 'Admin User' } }),
      })
    }

    if (url === 'http://localhost:4000/api/jobs?status=approved') {
      return Promise.resolve({ ok: true, json: async () => [] })
    }

    if (url === 'http://localhost:4000/api/jobs?status=applied') {
      return Promise.resolve({ ok: true, json: async () => [] })
    }

    if (url === 'http://localhost:4000/api/jobs?status=pending') {
      return Promise.resolve({ ok: true, json: async () => [] })
    }

    if (url === 'http://localhost:4000/api/jobs?status=mine') {
      return Promise.resolve({ ok: true, json: async () => [] })
    }

    if (url === 'http://localhost:4000/api/employer-requests') {
      return Promise.resolve({ ok: true, json: async () => [] })
    }

    if (url === 'http://localhost:4000/api/notifications') {
      return Promise.resolve({ ok: true, json: async () => [] })
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

  it('asks new applicants to choose skills right after signup and saves them to the profile', async () => {
    mockFetch.mockImplementation((url, options) => {
      if (url === 'http://localhost:4000/api/signup') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            token: 'token-new-applicant',
            user: { email: 'newapplicant@peso.gov', role: 'Applicant', profile: { name: 'New Applicant' } },
          }),
        })
      }

      if (url === 'http://localhost:4000/api/profile') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            email: 'newapplicant@peso.gov',
            role: 'Applicant',
            profile: { name: 'New Applicant', skills: ['Cleaning'], traits: 'Reliable', summary: 'I enjoy helping people and working with teams.' },
          }),
        })
      }

      if (url === 'http://localhost:4000/api/jobs?status=approved') {
        return Promise.resolve({ ok: true, json: async () => [] })
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

    fireEvent.click(screen.getByRole('button', { name: /Create an account \(Applicant\)/i }))
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'New Applicant' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'newapplicant@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }))

    expect(await screen.findByText(/Tell us about your skills/i)).toBeInTheDocument()
    const cleaningCheckboxes = screen.getAllByLabelText(/Cleaning/i)
    fireEvent.click(cleaningCheckboxes[0])
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

    expect(await screen.findAllByText(/Cleaning/i)).toHaveLength(2)
  })

  it('renders the portal after a successful admin login and shows admin access control', async () => {
    render(<App />)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByRole('button', { name: /Sign in/i })

    fireEvent.change(emailInput, { target: { value: 'admin@peso.gov' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    expect(await screen.findByText(/Online Employment Services Platform/i)).toBeInTheDocument()
    expect(await screen.findByText(/Access Control/i)).toBeInTheDocument()
    expect(await screen.findByText(/Role:\s*Admin/i)).toBeInTheDocument()
  })

  it('allows employer login and shows employer module navigation', async () => {
    render(<App />)
    const emailInput = screen.getByLabelText(/Email/i)
    const passwordInput = screen.getByLabelText(/Password/i)
    const submitButton = screen.getByRole('button', { name: /Sign in/i })

    fireEvent.change(emailInput, { target: { value: 'employer@peso.gov' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    expect(await screen.findByRole('heading', { name: /Approved Job Postings/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Job Postings/i }))
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
            user: { email: 'applicant@peso.gov', role: 'Applicant', profile: { name: 'Applicant One' } },
          }),
        })
      }

      if (url === 'http://localhost:4000/api/profile') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            email: 'applicant@peso.gov',
            role: 'Applicant',
            profile: { name: 'Applicant One', skills: ['Cleaning'] },
          }),
        })
      }

      if (url === 'http://localhost:4000/api/jobs?status=approved') {
        return Promise.resolve({
          ok: true,
          json: async () => ([{
            _id: 'job-1',
            title: 'Warehouse Helper',
            company: 'Acme Logistics',
            location: 'Quezon City',
            description: 'Move inventory and support operations.',
            requirements: 'Fast learner',
            skills: ['Cleaning', 'Driving'],
            salary: '₱18,000',
            createdAt: '2024-01-01T00:00:00.000Z',
          }]),
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

    expect(await screen.findByText(/Warehouse Helper/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Warehouse Helper/i))

    expect(await screen.findByText(/Job details/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Acme Logistics/i).length).toBeGreaterThan(0)
  })
})
