import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { sortJobsByMatch } from '../App'

const mockFetch = vi.fn()

const pdfFile = (name) => new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  localStorage.clear()
  // jsdom lacks URL.createObjectURL, used for document previews
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
  mockFetch.mockImplementation((url) => {
    if (url === 'http://localhost:4000/api/signup') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          token: 'token-new-applicant',
          user: {
            email: 'noskills@peso.gov',
            role: 'Applicant',
            emailVerified: false,
            verificationStatus: 'under_review',
            registration: { done: 0, total: 8, complete: false, checklist: [] },
            profile: { firstName: 'No', lastName: 'Skills', name: 'No Skills', skills: [] },
          },
        }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Applicant sign-up without skills', () => {
  it('does not render a Skills input on the sign-up form', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Create an account \(Applicant\)/i }))
    expect(screen.queryByLabelText(/^Skills$/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/First name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Last name/i)).toBeInTheDocument()
  })

  it('submits successfully without any skills and sends no skills field', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Create an account \(Applicant\)/i }))

    fireEvent.change(screen.getByLabelText(/First name/i), { target: { value: 'No' } })
    fireEvent.change(screen.getByLabelText(/Last name/i), { target: { value: 'Skills' } })
    fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: 'Legazpi City' } })
    fireEvent.change(screen.getByLabelText(/About me/i), { target: { value: 'Hardworking applicant.' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'noskills@peso.gov' } })
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password123!' } })

    // Resume + required verification documents (hidden file inputs inside the signup form)
    fireEvent.change(document.getElementById('signup-resume'), { target: { files: [pdfFile('resume.pdf')] } })
    const docsFieldset = screen.getByText('Verification documents').closest('fieldset')
    const hiddenFileInputs = docsFieldset.querySelectorAll('input[type="file"]')
    // Order: NSRP form, birth certificate, ID1 front, ID1 back, ID2 front, ID2 back
    fireEvent.change(hiddenFileInputs[0], { target: { files: [pdfFile('nsrp.pdf')] } })
    fireEvent.change(hiddenFileInputs[1], { target: { files: [pdfFile('birth.pdf')] } })
    fireEvent.change(hiddenFileInputs[2], { target: { files: [pdfFile('id1-front.pdf')] } })
    fireEvent.change(within(docsFieldset).getAllByRole('combobox')[0], { target: { value: 'SSS' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the collection/i }))

    const submitButton = screen.getByRole('button', { name: /Create account/i })
    await waitFor(() => expect(submitButton).not.toBeDisabled())
    fireEvent.submit(submitButton.closest('form'))

    await waitFor(() => {
      const signupCall = mockFetch.mock.calls.find(([url]) => url === 'http://localhost:4000/api/signup')
      expect(signupCall).toBeTruthy()
      const payload = signupCall[1].body
      expect(payload).toBeInstanceOf(FormData)
      expect(payload.has('skills')).toBe(false)
      expect(payload.get('firstName')).toBe('No')
      expect(payload.get('lastName')).toBe('Skills')
    })
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/Account created/i)))
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
    const sorted = sortJobsByMatch(jobs, [])
    expect(sorted.map((job) => job._id)).toEqual(['b', 'a'])
  })

  it('handles jobs with missing skills arrays', () => {
    expect(sortJobsByMatch([{ _id: 'c', title: 'No skills job', createdAt: '2026-03-01' }], undefined)).toHaveLength(1)
  })

  it('still sorts by match count when skills exist', () => {
    const sorted = sortJobsByMatch(jobs, ['Data entry'])
    expect(sorted[0]._id).toBe('b')
  })
})
