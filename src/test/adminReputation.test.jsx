import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminReputationSettings, AdminReputationReviews, AdminReputationAccount } from '../components/AdminReputation'
import { REPUTATION_DEFAULTS } from '../../shared/reputation.js'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('requires an audit reason to save edited settings and displays the saved history', async () => {
  const fetcher = vi.fn(async (_url, options) => ({ ok: true, json: async () => options?.method === 'POST' ? { rules: { ...REPUTATION_DEFAULTS, weeklyRecovery: 3 }, history: [{ at: '2026-11-05', by: 'admin', reason: 'Reviewed recovery rates.', before: REPUTATION_DEFAULTS, after: { ...REPUTATION_DEFAULTS, weeklyRecovery: 3 } }] } : { rules: REPUTATION_DEFAULTS, history: [] } }))
  vi.stubGlobal('fetch', fetcher)
  render(<AdminReputationSettings token="admin" />)
  fireEvent.click(await screen.findByText('Edit policy values'))
  fireEvent.change(screen.getByLabelText('Recovery points per full period'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save reputation settings' }))
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Reviewed recovery rates.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  expect(await screen.findByRole('status')).toHaveTextContent('saved and audited')
  const payload = JSON.parse(fetcher.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
  expect(payload.rules.weeklyRecovery).toBe(3)
  expect(payload.reason).toBe('Reviewed recovery rates.')
  fireEvent.click(screen.getByText('Reputation policy audit history'))
  expect(screen.getByText('Reviewed recovery rates.')).toBeInTheDocument()
})

it.each(['reverse', 'keep', 'reduce'])('requires confirmation and a private note for the %s review action', async action => {
  let decided = false
  const item = { _id: 'review-1', applicantEmail: 'applicant@example.test', category: 'Wrong report', note: 'Please check.', status: 'pending', event: { label: 'Confirmed no-show', change: -10 }, createdAt: '2026-11-05' }
  const fetcher = vi.fn(async (_url, options) => { if (options?.method === 'POST') decided = true; return { ok: true, json: async () => options?.method === 'POST' ? { ok: true } : { items: decided ? [] : [item], total: decided ? 0 : 1 } } })
  vi.stubGlobal('fetch', fetcher)
  render(<AdminReputationReviews token="admin" />)
  fireEvent.click(await screen.findByRole('button', { name: action === 'reverse' ? 'Reverse penalty' : action === 'keep' ? 'Keep penalty' : 'Reduce penalty' }))
  if (action !== 'reverse') fireEvent.change(screen.getByLabelText(/Explanation for the applicant/), { target: { value: 'PESO reviewed the available information.' } })
  if (action === 'reduce') fireEvent.change(screen.getByLabelText(/New penalty amount/), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to confirmation' }))
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Private staff evidence reviewed.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await screen.findByText('No reputation reviews in this queue.')
  const payload = JSON.parse(fetcher.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
  expect(payload.action).toBe(action)
  expect(payload.reason).toBe('Private staff evidence reviewed.')
  if (action === 'reduce') expect(payload.reducedPoints).toBe(3)
})

it('shows the private admin-only count and supports reversing a ledger event', async () => {
  let reversed = false
  const fetcher = vi.fn(async (_url, options) => { if (options?.method === 'POST') reversed = true; return { ok: true, json: async () => ({ points: reversed ? 100 : 90, tier: 'Good standing', confirmedNoShows: reversed ? 0 : 1, settings: REPUTATION_DEFAULTS, events: [{ key: 'private-key', label: 'Confirmed no-show', type: 'confirmed_no_show', change: -10, status: reversed ? 'reversed' : 'applied', at: '2026-11-05', by: 'admin', reason: 'Private evidence note' }] }) } })
  vi.stubGlobal('fetch', fetcher)
  render(<AdminReputationAccount token="admin" applicantId="applicant-1" />)
  fireEvent.click(screen.getByText('Reputation ledger (PESO only)'))
  expect(await screen.findByText(/1 confirmed no-shows/)).toBeInTheDocument()
  expect(screen.getByText(/Private evidence note/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reverse event' }))
  const dialog = screen.getByRole('alertdialog')
  fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Correcting this event.' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.getByText(/0 confirmed no-shows/)).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'Reverse event' })).not.toBeInTheDocument()
})
