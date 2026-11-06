import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PageGuide from '../components/PageGuide'

afterEach(() => vi.unstubAllGlobals())
const props = { role: 'Applicant', view: 'dashboard', state: { seenPages: [], dismissedAll: false }, token: 'test-token' }

it('shows the current page guide and remembers an acknowledgement through the API', async () => {
  const saved = { seenPages: ['dashboard'], dismissedAll: false }
  const onSaved = vi.fn()
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ pageGuides: saved }) }))
  vi.stubGlobal('fetch', fetcher)
  const { rerender } = render(<PageGuide {...props} onSaved={onSaved} />)
  expect(screen.getByRole('complementary', { name: 'Welcome to your workspace' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ page: 'dashboard' })
  rerender(<PageGuide {...props} state={saved} />)
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  rerender(<PageGuide {...props} view="jobs" state={saved} />)
  expect(screen.getByText('Find a job that fits')).toBeInTheDocument()
})

it('leaves legacy accounts and dismissed guides quiet', () => {
  const { rerender } = render(<PageGuide {...props} state={undefined} />)
  expect(screen.queryByText('Quick guide')).not.toBeInTheDocument()
  rerender(<PageGuide {...props} state={{ dismissedAll: true, seenPages: [] }} />)
  expect(screen.queryByText('Quick guide')).not.toBeInTheDocument()
})

it('allows hiding all guides and uses role-specific content', async () => {
  const onSaved = vi.fn()
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ pageGuides: { dismissedAll: true, seenPages: [] } }) }))
  vi.stubGlobal('fetch', fetcher)
  render(<PageGuide {...props} role="Employer" view="verification" onSaved={onSaved} />)
  expect(screen.getByText('Track your registration review')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hide all guides' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ dismissAll: true })
})

it('keeps the guide available for retry if saving fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const onSaved = vi.fn()
  render(<PageGuide {...props} onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again')
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Got it' })).toBeEnabled()
})
