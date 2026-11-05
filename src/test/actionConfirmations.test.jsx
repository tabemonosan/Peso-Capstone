import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ActionConfirmations from '../components/ActionConfirmations'
import ConfirmDialog from '../components/ConfirmDialog'
import { installConfirmedFetch, mutationDescription } from '../utils/actionConfirmation'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { API_URL } from '../config'
import PortfolioLinksEditor from '../components/PortfolioLinksEditor'
import Modal from '../components/Modal'

let original, uninstall
beforeEach(() => {
  original = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', original)
  uninstall = installConfirmedFetch()
})
afterEach(() => { cleanup(); uninstall(); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([
  ['/api/profile', 'PUT'], ['/api/profile/resume', 'POST'], ['/api/profile/resume', 'DELETE'],
  ['/api/jobs', 'POST'], ['/api/jobs/job1/status', 'PUT'], ['/api/ratings', 'POST'], ['/api/admin/new-resource', 'PATCH'],
])('requires confirmation before a system mutation %s %s', async (path, method) => {
  render(<ActionConfirmations />)
  let request
  act(() => { request = fetch(`${API_URL}${path}`, { method }) })
  const dialog = await screen.findByRole('alertdialog')
  expect(original).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^Confirm/ }))
  await request
  expect(original).toHaveBeenCalledExactlyOnceWith(`${API_URL}${path}`, { method })
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
})

it('cancels without contacting the server', async () => {
  render(<ActionConfirmations />)
  let request
  act(() => { request = fetch(`${API_URL}/api/jobs`, { method: 'POST' }) })
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  const response = await request
  expect(response.ok).toBe(false)
  expect((await response.json()).code).toBe('ACTION_CANCELLED')
  expect(original).not.toHaveBeenCalled()
})

it('preserves existing detailed confirmations without opening another dialog', async () => {
  let request
  render(<><ActionConfirmations /><ConfirmDialog title="Approve this document?" onCancel={vi.fn()} onConfirm={() => { request = fetch(`${API_URL}/api/documents/document1`, { method: 'PUT' }) }} /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await request
  expect(original).toHaveBeenCalledOnce()
  expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
})

it.each([
  ['/api/jobs', 'GET'], ['/api/nsrp/validate-signup', 'POST'], ['/api/nsrp/preview-signup', 'POST'],
  ['/api/applications/validate-email', 'POST'], ['/api/notifications/n1/read', 'PATCH'], ['/api/profile/page-guides', 'PATCH'],
])('leaves passive reads, checks and UI state uninterrupted %s', async (path, method) => {
  render(<ActionConfirmations />)
  await fetch(`${API_URL}${path}`, { method })
  expect(original).toHaveBeenCalledOnce()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

it('starts the network timeout only after confirmation', async () => {
  vi.useFakeTimers()
  render(<ActionConfirmations />)
  let request
  act(() => { request = fetchWithTimeout(`${API_URL}/api/profile`, { method: 'PUT' }, 50) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(original).not.toHaveBeenCalled()
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm save' })); await request })
  expect(original).toHaveBeenCalledOnce()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

it('cancels an aborted request waiting for confirmation', async () => {
  render(<ActionConfirmations />)
  const controller = new AbortController()
  let request
  act(() => { request = fetch(`${API_URL}/api/profile`, { method: 'PUT', signal: controller.signal }) })
  await screen.findByRole('alertdialog')
  act(() => controller.abort())
  expect((await request).ok).toBe(false)
  expect(original).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
})

it('queues independent mutations and never sends a cancelled one', async () => {
  render(<ActionConfirmations />)
  let first, second
  act(() => {
    first = fetch(`${API_URL}/api/profile`, { method: 'PUT' })
    second = fetch(`${API_URL}/api/profile/resume`, { method: 'DELETE' })
  })
  await screen.findByRole('alertdialog', { name: 'Save profile changes?' })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }))
  await first
  await screen.findByRole('alertdialog', { name: 'Delete this item?' })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await second
  expect(original).toHaveBeenCalledOnce()
})

it('does not intercept requests to unrelated services', () => {
  expect(mutationDescription('https://unrelated.example/api/profile', { method: 'PUT' })).toBeNull()
})

it('preserves a filled portfolio form when its shared confirmation is cancelled', async () => {
  const close = vi.fn()
  render(<><ActionConfirmations /><PortfolioLinksEditor links={[]} onClose={close} onSave={async links => ({ ok: (await fetch(`${API_URL}/api/profile`, { method: 'PUT', body: JSON.stringify({ profile: { portfolioLinks: links } }) })).ok })} /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
  fireEvent.change(screen.getByLabelText('Link title 1'), { target: { value: 'My portfolio' } })
  fireEvent.change(screen.getByLabelText('Website URL 1'), { target: { value: 'https://example.com/work' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save links' }))
  const confirm = await screen.findByRole('alertdialog')
  const form = screen.getByRole('dialog', { name: 'Portfolio links' })
  expect(Number(confirm.dataset.modalLayer)).toBeGreaterThan(Number(form.dataset.modalLayer))
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(screen.getByLabelText('Website URL 1')).toHaveValue('https://example.com/work')
  expect(original).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
})

it('places a shared confirmation above an already nested modal', async () => {
  render(<><ActionConfirmations /><Modal labelledBy="outer-title"><h2 id="outer-title">Outer</h2><Modal labelledBy="inner-title"><h3 id="inner-title">Inner</h3><button onClick={() => fetch(`${API_URL}/api/profile`, { method: 'PUT' })}>Save nested change</button></Modal></Modal></>)
  fireEvent.click(screen.getByRole('button', { name: 'Save nested change' }))
  const confirm = await screen.findByRole('alertdialog')
  expect(Number(confirm.dataset.modalLayer)).toBeGreaterThan(Number(screen.getByRole('dialog', { name: 'Inner' }).dataset.modalLayer))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(original).not.toHaveBeenCalled()
})
