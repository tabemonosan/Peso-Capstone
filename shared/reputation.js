export const REPUTATION_POLICY = [
  { type: 'confirmed_no_show', label: 'PESO-confirmed interview no-show', delta: -20, description: 'Applied after PESO reviews the employer report and your response or response deadline.' },
  { type: 'late_cancellation', label: 'PESO-confirmed late cancellation', delta: -10, description: 'Cancelling within 24 hours before the interview, after PESO reviews the circumstances.' },
  { type: 'attended_interview', label: 'PESO-confirmed interview attendance', delta: 5, description: 'Points can recover when PESO confirms interview attendance.' },
  { type: 'hired', label: 'PESO-confirmed employment', delta: 10, description: 'Points can recover when PESO confirms a reported hire or deployment.' },
]
export const reputationEventLabel = type => REPUTATION_POLICY.find(rule => rule.type === type)?.label || 'PESO reputation adjustment'
