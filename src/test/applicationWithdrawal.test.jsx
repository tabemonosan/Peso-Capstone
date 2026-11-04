import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApplicationWithdrawal from '../components/ApplicationWithdrawal'
import { applicationActions, applicationWithdrawalDeadline } from '../../shared/applicationProgress.js'

const acceptedAt = '2026-11-04T00:00:00Z'
const interview = { status: 'confirmed', acceptedAt, scheduledAt: '2026-11-07T00:00:00Z' }
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('withdrawal after accepting an interview', () => {
  it('counts down each second and disables the button exactly at 24 hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-04T23:59:58Z'))
    render(<ApplicationWithdrawal application={{ id: 'a', status: 'interview_confirmed', interview, actions: ['withdraw'] }} onWithdraw={vi.fn()} />)
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:02')
    expect(screen.getByRole('button')).toBeEnabled()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:01')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/24-hour withdrawal window has ended/)).toBeInTheDocument()
  })
  it('allows ordinary withdrawal before acceptance without starting the clock', () => {
    render(<ApplicationWithdrawal application={{ id: 'a', status: 'pending', actions: ['withdraw'] }} />)
    expect(screen.getByRole('button')).toBeEnabled()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByText(/countdown starts when you accept/)).toBeInTheDocument()
  })
  it('keeps withdrawn applications free of withdrawal controls', () => {
    render(<ApplicationWithdrawal application={{ id: 'a', status: 'withdrawn', interview, actions: [] }} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('uses the original acceptance time even after rescheduling and reconfirming', () => {
    expect(applicationWithdrawalDeadline({ history: [
      { action: 'interview_confirmed', at: acceptedAt },
      { action: 'interview_rescheduled', at: '2026-11-05T01:00:00Z' },
      { action: 'interview_confirmed', at: '2026-11-05T02:00:00Z' },
    ] })).toBe('2026-11-05T00:00:00.000Z')
  })
  it('enforces both the 24-hour boundary and an earlier interview start', () => {
    const args = { status: 'interview_confirmed', interview }
    expect(applicationActions({ ...args, now: new Date('2026-11-04T23:59:59.999Z') })).toContain('withdraw')
    expect(applicationActions({ ...args, now: new Date('2026-11-05T00:00:00Z') })).not.toContain('withdraw')
    expect(applicationActions({ ...args, interview: { ...interview, scheduledAt: '2026-11-04T01:00:00Z' }, now: new Date('2026-11-04T01:00:00Z') })).not.toContain('withdraw')
  })
})
