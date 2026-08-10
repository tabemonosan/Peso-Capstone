import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  localStorage.clear()
  mockFetch.mockImplementation((url) => {
    if (url === 'http://localhost:4000/api/login') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ token: 'token', user: { email: 'admin@peso.gov', role: 'Admin', profile: { name: 'Admin User' } } }),
      })
    }

    if (url === 'http://localhost:4000/api/profile') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ email: 'admin@peso.gov', role: 'Admin', profile: { name: 'Admin User' } }),
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

    expect(await screen.findByText(/Employer Module/i)).toBeInTheDocument()
    expect(await screen.findByText(/Post Vacancies/i)).toBeInTheDocument()
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
    expect(screen.getByText(/Acme Logistics/i)).toBeInTheDocument()
  })
})
