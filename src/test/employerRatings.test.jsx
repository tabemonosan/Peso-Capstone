import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmployerRatingsPage from '../components/EmployerRatingsPage'

afterEach(() => vi.unstubAllGlobals())
const respond = data => Promise.resolve({ ok: true, json: async () => data })

describe('employer ratings', () => {
  it('shows the company average and anonymous comments with pagination', async () => {
    const fetch = vi.fn().mockImplementationOnce(() => respond({ averageScore: 3.5, totalRatings: 11, pageSize: 10, ratings: [{ score: 4, comment: 'Supportive company' }] }))
      .mockImplementationOnce(() => respond({ averageScore: 3.5, totalRatings: 11, pageSize: 10, ratings: [{ score: 3, comment: '' }] }))
    vi.stubGlobal('fetch', fetch)
    render(<EmployerRatingsPage token="employer-token" />)
    expect(await screen.findByText('Supportive company')).toBeInTheDocument()
    expect(screen.getByLabelText('3.5 out of 5 stars')).toBeInTheDocument()
    expect(screen.getByText('Anonymous employee')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('No written feedback.')).toBeInTheDocument()
    expect(fetch.mock.calls[1][0]).toContain('page=2')
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer employer-token')
  })
  it('shows an empty state', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond({ averageScore: 0, totalRatings: 0, ratings: [] })))
    render(<EmployerRatingsPage token="token" />)
    expect(await screen.findByText('No employee ratings yet.')).toBeInTheDocument()
  })
  it('allows retrying a failed request', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Connection failed')).mockImplementationOnce(() => respond({ totalRatings: 0, ratings: [] }))
    vi.stubGlobal('fetch', fetch)
    render(<EmployerRatingsPage token="token" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('No employee ratings yet.')).toBeInTheDocument())
  })
})
