import { getEmployerAddress, PH_LOCATIONS } from '../../shared/phLocations.js'
import { useJobFilters } from '../hooks/useJobFilters'
import { fireEvent, render, screen, waitFor, within, renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { deadlineBounds } from '../../shared/jobPosting.js'
const mockFetch = vi.fn()
let user
let serverErrors
let myJobs
beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  serverErrors = null
  myJobs = []
  user = { id: 'employer-1', email: 'employer@example.com', role: 'Employer', emailVerified: true, companyName: 'Example Works', verificationStatus: 'approved', registration: { complete: true }, establishmentAddress: { city: 'Legazpi City', province: 'Albay' }, profile: {} }
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockImplementation(async (url, options = {}) => {
    let data = []
    let ok = true
    if (url.endsWith('/api/login')) data = { token: 'token', user }
    else if (url.endsWith('/api/profile')) data = user
    else if (url.includes('/api/jobs?status=mine')) data = myJobs
    else if (url.endsWith('/api/job-titles')) data = { categories: [] }
    else if (url.includes('/api/notifications')) data = { items: [], unreadCount: 0 }
    else if (url.includes('/api/dashboard')) data = {}
    else if (url.endsWith('/api/employer/verification')) data = { verificationStatus: 'approved' }
    else if (url.endsWith('/api/jobs') && options.method === 'POST' && serverErrors) { data = { error: 'Check fields', fieldErrors: serverErrors }; ok = false }
    return { ok, json: async () => data }
  })
})
afterEach(() => vi.unstubAllGlobals())
async function openForm() {
  render(<App />)
  fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123!' } })
  fireEvent.submit(screen.getByRole('button', { name: /Sign in/i }).closest('form'))
  fireEvent.click(await screen.findByRole('button', { name: 'Job Postings', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Create Job Posting', exact: true }))
  return within(await screen.findByRole('dialog', { name: 'Request a Job Posting' }))
}
describe('create job posting address and errors', () => {
  it('keeps complete city/province filter labels after URL reload', () => {
    const first = renderHook(() => useJobFilters())
    act(() => first.result.current.toggleValue('locations', 'Legazpi City, Albay'))
    act(() => first.result.current.toggleValue('locations', 'Daraga, Albay'))
    expect(JSON.parse(first.result.current.queryParams.locations)).toEqual(['Legazpi City, Albay', 'Daraga, Albay'])
    first.unmount()
    const restored = renderHook(() => useJobFilters())
    expect(restored.result.current.filters.locations).toEqual(['Legazpi City, Albay', 'Daraga, Albay'])
  })
  it.each([
    ['258, Relocation, Brgy. Nagotgot, Manito, Albay, Landmark: front of brgy hall', { city: 'Manito', province: 'Albay' }],
    ['rawis, Brgy. Bgy. 42 - Rawis, Legazpi City, Albay', { city: 'Legazpi City', province: 'Albay' }],
    ['Legazpi City', { city: 'Legazpi City', province: 'Albay' }],
    ['Address', {}], ['Metro', {}], ['123 Manito Street, Cebu', {}],
    ['Street, Cebu, Landmark: Manito, Albay', {}],
  ])('recovers only an exact registered location from %s', (location, expected) => {
    expect(getEmployerAddress({ profile: { location } })).toEqual(expected)
  })
  it('refreshes an older signed-in session from the profile endpoint when opening the form', async () => {
    user.establishmentAddress = {}
    mockFetch.mockImplementation(async (url) => ({ ok: true, json: async () => {
      if (url.endsWith('/api/login')) return { token: 'token', user }
      if (url.endsWith('/api/profile')) return { ...user, establishmentAddress: { city: 'Oas', province: 'Albay' } }
      if (url.endsWith('/api/job-titles')) return { categories: [] }
      if (url.includes('/api/notifications')) return { items: [], unreadCount: 0 }
      return []
    } }))
    const form = await openForm()
    expect(form.getByLabelText('City/Municipality *')).toHaveValue('Oas')
    expect(form.getByLabelText('Province *')).toHaveValue('Albay')
  })
  it('prefills older login payloads containing only the saved registration address string', async () => {
    user.establishmentAddress = {}
    user.profile.location = 'Brgy. Nagotgot, Manito, Albay, Landmark: near Barangay Hall'
    const form = await openForm()
    expect(form.getByLabelText('City/Municipality *')).toHaveValue('Manito')
    expect(form.getByLabelText('Province *')).toHaveValue('Albay')
  })
  it.each(['click', 'Enter', ' '])('opens a pending request for editing using %s and saves changes', async (activation) => {
    myJobs = [{ _id: 'pending-job', status: 'pending', title: 'Office Clerk', company: 'Example Works', description: 'Assist clients', skills: ['Excel'], locationType: 'On-site', city: 'Legazpi City', province: 'Albay', salaryMin: 15000, salaryMax: 20000, slots: 2, deadline: deadlineBounds().min }]
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    const card = await screen.findByRole('button', { name: 'Edit Office Clerk' })
    if (activation === 'click') fireEvent.click(card)
    else fireEvent.keyDown(card, { key: activation })
    const dialog = within(screen.getByRole('dialog', { name: 'Edit Job Posting' }))
    const description = dialog.getByLabelText('Description *')
    expect(description).toHaveValue('Assist clients')
    expect(description).toBeEnabled()
    fireEvent.change(description, { target: { value: 'Updated responsibilities' } })
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    fireEvent.click(dialog.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/jobs/pending-job'), expect.objectContaining({ method: 'PUT', body: expect.stringContaining('Updated responsibilities') })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Job Posting' })).not.toBeInTheDocument())
    window.alert.mockRestore()
  })
  it('keeps a legacy posting branch address when opening, changing, and reopening its edit form', async () => {
    myJobs = [{ _id: 'legacy-job', status: 'pending', title: 'Office Clerk', company: 'Example Works', description: 'Assist clients', skills: ['Excel'], locationType: 'On-site', location: 'rawis 119, Relocation, Brgy. Calpi, Oas, Albay, Landmark: Big Mac near Church', salaryMin: 15000, salaryMax: 20000, slots: 2, deadline: deadlineBounds().min }]
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Office Clerk' }))
    let dialog = within(screen.getByRole('dialog', { name: 'Edit Job Posting' }))
    expect(dialog.getByLabelText('City/Municipality *')).toHaveValue('Oas')
    expect(dialog.getByLabelText('Province *')).toHaveValue('Albay')
    fireEvent.change(dialog.getByLabelText('City/Municipality *'), { target: { value: 'Manito' } })
    // Reflect the server's persisted PUT response when the list is refreshed.
    const previousFetch = mockFetch.getMockImplementation()
    mockFetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/api/jobs/legacy-job') && options.method === 'PUT') {
        const body = JSON.parse(options.body)
        myJobs = [{ ...myJobs[0], ...body, title: body.title === 'Other' ? body.customTitle : body.title }]
        return { ok: true, json: async () => myJobs[0] }
      }
      return previousFetch(url, options)
    })
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    fireEvent.click(dialog.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Job Posting' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Edit Office Clerk' }))
    dialog = within(screen.getByRole('dialog', { name: 'Edit Job Posting' }))
    expect(dialog.getByLabelText('City/Municipality *')).toHaveValue('Manito')
    expect(dialog.getByLabelText('Province *')).toHaveValue('Albay')
    window.alert.mockRestore()
  })
  it('blocks saving a non-negotiable pending request without both salary amounts', async () => {
    myJobs = [{ _id: 'pending-job', status: 'pending', title: 'Office Clerk', company: 'Example Works', description: 'Assist clients', skills: ['Excel'], locationType: 'On-site', city: 'Legazpi City', province: 'Albay', salaryMin: 15000, salaryMax: 20000, slots: 2, deadline: deadlineBounds().min }]
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Office Clerk' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit Job Posting' }))
    const min = dialog.getByLabelText('Salary Min (\u20b1) *')
    const max = dialog.getByLabelText('Salary Max (\u20b1) *')
    fireEvent.change(min, { target: { value: '' } })
    fireEvent.change(max, { target: { value: '' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save Changes' }))
    expect(dialog.getByText('Minimum salary is required when salary is not negotiable.')).toBeInTheDocument()
    expect(dialog.getByText('Maximum salary is required when salary is not negotiable.')).toBeInTheDocument()
    await waitFor(() => expect(min).toHaveFocus())
    expect(mockFetch.mock.calls.some(([url, options]) => url.includes('/api/jobs/pending-job') && options?.method === 'PUT')).toBe(false)
    fireEvent.click(dialog.getByLabelText('Salary is negotiable'))
    expect(min).toBeDisabled()
    expect(max).toBeDisabled()
    expect(dialog.queryByText('Minimum salary is required when salary is not negotiable.')).not.toBeInTheDocument()
    fireEvent.click(dialog.getByLabelText('Salary is negotiable'))
    expect(min).toBeRequired()
    expect(dialog.getByText('Minimum salary is required when salary is not negotiable.')).toBeInTheDocument()
  })
  it('does not make approved or declined requests editable', async () => {
    myJobs = [
      { _id: 'approved-job', title: 'Approved Clerk', company: 'Example Works', status: 'approved' },
      { _id: 'declined-job', title: 'Declined Clerk', company: 'Example Works', status: 'declined' },
    ]
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(screen.queryByRole('button', { name: 'Edit Approved Clerk' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Declined Clerk' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByText('Approved Clerk'))
    fireEvent.click(screen.getByText('Declined Clerk'))
    expect(screen.queryByRole('dialog', { name: 'Edit Job Posting' })).not.toBeInTheDocument()
  })
  it('prefills the registered address, allows another branch, and resets it', async () => {
    const form = await openForm()
    const city = form.getByLabelText('City/Municipality *')
    expect(city.tagName).toBe('SELECT')
    expect(within(city).getAllByRole('option')).toHaveLength(Object.keys(PH_LOCATIONS).length + 1)
    expect(form.getByLabelText('Province *')).toHaveAttribute('readonly')
    expect(city).toHaveValue('Legazpi City')
    expect(form.getByLabelText('Province *')).toHaveValue('Albay')
    fireEvent.change(city, { target: { value: 'Daraga' } })
    expect(city).toHaveValue('Daraga')
    expect(form.getByLabelText('Province *')).toHaveValue('Albay')
    fireEvent.change(city, { target: { value: '' } })
    expect(form.getByLabelText('Province *')).toHaveValue('Albay')
    fireEvent.click(form.getByRole('button', { name: 'Reset to my address' }))
    expect(city).toHaveValue('Legazpi City')
  })
  it('opens an older account with no address quietly, then shows errors on submit', async () => {
    user.establishmentAddress = {}
    const form = await openForm()
    const city = form.getByLabelText('City/Municipality *')
    expect(city).toHaveValue('')
    fireEvent.blur(city)
    expect(form.queryByText('Enter the city or municipality.')).not.toBeInTheDocument()
    fireEvent.click(form.getByRole('button', { name: 'Submit Job Request' }))
    expect(await form.findByText('Enter the city or municipality.')).toBeInTheDocument()
  })
  it('shows server errors under the matching fields and focuses the first invalid input', async () => {
    const form = await openForm()
    fireEvent.change(form.getByRole('combobox', { name: 'Job title *' }), { target: { value: 'Clerk' } })
    fireEvent.change(form.getByLabelText('Description *'), { target: { value: 'Assist clients' } })
    fireEvent.change(form.getByLabelText('Required skills *'), { target: { value: 'Excel' } })
    fireEvent.keyDown(form.getByLabelText('Required skills *'), { key: 'Enter' })
    fireEvent.change(form.getByLabelText('Salary Min (₱) *'), { target: { value: '15000' } })
    const max = form.getByLabelText('Salary Max (₱) *')
    fireEvent.change(max, { target: { value: '20000' } })
    fireEvent.change(form.getByLabelText('Available slots *'), { target: { value: '2' } })
    fireEvent.change(form.getByLabelText('Application deadline *'), { target: { value: deadlineBounds().min } })
    serverErrors = { salaryMax: 'Maximum salary must be at least the minimum.' }
    fireEvent.click(form.getByRole('button', { name: 'Submit Job Request' }))
    expect(await form.findByText(serverErrors.salaryMax)).toBeInTheDocument()
    await waitFor(() => expect(max).toHaveFocus())
    expect(max).toHaveAttribute('aria-invalid', 'true')
    expect(max.parentElement).toHaveTextContent(serverErrors.salaryMax)
    serverErrors = null
    fireEvent.change(max, { target: { value: '21000' } })
    fireEvent.click(form.getByRole('button', { name: 'Submit Job Request' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Job request submitted for review' })
    expect(within(confirmation).getByText(/PESO will review your job posting/)).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Job request submitted for review' })).not.toBeInTheDocument()
  })
})
