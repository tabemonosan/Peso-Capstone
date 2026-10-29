import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JobsView from '../components/JobsView'
const job = { _id: 'job-1', status: 'pending', title: 'Clerk', company: 'Example Works', description: 'Assist clients', requirements: 'Bring certificates', skills: ['Excel'], locationType: 'Hybrid', city: 'Legazpi City', province: 'Albay', employmentType: 'Probationary', education: 'College Level', experience: '1–3 years', salaryMin: 15000, salaryMax: 20000, payFrequency: 'Monthly', negotiable: false, slots: 3, notesToAdmin: 'Private review note', deadline: '2026-12-01T15:59:59Z' }
afterEach(() => vi.unstubAllGlobals())
describe('admin job review', () => {
  it.each([false, true])('shows request fields and retains approval confirmation (legacy location: %s)', async (legacy) => {
    const reviewItem = legacy ? { ...job, city: undefined, province: undefined, location: 'Street, Legazpi City, Albay, Landmark: nearby' } : job
    const review = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, json: async () => ({ items: String(url).includes('status=pending') ? [reviewItem] : [], total: String(url).includes('status=pending') ? 1 : 0, totalPages: 1 }) })))
    render(<JobsView activeRole="Admin" jobLoading={false} availableSkills={[]} appliedJobs={[]} appliedJobIds={new Set()} currentUser={{ email: 'admin@example.com' }} adminJobSearchTerm="" adminJobStatusFilter="all" filteredPendingJobs={[]} filteredApprovedJobs={[]} filteredDeclinedJobs={[]} showPendingAdminSection showApprovedAdminSection showDeclinedAdminSection handleReviewJob={review} token="token" />)
    fireEvent.click(await screen.findByRole('button', { name: 'View Clerk details' }))
    const dialog = screen.getByRole('dialog', { name: 'Clerk' })
    for (const text of ['Legazpi City, Albay', 'Hybrid', 'Probationary', 'College Level', '1–3 years', '₱15,000 to ₱20,000 / month', 'Monthly', 'No', 'Excel', '3', 'Private review note']) expect(within(dialog).getByText(text)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve', exact: true }))
    expect(review).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve' }))
    await waitFor(() => expect(review).toHaveBeenCalledWith('job-1', 'approved', { confirm: false, silent: true }))
  })
})
