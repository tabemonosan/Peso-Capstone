import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, it, expect, vi } from 'vitest'
import NsrpImportReview from '../components/NsrpImportReview'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const result = { answers: { firstName: 'Maria', surname: 'Cruz', skills: ['Gardening'] }, warnings: [], importToken: 'source-bound-proof' }
it('shows extracted values and requires review before applying signup details', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result }), onUse = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<NsrpImportReview file={new File(['pdf'], 'nsrp.pdf', { type: 'application/pdf' })} emailProof="verified" onUse={onUse} />)
  fireEvent.click(screen.getByText('Retrieve from NSRP'))
  expect(await screen.findByText('Maria')).toBeInTheDocument()
  expect(onUse).not.toHaveBeenCalled()
  expect(screen.getByText('Use these details')).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByText('Use these details'))
  expect(onUse).toHaveBeenCalledWith(result)
  expect(fetch.mock.calls[0][1].headers).toEqual({ 'X-Email-Proof': 'verified' })
})
it('saves profile enrichment only after confirmation', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => result }).mockResolvedValueOnce({ ok: true, json: async () => ({ profile: { skills: ['Gardening'] } }) }), onUse = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<NsrpImportReview token="session" onUse={onUse} />)
  fireEvent.click(screen.getByText('Retrieve from NSRP'))
  await screen.findByText('Maria')
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Use these details'))
  await waitFor(() => expect(onUse).toHaveBeenCalledWith({ profile: { skills: ['Gardening'] } }))
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ confirmed: true, importToken: result.importToken })
})
it('leaves manual entry available on unreadable PDFs and prevents import during profile editing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Try a clearer PDF or enter manually.' }) }))
  const { rerender } = render(<NsrpImportReview token="session" onUse={vi.fn()} />)
  fireEvent.click(screen.getByText('Retrieve from NSRP'))
  expect(await screen.findByRole('alert')).toHaveTextContent('enter manually')
  rerender(<NsrpImportReview token="session" disabled onUse={vi.fn()} />)
  expect(screen.getByText('Retrieve from NSRP')).toBeDisabled()
})
