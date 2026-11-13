import { render, screen, fireEvent, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ApplicantJobBrowser from '../components/ApplicantJobBrowser'
import CompanyProfilePage from '../components/CompanyProfilePage'
import CompanyProfileWindow from '../components/CompanyProfileWindow'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); window.location.hash = '' })
const props = { jobs: [{ _id: 'job1', title: 'Welder', company: 'PARKour' }], applicationByJobId: new Map(), appliedPostingById: new Map(), appliedJobIds: new Set(), token: 'applicant-token' }

it('opens a new company profile tab while keeping the selected job visible', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  render(<ApplicantJobBrowser {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'View company profile' }))
  expect(open).toHaveBeenCalledWith(`${window.location.pathname}#company-profile/job1`, '_blank', 'noopener,noreferrer')
  expect(screen.getByRole('article', { name: 'Welder job details' })).toBeInTheDocument()
})

it('loads the company profile in its separate window using the signed-in account', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ companyName: 'PARKour', summary: 'About PARKour', location: 'Oas, Albay', website: 'example.com', job: { _id: 'job1', title: 'Welder', company: 'PARKour', description: 'Weld steel frames', skills: ['Welding'] }, rating: { averageScore: 3.5, totalRatings: 2 } }) })
  vi.stubGlobal('fetch', fetch)
  localStorage.setItem('peso-token', 'applicant-token')
  window.location.hash = '#company-profile/job1'
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  render(<CompanyProfileWindow />)
  expect(await screen.findByText('About PARKour')).toBeInTheDocument()
  expect(screen.getByLabelText('3.5 out of 5 stars, 2 reviews')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute('href', 'https://example.com/')
  expect(fetch.mock.calls[0][0]).toContain('/api/jobs/job1/company-profile')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer applicant-token')
  expect(screen.queryByRole('article', { name: 'Welder job details' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'View job details' }))
  expect(screen.getByRole('article', { name: 'Welder job details' })).toHaveTextContent('Weld steel frames')
  fireEvent.click(screen.getByRole('button', { name: 'Hide job details' }))
  expect(screen.queryByRole('article', { name: 'Welder job details' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close tab' }))
  expect(close).toHaveBeenCalled()
})

it('handles missing company information and unsafe website values', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ companyName: 'PARKour', website: 'javascript:alert(1)', rating: { totalRatings: 0 } }) }))
  render(<CompanyProfilePage token="token" jobId="job1" onBack={() => {}} />)
  expect(await screen.findByText('No employee ratings yet.')).toBeInTheDocument()
  expect(screen.getByText('No company description provided.')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('shows anonymous reviews below the job and pages through feedback', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ companyName: 'PARKour', job: { title: 'Welder' }, rating: { averageScore: 4, totalRatings: 11 }, reviewPageSize: 10, reviews: [{ score: 4, comment: 'Helpful team' }] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ companyName: 'PARKour', rating: { averageScore: 4, totalRatings: 11 }, reviewPageSize: 10, reviews: [{ score: 3, comment: '' }] }) })
  vi.stubGlobal('fetch', fetch)
  render(<CompanyProfilePage token="token" jobId="job1" onBack={() => {}} />)
  expect(await screen.findByText('Helpful team')).toBeInTheDocument()
  const reviews = screen.getByRole('region', { name: 'Employee reviews' })
  expect(within(reviews).getByText('Anonymous employee')).toBeInTheDocument()
  expect(within(reviews).getByLabelText('4 out of 5 stars')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View job details' }).compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next reviews' }))
  expect(await screen.findByText('No written feedback.')).toBeInTheDocument()
  expect(fetch.mock.calls[1][0]).toContain('reviewPage=2')
})
