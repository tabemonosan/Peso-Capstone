import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ApplicantProfileModal from '../components/ApplicantProfileModal'

const applicant = {
  email: 'applicant@example.com', phone: '09171234567',
  profile: { firstName: 'Eliseos', middleName: 'Dakac', lastName: 'Dioneda', suffix: 'III', skills: ['Auto Mechanic', 'Plumbing', 'Auto Mechanic'], summary: 'Experienced in vehicle maintenance.', education: [{ level: 'Tertiary', course: 'Automotive Technology', privateId: 'PRIVATE-ID' }], nsrp: { tin: 'PRIVATE-TIN' } },
}
describe('applicant profile preview', () => {
  it('presents contact actions, distinct skill tags and the summary without exposing private fields', () => {
    render(<ApplicantProfileModal applicant={applicant} onClose={vi.fn()} />)
    const modal = screen.getByRole('dialog', { name: 'Eliseos Dakac Dioneda III' })
    expect(within(modal).getByRole('link', { name: applicant.email })).toHaveAttribute('href', 'mailto:applicant%40example.com')
    expect(within(modal).getByRole('link', { name: applicant.phone })).toHaveAttribute('href', 'tel:09171234567')
    const skills = within(modal).getByRole('region', { name: 'Applicant skills' })
    expect(within(skills).getAllByRole('listitem')).toHaveLength(2)
    expect(within(modal).getByText(applicant.profile.summary)).toBeInTheDocument()
    expect(within(modal).getByText('Location not provided')).toBeInTheDocument()
    expect(modal).not.toHaveTextContent('PRIVATE-ID')
    expect(modal).not.toHaveTextContent('PRIVATE-TIN')
  })
  it('preserves uploaded profile and banner images', () => {
    render(<ApplicantProfileModal applicant={{ ...applicant, profile: { ...applicant.profile, profileImage: '/avatar.jpg', bannerImage: '/banner.jpg' } }} onClose={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Eliseos Dakac Dioneda III' })).toHaveAttribute('src', '/avatar.jpg')
    expect(document.querySelector('.candidate-profile-cover').style.backgroundImage).toContain('/banner.jpg')
  })
  it('supports closing with the button or Escape and handles missing contact data', () => {
    const close = vi.fn()
    render(<ApplicantProfileModal applicant={{ profile: {} }} onClose={close} />)
    const modal = screen.getByRole('dialog', { name: 'Applicant profile' })
    expect(within(modal).queryByRole('link')).not.toBeInTheDocument()
    expect(within(modal).getByText('No skills listed yet.')).toBeInTheDocument()
    fireEvent.keyDown(modal, { key: 'Escape' })
    fireEvent.click(within(modal).getByRole('button', { name: 'Close applicant profile' }))
    expect(close).toHaveBeenCalledTimes(2)
  })
})
