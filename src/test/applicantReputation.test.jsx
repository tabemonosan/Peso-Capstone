import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApplicantReputationPage from '../components/ApplicantReputationPage'
import { REPUTATION_POLICY, REPUTATION_DEFAULTS, reputationPolicy } from '../../shared/reputation.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('applicant reputation window', () => {
  it('shows the current points, policy and confirmed event history with access to applications', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ points: 80, policy: REPUTATION_POLICY, items: [{ type: 'confirmed_no_show', label: 'PESO-confirmed interview no-show', at: '2026-11-04T01:00:00Z', before: 100, after: 80, change: -20 }], total: 1, pageSize: 10 }) })))
    const onOpen = vi.fn()
    render(<ApplicantReputationPage token="applicant" onOpenApplications={onOpen} />)
    expect(await screen.findByLabelText('80 out of 100 reputation points')).toBeInTheDocument()
    expect(screen.getByText('-20 points')).toBeInTheDocument()
    expect(screen.getByText(/100 → 80 points/)).toBeInTheDocument()
    expect(screen.getByText(/apply the reputation policy automatically/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open My applications' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
  it('starts at 100 with an empty history and uses server pagination', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ points: 100, policy: [], items: [], total: 0, pageSize: 10 }) }))
    vi.stubGlobal('fetch', fetcher)
    render(<ApplicantReputationPage token="applicant" />)
    expect(await screen.findByLabelText('100 out of 100 reputation points')).toBeInTheDocument()
    expect(screen.getByText(/No changes yet. You start with 100 points./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })
  it('paginates and sorts real history without displaying an empty state', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ points: 90, policy: [], items: [{ id: 'one', type: 'confirmed_no_show', label: 'Confirmed no-show', at: '2026-11-01', change: -10, before: 100, after: 90, status: 'applied' }], total: 12, pageSize: 10 }) }))
    vi.stubGlobal('fetch', fetcher)
    render(<ApplicantReputationPage token="applicant" />)
    await screen.findByLabelText('90 out of 100 reputation points')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('/reputation?page=2'))).toBe(true))
    fireEvent.change(screen.getByLabelText('Sort history'), { target: { value: 'asc' } })
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('page=1&order=asc'))).toBe(true))
    expect(screen.queryByText(/No changes yet/)).not.toBeInTheDocument()
  })
  it.each([true, false])('shows At risk, a recovery forecast, and truthful routing guidance with low-trust routing %s', async lowTrustRouting => {
    const rules = { ...REPUTATION_DEFAULTS, attendanceCredit: 7, weeklyRecovery: 3 }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ points: 45, tier: 'At risk', maximumPoints: 100, settings: rules, policy: reputationPolicy(rules), recovery: { expectedAt: '2027-01-01T00:00:00Z', nextAt: '2026-11-12T00:00:00Z', amount: 3, progress: 0.5 }, lowTrustRouting, items: [], total: 0 }) })))
    render(<ApplicantReputationPage token="applicant" />)
    expect(await screen.findByText('At risk', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Your path back' })).toHaveTextContent('2027')
    expect(screen.getByLabelText('Weekly recovery progress')).toHaveAttribute('value', '0.5')
    expect(screen.getByText(/Attend your next interview/)).toHaveTextContent('+7')
    expect(screen.getByText(/3 previously lost points/)).toBeInTheDocument()
    expect(screen.getByText(lowTrustRouting ? /reviewed by PESO before reaching employers/ : /Points alone never block applying/)).toBeInTheDocument()
  })
  it('submits one private review request with the selected evidence and opens the associated application', async () => {
    const item = { id: 'a'.repeat(64), type: 'confirmed_no_show', label: 'PESO-confirmed interview no-show', change: -10, before: 100, after: 90, at: '2026-11-01', status: 'applied', canRequestReview: true, applicationId: 'application-1' }
    let submitted = false
    const fetcher = vi.fn(async (url, options) => {
      if (options?.method === 'POST') { submitted = true; return { ok: true, json: async () => ({ ok: true }) } }
      return { ok: true, json: async () => ({ points: 90, policy: [], items: [{ ...item, status: submitted ? 'under_review' : 'applied', canRequestReview: !submitted }], total: 1 }) }
    })
    vi.stubGlobal('fetch', fetcher)
    const onOpen = vi.fn()
    render(<ApplicantReputationPage token="applicant" onOpenApplications={onOpen} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Open application' }))
    expect(onOpen).toHaveBeenCalledWith('application-1')
    fireEvent.click(screen.getByRole('button', { name: 'Request review' }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Emergency or illness' } })
    const note = screen.getByLabelText(/Your note/)
    expect(note).toHaveAttribute('maxlength', '300')
    fireEvent.change(note, { target: { value: 'Please review this penalty.' } })
    const evidence = new File(['test'], 'support.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/Supporting file/), { target: { files: [evidence] } })
    fireEvent.click(screen.getByRole('button', { name: 'Send review request' }))
    expect(await screen.findByText('Under review', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request review' })).not.toBeInTheDocument()
    const body = fetcher.mock.calls.find(([, options]) => options?.method === 'POST')[1].body
    expect(body.get('eventId')).toBe(item.id)
    expect(body.get('file')).toBe(evidence)
    expect(body.get('category')).toBe('Emergency or illness')
    expect(body.get('note')).toBe('Please review this penalty.')
  })
})
