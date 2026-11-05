import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import JobApplicationWizard from '../components/JobApplicationWizard'
import { validateJobApplication, bachelorDegreeFromNsrp } from '../../shared/jobApplication.js'

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
  const valid = JSON.parse(options.body).email !== 'akoyuki95@gmail.comsds'
  return { ok: valid, json: async () => valid ? { valid: true } : { valid: false, error: 'This email domain was not found.' } }
})))
afterEach(() => vi.unstubAllGlobals())

const resume = new File(['%PDF-resume'], 'resume.pdf', { type: 'application/pdf' })
const details = { email: 'applicant@example.com', mobile: '09171234567', bachelorDegree: 'Yes', hasExperience: 'Yes', experience: 'Office clerk' }
function setup() {
  const submit = vi.fn(async () => ({ ok: true })), close = vi.fn()
  render(<JobApplicationWizard job={{ _id: 'job1', title: 'Delivery Driver' }} currentUser={{ email: details.email, profile: { nsrp: { education: [{ level: 'Tertiary', course: 'BS Computer Science', year: '2020' }] } } }} onSubmit={submit} onClose={close} />)
  return { submit, close }
}
async function next() { await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }))) }
async function contact() { fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: details.mobile } }); await next() }
async function upload() { fireEvent.change(screen.getByLabelText('Resume'), { target: { files: [resume] } }); await next() }

describe('four-step job application', () => {
  it.each([
    [[{ level: 'Tertiary', course: 'BS Computer Science', year: '2020' }], 'Yes'],
    [[{ level: 'Tertiary', course: 'BS Computer Science', undergradLevel: 'Third year', yearLastAttended: '2020' }], 'No'],
    [[{ level: 'Secondary', year: '2020' }], 'No'],
    [[{ level: 'Tertiary', course: 'Associate in Computer Technology', year: '2020' }], 'No'],
    [[], 'No'],
  ])('derives college completion from NSRP education %j', (education, expected) => {
    expect(bachelorDegreeFromNsrp({ nsrp: { education } })).toBe(expected)
    expect(validateJobApplication({ ...details, bachelorDegree: expected === 'Yes' ? 'No' : 'Yes' }, resume, { nsrp: { education } }).value.bachelorDegree).toBe(expected)
  })

  it.each([false, true])('prefills the profile resume and permits an application-only replacement (%s)', async replace => {
    const fetcher = vi.fn(async url => {
      if (url.endsWith('/api/profile/qualifications')) return { ok: true, json: async () => ({ bachelorDegree: 'Yes' }) }
      if (url.endsWith('/api/profile/resume')) return { ok: true, json: async () => ({ resumeFile: { originalName: 'profile.pdf', mimetype: 'application/pdf' } }) }
      if (url.endsWith('/api/applicants/applicant1/resume')) return { ok: true, blob: async () => new Blob(['%PDF-profile'], { type: 'application/pdf' }) }
      return { ok: true, json: async () => ({ valid: true }) }
    })
    vi.stubGlobal('fetch', fetcher)
    const submit = vi.fn(async () => ({ ok: true }))
    render(<JobApplicationWizard job={{ _id: 'profile-job', title: 'Driver' }} currentUser={{ id: 'applicant1', email: details.email }} token="token" onSubmit={submit} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next', exact: true })).toBeEnabled())
    await contact()
    expect(screen.getByText(/Using your profile resume/)).toHaveTextContent('profile.pdf')
    if (replace) fireEvent.change(screen.getByLabelText('Resume'), { target: { files: [resume] } })
    await next()
    fireEvent.change(screen.getByLabelText('Do you have work experience?'), { target: { value: 'No' } })
    await next()
    expect(screen.getByText(replace ? 'resume.pdf' : 'profile.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    await waitFor(() => expect(submit).toHaveBeenCalledOnce())
    const submitted = submit.mock.calls[0][1].resume
    expect(submit.mock.calls[0][1].bachelorDegree).toBe('Yes')
    expect(submitted).toBeInstanceOf(File)
    expect(submitted.name).toBe(replace ? 'resume.pdf' : 'profile.pdf')
    expect(submitted.size).toBe(replace ? resume.size : 12)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/api/profile/resume'))).toEqual([[expect.any(String), { headers: { Authorization: 'Bearer token' } }]])
  })

  it('rejects an empty downloaded profile resume and allows a valid replacement', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url.endsWith('/api/profile/resume')) return { ok: true, json: async () => ({ resumeFile: { originalName: 'profile.pdf', mimetype: 'application/pdf' } }) }
      if (url.endsWith('/api/applicants/applicant1/resume')) return { ok: true, blob: async () => new Blob([], { type: 'application/pdf' }) }
      return { ok: true, json: async () => ({ valid: true }) }
    }))
    render(<JobApplicationWizard job={{ _id: 'empty-profile-job', title: 'Welder' }} currentUser={{ id: 'applicant1', email: details.email }} token="token" onSubmit={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText(/Your profile resume could not be loaded/)
    await contact()
    expect(screen.queryByText(/Using your profile resume/)).not.toBeInTheDocument()
    await upload()
    expect(screen.getByText('Step 3: Qualifications')).toBeInTheDocument()
  })

  it('allows manual upload when the profile resume cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => url.endsWith('/api/profile/resume')
      ? { ok: false }
      : { ok: true, json: async () => ({ valid: true }) }))
    render(<JobApplicationWizard job={{ _id: 'failed-profile-job', title: 'Driver' }} currentUser={{ id: 'applicant1', email: details.email }} token="token" onSubmit={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText(/Your profile resume could not be loaded/)
    await contact()
    await upload()
    expect(screen.getByText('Step 3: Qualifications')).toBeInTheDocument()
  })

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
    expect(screen.queryByLabelText("Have you completed a bachelor's degree?")).not.toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Do you have work experience?'), { target: { value: 'No' } })
    expect(screen.queryByLabelText('Briefly describe your experience')).not.toBeInTheDocument()
    await next()
    expect(within(screen.getByRole('dialog')).getByText('Step 4: Review')).toBeInTheDocument()
  })
  it.each([
    [{ mobile: '0917123456' }, 'mobile'], [{ mobile: '091712345678' }, 'mobile'], [{ mobile: '0917abc4567' }, 'mobile'],
    [{ email: 'invalid' }, 'email'], [{ experience: 'a'.repeat(21) }, 'experience'],
  ])('shares field validation with the server for %j', (change, field) => {
    expect(validateJobApplication({ ...details, ...change }, resume).errors[field]).toBeTruthy()
  })
})
