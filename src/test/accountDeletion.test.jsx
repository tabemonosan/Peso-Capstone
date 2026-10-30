import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ApplicantAccountSettings from '../components/ApplicantAccountSettings'
import AdminAccountDeletionRequests from '../components/AdminAccountDeletionRequests'

const record = { _id: 'r1', applicantId: 'a1', applicantName: 'Juan Cruz', email: 'juan@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00Z' }
const response = (body, ok = true) => ({ ok, json: async () => body })
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); window.history.replaceState({}, '', '/') })
afterEach(() => vi.unstubAllGlobals())

describe('account deletion screens', () => {
  it('confirms the applicant request before sending it and shows pending review', async () => {
    fetch.mockImplementation(async (_url, options) => response(options?.method === 'POST' ? record : null))
    render(<ApplicantAccountSettings token="token" />)
    await screen.findByLabelText('Current password')
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'MyPassword123!' } })
    fireEvent.change(screen.getByLabelText('Reason for deletion (optional)'), { target: { value: 'No longer needed' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Request account deletion' }).closest('form'))
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
    const confirm = screen.getByRole('alertdialog')
    expect(within(confirm).getByText(/email can be used for a fresh registration/)).toBeInTheDocument()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Send deletion request' }))
    await screen.findByText('Pending admin review')
    const sent = fetch.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(JSON.parse(sent[1].body)).toEqual({ password: 'MyPassword123!', reason: 'No longer needed' })
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel deletion request' })).toBeInTheDocument()
  })

  it('allows cancellation while pending without sending anything when confirmation is dismissed', async () => {
    fetch.mockImplementation(async (_url, options) => response(options?.method === 'DELETE' ? { ...record, status: 'cancelled' } : record))
    render(<ApplicantAccountSettings token="token" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel deletion request' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel', exact: true }))
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deletion request' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, cancel request' }))
    await screen.findByText('Deletion request cancelled')
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
  })

  it('shows decline feedback and allows another request', async () => {
    fetch.mockResolvedValue(response({ ...record, status: 'declined', reviewReason: 'Please speak with PESO first.' }))
    render(<ApplicantAccountSettings token="token" />)
    await screen.findByText('Deletion request declined')
    expect(screen.getByText(/PESO feedback: Please speak/)).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
  })

  it('requires admin approval confirmation and refreshes the queue after success', async () => {
    let reviewed = false
    fetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') { reviewed = true; return response({ ...record, status: 'approved' }) }
      return response({ items: reviewed ? [] : [record], total: reviewed ? 0 : 1 })
    })
    render(<AdminAccountDeletionRequests token="admin-token" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve deletion' }))
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, approve deletion' }))
    await screen.findByText('No account deletion requests in this view.')
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options?.method === 'PUT')[1].body).status).toBe('approved')
  })

  it('requires a reason to decline an account deletion request', async () => {
    fetch.mockResolvedValue(response({ items: [record], total: 1 }))
    render(<AdminAccountDeletionRequests token="admin-token" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Decline request' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'Confirm decline' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Please contact PESO first.' } })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Confirm decline' })).toBeEnabled())
  })
})
