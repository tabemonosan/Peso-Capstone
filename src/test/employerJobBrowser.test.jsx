import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EmployerJobBrowser from '../components/EmployerJobBrowser'

const pending = { _id: 'job1', title: 'Office Clerk', company: 'Example Works', status: 'pending', city: 'Manito', province: 'Albay', barangay: 'Nagotgot', skills: ['Excel'], description: 'Assist office clients', requirements: 'Bring a certificate' }
const approved = { ...pending, _id: 'job2', title: 'Delivery Driver', status: 'approved', skills: ['Driving'], description: 'Deliver orders', requirements: 'Valid license' }

describe('employer job browser', () => {
  it('places a normalized employment type tag above the job details', () => {
    render(<EmployerJobBrowser jobs={[{ ...pending, employmentType: 'Contract' }]} />)
    const details = screen.getByRole('article', { name: 'Office Clerk job details' })
    const tag = within(details).getByLabelText('Employment type: Contractual')
    expect(tag).toHaveTextContent('Contractual')
    expect(tag.compareDocumentPosition(within(details).getByRole('region', { name: 'Required skills' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('shows the company photo and updates it when the employer changes their profile picture', () => {
    const branded = { ...pending, employerBranding: { profileImage: '/saved-company.jpg' } }
    const { rerender } = render(<EmployerJobBrowser jobs={[branded]} />)
    const row = screen.getByRole('button', { name: 'View details for Office Clerk' })
    expect(row.querySelector('img')).toHaveAttribute('src', '/saved-company.jpg')
    rerender(<EmployerJobBrowser jobs={[branded]} profileImage="/updated-company.jpg" />)
    expect(row.querySelector('img')).toHaveAttribute('src', '/updated-company.jpg')
    rerender(<EmployerJobBrowser jobs={[pending]} />)
    expect(row.querySelector('img')).toBeNull()
    expect(row.querySelector('.job-browser-company-mark')).toHaveTextContent('E')
  })
  it('switches the right panel and lets employers edit pending and approved postings', () => {
    const edit = vi.fn()
    render(<EmployerJobBrowser jobs={[pending, approved]} onEdit={edit} />)
    const list = screen.getByRole('region', { name: 'My job postings' })
    expect(within(list).getByRole('button', { name: 'View details for Office Clerk' })).toHaveAttribute('aria-pressed', 'true')
    const first = screen.getByRole('article', { name: 'Office Clerk job details' })
    expect(within(first).getByText('Nagotgot, Manito, Albay')).toBeInTheDocument()
    fireEvent.click(within(first).getByRole('button', { name: 'Edit pending request' }))
    expect(edit).toHaveBeenCalledWith(pending)
    fireEvent.click(within(list).getByRole('button', { name: 'View details for Delivery Driver' }))
    const second = screen.getByRole('article', { name: 'Delivery Driver job details' })
    expect(within(second).getByText('Deliver orders')).toBeInTheDocument()
    expect(within(second).getByText('Valid license')).toBeInTheDocument()
    expect(within(second).queryByRole('button', { name: 'Edit pending request' })).not.toBeInTheDocument()
    fireEvent.click(within(second).getByRole('button', { name: 'Edit job posting' }))
    expect(edit).toHaveBeenLastCalledWith(approved)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows ratings on archived rows and details while hiding editing controls', () => {
    const job = { ...approved, deadline: '2000-01-01', employerBranding: { rating: { averageScore: 3.5, totalRatings: 2 } } }
    render(<EmployerJobBrowser jobs={[job]} onEdit={vi.fn()} />)
    const row = screen.getByRole('button', { name: 'View details for Delivery Driver' })
    const details = screen.getByRole('article', { name: 'Delivery Driver job details' })
    expect(within(row).getByLabelText('3.5 out of 5 stars, 2 reviews')).toBeInTheDocument()
    expect(within(details).getByLabelText('3.5 out of 5 stars, 2 reviews')).toBeInTheDocument()
    expect(within(row).getByText('Archived')).toBeInTheDocument()
    expect(within(details).queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
    expect(within(details).queryByText(/Every edit runs/)).not.toBeInTheDocument()
  })
  it('replaces a selected posting when filters or pagination remove it', () => {
    const { rerender } = render(<EmployerJobBrowser jobs={[pending, approved]} />)
    fireEvent.click(screen.getByRole('button', { name: 'View details for Delivery Driver' }))
    const declined = { ...pending, status: 'declined', reviewReason: 'Clarify the requirements' }
    rerender(<EmployerJobBrowser jobs={[declined]} />)
    expect(screen.queryByRole('article', { name: 'Delivery Driver job details' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Office Clerk job details' })).getByText(/Clarify the requirements/)).toBeInTheDocument()
    rerender(<EmployerJobBrowser jobs={[]} />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
