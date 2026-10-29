import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicantSignupWizard from '../components/ApplicantSignupWizard'

const mockFetch = vi.fn()
const pdfFile = (name) => new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.clear()
  sessionStorage.clear()
  mockFetch.mockImplementation(async (url, options) => {
    if (url.endsWith('/api/signup/email-code')) return { ok: true, json: async () => ({ ok: true }) }
    if (url.endsWith('/api/signup/email-code/verify')) return { ok: true, json: async () => ({ ok: true, proofToken: 'proof-1' }) }
    if (url.endsWith('/api/nsrp/validate-signup')) {
      const body = JSON.parse(options.body)
      if (body.mode === 'upload' && body.step === 'basic') {
        const errors = {}
        if (!body.basic?.firstName) errors.firstName = 'First name is required.'
        if (!/^\d{11}$/.test(body.basic?.cellphone || '')) errors.cellphone = 'Enter an 11-digit mobile number starting with 09.'
        return { ok: !Object.keys(errors).length, status: Object.keys(errors).length ? 422 : 200, json: async () => ({ ok: !Object.keys(errors).length, fieldErrors: errors }) }
      }
      return { ok: true, json: async () => ({ ok: true, fieldErrors: {} }) }
    }
    if (url.endsWith('/api/signup')) return { ok: true, json: async () => ({ user: { email: 'up@example.com' }, token: 't' }) }
    return { ok: true, json: async () => ({}) }
  })
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const renderWizard = () => render(<ApplicantSignupWizard onCancel={() => {}} />)

async function completeAccountStep() {
  renderWizard()
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'up@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
  await screen.findByLabelText(/^Code digit 1$/i)
  for (let i = 1; i <= 6; i += 1) fireEvent.change(screen.getByLabelText(new RegExp(`^Code digit ${i}$`, 'i')), { target: { value: String(i) } })
  fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
  await screen.findByText(/Email verified/i)
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
  fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password123!' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /collection and processing/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByRole('radiogroup', { name: /NSRP options/i })
}

async function chooseUpload(withFile = true) {
  fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
  if (withFile) fireEvent.change(screen.getByLabelText(/Filled NSRP form/i), { target: { files: [pdfFile('my-nsrp.pdf')] } })
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
}

async function fillBasicInfo() {
  await screen.findByLabelText(/^First name$/i)
  fireEvent.change(screen.getByLabelText(/^First name$/i), { target: { value: 'Juan' } })
  fireEvent.change(screen.getByLabelText(/^Last name$/i), { target: { value: 'Cruz' } })
  fireEvent.change(screen.getByLabelText(/^Date of birth$/i), { target: { value: '1990-01-01' } })
  fireEvent.change(screen.getByLabelText(/^Cellphone number/i), { target: { value: '09171234567' } })
  fireEvent.change(screen.getByLabelText(/^City \/ Municipality$/i), { target: { value: 'Legazpi' } })
  fireEvent.change(screen.getByLabelText(/^Province$/i), { target: { value: 'Albay' } })
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
}

async function fillDocuments() {
  await screen.findByText('Verification documents')
  const fieldset = screen.getByText('Verification documents').closest('fieldset')
  const files = fieldset.querySelectorAll('input[type="file"]')
  fireEvent.change(files[0], { target: { files: [pdfFile('birth.pdf')] } })
  fireEvent.change(files[1], { target: { files: [pdfFile('id1.pdf')] } })
  fireEvent.change(fieldset.querySelector('select'), { target: { value: 'SSS' } })
  await screen.findByText('birth.pdf')
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
}

describe('NSRP path choice', () => {
  it('offers both options after the Account step and adapts the tabs', async () => {
    await completeAccountStep()
    expect(screen.getByRole('radio', { name: /I already have a filled NSRP form/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Fill out my NSRP online/i })).toBeInTheDocument()

    await chooseUpload()
    const nav = screen.getByRole('navigation', { name: /Sign-up progress/i })
    expect(nav).toHaveTextContent('1. Account')
    expect(nav).toHaveTextContent('2. Your NSRP')
    expect(nav).toHaveTextContent('3. Basic information')
    expect(nav).toHaveTextContent('4. Documents')
    expect(nav).toHaveTextContent('5. Review and submit')
    // Certification applies only to the online path
    expect(nav).not.toHaveTextContent('Certification')
  })

  it('requires a choice and a file before continuing', async () => {
    await completeAccountStep()
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Choose how you want to provide your NSRP.')
    fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Upload your filled NSRP form (PDF, JPG, or PNG).')
  })

  it('switching paths keeps both drafts and shows the note', async () => {
    await completeAccountStep()
    // Start online, type a surname, go back, switch to upload
    fireEvent.click(screen.getByRole('radio', { name: /Fill out my NSRP online/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    fireEvent.change(await screen.findByLabelText(/^Surname/i), { target: { value: 'Cruz' } })
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }))
    await screen.findByRole('radiogroup', { name: /NSRP options/i })
    fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
    fireEvent.change(screen.getByLabelText(/Filled NSRP form/i), { target: { files: [pdfFile('my-nsrp.pdf')] } })
    expect(screen.getByText('Your other answers are kept until you submit.')).toBeInTheDocument()
    // Switch back: the online draft is intact
    fireEvent.click(screen.getByRole('radio', { name: /Fill out my NSRP online/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    expect(await screen.findByLabelText(/^Surname/i)).toHaveValue('Cruz')
  })

  it('shows a basic-info validation error under the field', async () => {
    await completeAccountStep()
    await chooseUpload()
    await screen.findByLabelText(/^First name$/i)
    fireEvent.change(screen.getByLabelText(/^Cellphone number/i), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    const message = await screen.findByText('Enter an 11-digit mobile number starting with 09.')
    expect(message).toBeInTheDocument()
    expect(screen.getByLabelText(/^Cellphone number/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('upload path end-to-end', () => {
  it('submits nsrpMode upload with the file and basic info, no nsrpAnswers, and stores nothing sensitive', async () => {
    await completeAccountStep()
    await chooseUpload()
    await fillBasicInfo()
    await fillDocuments()
    // Review step shows the file
    await screen.findByText('my-nsrp.pdf')
    expect(screen.getByRole('button', { name: /Replace file/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => url.endsWith('/api/signup'))).toBe(true))
    const body = mockFetch.mock.calls.find(([url]) => url.endsWith('/api/signup'))[1].body
    expect(body.get('nsrpMode')).toBe('upload')
    expect(body.get('nsrpFile')).toBeTruthy()
    expect(body.get('nsrpFile').name).toBe('my-nsrp.pdf')
    expect(body.get('nsrpAnswers')).toBeNull()
    expect(body.get('firstName')).toBe('Juan')
    expect(body.get('lastName')).toBe('Cruz')
    expect(body.get('emailProof')).toBe('proof-1')
    await screen.findByText('Account created')

    // No file contents, signature, code, or proof token in browser storage
    const stored = [localStorage, sessionStorage]
      .flatMap((s) => Array.from({ length: s.length }, (_, i) => s.key(i)).map((key) => s.getItem(key)))
      .join('\n')
    expect(stored).not.toContain('proof-1')
    expect(stored).not.toContain('signatureDataUrl')
    expect(stored).not.toContain('my-nsrp.pdf')
  })
})
