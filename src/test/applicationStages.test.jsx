import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ApplicationStages from '../components/ApplicationStages'
afterEach(cleanup)
describe('application progress graph', () => {
  it.each([
    ['interview_invited', { status: 'invited' }, '1. Invitation received', /Invitation received/],
    ['interview_confirmed', { status: 'confirmed' }, '2. Invitation accepted', /You accepted the invitation/],
    ['interview_held', { status: 'held' }, '3. Post-interview task', /interview was recorded as held/],
    ['interview_attended', { status: 'attended' }, '3. Post-interview task', /post-interview task/],
    ['no_show_pending', { status: 'confirmed' }, '3. Interview result review', /apply the reputation policy automatically/],
    ['no_show_responded', { status: 'confirmed' }, '3. Interview result review', /apply the reputation policy automatically/],
    ['no_show_confirmed', { status: 'missed' }, '3. Interview result review', /PESO reviewed/],
  ])('shows the recorded stage for %s', (status, interview, current, message) => {
    render(<ApplicationStages application={{ status, interview }} />)
    const graph = screen.getByRole('list', { name: 'Application stages' })
    expect(within(graph).getAllByRole('listitem')).toHaveLength(4)
    expect(graph.querySelector('[aria-current="step"]')).toHaveTextContent(current)
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })
  it.each(['pending', 'accepted', 'declined', 'hired', 'not_hired'])('hides progress without an employer invitation (%s)', status => {
    render(<ApplicationStages application={{ status, interview: null }} />)
    expect(screen.queryByRole('region', { name: 'Application progress' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Application stages' })).not.toBeInTheDocument()
  })
  it.each([
    ['hired', 'attended', 'is-hired'], ['deployed', 'held', 'is-hired'],
    ['not_hired', 'held', 'is-closed'], ['declined', 'invited', 'is-closed'],
    ['declined_by_admin', 'invited', 'is-closed'], ['interview_declined', 'declined', 'is-closed'],
  ])('marks %s complete with the correct final color and no active step', (status, meetingStatus, color) => {
    render(<ApplicationStages application={{ status, interview: { status: meetingStatus } }} />)
    expect(screen.getByText('Complete')).toBeInTheDocument()
    const steps = screen.getAllByRole('listitem')
    expect(steps[3]).toHaveClass('is-complete', color)
    expect(steps[3].querySelector('.application-stage-number')).toHaveTextContent('\u2713')
    expect(document.querySelector('[aria-current="step"]')).toBeNull()
    if (meetingStatus === 'invited' || meetingStatus === 'declined') {
      expect(steps[1]).not.toHaveClass('is-complete')
      expect(steps[2]).not.toHaveClass('is-complete')
    }
  })
})
