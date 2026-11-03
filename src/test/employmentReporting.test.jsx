import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import HireReportForm from '../components/HireReportForm'
import ApplicantEmploymentReports from '../components/ApplicantEmploymentReports'
import ReferralList from '../components/ReferralList'
import PesoReferralPanel from '../components/PesoReferralPanel'
import { API_URL } from '../config'

const response = (body, ok = true) => ({ ok, json: async () => body })
beforeEach(() => { vi.restoreAllMocks(); global.fetch = vi.fn() })

describe('employment updates', () => {
  it.each([
    ['invited', null, '1. Invitation sent', /Waiting for the applicant response/],
    ['confirmed', null, '2. Invitation accepted', /The applicant accepted/],
    ['held', null, '3. Post-interview task', /Provide any post-interview task/],
    ['attended', 'hired', '4. Hiring outcome', /You reported this applicant as hired/],
    ['held', 'not_hired', '4. Hiring outcome', /You reported this applicant as not hired/],
  ])('shows employer progress for interview %s and outcome %s', async (meetingStatus, outcome, stage, message) => {
    const referral = { _id: 'r1', status: 'accepted', applicantId: { _id: 'a1', profile: { firstName: 'Ana', lastName: 'Cruz' } }, jobId: { _id: 'j1', title: 'Office Clerk' } }
    fetch.mockImplementation(async url => {
      if (url.includes('/api/workflow/referrals/')) return response({ id: 'meeting1', status: meetingStatus, scheduledAt: new Date(Date.now() + 86400000).toISOString(), mode: 'In person', location: 'Demo office' })
      if (url.endsWith('/api/hire-reports')) return response(outcome ? [{ _id: 'report1', referralId: 'r1', status: outcome }] : [])
      return response([referral])
    })
    render(<ReferralList token="token" employerId="e1" />)
    const graph = await screen.findByRole('list', { name: 'Application stages' })
    await waitFor(() => expect(graph.querySelector('[aria-current="step"]')).toHaveTextContent(stage))
    expect(within(graph).getAllByRole('listitem')).toHaveLength(4)
    expect(within(graph.closest('section')).getByRole('status')).toHaveTextContent(message)
  })
  it('keeps job details in the sidebar and focuses the main panel on the selected job referrals', async () => {
    let referrals = [
      { _id: 'r1', status: 'pending', applicantId: { _id: 'a1', profile: { firstName: 'Ana', lastName: 'Cruz' } }, jobId: { _id: 'j1', title: 'Office Clerk', company: 'Example Works', location: 'Manito, Albay', description: 'Organize office records', requirements: 'Office skills' } },
      { _id: 'r2', status: 'pending', applicantId: { _id: 'a2', profile: { firstName: 'Ben', lastName: 'Reyes' } }, jobId: { _id: 'j2', title: 'Delivery Driver', company: 'Example Works', location: 'Manito, Albay', description: 'Deliver orders', requirements: 'Valid license' } },
    ]
    fetch.mockImplementation(async url => response(url.includes('/api/referrals/employer/') ? referrals : []))
    render(<ReferralList token="token" employerId="e1" profileImage="/company.jpg" />)
    const sidebar = await screen.findByRole('region', { name: 'Jobs with referrals' })
    const clerk = within(sidebar).getByRole('button', { name: 'View referrals for Office Clerk' })
    expect(clerk).toHaveAttribute('aria-pressed', 'true')
    expect(clerk.querySelector('img')).toHaveAttribute('src', '/company.jpg')
    expect(within(sidebar).getByText('Organize office records')).toBeInTheDocument()
    const firstPanel = screen.getByRole('region', { name: 'Office Clerk referrals' })
    expect(within(firstPanel).getByText('Ana Cruz')).toBeInTheDocument()
    expect(within(firstPanel).queryByText('Organize office records')).not.toBeInTheDocument()
    expect(screen.queryByText('Ben Reyes')).not.toBeInTheDocument()
    fireEvent.click(within(sidebar).getByRole('button', { name: 'View referrals for Delivery Driver' }))
    expect(within(screen.getByRole('region', { name: 'Delivery Driver referrals' })).getByText('Ben Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument()
    expect(within(sidebar).getByText('Valid license')).toBeInTheDocument()
    referrals = [referrals[0]]
    fireEvent(window, new Event('focus'))
    expect(await screen.findByRole('region', { name: 'Office Clerk referrals' })).toBeInTheDocument()
    expect(screen.queryByText('Ben Reyes')).not.toBeInTheDocument()
  })
  it('shows admin tracking names and job titles even without loaded directory records', async () => {
    fetch.mockImplementation(async (url) => response(url.endsWith('/api/hire-reports') ? [{ _id: 'report1', applicantId: 'private-applicant-id', employerId: 'private-employer-id', jobId: 'private-job-id', status: 'hired', applicant: { name: 'Juan Cruz', email: 'juan@example.com' }, employer: { name: 'Example Works', email: 'hr@example.com' }, job: { title: 'Office Clerk' } }] : []))
    render(<PesoReferralPanel token="token" adminUsers={[]} />)
    await screen.findByText('Juan Cruz')
    expect(screen.getByText('Example Works')).toBeTruthy()
    expect(screen.getByText('Office Clerk')).toBeTruthy()
    expect(screen.queryByText('private-applicant-id')).toBeNull()
  })
  it('hides pending, declined, and direct-application reports until referral acceptance', async () => {
    fetch.mockImplementation(async (url) => response(url.endsWith('/api/hire-reports') ? [] : ['pending', 'declined', 'applied'].map((status) => ({ _id: status, referralId: status === 'applied' ? null : status, status, jobId: { _id: status, title: `Hidden ${status}` } }))))
    render(<ApplicantEmploymentReports token="token" applicantId="a1" />)
    await screen.findByText(/No accepted referrals yet/)
    expect(screen.queryByText(/Hidden pending/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send update to PESO' })).toBeNull()
  })
  it('sends employer outcomes, dates and notes to the configured API', async () => {
    fetch.mockResolvedValue(response({ _id: 'report1', status: 'not_hired' }))
    render(<HireReportForm token="token" applicantId="a1" jobId="j1" referralId="r1" />)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'not_hired' } })
    fireEvent.change(screen.getByLabelText('Notes to PESO (optional)'), { target: { value: 'Position filled' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send update to PESO' }))
    await screen.findByText('Your update was sent to PESO.')
    expect(fetch.mock.calls[0][0]).toBe(`${API_URL}/api/hire-reports`)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ status: 'not_hired', notes: 'Position filled', employmentDate: '', referralId: 'r1' })
  })

  it('shows applicant-only outcomes and loads existing reports for updates', () => {
    render(<HireReportForm token="token" applicantId="a1" jobId="j1" reporterRole="Applicant" existingReport={{ status: 'deployed', employmentDate: '2026-01-02', notes: 'Started work' }} />)
    expect(screen.queryByRole('option', { name: 'Not hired' })).toBeNull()
    expect(screen.getByLabelText('Status').value).toBe('deployed')
    expect(screen.getByLabelText('Actual deployment date (optional)').value).toBe('2026-01-02')
    expect(screen.getByText(/employer decides deployment timing/)).toBeTruthy()
  })

  it('loads applicant opportunities and restores a previously submitted report', async () => {
    fetch.mockImplementation(async (url) => response(url.endsWith('/api/hire-reports') ? [{ _id: 'report1', jobId: 'j1', status: 'hired' }] : [{ _id: 'r1', referralId: 'r1', jobId: { _id: 'j1', title: 'Office Clerk' }, employerId: { companyName: 'Example Works', email: 'hr@example.com' }, status: 'accepted' }]))
    render(<ApplicantEmploymentReports token="token" applicantId="a1" />)
    await screen.findByText('Office Clerk')
    expect(screen.getByText('Update sent to PESO')).toBeTruthy()
    expect(screen.getByText('Hired', { exact: true })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send update to PESO' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit update' }))
    expect(screen.getByLabelText('Status').value).toBe('hired')
    expect(screen.getByText(/hr@example.com/)).toBeTruthy()
    expect(screen.getByText(/Your NSRP form stays with PESO/)).toBeTruthy()
  })

  it('replaces successful submissions with a summary and allows editing or reporting deployment', async () => {
    const opportunity = { _id: 'r1', referralId: 'r1', status: 'accepted', jobId: { _id: 'j1', title: 'Office Clerk' }, employerId: { companyName: 'Example Works' } }
    fetch.mockImplementation(async (url, options) => {
      if (options?.method === 'POST') return response({ ...JSON.parse(options.body), _id: 'report1', reportedAt: '2026-10-30T16:05:00Z' })
      return response(url.endsWith('/api/hire-reports') ? [] : [opportunity])
    })
    render(<ApplicantEmploymentReports token="token" applicantId="a1" />)
    await screen.findByRole('button', { name: 'Send update to PESO' })
    fireEvent.change(screen.getByLabelText('Date hired (optional)'), { target: { value: '2026-10-30' } })
    fireEvent.change(screen.getByLabelText('Notes to PESO (optional)'), { target: { value: 'Offer accepted.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send update to PESO' }))
    await screen.findByText('Update sent to PESO')
    expect(screen.queryByLabelText('Status')).toBeNull()
    expect(screen.getByText('October 30, 2026')).toBeTruthy()
    expect(screen.getByText(/October 31, 2026/)).toBeTruthy()
    expect(screen.getByText('Offer accepted.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit update' }))
    expect(screen.getByLabelText('Date hired (optional)').value).toBe('2026-10-30')
    expect(screen.getByLabelText('Notes to PESO (optional)').value).toBe('Offer accepted.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Report deployment' }))
    expect(screen.getByLabelText('Status').value).toBe('deployed')
    expect(screen.getByLabelText('Actual deployment date (optional)').value).toBe('')
    fireEvent.change(screen.getByLabelText('Actual deployment date (optional)'), { target: { value: '2026-10-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send update to PESO' }))
    await screen.findByText('Update sent to PESO')
    expect(screen.getByText('Deployed', { exact: true })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Report deployment' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit update' })).toBeTruthy()
  })

  it('keeps the applicant form and entered values when submission fails', async () => {
    fetch.mockImplementation(async (url, options) => options?.method === 'POST'
      ? response({ error: 'Please try again.' }, false)
      : response(url.endsWith('/api/hire-reports') ? [] : [{ _id: 'r1', referralId: 'r1', status: 'accepted', jobId: { _id: 'j1', title: 'Office Clerk' } }]))
    render(<ApplicantEmploymentReports token="token" applicantId="a1" />)
    await screen.findByLabelText('Notes to PESO (optional)')
    fireEvent.change(screen.getByLabelText('Notes to PESO (optional)'), { target: { value: 'Keep my note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send update to PESO' }))
    await screen.findByText('Please try again.')
    expect(screen.queryByText('Update sent to PESO')).toBeNull()
    expect(screen.getByLabelText('Notes to PESO (optional)').value).toBe('Keep my note')
  })

  it('keeps declined referrals available for reporting without replacing populated contact details', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fetch.mockImplementation(async (url, options) => {
      if (options?.method === 'PUT') return response({ _id: 'r1', status: 'declined', applicantId: 'a1', jobId: 'j1' })
      if (url.endsWith('/api/hire-reports')) return response([])
      return response([{ _id: 'r1', status: 'pending', applicantId: { _id: 'a1', email: 'juan@example.com', profile: { firstName: 'Juan', lastName: 'Cruz' } }, jobId: { _id: 'j1', title: 'Office Clerk' } }])
    })
    render(<ReferralList token="token" employerId="e1" />)
    await screen.findByText('Juan Cruz')
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send update to PESO' })).toBeTruthy())
    expect(screen.getByText('Juan Cruz')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Not hired' })).toBeTruthy()
  })

  it('restores an employer report after reopening the referrals screen', async () => {
    fetch.mockImplementation(async (url) => response(url.endsWith('/api/hire-reports')
      ? [{ _id: 'report1', referralId: 'r1', status: 'deployed', employmentDate: '2026-01-02' }]
      : [{ _id: 'r1', status: 'accepted', applicantId: { _id: 'a1', email: 'juan@example.com', profile: { firstName: 'Juan', lastName: 'Cruz' } }, jobId: { _id: 'j1', title: 'Office Clerk' } }]))
    render(<ReferralList token="token" employerId="e1" />)
    await screen.findByText(/Last reported: Deployed/)
    expect(screen.getByLabelText('Status').value).toBe('deployed')
    expect(screen.getByLabelText('Actual deployment date (optional)').value).toBe('2026-01-02')
  })
})
