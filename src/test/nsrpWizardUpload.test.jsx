import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    if (url.endsWith('/api/signup/nsrp-import')) return { ok: true, json: async () => ({ answers: {}, warnings: [], importToken: 'empty-proof' }) }
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

it('toggles both signup passwords from either visibility button', () => {
  renderWizard()
  const password = screen.getByLabelText(/^Password/i, { selector: 'input' })
  const confirmation = screen.getByLabelText(/^Confirm password/i, { selector: 'input' })
  expect(password).toHaveAttribute('type', 'password')
  expect(confirmation).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }))
  expect(password).toHaveAttribute('type', 'text')
  expect(confirmation).toHaveAttribute('type', 'text')
  fireEvent.click(screen.getByRole('button', { name: 'Hide password', exact: true }))
  expect(password).toHaveAttribute('type', 'password')
  expect(confirmation).toHaveAttribute('type', 'password')
})

async function completeAccountStep() {
  renderWizard()
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'up@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
  await screen.findByLabelText(/^Code digit 1$/i)
  for (let i = 1; i <= 6; i += 1) fireEvent.change(screen.getByLabelText(new RegExp(`^Code digit ${i}$`, 'i')), { target: { value: String(i) } })
  fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
  await screen.findByText(/Email verified/i)
  fireEvent.change(screen.getByLabelText(/^Password$/i, { selector: 'input' }), { target: { value: 'Password123!' } })
  fireEvent.change(screen.getByLabelText(/Confirm password/i, { selector: 'input' }), { target: { value: 'Password123!' } })
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
  fireEvent.change(screen.getByLabelText('Valid ID #1 type'), { target: { value: 'SSS' } })
  fireEvent.change(screen.getByLabelText(/^Birth certificate copy type/), { target: { value: 'PSA copy on security paper' } })
  await screen.findByText('birth.pdf')
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
}

