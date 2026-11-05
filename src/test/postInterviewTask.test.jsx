import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PostInterviewTask from '../components/PostInterviewTask'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const task = { status: 'requested', requestedAt: '2026-11-04T01:00:00Z', instructions: 'Sign the authorization form provided during the interview.', requirements: [{ key: 'background_authorization', label: 'Background-check authorization form', file: null }] }
const file = { id: 'file1', name: 'authorization.pdf', version: 1, size: 100, uploadedAt: '2026-11-04T02:00:00Z', expiresAt: '2027-02-02T02:00:00Z' }
const mock = () => { const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({}) })); vi.stubGlobal('fetch', fetcher); return fetcher }
describe('optional post-interview documents', () => {
  it('lets employers select requirements and confirm before sending a document request', async () => {
    const fetcher = mock(), onChanged = vi.fn()
    render(<PostInterviewTask token="employer" interviewId="meeting1" audience="employer" canRequest onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add optional document task' }))
    expect(screen.getByRole('button', { name: 'Request documents' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Background-check authorization form' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Proof of certifications or degrees' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions for the applicant' }), { target: { value: 'Upload signed authorization and certification proof.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request documents' }))
    expect(fetcher).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ requirements: ['background_authorization', 'qualifications'], instructions: 'Upload signed authorization and certification proof.' })
  })
  it('uploads the requested file with authentication and refreshes the applicant task', async () => {
    const fetcher = mock(), onChanged = vi.fn()
    render(<PostInterviewTask token="applicant" interviewId="meeting1" task={task} onChanged={onChanged} />)
    expect(screen.getByText(task.instructions)).toBeInTheDocument()
    const upload = screen.getByRole('button', { name: 'Upload document' })
    expect(upload).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Upload Background-check authorization form'), { target: { files: [new File(['%PDF-demo'], 'authorization.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(upload)
    expect(fetcher).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm upload' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toContain('/interviews/meeting1/task/background_authorization/file')
    expect(options.headers.Authorization).toBe('Bearer applicant')
    expect(options.body.get('file').name).toBe('authorization.pdf')
    expect(options.headers['Content-Type']).toBeUndefined()
  })
  it('blocks completion until submissions exist and sends the reviewed file versions on confirmation', async () => {
    const fetcher = mock()
    const { rerender } = render(<PostInterviewTask token="employer" audience="employer" interviewId="meeting1" task={task} />)
    expect(screen.getByRole('button', { name: 'Mark document task complete' })).toBeDisabled()
    rerender(<PostInterviewTask token="employer" audience="employer" interviewId="meeting1" task={{ ...task, status: 'submitted', requirements: [{ ...task.requirements[0], file }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark document task complete' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ files: { background_authorization: 'file1' } })
  })
  it('keeps the task optional and renders no applicant task when none was assigned', () => {
    const { container } = render(<PostInterviewTask token="applicant" interviewId="meeting1" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('preserves an uploaded file and prevents replacement after employer completion', () => {
    render(<PostInterviewTask token="applicant" interviewId="meeting1" task={{ ...task, status: 'completed', completedAt: '2026-11-04T03:00:00Z', requirements: [{ ...task.requirements[0], file }] }} />)
    expect(screen.getByRole('button', { name: 'Download authorization.pdf' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Replace/)).not.toBeInTheDocument()
    expect(screen.getByText(/Employer marked complete/)).toBeInTheDocument()
  })
})
