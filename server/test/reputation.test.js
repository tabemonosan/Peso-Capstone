import { describe, expect, it } from 'vitest'
import { calculateReputation, REPUTATION_DEFAULTS, reputationPolicy, validateReputationSettings } from '../../shared/reputation.js'
const DAY = 86400000, start = Date.parse('2026-01-01T00:00:00Z')
const at = day => new Date(start + day * DAY)
const event = (key, type, day = 0, extra = {}) => ({ key, type, at: at(day), ...extra })
const calculate = (events, day = 0, settings = {}) => calculateReputation(events, settings, at(day))
describe('deterministic reputation and recovery', () => {
  it('graduates confirmed penalties over the rolling year', () => {
    const events = [0, 31, 62].map((day, index) => event(`n${index}`, 'confirmed_no_show', day))
    const state = calculate(events, 62, { weeklyRecovery: 0 })
    expect(state.events.map(row => row.change)).toEqual([-10, -20, -25])
    expect(state.confirmedNoShows).toBe(3)
    expect(calculate([...events, event('n4', 'confirmed_no_show', 430)], 430, { weeklyRecovery: 0 }).events.at(-1).change).toBe(-10)
    expect(calculate([event('l1', 'late_cancellation'), event('l2', 'late_cancellation', 1)], 1).events.map(row => row.change)).toEqual([-5, -10])
  })
  it('caps penalties at 30 inside the window and frees the boundary exactly at day 30', () => {
    const events = [0, 1, 2, 30].map((day, index) => event(`n${index}`, 'confirmed_no_show', day))
    expect(calculate(events, 30, { weeklyRecovery: 0 }).events.map(row => row.change)).toEqual([-10, -20, 0, -10])
  })
  it('heals a 20-point loss in exactly ten full weeks without other activity', () => {
    const events = [event('loss', 'confirmed_no_show', 0, { points: -20 })]
    for (let week = 0; week <= 10; week++) expect(calculate(events, week * 7).points).toBe(80 + week * 2)
    expect(calculate(events, 6.999).points).toBe(80)
    expect(calculate(events, 69).recovery.expectedAt).toBe(at(70).toISOString())
    expect(calculate(events, 700).points).toBe(100)
    expect(calculate(events, 700).events.filter(row => row.type === 'weekly_recovery')).toHaveLength(10)
  })
  it('restarts the full recovery week on a new penalty', () => {
    const state = calculate([event('n', 'confirmed_no_show'), event('late', 'late_cancellation', 6)], 12)
    expect(state.points).toBe(85)
    expect(state.recovery.nextAt).toBe(at(13).toISOString())
  })
  it('never recovers more than the remaining lost points', () => {
    const state = calculate([event('loss', 'manual_adjustment', 0, { delta: -3 })], 14)
    expect(state.events.map(row => row.change)).toEqual([-3, 2, 1])
    expect(state.points).toBe(100)
    expect(calculate([], 1000).events).toEqual([])
  })
  it('caps credits separately from recovery', () => {
    const events = [event('loss', 'manual_adjustment', 0, { delta: -50 }), event('a', 'attended_interview', 1, { employerId: 'one' }), event('hire', 'hired', 2), event('b', 'attended_interview', 3, { employerId: 'two' })]
    const state = calculate(events, 7)
    expect(state.events.filter(row => row.credit).map(row => row.change)).toEqual([5, 10, 0])
    expect(state.points).toBe(67)
  })
  it('only credits the first attendance for an employer in 30 days, including concurrent timestamps', () => {
    const events = [event('loss', 'manual_adjustment', 0, { delta: -80 }), event('a', 'attended_interview', 1, { employerId: 'same' }), event('b', 'attended_interview', 1, { employerId: 'same' }), event('c', 'attended_interview', 30, { employerId: 'same' }), event('d', 'attended_interview', 31, { employerId: 'same' })]
    expect(calculate(events, 31, { weeklyRecovery: 0 }).events.filter(row => row.credit).map(row => row.change)).toEqual([5, 0, 0, 5])
  })
  it('restores a reversed penalty immediately without mutating the original history', () => {
    const events = [event('n', 'confirmed_no_show'), event('reverse', 'reversal', 1, { targetKey: 'n' })]
    const original = JSON.stringify(events)
    const state = calculate(events, 1)
    expect(state.points).toBe(100)
    expect(state.events[0]).toMatchObject({ change: -10, status: 'reversed' })
    expect(state.events[1].change).toBe(10)
    expect(state.confirmedNoShows).toBe(0)
    expect(JSON.stringify(events)).toBe(original)
    expect(calculate([...events, event('retry', 'reversal', 2, { targetKey: 'n' })], 2).points).toBe(100)
  })
  it('ignores unsupported credit types and demographic attributes', () => {
    expect(calculate([event('unsupported', 'invitation_confirmed', 0, { points: 100 }), event('loss', 'manual_adjustment', 0, { delta: -10 })]).points).toBe(90)
    expect(calculate([event('loss', 'confirmed_no_show', 0, { sex: 'Female', age: 70, religion: 'unused' })]).points).toBe(90)
  })
  it('validates settings and generates the displayed rules from live values', () => {
    expect(validateReputationSettings(REPUTATION_DEFAULTS)).toBe('')
    expect(validateReputationSettings({ recoveryDays: 0 })).toBeTruthy()
    expect(validateReputationSettings({ unexpected: 1 })).toBeTruthy()
    expect(reputationPolicy({ weeklyRecovery: 3 }).find(row => row.type === 'weekly_recovery').description).toContain('3 previously lost points')
  })
  it('does not lower an already recovered score when a penalty is reduced', () => {
    const events = [event('n', 'confirmed_no_show'), event('reverse', 'reversal', 70, { targetKey: 'n', replacementPoints: 3 }), event('reduced', 'confirmed_no_show', 70, { points: -3, replaces: 'n', occurrenceAt: at(0) })]
    const state = calculate(events, 70)
    expect(state.points).toBe(100)
    expect(state.events.every(row => row.after <= 100 && row.after >= 0)).toBe(true)
    expect(state.confirmedNoShows).toBe(1)
    expect(calculate([event('n', 'confirmed_no_show'), event('reverse', 'reversal', 1, { targetKey: 'n', replacementPoints: 3 }), event('reduced', 'confirmed_no_show', 1, { points: -3, replaces: 'n', occurrenceAt: at(0) })], 1).points).toBe(97)
  })
  it('only restores actual losses when an administrator changes the starting score', () => {
    expect(calculate([event('n', 'late_cancellation')], 100, { initialPoints: 90 }).points).toBe(90)
  })
})
