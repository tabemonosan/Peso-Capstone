import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RatingForm from '../components/RatingForm'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const props = { token: 'employer', toUserId: 'applicant1', toRole: 'applicant', hireReportId: 'report1' }
describe('one employer rating per applicant', () => {
  it('keeps the form hidden when a saved rating exists, including a different hire report', async () => {
    const onCreated = vi.fn()
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ratings: [{ fromRole: 'employer', hireReportId: 'older-report' }] }) }))
    vi.stubGlobal('fetch', fetcher)
    render(<RatingForm {...props} onCreated={onCreated} />)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ alreadyExists: true }))
    expect(screen.queryByRole('button', { name: 'Submit Rating' })).not.toBeInTheDocument()
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })
  it('hides after successful submission and remains hidden after remounting', async () => {
    let saved = false
    const fetcher = vi.fn(async (_url, options) => {
      if (options?.method === 'POST') saved = true
      return { ok: true, json: async () => options?.method === 'POST' ? { _id: 'rating1' } : { ratings: saved ? [{ fromRole: 'employer', hireReportId: 'report1' }] : [] } }
    })
    vi.stubGlobal('fetch', fetcher)
    const first = render(<RatingForm {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Rating' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Submit Rating' })).not.toBeInTheDocument())
    first.unmount()
    const onCreated = vi.fn()
    render(<RatingForm {...props} onCreated={onCreated} />)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ alreadyExists: true }))
    expect(screen.queryByRole('button', { name: 'Submit Rating' })).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })
  it('recovers from a duplicate response by hiding the stale form', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: options?.method !== 'POST', status: options?.method === 'POST' ? 409 : 200, json: async () => options?.method === 'POST' ? { code: 'RATING_ALREADY_EXISTS', error: 'Already rated.' } : { ratings: [] } })))
    const onCreated = vi.fn()
    render(<RatingForm {...props} onCreated={onCreated} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Rating' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ alreadyExists: true }))
    expect(screen.queryByRole('button', { name: 'Submit Rating' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
