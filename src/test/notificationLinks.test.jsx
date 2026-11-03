import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { notificationDestination, notificationViewFromQuery } from '../utils/notificationLinks'

const user = { id: 'employer1', role: 'Employer', email: 'employer@example.com', emailVerified: true, verificationStatus: 'approved', registration: { complete: true }, companyName: 'Example Works', profile: {} }
const notification = { _id: 'notification1', type: 'referral_received', title: 'New application received', message: 'A new applicant is available for Delivery Driver.', link: '/referrals', createdAt: '2026-11-02T12:00:00Z', read: false }
beforeEach(() => {
  window.history.replaceState({}, '', '/')
  localStorage.setItem('peso-token', 'token')
  localStorage.setItem('peso-active-role', 'Employer')
  localStorage.setItem('peso-active-view', 'notify')
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    let data = []
    if (url.endsWith('/api/profile')) data = user
    else if (url.endsWith('/api/employer/verification')) data = { verificationStatus: 'approved' }
    else if (url.includes('/api/notifications')) data = { items: [notification], total: 1, unreadCount: 1 }
    return { ok: true, json: async () => data }
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('notification destinations', () => {
  it('opens the employer applicant view from the link inside notification details', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /New application received/ }))
    const modal = screen.getByRole('dialog', { name: 'Notification details' })
    const link = within(modal).getByRole('link', { name: 'View applications and referrals' })
    expect(link).toHaveAttribute('href', '?notificationView=referrals')
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { name: 'Applications and referrals' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Notification details' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Employer navigation' })).getByRole('button', { name: 'Reports' })).toHaveClass('is-active')
  })
  it('supports opening the link in a new tab and consumes the URL target after navigation', async () => {
    window.history.replaceState({}, '', '/?notificationView=referrals')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Applications and referrals' })).toBeInTheDocument()
    expect(window.location.search).not.toContain('notificationView')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Employer navigation' })).getByRole('button', { name: 'Notifications' }))
    expect(await screen.findByRole('heading', { name: 'Notifications', exact: true })).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('peso-active-view')).toBe('notify'))
  })
  it('handles legacy referral notices and maps the employer jobs link to their own postings', () => {
    expect(notificationDestination({ type: 'referral_received' }, 'Employer')?.view).toBe('referrals')
    expect(notificationDestination({ linkPath: '/jobs?status=mine' }, 'Employer')?.view).toBe('employer')
    expect(notificationDestination({ link: '/jobs' }, 'Applicant')?.view).toBe('jobs')
    expect(notificationDestination({ link: '/verification-rules' }, 'Admin')?.view).toBe('verification-rules')
  })
  it.each(['javascript:alert(1)', '//external.example/referrals', 'https://external.example/referrals', '/unknown'])('does not render an unsafe or unknown destination %s', (link) => {
    expect(notificationDestination({ link, type: 'referral_received' }, 'Employer')).toBeNull()
  })
  it('keeps admin destinations unavailable to other roles', () => {
    expect(notificationDestination({ link: '/peso-referrals' }, 'Employer')).toBeNull()
    expect(notificationViewFromQuery('Applicant', '?notificationView=peso-referrals')).toBeNull()
    expect(notificationViewFromQuery('Employer', '?notificationView=referrals')).toBe('referrals')
  })
})
