import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import ApplicantJobBrowser from '../components/ApplicantJobBrowser'
import CompanyRating from '../components/CompanyRating'

afterEach(cleanup)
it('shows the average beside the company in both job cards and details', () => {
  render(<ApplicantJobBrowser jobs={[{ _id: 'job1', title: 'Welder', company: 'PARKour', employerBranding: { rating: { averageScore: 3.5, totalRatings: 2 } } }]} applicationByJobId={new Map()} appliedPostingById={new Map()} appliedJobIds={new Set()} onApply={() => {}} />)
  const card = screen.getByRole('button', { name: 'View Welder details' })
  expect(within(card).getByLabelText('3.5 out of 5 stars, 2 reviews')).toBeInTheDocument()
  const details = screen.getByRole('article', { name: 'Welder job details' })
  expect(within(details).getByLabelText('3.5 out of 5 stars, 2 reviews')).toBeInTheDocument()
})
it('rounds to one decimal and does not invent a rating for an unrated company', () => {
  const { rerender, container } = render(<CompanyRating rating={{ averageScore: 11 / 3, totalRatings: 3 }} />)
  expect(screen.getByLabelText('3.7 out of 5 stars, 3 reviews')).toBeInTheDocument()
  rerender(<CompanyRating />)
  expect(container).toBeEmptyDOMElement()
  expect(screen.queryByText('0.0')).not.toBeInTheDocument()
})
