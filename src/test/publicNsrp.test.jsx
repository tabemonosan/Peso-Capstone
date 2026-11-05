import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('../components/NsrpSignatureInput', () => ({ default: ({ onChange }) => <button type="button" onClick={() => onChange('test-signature')}>Add test signature</button> }))
vi.mock('../components/NsrpPdfPreview', () => ({ default: ({ blobUrl, downloadName }) => blobUrl ? <a href={blobUrl} download={downloadName}>Download PDF</a> : null }))

const mockFetch = vi.fn()
beforeEach(() => {
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (url) => {
    if (url.endsWith('/preview-signup') || url.endsWith('/employer-registration/preview')) {
      return { ok: true, headers: { get: () => '[]' }, blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }) }
    }
    return { ok: true, json: async () => ({ ok: true, fieldErrors: {} }) }
  })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:nsrp'), revokeObjectURL: vi.fn() }))
})
afterEach(() => vi.unstubAllGlobals())

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const next = async (heading) => {
  fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }))
  await screen.findByRole('heading', { name: heading, exact: true })
}

describe('landing page NSRP tools', () => {
  it('allows applicant section jumps but blocks PDF preview when required fields are missing', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Applicant · Form 1', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /5\. Employment/ }))
    expect(screen.getByRole('heading', { name: 'Employment & preferences' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /3\. Education/ }))
    expect(screen.getByRole('heading', { name: 'Education & training' })).toBeInTheDocument()
    expect(mockFetch.mock.calls.some(([url]) => url.endsWith('/validate-signup'))).toBe(false)
    mockFetch.mockImplementationOnce(async () => ({ ok: false, status: 422, json: async () => ({ fieldErrors: { surname: 'This field is required.', addressCity: 'This field is required.' } }) }))
    fireEvent.click(screen.getByRole('button', { name: /7\. Preview/ }))
    await screen.findByRole('heading', { name: 'Personal information' })
    expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Surname/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('allows employer section jumps and validates all sections before generating a PDF', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Employer · Form 2', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: /4\. Certification/ }))
    expect(screen.getByRole('heading', { name: 'Certification' })).toBeInTheDocument()
    fill(/^Authorized representative full name/, 'Juan Cruz')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Add test signature' }))
    fireEvent.click(screen.getByRole('button', { name: /5\. Preview/ }))
    await screen.findByRole('heading', { name: 'Establishment details' })
    expect(screen.getByText(/Complete the highlighted required fields/)).toBeInTheDocument()
    expect(mockFetch.mock.calls.some(([url]) => url.endsWith('/employer-registration/preview'))).toBe(false)
    expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /3\. Contact/ }))
    expect(screen.getByRole('heading', { name: 'Contact details' })).toBeInTheDocument()
  })

  it('opens applicant Form 1 without an account and downloads a preview without changing signup drafts', async () => {
    localStorage.setItem('peso-applicant-signup-draft', '{"email":"saved@example.com"}')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Applicant · Form 1' }))
    expect(screen.getByRole('heading', { name: 'Applicant NSRP Form 1' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument()
    fill(/^Surname/, 'Cruz')
    await next('Address & contact')
    fill(/^Email/, 'visitor@example.com')
    await next('Education & training')
    await next('Work & skills')
    await next('Employment & preferences')
    await next('Certification')
    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }))
    await screen.findByRole('heading', { name: 'Preview & download' })
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('download', 'NSRP-Registration-Form.pdf')
    const preview = mockFetch.mock.calls.find(([url]) => url.endsWith('/preview-signup'))
    expect(JSON.parse(preview[1].body).answers).toMatchObject({ surname: 'Cruz', email: 'visitor@example.com' })
    expect(localStorage.getItem('peso-applicant-signup-draft')).toBe('{"email":"saved@example.com"}')
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }))
    expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toBeInTheDocument()
  })

  it('completes employer Form 2 and downloads it without email verification or account creation', async () => {
    localStorage.setItem('peso-employer-signup-draft', '{"email":"saved@example.com"}')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Employer · Form 2' }))
    fill(/^Establishment name/, 'Example Company')
    fill(/^Employer type/, 'Private')
    fill(/^Total work force/, 'Micro (1-9)')
    fill(/^Line of business/, 'Retail')
    await next('Address')
    fill(/^City\/municipality/, 'Manito')
    fill(/^Barangay/, 'Nagotgot')
    await next('Contact details')
    fill(/^Email address/, 'office@example.com')
    fill(/^Title/, 'Mr.')
    fill(/^Contact person full name/, 'Juan Cruz')
    fill(/^Position/, 'Manager')
    fill(/^Mobile number/, '09171234567')
    await next('Certification')
    fill(/^Authorized representative full name/, 'Juan Cruz')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Add test signature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }))
    await screen.findByRole('heading', { name: 'Preview and download' })
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('download', 'NSRP-Form-2-Employer-Reg-Form.pdf')
    expect(localStorage.getItem('peso-employer-signup-draft')).toBe('{"email":"saved@example.com"}')
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => url.endsWith('/employer-registration/preview'))).toBe(true))
    expect(mockFetch.mock.calls.some(([url]) => /email-code|employer-requests|\/api\/signup$/.test(url))).toBe(false)
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
  })
})
