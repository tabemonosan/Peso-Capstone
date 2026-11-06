// All configurable reputation values live here. Durations are elapsed UTC days.
export const REPUTATION_DEFAULTS = Object.freeze({
  initialPoints: 100, minimumPoints: 0, maximumPoints: 100,
  noShowFirst: 10, noShowSecond: 20, noShowLater: 25,
  lateFirst: 5, lateLater: 10, lateCancellationHours: 24, graduationMonths: 12,
  weeklyRecovery: 2, recoveryDays: 7,
  attendanceCredit: 5, employmentCredit: 10, employerCooldownDays: 30,
  penaltyCap: 30, penaltyWindowDays: 30, creditCap: 15, creditWindowDays: 30,
  goodStandingFrom: 80, atRiskBelow: 50,
})
export const REPUTATION_FIELDS = {
  initialPoints: 'Starting points', minimumPoints: 'Minimum points', maximumPoints: 'Maximum points',
  noShowFirst: 'First confirmed no-show penalty', noShowSecond: 'Second confirmed no-show penalty', noShowLater: 'Later confirmed no-show penalty',
  lateFirst: 'First late cancellation penalty', lateLater: 'Later late cancellation penalty', lateCancellationHours: 'Late cancellation window (hours)', graduationMonths: 'Penalty counting period (months)',
  weeklyRecovery: 'Recovery points per full period', recoveryDays: 'Recovery period (days)',
  attendanceCredit: 'Interview attendance credit', employmentCredit: 'Confirmed employment credit', employerCooldownDays: 'Attendance cooldown per employer (days)',
  penaltyCap: 'Maximum penalty points per window', penaltyWindowDays: 'Penalty window (days)', creditCap: 'Maximum credit points per window', creditWindowDays: 'Credit window (days)',
  goodStandingFrom: 'Good standing starts at', atRiskBelow: 'At risk below',
}
export const REVIEW_CATEGORIES = ['Emergency or illness', 'Employer rescheduled', 'Never received the invitation', 'Wrong report', 'Other']
const DAY = 86400000
function monthsBefore(time, months) {
  const date = new Date(time)
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1))
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate()
  return Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())
}
const labels = { confirmed_no_show: 'Interview no-show', late_cancellation: 'PESO-confirmed late cancellation', attended_interview: 'Interview attendance', hired: 'PESO-confirmed employment', manual_adjustment: 'PESO reputation adjustment', reversal: 'Event reversed', weekly_recovery: 'Weekly recovery' }
export const reputationEventLabel = type => labels[type] || 'PESO reputation adjustment'
export function reputationSettings(input = {}) { return { ...REPUTATION_DEFAULTS, ...Object.fromEntries(Object.keys(REPUTATION_DEFAULTS).filter(key => Number.isFinite(input[key])).map(key => [key, input[key]])) } }
export function validateReputationSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Enter valid reputation settings.'
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(REPUTATION_DEFAULTS, key) || !Number.isInteger(value) || value < 0 || value > (key.endsWith('Days') ? 3660 : key.endsWith('Months') ? 120 : key.endsWith('Hours') ? 720 : 100)) return 'Settings must be whole numbers within their allowed range.'
    if ((key.endsWith('Days') || key.endsWith('Months') || key.endsWith('Hours')) && !value) return 'Time windows must be positive.'
  }
  const s = reputationSettings(input)
  if (!(s.minimumPoints < s.maximumPoints && s.minimumPoints <= s.initialPoints && s.initialPoints <= s.maximumPoints && s.atRiskBelow > s.minimumPoints && s.goodStandingFrom > s.atRiskBelow && s.goodStandingFrom <= s.maximumPoints)) return 'Check the starting points, range, and standing thresholds.'
  if (s.noShowFirst > s.noShowSecond || s.noShowSecond > s.noShowLater || s.lateFirst > s.lateLater) return 'Later penalties cannot be smaller than earlier penalties.'
  return ''
}
export function reputationPolicy(input) {
  const s = reputationSettings(input)
  return [
    { type: 'confirmed_no_show', label: 'Confirmed interview no-show', delta: -s.noShowFirst, description: `First: −${s.noShowFirst}; second: −${s.noShowSecond}; third and later: −${s.noShowLater}, counted over ${s.graduationMonths} months. Employer no-show reports after the scheduled interview time apply points automatically. You can request a review.` },
    { type: 'late_cancellation', label: 'Confirmed late cancellation', delta: -s.lateFirst, description: `Under ${s.lateCancellationHours} hours before the interview: −${s.lateFirst} first, −${s.lateLater} later, counted over ${s.graduationMonths} months. PESO must confirm it.` },
    { type: 'attended_interview', label: 'Attend an interview', delta: s.attendanceCredit, description: `+${s.attendanceCredit} after an employer records an attended interview outcome. Once per employer in ${s.employerCooldownDays} days.` },
    { type: 'hired', label: 'Confirmed employment', delta: s.employmentCredit, description: `+${s.employmentCredit} when PESO confirms employer-reported employment.` },
    { type: 'weekly_recovery', label: 'Weekly recovery', delta: s.weeklyRecovery, description: `Recover ${s.weeklyRecovery} previously lost points per full ${s.recoveryDays} days without a new penalty, up to ${s.maximumPoints}.` },
    { type: 'caps', label: 'Rolling limits', description: `At most −${s.penaltyCap} in ${s.penaltyWindowDays} days from penalties; at most +${s.creditCap} in ${s.creditWindowDays} days from credits. Recovery is separate.` },
  ]
}
export const REPUTATION_POLICY = reputationPolicy()

