import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicantSignupWizard from '../components/ApplicantSignupWizard'

const mockFetch = vi.fn()

// Per-step server validation results, flipped by individual tests.
let validateImpl = () => ({ ok: true, status: 200, body: { ok: true, fieldErrors: {} } })

beforeEach(() => {
  mockFetch.mockReset()
  validateImpl = () => ({ ok: true, status: 200, body: { ok: true, fieldErrors: {} } })
  vi.stubGlobal('fetch', mockFetch)
  localStorage.clear()
  sessionStorage.clear()
  mockFetch.mockImplementation(async (url, options) => {
    if (url.endsWith('/api/signup/email-code')) return { ok: true, json: async () => ({ ok: true }) }
    if (url.endsWith('/api/signup/email-code/verify')) return { ok: true, json: async () => ({ ok: true, proofToken: 'proof-1' }) }
    if (url.endsWith('/api/nsrp/validate-signup')) {
      const result = validateImpl(JSON.parse(options.body))
      return { ok: result.ok, status: result.status, json: async () => result.body }
    }
    if (url.endsWith('/api/nsrp/preview-signup')) {
      return { ok: true, headers: { get: () => '[]' }, blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }) }
    }
    return { ok: true, json: async () => ({}) }
  })
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock')
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderWizard() {
  render(<ApplicantSignupWizard onCancel={() => {}} />)
}

