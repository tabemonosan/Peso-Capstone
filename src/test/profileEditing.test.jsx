import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { applicantProfileContent } from '../../shared/applicantProfile.js'

let user, requests
beforeEach(() => {
  window.history.replaceState({}, '', '/')
  requests = []
  user = { id: 'applicant1', role: 'Applicant', email: 'applicant@example.com', emailVerified: true, verificationStatus: 'approved', registration: { complete: true }, profile: { firstName: 'Juan', lastName: 'Cruz', skills: ['Computer Literate'], summary: 'IT Related · Computer Literate · Plumbing', nsrp: { occupation1: 'IT Related', skills: ['Computer Literate', 'Plumbing'] } } }
  localStorage.setItem('peso-token', 'token'); localStorage.setItem('peso-active-role', 'Applicant'); localStorage.setItem('peso-active-view', 'profile')
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    let data = []
    if (url.endsWith('/api/profile')) {
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body); requests.push(body)
        user = { ...user, profile: { ...user.profile, ...body.profile } }; data = { profile: user.profile }
      } else data = user
    } else if (url.endsWith('/api/employer/verification')) data = { verificationStatus: 'approved' }
    else if (url.includes('/api/notifications')) data = { items: [], unreadCount: 0 }
    return { ok: true, json: async () => data }
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('profile editing and NSRP skills', () => {
  it('opens the skills catalog without typing and supports selection, filtering and dismissal', async () => {
    render(<App />)
    const cover = await screen.findByRole('group', { name: 'Profile pictures' })
    fireEvent.click(within(cover).getByRole('button', { name: 'Edit profile' }))
    const input = screen.getByRole('combobox', { name: 'Search or select skills' })
    fireEvent.focus(input)
    const list = screen.getByRole('listbox', { name: 'Available skills' })
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(8)
    expect(within(list).queryByRole('option', { name: 'Computer Literate', exact: true })).not.toBeInTheDocument()
    const option = within(list).getAllByRole('option')[0]
    const skill = option.textContent
    const filterSkill = within(list).getAllByRole('option')[1].textContent
    fireEvent.click(option)
    expect(screen.getByRole('button', { name: `Remove ${skill}` })).toBeInTheDocument()
    fireEvent.change(input, { target: { value: filterSkill } })
    expect(screen.getByRole('option', { name: filterSkill, exact: true })).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getAllByRole('option').length).toBeGreaterThan(8)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'Available skills' })).not.toBeInTheDocument()
  })
  it('keeps NSRP skills out of About me and puts the edit pencil at the top', async () => {
    render(<App />)
    expect(await screen.findByLabelText('About me')).toHaveValue('')
    expect(screen.getAllByText('Plumbing').length).toBeGreaterThan(0)
    const cover = screen.getByRole('group', { name: 'Profile pictures' })
    const edit = within(cover).getByRole('button', { name: 'Edit profile' })
    expect(edit.closest('form')).toBeNull()
    expect(screen.getByLabelText('About me')).toBeDisabled()
    fireEvent.click(edit)
    expect(screen.getByLabelText('About me')).toBeEnabled()
    expect(within(cover).getByRole('button', { name: 'Save profile' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('About me'), { target: { value: 'I enjoy helping customers.' } })
    fireEvent.click(within(cover).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('About me')).toHaveValue('')
  })
  it('previews profile/banner image selections and saves both using the top controls', async () => {
    render(<App />)
    const cover = await screen.findByRole('group', { name: 'Profile pictures' })
    const photoInput = within(cover).getByLabelText('Upload profile photo')
    const picker = vi.spyOn(photoInput, 'click')
    fireEvent.click(within(cover).getByRole('button', { name: 'Change profile photo' }))
    expect(picker).toHaveBeenCalledOnce()
    fireEvent.change(photoInput, { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } })
    await waitFor(() => expect(within(cover).getByRole('img', { name: 'Profile' }).src).toMatch(/^data:image\/png;base64,/))
    const bannerInput = within(cover).getByLabelText('Upload banner image')
    const bannerPicker = vi.spyOn(bannerInput, 'click')
    fireEvent.click(within(cover).getByRole('button', { name: 'Change banner image' }))
    expect(bannerPicker).toHaveBeenCalledOnce()
    fireEvent.change(bannerInput, { target: { files: [new File(['banner'], 'banner.png', { type: 'image/png' })] } })
    await waitFor(() => expect(within(cover).getByRole('button', { name: 'Change banner image' }).style.backgroundImage).toContain('data:image/png;base64,'))
    fireEvent.click(within(cover).getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].profile.profileImage).toMatch(/^data:image\/png;base64,/)
    expect(requests[0].profile.bannerImage).toMatch(/^data:image\/png;base64,/)
    await waitFor(() => expect(within(cover).getByRole('button', { name: 'Edit profile' })).toBeInTheDocument())
  })
  it('removes only the recognizable old generated bio and preserves personal writing', () => {
    const original = user.profile
    expect(applicantProfileContent(original)).toEqual({ summary: '', skills: ['Computer Literate', 'Plumbing'] })
    expect(applicantProfileContent({ ...original, summary: 'I am an experienced mechanic.' }).summary).toBe('I am an experienced mechanic.')
    expect(applicantProfileContent({ ...original, summarySource: 'personal' }).summary).toBe(original.summary)
  })
})
