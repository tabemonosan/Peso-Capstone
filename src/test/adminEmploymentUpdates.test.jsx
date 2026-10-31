import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import AdminEmploymentUpdatesPage from '../components/AdminEmploymentUpdatesPage'

const item = {
  id: 'record1', applicant: { id: 'a1', name: 'Juan Cruz', email: 'juan@example.com' }, employer: { id: 'e1', name: 'Example Works', email: 'hr@example.com' }, job: { id: 'j1', title: 'Office Clerk' },
  applicantReport: { status: 'hired', employmentDate: '2026-01-01', reportedAt: '2026-01-01T02:00:00Z', notes: 'Offer accepted', history: [] },
  employerReport: { status: 'deployed', employmentDate: '2026-02-01', reportedAt: '2026-02-01T02:00:00Z', notes: 'Started work', history: [{ status: 'hired', employmentDate: '2026-01-01', notes: 'Contract signed', reportedAt: '2026-01-01T02:00:00Z' }] },
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [item], total: 1 }) }))))
afterEach(() => vi.unstubAllGlobals())

describe('admin hiring updates page', () => {
  it('shows both parties side by side, status differences, dates, notes and history', async () => {
    render(<AdminEmploymentUpdatesPage token="token" />)
    expect(screen.getByRole('region', { name: 'Hiring updates' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await screen.findByText('Juan Cruz')
    const applicant = screen.getByRole('region', { name: 'Applicant / employee update' })
    const employer = screen.getByRole('region', { name: 'Employer update' })
    expect(within(applicant).getByText('Hired', { exact: true })).toBeInTheDocument()
    expect(within(applicant).getByText('Offer accepted')).toBeInTheDocument()
    expect(within(employer).getByText('Deployed', { exact: true })).toBeInTheDocument()
    expect(within(employer).getByText('Started work')).toBeInTheDocument()
    expect(screen.getByText(/reported different statuses/)).toBeInTheDocument()
    fireEvent.click(within(employer).getByText('Previous updates (1)'))
    expect(within(employer).getByText('Contract signed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('supports missing statements and can clear the notification filters', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [{ ...item, employerReport: null }], total: 1 }) })
    render(<AdminEmploymentUpdatesPage token="token" applicantId="a1" jobId="j1" />)
    await screen.findByText('No update submitted yet.')
    expect(fetch.mock.calls[0][0]).toContain('applicantId=a1')
    expect(fetch.mock.calls[0][0]).toContain('jobId=j1')
    fireEvent.click(screen.getByRole('button', { name: 'Show all updates' }))
    await screen.findByText('Juan Cruz')
    expect(fetch.mock.calls.at(-1)[0]).not.toContain('applicantId=')
  })

  it('shows a load error and lets the admin retry', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unable to load updates.' }) })
    render(<AdminEmploymentUpdatesPage token="token" />)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh updates' }))
    await screen.findByText('Juan Cruz')
  })
})