// No demographic inputs or ratings. Input events are never mutated. Reversals
// are compensating events at their own timestamp, not edits to earlier entries.
export function calculateReputation(events = [], input = {}, asOf = new Date()) {
  const s = reputationSettings(input), end = +new Date(asOf)
  if (!Number.isFinite(end)) throw new Error('Use a valid calculation date.')
  const ordered = events.map((event, index) => ({ ...event, key: event.key || `legacy:${index}`, time: +new Date(event.at), index }))
    .filter(event => Number.isFinite(event.time) && event.time <= end).sort((a, b) => a.time - b.time || a.index - b.index)
  const seen = new Set(), reversed = new Set(), rows = [], base = [], attendance = [], replacementOverflow = new Map()
  let points = s.initialPoints, lost = 0, anchor = null, nextRecovery = null
  const clamp = value => Math.max(s.minimumPoints, Math.min(s.maximumPoints, value))
  const add = (event, requestedPoints, reason = '') => {
    const before = points
    points = clamp(points + requestedPoints)
    lost = Math.max(0, lost + before - points)
    const row = { ...event, at: new Date(event.time).toISOString(), label: reputationEventLabel(event.type), requestedPoints, before, after: points, change: points - before, status: 'applied', ...(reason ? { limit: reason } : {}) }
    rows.push(row)
    return row
  }
  const recoverUntil = until => {
    if (nextRecovery === null || !s.weeklyRecovery) return
    while (nextRecovery <= until && points < s.maximumPoints && lost > 0) {
      add({ key: `recovery:${anchor}:${nextRecovery}`, type: 'weekly_recovery', time: nextRecovery, virtual: true }, Math.min(s.weeklyRecovery, lost, s.maximumPoints - points))
      nextRecovery += s.recoveryDays * DAY
    }
    if (nextRecovery <= until) nextRecovery += (Math.floor((until - nextRecovery) / (s.recoveryDays * DAY)) + 1) * s.recoveryDays * DAY
  }
  for (const event of ordered) {
    if (seen.has(event.key)) continue
    seen.add(event.key)
    recoverUntil(event.time)
    let nominal = 0, limited = ''
    if (event.type === 'reversal') {
      const target = rows.find(row => row.key === event.targetKey)
      if (!target || reversed.has(event.targetKey)) { add(event, 0, 'Already reversed or unavailable'); continue }
      reversed.add(event.targetKey)
      nominal = -target.change
      if (Number.isInteger(event.replacementPoints)) replacementOverflow.set(event.targetKey, Math.max(0, points + nominal - s.maximumPoints))
    } else {
      const recent = base.filter(row => !reversed.has(row.key) && +(new Date(row.occurrenceAt || row.at)) > monthsBefore(event.time, s.graduationMonths))
      if (event.type === 'confirmed_no_show') { const n = recent.filter(row => row.type === event.type).length; nominal = -[s.noShowFirst, s.noShowSecond, s.noShowLater][Math.min(n, 2)] }
      if (event.type === 'late_cancellation') nominal = -(recent.some(row => row.type === event.type) ? s.lateLater : s.lateFirst)
      if (event.type === 'attended_interview') nominal = s.attendanceCredit
      if (event.type === 'hired') nominal = s.employmentCredit
      if (Number.isInteger(event.points)) nominal = event.points
      else if (Number.isInteger(event.delta)) nominal = event.delta // Preserve historical booked events.
      if (!Object.hasOwn(labels, event.type)) nominal = 0
    }
    const penalty = ['confirmed_no_show', 'late_cancellation'].includes(event.type) || event.type === 'manual_adjustment' && (event.actor || Object.hasOwn(event, 'points')) && nominal < 0
    const credit = ['attended_interview', 'hired'].includes(event.type)
    if (event.type === 'attended_interview') {
      const legacy = Number.isInteger(event.delta) && !event.actor && !Object.hasOwn(event, 'points')
      if (!event.employerId && !legacy || event.employerId && attendance.some(row => String(row.employerId) === String(event.employerId) && row.time > event.time - s.employerCooldownDays * DAY)) { nominal = 0; limited = 'Employer attendance cooldown' }
      else if (event.employerId) attendance.push(event)
    }
    let applied = nominal
    if (penalty) {
      const used = base.filter(row => row.penalty && !reversed.has(row.key) && +(new Date(row.occurrenceAt || row.at)) > event.time - s.penaltyWindowDays * DAY).reduce((sum, row) => sum - row.change, 0)
      const remainingPenalty = Math.max(0, -nominal - (event.replaces ? replacementOverflow.get(event.replaces) || 0 : 0))
      applied = -Math.min(remainingPenalty, Math.max(0, s.penaltyCap - used))
      if (applied !== nominal) limited = 'Penalty window limit'
    }
    if (credit) {
      const used = base.filter(row => row.credit && row.time > event.time - s.creditWindowDays * DAY).reduce((sum, row) => sum + row.change, 0)
      applied = Math.min(nominal, Math.max(0, s.creditCap - used))
      if (applied !== nominal) limited = 'Credit window limit'
    }
    const row = add(event, applied, limited)
    row.nominalPoints = nominal
    row.penalty = penalty || event.type === 'manual_adjustment' && row.change < 0
    row.credit = credit
    base.push(row)
    if ((penalty || row.change < 0) && !event.replaces) { anchor = event.time; nextRecovery = anchor + s.recoveryDays * DAY }
  }
  recoverUntil(end)
  for (const row of rows) if (reversed.has(row.key)) row.status = 'reversed'
  const deficit = Math.min(lost, Math.max(0, s.maximumPoints - points))
  const next = deficit && s.weeklyRecovery && nextRecovery !== null ? nextRecovery : null
  const expected = next === null ? null : next + (Math.ceil(deficit / s.weeklyRecovery) - 1) * s.recoveryDays * DAY
  return {
    points, settings: s, events: rows,
    tier: points >= s.goodStandingFrom ? 'Good standing' : points < s.atRiskBelow ? 'At risk' : 'Needs improvement',
    confirmedNoShows: base.filter(row => row.type === 'confirmed_no_show' && !reversed.has(row.key) && +(new Date(row.occurrenceAt || row.at)) > monthsBefore(end, s.graduationMonths)).length,
    recovery: { deficit, nextAt: next === null ? null : new Date(next).toISOString(), expectedAt: expected === null ? null : new Date(expected).toISOString(), progress: next === null ? 0 : Math.max(0, Math.min(1, 1 - (next - end) / (s.recoveryDays * DAY))), amount: Math.min(deficit, s.weeklyRecovery) },
  }
}
