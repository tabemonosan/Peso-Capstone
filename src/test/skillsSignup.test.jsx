import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { sortJobsByMatch } from '../App'

const mockFetch = vi.fn()
const pdfFile = (name) => new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  })
  localStorage.clear()
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
  mockFetch.mockImplementation((url) => {
    if (url === 'http://localhost:4000/api/nsrp/validate-signup') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, fieldErrors: {} }) })
    }
    if (url === 'http://localhost:4000/api/nsrp/preview-signup') {
      return Promise.resolve({
        ok: true,
        headers: { get: () => '[]' },
        blob: async () => new Blob(['%PDF-1.4 preview'], { type: 'application/pdf' }),
      })
    }
    if (url === 'http://localhost:4000/api/signup/email-code') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
    }
    if (url === 'http://localhost:4000/api/signup/email-code/verify') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, proofToken: 'proof-token-123' }) })
    }
    if (url === 'http://localhost:4000/api/signup') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ token: 'token-new-applicant', user: { email: 'new@peso.gov', role: 'Applicant' } }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function openSignup() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Create an account \(Applicant\)/i }))
}

// Completes the step-1 email-code verification via the mocked endpoints.
async function verifyStepOneEmail(email = 'new@peso.gov') {
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
  await screen.findByLabelText(/^Code digit 1$/i)
  for (let i = 1; i <= 6; i += 1) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^Code digit ${i}$`, 'i')), { target: { value: String(i) } })
  }
  fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
  await screen.findByText(/Email verified/i)
}

// Past the Account step, choose the online NSRP path.
async function chooseOnlinePath() {
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByRole('radio', { name: /Fill out my NSRP online/i })
  fireEvent.click(screen.getByRole('radio', { name: /Fill out my NSRP online/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
}

// Walks the wizard from the account step to the Documents step with valid input.
async function advanceToDocumentsStep() {
  openSignup()
  await verifyStepOneEmail()
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
  fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password123!' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /collection and processing/i }))
  await chooseOnlinePath()

  await screen.findByLabelText(/^Surname/i)
  fireEvent.change(screen.getByLabelText(/^Surname/i), { target: { value: 'Cruz' } })
  fireEvent.change(screen.getByLabelText(/^First name/i), { target: { value: 'Juan' } })
  fireEvent.change(screen.getByLabelText(/^Date of birth/i), { target: { value: '1990-01-01' } })
  fireEvent.change(screen.getByLabelText(/^Place of birth/i), { target: { value: 'Legazpi City' } })
  fireEvent.change(screen.getByLabelText(/^Sex/i), { target: { value: 'Male' } })
  fireEvent.change(screen.getByLabelText(/^Civil status/i), { target: { value: 'Single' } })
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

  await screen.findByLabelText(/House no\. \/ street/i)
  fireEvent.change(screen.getByLabelText(/House no\. \/ street/i), { target: { value: '1 Main Street' } })
  fireEvent.change(screen.getByLabelText(/^Barangay/i), { target: { value: 'Centro' } })
  fireEvent.change(screen.getByLabelText(/Municipality \/ city/i), { target: { value: 'Legazpi' } })
  fireEvent.change(screen.getByLabelText(/^Province/i), { target: { value: 'Albay' } })
  fireEvent.change(screen.getByLabelText(/Cellphone number/i), { target: { value: '09171234567' } })
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByText('Education & training')
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByText('Work & skills')
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

  await screen.findByLabelText(/^Employment status/i)
  fireEvent.change(screen.getByLabelText(/^Employment status/i), { target: { value: 'Unemployed' } })
  fireEvent.change(screen.getByLabelText(/Actively looking for work/i), { target: { value: 'Yes' } })
  fireEvent.change(screen.getByLabelText(/Willing to work immediately/i), { target: { value: 'Yes' } })
  fireEvent.change(screen.getByLabelText(/4Ps beneficiary/i), { target: { value: 'No' } })
  fireEvent.change(screen.getByLabelText(/Preferred occupation 1/i), { target: { value: 'Clerk' } })
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

  await screen.findByText('Certification')
  fireEvent.click(screen.getByRole('checkbox', { name: /I certify that this information/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

  await screen.findByText('Documents')
  const docsFieldset = screen.getByText('Verification documents').closest('fieldset')
  const files = docsFieldset.querySelectorAll('input[type="file"]')
  fireEvent.change(files[0], { target: { files: [pdfFile('birth.pdf')] } })
  fireEvent.change(files[1], { target: { files: [pdfFile('id-front.pdf')] } })
  fireEvent.change(within(docsFieldset).getAllByRole('combobox')[0], { target: { value: 'SSS' } })
  await screen.findByText('birth.pdf')
  await screen.findByText('id-front.pdf')
}

describe('Applicant sign-up wizard', () => {
  it('starts with account credentials and privacy consent, without duplicate profile fields', () => {
    openSignup()
    expect(screen.getByLabelText(/^Email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Confirm password/i)).toBeInTheDocument()
    expect(screen.getByText(/collection and processing/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Location$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^About me$/i)).not.toBeInTheDocument()
    // Before a path is chosen, only Account and Your NSRP are shown
    expect(screen.getByRole('navigation', { name: /Sign-up progress/i })).toHaveTextContent('2. Your NSRP')
  })

  it('does not persist the password or confirmation while saving browser progress', async () => {
    openSignup()
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'draft@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password123!' } })
    await waitFor(() => expect(localStorage.getItem('peso-applicant-signup-draft')).toContain('draft@peso.gov'))
    const savedDraft = localStorage.getItem('peso-applicant-signup-draft')
    expect(savedDraft).not.toContain('Password123!')
    expect(savedDraft).not.toContain('password')
  })

  it('sends NSRP answers and all signup documents in one multipart request', async () => {
    openSignup()
    await verifyStepOneEmail()
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password123!' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /collection and processing/i }))
    await chooseOnlinePath()

    await screen.findByLabelText(/^Surname/i)
    fireEvent.change(screen.getByLabelText(/^Surname/i), { target: { value: 'Cruz' } })
    fireEvent.change(screen.getByLabelText(/^First name/i), { target: { value: 'Juan' } })
    fireEvent.change(screen.getByLabelText(/^Date of birth/i), { target: { value: '1990-01-01' } })
    fireEvent.change(screen.getByLabelText(/^Place of birth/i), { target: { value: 'Legazpi City' } })
    fireEvent.change(screen.getByLabelText(/^Sex/i), { target: { value: 'Male' } })
    fireEvent.change(screen.getByLabelText(/^Civil status/i), { target: { value: 'Single' } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    await screen.findByLabelText(/House no\. \/ street/i)
    fireEvent.change(screen.getByLabelText(/House no\. \/ street/i), { target: { value: '1 Main Street' } })
    fireEvent.change(screen.getByLabelText(/^Barangay/i), { target: { value: 'Centro' } })
    fireEvent.change(screen.getByLabelText(/Municipality \/ city/i), { target: { value: 'Legazpi' } })
    fireEvent.change(screen.getByLabelText(/^Province/i), { target: { value: 'Albay' } })
    fireEvent.change(screen.getByLabelText(/Cellphone number/i), { target: { value: '09171234567' } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Education & training')
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Work & skills')
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    await screen.findByLabelText(/^Employment status/i)
    fireEvent.change(screen.getByLabelText(/^Employment status/i), { target: { value: 'Unemployed' } })
    fireEvent.change(screen.getByLabelText(/Actively looking for work/i), { target: { value: 'Yes' } })
    fireEvent.change(screen.getByLabelText(/Willing to work immediately/i), { target: { value: 'Yes' } })
    fireEvent.change(screen.getByLabelText(/4Ps beneficiary/i), { target: { value: 'No' } })
    fireEvent.change(screen.getByLabelText(/Preferred occupation 1/i), { target: { value: 'Clerk' } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    await screen.findByText('Certification')
    fireEvent.click(screen.getByRole('checkbox', { name: /I certify that this information/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    await screen.findByText('Documents')
    const docsFieldset = screen.getByText('Verification documents').closest('fieldset')
    const files = docsFieldset.querySelectorAll('input[type="file"]')
    fireEvent.change(files[0], { target: { files: [pdfFile('birth.pdf')] } })
    fireEvent.change(files[1], { target: { files: [pdfFile('id-front.pdf')] } })
    fireEvent.change(within(docsFieldset).getAllByRole('combobox')[0], { target: { value: 'SSS' } })
    await screen.findByText('birth.pdf')
    await screen.findByText('id-front.pdf')
    const savedDraft = localStorage.getItem('peso-applicant-signup-draft')
    expect(savedDraft).not.toContain('resume.pdf')
    expect(savedDraft).not.toContain('birth.pdf')
    expect(savedDraft).not.toContain('id-front.pdf')
    fireEvent.click(screen.getByRole('button', { name: /Generate preview/i }))

    await screen.findByTitle('Generated NSRP PDF preview')
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }))
    await waitFor(() => expect(mockFetch.mock.calls.filter(([url]) => url === 'http://localhost:4000/api/signup')).toHaveLength(1))
    const request = mockFetch.mock.calls.find(([url]) => url === 'http://localhost:4000/api/signup')[1]
    expect(request.body).toBeInstanceOf(FormData)
    expect(request.body.has('nsrpAnswers')).toBe(true)
    expect(JSON.parse(request.body.get('nsrpAnswers')).surname).toBe('Cruz')
    expect(request.body.has('birthCertificate')).toBe(true)
    expect(request.body.has('validId1Front')).toBe(true)
    // The resume is optional and no longer collected at sign-up
    expect(request.body.has('resume')).toBe(false)
    expect(request.body.get('nsrpMode')).toBe('online')
    expect(request.body.has('nsrpForm')).toBe(false)
    expect(request.body.get('emailProof')).toBe('proof-token-123')
    await screen.findByText('Account created')
  })

  it('shows the server rate-limit message when the preview is throttled', async () => {
    mockFetch.mockImplementation((url) => {
      if (url === 'http://localhost:4000/api/nsrp/validate-signup') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, fieldErrors: {} }) })
      }
      if (url === 'http://localhost:4000/api/nsrp/preview-signup') {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ code: 'PREVIEW_RATE_LIMITED', error: 'Too many previews. Please wait a few minutes.' }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    await advanceToDocumentsStep()
    fireEvent.click(screen.getByRole('button', { name: /Generate preview/i }))
    await screen.findByText('Too many previews. Please wait a few minutes.')
    // No account is created while the preview is throttled
    expect(mockFetch.mock.calls.some(([url]) => url === 'http://localhost:4000/api/signup')).toBe(false)
  })
})

describe('sortJobsByMatch with empty or missing skills', () => {
  const jobs = [
    { _id: 'a', title: 'Cashier', skills: ['Customer service'], createdAt: '2026-01-01' },
    { _id: 'b', title: 'Encoder', skills: ['Data entry'], createdAt: '2026-02-01' },
  ]

  it('returns all jobs without crashing when skills are undefined', () => {
    expect(sortJobsByMatch(jobs, undefined)).toHaveLength(2)
  })
  it('returns all jobs with no score applied when skills are empty (newest first)', () => {
    expect(sortJobsByMatch(jobs, []).map((job) => job._id)).toEqual(['b', 'a'])
  })
  it('handles jobs with missing skills arrays', () => {
    expect(sortJobsByMatch([{ _id: 'c', title: 'No skills job', createdAt: '2026-03-01' }], undefined)).toHaveLength(1)
  })
  it('still sorts by match count when skills exist', () => {
    expect(sortJobsByMatch(jobs, ['Data entry'])[0]._id).toBe('b')
  })
})
