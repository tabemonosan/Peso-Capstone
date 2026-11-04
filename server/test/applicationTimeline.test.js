// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mergeApplicationHistory, publicApplicationHistory } from '../../shared/employmentReporting.js'
import { publicApplication } from '../services/applicationProgress.js'

describe('merged application timelines', () => {
  it('reconciles interview copies with different status spellings and small timestamp differences', () => {
    const referral = [
      { action: 'interview_invited', status: 'interview_invited', at: '2026-11-03T01:00:00.010Z', reason: 'PRIVATE reason' },
      { action: 'interview_confirmed', status: 'interview_confirmed', at: '2026-11-03T01:05:00.010Z' },
      { action: 'interview_reschedule_requested', status: 'interview_reschedule_requested', at: '2026-11-03T01:06:00.010Z' },
      { action: 'employer_recorded_interview_held', status: 'interview_held', at: '2026-11-03T01:07:00.010Z' },
    ]
    const meeting = referral.map(entry => ({ ...entry, status: entry.status.replace('interview_', ''), at: new Date(+new Date(entry.at) - 5) }))
    const result = publicApplication({ _id: 'application', jobId: 'job', deliveryStatus: 'delivered', referral: { history: referral }, interview: { _id: 'interview', status: 'held', history: meeting } })
    expect(result.history).toHaveLength(4)
    expect(result.history.map(entry => entry.status)).toEqual(['interview_invited', 'interview_confirmed', 'reschedule_requested', 'interview_held'])
    expect(JSON.stringify(result.history)).not.toContain('PRIVATE')
  })
  it('retains repeated real events and strips private timeline metadata', () => {
    const history = ['2026-11-03T01:00:00.000Z', '2026-11-03T01:00:00.005Z', '2026-11-04T01:00:00.000Z'].map(at => ({ action: 'interview_rescheduled', status: 'invited', at, by: 'PRIVATE admin', reason: 'PRIVATE notes' }))
    expect(mergeApplicationHistory(history, history)).toHaveLength(3)
    expect(publicApplicationHistory(history)).toHaveLength(3)
    expect(JSON.stringify(publicApplicationHistory(history))).not.toContain('PRIVATE')
    expect(mergeApplicationHistory([history[0], history[0]])).toHaveLength(1)
  })
})
