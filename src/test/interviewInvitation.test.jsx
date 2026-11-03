import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EmployerInterviewPanel from '../components/EmployerInterviewPanel'
import { philippineDateTimeInput } from '../../shared/interviewInvitation.js'

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: true, json: async () => options?.method === 'POST' ? { id: 'interview1', ...JSON.parse(options.body), status: 'invited' } : null }))))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function openForm() {
  render(<EmployerInterviewPanel token="employer" referralId="referral1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Invite to interview' }))
  return screen.getByRole('dialog', { name: 'Interview invitation' })
}
function fill(dialog) {
  fireEvent.change(within(dialog).getByLabelText(/Interview date and time/), { target: { value: philippineDateTimeInput(new Date(Date.now() + 86400000)) } })
  fireEvent.change(within(dialog).getByLabelText(/Municipality \/ city/), { target: { value: 'Manito' } })
  fireEvent.change(within(dialog).getByLabelText(/Barangay/), { target: { value: 'Nagotgot' } })
}
describe('interview invitation date and location', () => {
  it('disables past date/time values and limits barangays to the selected city', async () => {
    const dialog = await openForm()
    expect(within(dialog).getByLabelText(/Message to applicant/)).toHaveAttribute('maxlength', '50')
    const date = within(dialog).getByLabelText(/Interview date and time/)
    expect(+new Date(`${date.min}+08:00`)).toBeGreaterThan(Date.now())
    fireEvent.change(date, { target: { value: '2020-01-01T10:00' } })
    expect(date.validity.rangeUnderflow).toBe(true)
    const barangay = within(dialog).getByLabelText(/Barangay/)
    expect(barangay).toBeRequired()
    expect(barangay).toBeDisabled()
    fill(dialog)
    expect(barangay).toHaveValue('Nagotgot')
    fireEvent.change(within(dialog).getByLabelText(/Municipality \/ city/), { target: { value: 'Oas' } })
    expect(barangay).toHaveValue('')
    expect(within(barangay).queryByRole('option', { name: 'Nagotgot' })).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Province/)).toBeRequired()
    expect(within(dialog).getByLabelText(/Landmark/)).not.toBeRequired()
  })
  it('submits a future Philippine time and required address without a landmark', async () => {
    const dialog = await openForm()
    fill(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true))
    const [, options] = fetch.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(JSON.parse(options.body)).toMatchObject({ city: 'Manito', barangay: 'Nagotgot', province: 'Albay', landmark: '', location: 'Nagotgot, Manito, Albay' })
    expect(+new Date(JSON.parse(options.body).scheduledAt)).toBeGreaterThan(Date.now())
  })
  it('rejects a typed past time even if browser validation is bypassed', async () => {
    const dialog = await openForm()
    fill(dialog)
    fireEvent.change(within(dialog).getByLabelText(/Interview date and time/), { target: { value: '2020-01-01T10:00' } })
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Send invitation' }).closest('form'))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose a future interview time')
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })
})
