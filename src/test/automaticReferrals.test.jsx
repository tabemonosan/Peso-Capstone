import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminReferralsPage, { AutomaticReferralBanner } from '../components/AdminReferralsPage'
import ApplicantApplicationHistory from '../components/ApplicantApplicationHistory'

vi.mock('../components/PesoReferralPanel', () => ({ default: () => <p>Preserved manual queue</p> }))
const endpoint = '/api/admin/referral-workflow'
let automatic, fetcher
const item = { _id: 'app1', referralId: 'ref1', applicant: { email: 'applicant@example.com', firstName: 'Ana' }, employer: { id: 'employer1', name: 'Example Works' }, job: { id: 'job1', title: 'Clerk' }, status: 'pending', source: 'auto', history: [] }
beforeEach(() => {
  automatic = true
  fetcher = vi.fn(async (url, options = {}) => {
    let body = {}
    if (url.endsWith(`${endpoint}/settings`)) {
      if (options.method === 'PUT') automatic = JSON.parse(options.body).automaticReferral
      body = { automaticReferral: automatic, history: [] }
    } else if (url.endsWith(`${endpoint}/options`)) body = { employers: [], jobs: [], applicants: [] }
    else if (url.includes(`${endpoint}/applications?`)) body = { items: [item], total: 1 }
    else if (url.endsWith(`${endpoint}/applications/app1`)) body = item
    return { ok: true, json: async () => body }
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => vi.unstubAllGlobals())

describe('automatic referral controls', () => {
  it('shows the manual queue only when automatic referral is switched off', async () => {
    render(<AdminReferralsPage token="admin" />)
    const toggle = await screen.findByRole('checkbox', { name: /Automatic referral/ })
    expect(toggle).toBeChecked()
    expect(screen.queryByText('Preserved manual queue')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(await screen.findByText('Preserved manual queue')).toBeInTheDocument()
    expect(fetcher.mock.calls.some(([url, options]) => url.endsWith('/settings') && options.method === 'PUT' && JSON.parse(options.body).automaticReferral === false)).toBe(true)
  })
  it('requires a reason before pulling back an application', async () => {
    render(<AdminReferralsPage token="admin" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pull back' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'PESO review requested' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(fetcher.mock.calls.some(([url, options]) => url.endsWith('/applications/app1/pull-back') && JSON.parse(options.body).reason === 'PESO review requested')).toBe(true))
  })
  it('shows the off banner and opens oversight', async () => {
    automatic = false
    const open = vi.fn()
    render(<AutomaticReferralBanner token="admin" onOpen={open} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open referrals and applications' }))
    expect(open).toHaveBeenCalledOnce()
  })
  it('keeps withdrawn applicant history visible with no employer actions', () => {
    render(<ApplicantApplicationHistory token="owner" application={{ id: 'app1', status: 'withdrawn_by_admin', source: 'auto', message: 'This application remains in your history.', history: [{ action: 'pull_back', status: 'withdrawn_by_admin', at: '2026-11-02T01:00:00Z' }] }} />)
    expect(screen.getByText('Returned to PESO review')).toBeInTheDocument()
    expect(screen.getByText(/remains in your history/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw application' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report a problem' })).not.toBeInTheDocument()
  })
})
