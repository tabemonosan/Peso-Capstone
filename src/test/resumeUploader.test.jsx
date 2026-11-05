import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ResumeUploader from '../components/ResumeUploader'

afterEach(() => vi.unstubAllGlobals())

it('loads, validates and uploads an optional profile resume', async () => {
  const close = vi.fn(), fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ resumeFile: null }) }))
  vi.stubGlobal('fetch', fetcher)
  render(<ResumeUploader token="token" onClose={close} />)
  await screen.findByText('No resume uploaded yet.')
  const input = screen.getByLabelText('Choose resume')
  fireEvent.change(input, { target: { files: [new File(['text'], 'resume.txt', { type: 'text/plain' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('Upload a PDF or DOCX')
  expect(screen.getByRole('button', { name: 'Upload resume' })).toBeDisabled()
  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'resume.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload resume' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(fetcher.mock.calls[1][1].body.get('resume').name).toBe('resume.pdf')
})

it('removes an existing resume', async () => {
  const close = vi.fn(), fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ resumeFile: { originalName: 'old.pdf' } }) }))
  vi.stubGlobal('fetch', fetcher)
  render(<ResumeUploader token="token" onClose={close} />)
  await screen.findByText('Current resume: old.pdf')
  fireEvent.click(screen.getByRole('button', { name: 'Remove resume' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(fetcher.mock.calls[1][1].method).toBe('DELETE')
})