describe('NSRP path choice', () => {
  it.each([['image/png', 'nsrp.png'], ['image/jpeg', 'nsrp.jpg'], ['application/pdf', 'nsrp.jpg']])('rejects non-PDF selections (%s, %s)', async (type, name) => {
    await completeAccountStep()
    fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
    const input = screen.getByLabelText(/Filled NSRP form/i)
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf')
    expect(screen.getByText('Upload a PDF only (max 5 MB).')).toBeInTheDocument()
    fireEvent.change(input, { target: { files: [new File(['test'], name, { type })] } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    expect(await screen.findByText('The NSRP form must be a PDF file.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^First name$/i)).not.toBeInTheDocument()
  })

  it('offers expanded Philippine IDs in both document dropdowns', async () => {
    await completeAccountStep()
    await chooseUpload()
    await fillBasicInfo()
    fireEvent.click(await screen.findByRole('button', { name: 'Add ID (optional)' }))
    for (const label of ['Valid ID #1 type', 'Valid ID #2 type']) {
      const select = await screen.findByLabelText(label)
      for (const name of ["Driver's License", 'PhilHealth ID', 'Digital TIN ID', 'PWD ID', 'Senior Citizen ID', 'Other government-issued ID']) {
        expect(within(select).getByRole('option', { name, exact: true })).toBeInTheDocument()
      }
    }
  })

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
    await screen.findByText('Upload your filled NSRP form (PDF only).')
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
  it('skips complete basic information from an older draft after refresh and PDF reselection', async () => {
    localStorage.setItem('peso-applicant-signup-draft', JSON.stringify({ email: 'up@example.com', nsrpMode: 'upload', step: 10, basicInfo: {
      firstName: 'Winter', lastName: 'Gyeoul', dob: '2005-11-01', cellphone: '09564546464', addressCity: 'Manito', addressProvince: 'Albay',
    } }))
    const first = renderWizard()
    const nav = screen.getByRole('navigation', { name: /Sign-up progress/i })
    expect(nav).not.toHaveTextContent('Basic information')
    expect(nav).toHaveTextContent('3. Documents')
    expect(screen.getByRole('heading', { name: 'Your NSRP' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^First name$/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Filled NSRP form/i), { target: { files: [pdfFile('my-nsrp.pdf')] } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Verification documents')
    expect(nav).not.toHaveTextContent('Basic information')
    first.unmount()
    renderWizard()
    expect(screen.getByRole('navigation', { name: /Sign-up progress/i })).not.toHaveTextContent('Basic information')
    expect(screen.queryByLabelText(/^First name$/i)).not.toBeInTheDocument()
    expect(localStorage.getItem('peso-applicant-signup-draft')).not.toContain('my-nsrp.pdf')
  })
  it('skips basic information after confirming retrieved details and submits them with the source-bound proof', async () => {
    const fallback = mockFetch.getMockImplementation()
    mockFetch.mockImplementation(async (url, options) => url.endsWith('/api/signup/nsrp-import') ? { ok: true, json: async () => ({ answers: { firstName: 'Maria', surname: 'Cruz', dob: '1990-06-11', cellphone: '09171234567', addressCity: 'Manito', addressProvince: 'Albay', skills: ['Gardening'], tin: '987654321' }, warnings: [], importToken: 'reviewed-import-proof' }) } : fallback(url, options))
    await completeAccountStep()
    fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
    fireEvent.change(screen.getByLabelText(/Filled NSRP form/i), { target: { files: [pdfFile('my-nsrp.pdf')] } })
    await screen.findByText('Maria')
    fireEvent.click(screen.getByRole('checkbox', { name: /checked these details/i }))
    fireEvent.click(screen.getByText('Use these details'))
    const nav = screen.getByRole('navigation', { name: /Sign-up progress/i })
    expect(nav).not.toHaveTextContent('Basic information')
    expect(nav).toHaveTextContent('3. Documents')
    expect(nav).toHaveTextContent('4. Review and submit')
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Verification documents')
    expect(screen.queryByLabelText(/^First name$/i)).not.toBeInTheDocument()
    await fillDocuments()
    expect(await screen.findByText('1990-06-11')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Create account/i }))
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => url.endsWith('/api/signup'))).toBe(true))
    const body = mockFetch.mock.calls.find(([url]) => url.endsWith('/api/signup'))[1].body
    expect(body.get('nsrpImportToken')).toBe('reviewed-import-proof')
    expect(body.get('firstName')).toBe('Maria')
    expect(body.get('dob')).toBe('1990-06-11')
    expect(body.get('addressCity')).toBe('Manito')
    const stored = JSON.stringify({ ...localStorage, ...sessionStorage })
    expect(stored).not.toContain('reviewed-import-proof')
    expect(stored).not.toContain('987654321')
  })
  it('keeps basic information available when retrieved details are incomplete', async () => {
    const fallback = mockFetch.getMockImplementation()
    mockFetch.mockImplementation(async (url, options) => url.endsWith('/api/signup/nsrp-import') ? { ok: true, json: async () => ({ answers: { firstName: 'Maria' }, warnings: [], importToken: 'partial-proof' }) } : fallback(url, options))
    await completeAccountStep()
    fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
    fireEvent.change(screen.getByLabelText(/Filled NSRP form/i), { target: { files: [pdfFile('partial.pdf')] } })
    await screen.findByText('Maria')
    fireEvent.click(screen.getByRole('checkbox', { name: /checked these details/i }))
    fireEvent.click(screen.getByText('Use these details'))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    expect(await screen.findByLabelText(/^First name$/i)).toHaveValue('Maria')
    expect(screen.getByRole('navigation', { name: /Sign-up progress/i })).toHaveTextContent('3. Basic information')
  })
  it('restores basic information when replacing a confirmed PDF and allows editing retrieved details', async () => {
    const fallback = mockFetch.getMockImplementation()
    mockFetch.mockImplementation(async (url, options) => url.endsWith('/api/signup/nsrp-import') ? { ok: true, json: async () => ({ answers: { firstName: 'Maria', surname: 'Cruz', dob: '1990-06-11', cellphone: '09171234567', addressCity: 'Manito', addressProvince: 'Albay' }, warnings: [], importToken: 'complete-proof' }) } : fallback(url, options))
    await completeAccountStep()
    fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
    fireEvent.change(screen.getByLabelText(/Filled NSRP form/i), { target: { files: [pdfFile('complete.pdf')] } })
    await screen.findByText('Maria')
    fireEvent.click(screen.getByRole('checkbox', { name: /checked these details/i }))
    fireEvent.click(screen.getByText('Use these details'))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await fillDocuments()
    fireEvent.click(await screen.findByRole('button', { name: /Edit basic information/i }))
    expect(await screen.findByLabelText(/^First name$/i)).toHaveValue('Maria')
    fireEvent.click(screen.getByRole('button', { name: /2\. Your NSRP/i }))
    fireEvent.change(await screen.findByLabelText(/Filled NSRP form/i), { target: { files: [pdfFile('replacement.pdf')] } })
    expect(screen.getByRole('navigation', { name: /Sign-up progress/i })).toHaveTextContent('3. Basic information')
  })

  it('clears reviewed results when the applicant replaces the PDF', async () => {
    const fallback = mockFetch.getMockImplementation()
    mockFetch.mockImplementation(async (url, options) => url.endsWith('/api/signup/nsrp-import') ? { ok: true, json: async () => ({ answers: { firstName: 'Maria' }, warnings: [], importToken: 'old-proof' }) } : fallback(url, options))
    await completeAccountStep()
    fireEvent.click(screen.getByRole('radio', { name: /I already have a filled NSRP form/i }))
    const input = screen.getByLabelText(/Filled NSRP form/i)
    fireEvent.change(input, { target: { files: [pdfFile('old.pdf')] } })
    await screen.findByText('Maria')
    fireEvent.change(input, { target: { files: [pdfFile('replacement.pdf')] } })
    expect(screen.queryByText('Maria')).not.toBeInTheDocument()
    expect(screen.queryByText('Use these details')).not.toBeInTheDocument()
  })

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