// Complete step 1 (Account): verify the mocked email code, then fill the rest.
async function completeAccountStep() {
  renderWizard()
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'wiz@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
  await screen.findByLabelText(/^Code digit 1$/i)
  for (let i = 1; i <= 6; i += 1) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^Code digit ${i}$`, 'i')), { target: { value: String(i) } })
  }
  fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
  await screen.findByText(/Email verified/i)
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
  fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password123!' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /collection and processing/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  // "Your NSRP" choice step: pick the online path
  await screen.findByRole('radio', { name: /Fill out my NSRP online/i })
  fireEvent.click(screen.getByRole('radio', { name: /Fill out my NSRP online/i }))
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByLabelText(/^Surname/i)
}

// Move from Personal information to Address & contact.
async function goToAddressStep() {
  await completeAccountStep()
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByLabelText(/^TIN/i)
}

describe('wizard numeric fields', () => {
  it.each([
    ['TIN', '12-345 ab678', '12345678'],
    ['GSIS / SSS ID no.', '12a3 456-78x', '12345678'],
    ['Pag-IBIG no.', 'abc123456789012def', '123456789012'],
    ['PhilHealth no.', 'aa11', '11'],
  ])('%s strips letters and symbols while typing', async (field, typed, stored) => {
    await goToAddressStep()
    const input = screen.getByLabelText(new RegExp(`^${field.replace(/[/.]/g, '\\$&')}`, 'i'))
    fireEvent.change(input, { target: { value: typed } })
    expect(input).toHaveValue(stored)
    expect(input).toHaveAttribute('inputMode', 'numeric')
  })

  it('Height (Personal information step) strips non-digits, shows cm and a helper', async () => {
    await completeAccountStep()
    const height = screen.getByLabelText(/^Height/i)
    fireEvent.change(height, { target: { value: '1a6b5c' } })
    expect(height).toHaveValue('165')
    expect(height).toHaveAttribute('inputMode', 'numeric')
    expect(screen.getByText('cm')).toBeInTheDocument()
    expect(screen.getByText(/whole number, 50–250/i)).toBeInTheDocument()
  })

  it('cellphone converts +63 and 63 formats and blocks the 12th digit', async () => {
    await goToAddressStep()
    const phone = screen.getByLabelText(/^Cellphone number/i)
    fireEvent.change(phone, { target: { value: '+639171234567' } })
    expect(phone).toHaveValue('09171234567')
    fireEvent.change(phone, { target: { value: '639171234567' } })
    expect(phone).toHaveValue('09171234567')
    fireEvent.change(phone, { target: { value: '091712345678' } })
    expect(phone).toHaveValue('09171234567') // 12th digit blocked
  })

  it('landline accepts digits only, max 11', async () => {
    await goToAddressStep()
    const landline = screen.getByLabelText(/^Landline number/i)
    fireEvent.change(landline, { target: { value: '(02) 8123-4567' } })
    expect(landline).toHaveValue('0281234567')
    fireEvent.change(landline, { target: { value: '02812345678901' } })
    expect(landline).toHaveValue('02812345678') // 12th digit blocked
  })

  it('paste is sanitized the same way as typing', async () => {
    await goToAddressStep()
    const input = screen.getByLabelText(/^TIN/i)
    // Paste flows through onChange (no preventDefault), so it is sanitized.
    fireEvent.paste(input, { clipboardData: { getData: () => 'abc-123-456-789' } })
    fireEvent.change(input, { target: { value: 'abc-123-456-789' } })
    expect(input).toHaveValue('123456789')
  })
})

describe('wizard conditional fields and salary', () => {
  it('expected salary formats with thousands separators on blur, stores digits', async () => {
    await completeAccountStep()
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i })) // -> Address
    await screen.findByLabelText(/^TIN/i)
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i })) // -> Education
    await screen.findByText('Education & training')
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i })) // -> Work & skills
    await screen.findByText('Work & skills')
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i })) // -> Employment
    const salary = await screen.findByLabelText(/^Expected salary range/i)
    fireEvent.change(salary, { target: { value: '25000' } })
    fireEvent.blur(salary)
    expect(salary).toHaveValue('25,000')
    fireEvent.focus(salary)
    expect(salary).toHaveValue('25000')
  })

  it('4Ps household ID appears only when 4Ps is Yes and is cleared when hidden', async () => {
    await completeAccountStep()
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByLabelText(/^TIN/i)
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Education & training')
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText('Work & skills')
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByLabelText(/^Employment status/i)

    expect(screen.queryByLabelText(/4Ps household ID/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/4Ps beneficiary/i), { target: { value: 'Yes' } })
    const idField = await screen.findByLabelText(/4Ps household ID/i)
    fireEvent.change(idField, { target: { value: '1234' } })
    fireEvent.change(screen.getByLabelText(/4Ps beneficiary/i), { target: { value: 'No' } })
    expect(screen.queryByLabelText(/4Ps household ID/i)).not.toBeInTheDocument()
    // Re-show: the previously typed value was cleared
    fireEvent.change(screen.getByLabelText(/4Ps beneficiary/i), { target: { value: 'Yes' } })
    expect(await screen.findByLabelText(/4Ps household ID/i)).toHaveValue('')
  })
})

describe('wizard education section', () => {
  it('shows exactly one row per level and no Add button', async () => {
    await goToEducationStep()
    for (const level of ['Elementary', 'Secondary', 'Tertiary', 'Graduate Studies']) {
      expect(screen.getByText(level)).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /add education/i })).not.toBeInTheDocument()
  })

  it('undergraduate fields appear only without a graduation year and clear when one is entered', async () => {
    await goToEducationStep()
    const elementary = screen.getByText('Elementary').closest('fieldset')
    const lastAttended = within(elementary).getByLabelText(/Year last attended/i)
    fireEvent.change(lastAttended, { target: { value: '2009' } })
    fireEvent.change(within(elementary).getByLabelText(/Year graduated/i), { target: { value: '2010' } })
    expect(within(elementary).queryByLabelText(/Year last attended/i)).not.toBeInTheDocument()
  })
})

describe('wizard row limits', () => {
  it('technical training caps at 3 rows with a note', async () => {
    await goToEducationStep()
    const addButton = screen.getByRole('button', { name: /add technical training row/i })
    fireEvent.click(addButton)
    fireEvent.click(screen.getByRole('button', { name: /add technical training row/i }))
    fireEvent.click(screen.getByRole('button', { name: /add technical training row/i }))
    expect(screen.queryByRole('button', { name: /add technical training row/i })).not.toBeInTheDocument()
    expect(screen.getByText('Maximum of 3 entries')).toBeInTheDocument()
  })
})

// Move to the Education & training step (education, training, eligibility).
async function goToEducationStep() {
  await goToAddressStep()
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByText('Elementary')
}

// Move to the Work & skills step (work experience, languages, skills).
async function goToWorkStep() {
  await goToEducationStep()
  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
  await screen.findByRole('button', { name: /add work experience/i })
}

describe('wizard work-experience errors', () => {
  it('From after To shows the message under the To input, marks it invalid, and focuses it', async () => {
    await goToWorkStep()
    fireEvent.click(screen.getByRole('button', { name: /add work experience/i }))
    fireEvent.change(screen.getByLabelText(/^Company/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/^From/i), { target: { value: '2026-10-29' } })
    fireEvent.change(screen.getByLabelText(/^To/i), { target: { value: '2026-10-01' } })
    validateImpl = () => ({ ok: false, status: 422, body: { error: 'Check the highlighted fields.', fieldErrors: { 'workExperience[0].toDate': 'End date cannot be before the start date.' } } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    const message = await screen.findByText('End date cannot be before the start date.')
    expect(message).toBeInTheDocument()
    const toInput = screen.getByLabelText(/^To/i)
    expect(toInput).toHaveAttribute('aria-invalid', 'true')
    expect(toInput.getAttribute('aria-describedby')).toBe(message.id)
    await waitFor(() => expect(document.activeElement).toBe(toInput))
    // The banner names the problem instead of a bare "Check the highlighted fields."
    expect(screen.getByText(/1 field needs attention/i)).toBeInTheDocument()
  })

  it('a row starting and ending today passes', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    await goToWorkStep()
    fireEvent.click(screen.getByRole('button', { name: /add work experience/i }))
    fireEvent.change(screen.getByLabelText(/^Company/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/^From/i), { target: { value: today } })
    fireEvent.change(screen.getByLabelText(/^To/i), { target: { value: today } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByRole('heading', { name: 'Employment & preferences' })
  })

  it('a Present row passes without an end date', async () => {
    await goToWorkStep()
    fireEvent.click(screen.getByRole('button', { name: /add work experience/i }))
    fireEvent.change(screen.getByLabelText(/^Company/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/^From/i), { target: { value: '2024-01-01' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Present \(current job\)/i }))
    expect(screen.queryByLabelText(/^To/i)).not.toBeInTheDocument() // To hidden when Present
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByRole('heading', { name: 'Employment & preferences' })
    const validateCall = mockFetch.mock.calls.filter(([url]) => url.endsWith('/api/nsrp/validate-signup')).at(-1)
    expect(JSON.parse(validateCall[1].body).answers.workExperience[0].toDate).toBe('Present')
  })

  it('an unmatchable server error key is shown in the banner, not hidden', async () => {
    await goToWorkStep()
    validateImpl = () => ({ ok: false, status: 422, body: { error: 'Check the highlighted fields.', fieldErrors: { mysteryField: 'Something unusual happened.' } } })
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    await screen.findByText(/Something unusual happened\./)
  })
})

describe('wizard education course field', () => {
  it('Course is disabled and greyed for Elementary and Secondary, enabled for Tertiary', async () => {
    await goToEducationStep()
    for (const level of ['Elementary', 'Secondary']) {
      const fieldset = screen.getByText(level).closest('fieldset')
      const course = within(fieldset).getByLabelText(/Course \/ degree/i)
      expect(course).toBeDisabled()
      expect(course).toHaveAttribute('placeholder', 'Not applicable')
      expect(course.className).toContain('bg-slate-100')
    }
    const tertiary = screen.getByText('Tertiary').closest('fieldset')
    const course = within(tertiary).getByLabelText(/Course \/ degree/i)
    expect(course).toBeEnabled()
    fireEvent.change(course, { target: { value: 'BS Computer Science' } })
    expect(course).toHaveValue('BS Computer Science')
  })

  it('clears a stale Course value from an old draft for Elementary rows', async () => {
    localStorage.setItem('peso-applicant-signup-draft', JSON.stringify({
      step: 3,
      nsrpMode: 'online',
      answers: {
        education: [{ level: 'Elementary', school: 'Old School', course: 'BS Math', year: '2010', undergradLevel: '', yearLastAttended: '', awards: '' }],
      },
    }))
    // The draft restores directly to step 3 (Education & training)
    renderWizard()
    const elementary = (await screen.findByText('Elementary')).closest('fieldset')
    const course = within(elementary).getByLabelText(/Course \/ degree/i)
    await waitFor(() => expect(course).toHaveValue(''))
    expect(course).toBeDisabled()
  })
})

describe('wizard tab navigation', () => {
  it('aria-current marks the active tab', async () => {
    renderWizard()
    const active = screen.getByRole('button', { name: /1\. Account/i })
    expect(active).toHaveAttribute('aria-current', 'step')
  })

  it('back is always allowed without validation and keeps entered data', async () => {
    await goToAddressStep()
    fireEvent.change(screen.getByLabelText(/^TIN/i), { target: { value: '123456789' } })
    validateImpl = () => { throw new Error('validation must not be called when going back') }
    fireEvent.click(screen.getByRole('button', { name: /1\. Account/i }))
    await screen.findByLabelText(/^Password$/i) // step 1 shows, no validation call
    fireEvent.click(screen.getByRole('button', { name: /4\. Address & contact/i }))
    await waitFor(() => expect(screen.getByLabelText(/^TIN/i)).toHaveValue('123456789'))
  })

  it('forward past an invalid step is blocked and shows an error badge', async () => {
    await goToAddressStep()
    validateImpl = () => ({ ok: false, status: 422, body: { error: 'Check the highlighted fields.', fieldErrors: { tin: 'Enter 9 or 12 digits.' } } })
    // maxStep is 2 (Address & contact). Clicking tab 4 (one beyond) must validate first and fail.
    fireEvent.click(screen.getByRole('button', { name: /5\. Education & training/i }))
    await screen.findByText('Enter 9 or 12 digits.')
    expect(screen.getByLabelText(/^TIN/i)).toBeInTheDocument() // still on Address & contact
    expect(screen.getByLabelText('has errors', { selector: 'span' })).toBeInTheDocument()
    // Once valid, the same click advances
    validateImpl = () => ({ ok: true, status: 200, body: { ok: true, fieldErrors: {} } })
    fireEvent.click(screen.getByRole('button', { name: /5\. Education & training/i }))
    await screen.findByRole('heading', { name: 'Education & training' })
  })

  it('clicking a much later tab cannot skip ahead of the furthest reached step', async () => {
    await goToAddressStep()
    fireEvent.click(screen.getByRole('button', { name: /10\. Preview & submit/i }))
    // Still on Address & contact
    expect(screen.getByLabelText(/^TIN/i)).toBeInTheDocument()
  })
})
