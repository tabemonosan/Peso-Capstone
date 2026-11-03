import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApplicantReputationPage from '../components/ApplicantReputationPage'
import { REPUTATION_POLICY } from '../../shared/reputation.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('applicant reputation window', () => {
  it('shows the current points, policy and confirmed event history with access to applications', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ points: 80, policy: REPUTATION_POLICY, items: [{ type: 'confirmed_no_show', label: 'PESO-confirmed interview no-show', at: '2026-11-04T01:00:00Z', before: 100, after: 80, change: -20 }], total: 1, pageSize: 10 }) })))
    const onOpen = vi.fn()
    render(<ApplicantReputationPage token="applicant" onOpenApplications={onOpen} />)
    expect(await screen.findByLabelText('80 out of 100 reputation points')).toBeInTheDocument()
    expect(screen.getByText('-20 points')).toBeInTheDocument()
    expect(screen.getByText(/100 → 80 points/)).toBeInTheDocument()
    expect(screen.getByText(/A no-show report alone does not deduct points/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open My applications' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
  it('starts at 100 with an empty history and uses server pagination', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ points: 100, policy: [], items: [], total: 12, pageSize: 10 }) }))
    vi.stubGlobal('fetch', fetcher)
    render(<ApplicantReputationPage token="applicant" />)
    expect(await screen.findByLabelText('100 out of 100 reputation points')).toBeInTheDocument()
    expect(screen.getByText(/No reputation changes yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('/reputation?page=2'))).toBe(true))
  })
})
