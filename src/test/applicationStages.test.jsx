import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ApplicationStages from '../components/ApplicationStages'
afterEach(cleanup)
describe('application progress graph', () => {
  it.each([
    ['pending', null, '1. Invitation received', /Waiting for the employer/],
    ['interview_invited', { status: 'invited' }, '1. Invitation received', /Invitation received/],
    ['interview_confirmed', { status: 'confirmed' }, '2. Invitation accepted', /You accepted the invitation/],
    ['interview_held', { status: 'held' }, '3. Post-interview task', /interview was recorded as held/],
    ['interview_attended', { status: 'attended' }, '3. Post-interview task', /post-interview task/],
    ['hired', { status: 'attended' }, '4. Hiring outcome', /accepted for the job/],
    ['not_hired', { status: 'held' }, '4. Hiring outcome', /not selected/],
    ['no_show_pending', { status: 'confirmed' }, '3. Interview result review', /under PESO review/],
    ['no_show_responded', { status: 'confirmed' }, '3. Interview result review', /under PESO review/],
    ['no_show_confirmed', { status: 'missed' }, '3. Interview result review', /PESO reviewed/],
  ])('shows the recorded stage for %s', (status, interview, current, message) => {
    render(<ApplicationStages application={{ status, interview }} />)
    const graph = screen.getByRole('list', { name: 'Application stages' })
    expect(within(graph).getAllByRole('listitem')).toHaveLength(4)
    expect(graph.querySelector('[aria-current="step"]')).toHaveTextContent(current)
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })
  it('does not invent completed interview stages for an older hire report without an interview', () => {
    render(<ApplicationStages application={{ status: 'hired', interview: null }} />)
    expect(document.querySelectorAll('.application-stage.is-complete')).toHaveLength(0)
    expect(screen.getByText('4. Hiring outcome').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})
