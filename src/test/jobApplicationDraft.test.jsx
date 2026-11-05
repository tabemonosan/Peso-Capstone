import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JobApplicationWizard from '../components/JobApplicationWizard'
import { applicationDraftKey, readApplicationDraft, saveApplicationDraft } from '../utils/jobApplicationDraft'

const files = vi.hoisted(() => new Map())
// Exercise the UI across unmounts with a persistent file store, independent of
// jsdom's missing IndexedDB. Text/step drafts use the real browser-storage code.
vi.mock('../utils/jobApplicationDraft', async (original) => {
  const actual = await original()
  return { ...actual,
    loadApplicationResume: vi.fn(async (key) => files.get(key) || null),
    saveApplicationResume: vi.fn(async (key, file) => { if (file) files.set(key, file); else files.delete(key) }),
    clearApplicationDraft: vi.fn(async (key) => { localStorage.removeItem(key); files.delete(key) }),
  }
})
const user = { id: 'applicant1', email: 'original@example.com' }
const job = { _id: 'job1', title: 'Driver' }
const resume = new File(['%PDF-resume'], 'my-resume.pdf', { type: 'application/pdf' })
const key = applicationDraftKey(user, job)
beforeEach(() => {
  files.clear(); vi.clearAllMocks()
  vi.stubGlobal('indexedDB', {})
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ valid: true }) })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
function mount(account = user, posting = job, submit = vi.fn(async () => ({ ok: true }))) {
  return render(<JobApplicationWizard currentUser={account} job={posting} token="token" onClose={vi.fn()} onSubmit={submit} />)
}
async function next() { await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }))) }
async function fill() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next', exact: true })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new.contact@gmail.com' } })
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '09171234567' } })
  await next()
  fireEvent.change(screen.getByLabelText('Resume'), { target: { files: [resume] } })
  await next()
  fireEvent.change(screen.getByLabelText('Do you have work experience?'), { target: { value: 'Yes' } })
  fireEvent.change(screen.getByLabelText('Briefly describe your experience'), { target: { value: 'Delivery driver' } })
}

describe('application draft persistence', () => {
  it('keeps a previously chosen application resume ahead of the profile default', async () => {
    files.set(key, resume)
    mount()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next', exact: true })).toBeEnabled())
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/api/profile/resume'))).toBe(false)
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '09171234567' } })
    await next()
    expect(screen.getByText('my-resume.pdf')).toBeInTheDocument()
  })

  it('restores every answer, the resume and the last step after reopening', async () => {
    const first = mount()
    await fill()
    expect(readApplicationDraft(key)).toEqual({ step: 2, answers: { email: 'new.contact@gmail.com', mobile: '09171234567', hasExperience: 'Yes', experience: 'Delivery driver' } })
    first.unmount()
    mount()
    expect(screen.getByText('Step 3: Qualifications')).toBeInTheDocument()
    expect(screen.queryByLabelText("Have you completed a bachelor's degree?")).not.toBeInTheDocument()
    expect(screen.getByLabelText('Do you have work experience?')).toHaveValue('Yes')
    expect(screen.getByLabelText('Briefly describe your experience')).toHaveValue('Delivery driver')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next', exact: true })).toBeEnabled())
    await next()
    expect(screen.getByText('my-resume.pdf')).toBeInTheDocument()
    expect(screen.getByText('new.contact@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('09171234567')).toBeInTheDocument()
  })
  it('isolates drafts by applicant and job and preserves partially entered answers', async () => {
    saveApplicationDraft(key, { email: 'unfinished@', mobile: '09', bachelorDegree: 'Yes', hasExperience: 'No', experience: '' }, 0)
    const original = mount()
    expect(screen.getByLabelText('Email')).toHaveValue('unfinished@')
    expect(screen.getByLabelText('Mobile number')).toHaveValue('09')
    original.unmount()
    const differentJob = mount(user, { ...job, _id: 'job2' })
    expect(screen.getByLabelText('Email')).toHaveValue(user.email)
    expect(screen.getByLabelText('Mobile number')).toHaveValue('')
    differentJob.unmount()
    mount({ id: 'applicant2', email: 'other@example.com' })
    expect(screen.getByLabelText('Email')).toHaveValue('other@example.com')
    expect(screen.getByLabelText('Mobile number')).toHaveValue('')
  })
  it('keeps the draft after failed submission and clears it only after successful submission', async () => {
    const submit = vi.fn().mockResolvedValueOnce({ error: 'Try again later.' }).mockResolvedValueOnce({ ok: true })
    mount(user, job, submit)
    await fill(); await next()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit application' })))
    expect(screen.getByText('Try again later.')).toBeInTheDocument()
    expect(localStorage.getItem(key)).toBeTruthy()
    expect(files.get(key)).toBe(resume)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit application' })))
    expect(localStorage.getItem(key)).toBeNull()
    expect(files.has(key)).toBe(false)
  })
  it('shows an honest warning when text storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled') })
    mount()
    expect(screen.getByRole('status')).toHaveTextContent('Your draft could not be saved on this device.')
  })
})
