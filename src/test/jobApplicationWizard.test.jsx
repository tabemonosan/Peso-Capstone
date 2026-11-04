import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import JobApplicationWizard from '../components/JobApplicationWizard'
import { validateJobApplication } from '../../shared/jobApplication.js'

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
  const valid = JSON.parse(options.body).email !== 'akoyuki95@gmail.comsds'
  return { ok: valid, json: async () => valid ? { valid: true } : { valid: false, error: 'This email domain was not found.' } }
})))
afterEach(() => vi.unstubAllGlobals())

const resume = new File(['%PDF-resume'], 'resume.pdf', { type: 'application/pdf' })
const details = { email: 'applicant@example.com', mobile: '09171234567', bachelorDegree: 'Yes', hasExperience: 'Yes', experience: 'Office clerk' }
function setup() {
  const submit = vi.fn(async () => ({ ok: true })), close = vi.fn()
  render(<JobApplicationWizard job={{ _id: 'job1', title: 'Delivery Driver' }} currentUser={{ email: details.email }} onSubmit={submit} onClose={close} />)
  return { submit, close }
}
async function next() { await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }))) }
async function contact() { fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: details.mobile } }); await next() }
async function upload() { fireEvent.change(screen.getByLabelText('Resume'), { target: { files: [resume] } }); await next() }

describe('four-step job application', () => {
  it('keeps a misspelled email domain on the contact step with an inline error', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'akoyuki95@gmail.comsds' } })
    await contact()
    expect(screen.getByText('This email domain was not found.')).toBeInTheDocument()
    expect(screen.getByText('Step 1: Contact details')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })
  it('validates contact details and restricts mobile input to 11 digits', async () => {
    setup()
    expect(screen.queryByText(/NSRP PDF/)).not.toBeInTheDocument()
    await next()
    expect(screen.getByText('Enter exactly 11 digits, using numbers only.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '09a171234567890' } })
    expect(screen.getByLabelText('Mobile number')).toHaveValue('09171234567')
    await next()
    expect(screen.getByText('Step 2: Resume')).toBeInTheDocument()
  })
  it('requires resume and qualifications before review, preserves answers on back, and submits only on confirmation', async () => {
    const { submit, close } = setup()
    fireEvent.click(screen.getByRole('button', { name: '4. Review' }))
    expect(submit).not.toHaveBeenCalled()
    await contact()
    await next()
    expect(screen.getByText('Upload your resume.')).toBeInTheDocument()
    await upload()
    fireEvent.change(screen.getByLabelText("Have you completed a bachelor's degree?"), { target: { value: 'Yes' } })
    fireEvent.change(screen.getByLabelText('Do you have work experience?'), { target: { value: 'Yes' } })
    expect(screen.getByLabelText('Briefly describe your experience')).toHaveAttribute('maxlength', '20')
    fireEvent.change(screen.getByLabelText('Briefly describe your experience'), { target: { value: details.experience } })
    await next()
    expect(screen.getByText('Step 4: Review')).toBeInTheDocument()
    expect(screen.getByText(details.mobile)).toBeInTheDocument()
    expect(screen.getByText('resume.pdf')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
    expect(screen.getByLabelText('Briefly describe your experience')).toHaveValue(details.experience)
    await next()
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    await waitFor(() => expect(submit).toHaveBeenCalledWith('job1', { ...details, resume }))
    expect(close).toHaveBeenCalledOnce()
  })
  it('allows no degree and no experience without an explanation', async () => {
    setup(); await contact(); await upload()
    for (const label of ["Have you completed a bachelor's degree?", 'Do you have work experience?']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'No' } })
    expect(screen.queryByLabelText('Briefly describe your experience')).not.toBeInTheDocument()
    await next()
    expect(within(screen.getByRole('dialog')).getByText('Step 4: Review')).toBeInTheDocument()
  })
  it.each([
    [{ mobile: '0917123456' }, 'mobile'], [{ mobile: '091712345678' }, 'mobile'], [{ mobile: '0917abc4567' }, 'mobile'],
    [{ email: 'invalid' }, 'email'], [{ bachelorDegree: '' }, 'bachelorDegree'], [{ experience: 'a'.repeat(21) }, 'experience'],
  ])('shares field validation with the server for %j', (change, field) => {
    expect(validateJobApplication({ ...details, ...change }, resume).errors[field]).toBeTruthy()
  })
})
