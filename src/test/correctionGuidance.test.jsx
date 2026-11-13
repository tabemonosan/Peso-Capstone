import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import CorrectionGuidance from '../components/CorrectionGuidance'
it('explains what to replace, where to submit it, and what happens after submission', () => {
  render(<CorrectionGuidance docKey="validId1" canReplace remaining={2} />)
  expect(screen.getByRole('region', { name: 'Correction instructions' })).toHaveTextContent('front and back')
  expect(screen.getByText(/After submission/)).toHaveTextContent('2 uploads remaining')
  expect(screen.getByText(/In this document section/)).toHaveTextContent('name is readable and matches your NSRP')
})
it('directs a blocked applicant to PESO instead of telling them to upload again', () => {
  render(<CorrectionGuidance docKey="birthCertificate" canReplace={false} remaining={0} />)
  expect(screen.getByText(/Your upload limit/)).toHaveTextContent('Contact PESO')
  expect(screen.queryByText(/Submit the replacement/)).not.toBeInTheDocument()
})
