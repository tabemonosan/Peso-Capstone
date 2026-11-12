import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'
import { AdminAccessContext } from '../components/AdminAccessContext'
import VerificationDocsReviewModal from '../components/VerificationDocsReviewModal'
import AdminNsrpAutomation from '../components/AdminNsrpAutomation'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState({}, '', '/') })

it.each(['super_admin', 'admin', 'staff'])('shows navigation appropriate for %s', async level => {
  localStorage.setItem('peso-token', 'internal-token')
  localStorage.setItem('peso-active-role', 'Admin')
  localStorage.setItem('peso-active-view', 'employers')
  vi.stubGlobal('fetch', vi.fn(async input => {
    const url = new URL(input)
    let data = {}
    if (url.pathname === '/api/profile') data = { id: 'account-1', role: 'Admin', adminLevel: level, email: 'internal@example.com', profile: {} }
    if (url.pathname === '/api/admin/users') data = url.searchParams.has('role') ? { items: [], total: 0, totalPages: 1 } : []
    if (url.pathname === '/api/notifications') data = { items: [], unreadCount: 0 }
    return { ok: true, json: async () => data }
  }))
  render(<App />)
  const navigation = await screen.findByRole('navigation', { name: 'Admin navigation' })
  await waitFor(() => {
    expect(Boolean(within(navigation).queryByRole('button', { name: /Internal Accounts/i }))).toBe(level === 'super_admin')
    expect(Boolean(within(navigation).queryByRole('button', { name: /Account Deletions/i }))).toBe(level !== 'staff')
    expect(Boolean(within(navigation).queryByRole('button', { name: /Verification Settings/i }))).toBe(level === 'super_admin')
    expect(Boolean(within(navigation).queryByRole('button', { name: /Email Delivery/i }))).toBe(level === 'super_admin')
  })
  expect(within(navigation).getByRole('button', { name: /Review Notes/i })).toBeInTheDocument()
})

it('lets staff inspect documents and recommend a decision without final decision buttons', async () => {
  vi.stubGlobal('fetch', vi.fn(async input => ({ ok: true, json: async () => input.includes('/review-notes') ? { items: [], total: 0 } : { verificationStatus: 'approved', documents: [{ docKey: 'birthCertificate', label: 'Birth Certificate', status: 'pending', latest: { version: 1, url: '/file', originalName: 'birth.pdf' } }] } })))
  render(<AdminAccessContext.Provider value={{ adminLevel: 'staff' }}><VerificationDocsReviewModal applicant={{ id: 'app1', email: 'applicant@example.com' }} token="staff-token" onClose={() => {}} onRestrict={() => {}} /></AdminAccessContext.Provider>)
  expect(await screen.findByText('Birth Certificate (v1)')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Restrict applicant' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument()
})

it('shows automation settings as read-only for normal Admin', async () => {
  vi.stubGlobal('fetch', vi.fn(async input => ({ ok: true, json: async () => input.includes('/settings') ? { automaticApproval: true, history: [] } : { items: [], total: 0 } })))
  render(<AdminAccessContext.Provider value={{ adminLevel: 'admin' }}><AdminNsrpAutomation token="admin-token" /></AdminAccessContext.Provider>)
  const checkbox = await screen.findByRole('checkbox', { name: 'Automatic approval' })
  expect(checkbox).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Save verification rules' }))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})


it.each(['admin', 'super_admin'])('shows staff recommendations without a note form for %s', async level => {
  vi.stubGlobal('fetch', vi.fn(async input => ({ ok: true, json: async () => input.includes('/review-notes') ? { items: [{ _id: 'note1', recommendation: 'approve', authorEmail: 'staff@example.com', note: 'Staff checked the documents.', entityType: 'Applicant', entityId: 'app1', createdAt: new Date().toISOString() }], total: 1 } : { verificationStatus: 'approved', documents: [] } })))
  render(<AdminAccessContext.Provider value={{ adminLevel: level }}><VerificationDocsReviewModal applicant={{ id: 'app1', email: 'applicant@example.com' }} token="reviewer-token" onClose={() => {}} onRestrict={() => {}} /></AdminAccessContext.Provider>)
  expect(await screen.findByText('Staff checked the documents.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Recommendation')).not.toBeInTheDocument()
})
