// Albay portal reference: Region V, private sector, Wage Order RBV-23.
// Source: https://nwpc.dole.gov.ph/rtwpb-v-implements-first-tranche-of-%E2%82%B120-daily-wage-increase-for-bicol-workers-starting-april-8/
// Update this single reference when a new order takes effect. Monthly figures
// are estimates using 26 working days, not a determination of legal compliance.
import { manilaDate } from './jobPosting.js'
export const MINIMUM_WAGE = {
  label: 'Bicol minimum wage',
  provinces: ['albay', 'camarines norte', 'camarines sur', 'catanduanes', 'masbate', 'sorsogon'],
  rates: [{ effective: '2026-04-08', dailyPhp: 455 }, { effective: '2026-12-01', dailyPhp: 480 }],
  workingDaysPerMonth: 26,
  source: 'https://nwpc.dole.gov.ph/rtwpb-v-implements-first-tranche-of-%E2%82%B120-daily-wage-increase-for-bicol-workers-starting-april-8/',
}
export function minimumWageWarning(salaryMin, payFrequency, province, now = new Date()) {
  if (payFrequency !== 'Monthly' || !MINIMUM_WAGE.provinces.includes((province || '').trim().toLowerCase())) return ''
  const rate = MINIMUM_WAGE.rates.filter((entry) => entry.effective <= manilaDate(now)).at(-1)
  const amount = Number(salaryMin)
  if (!rate || !Number.isFinite(amount) || amount <= 0) return ''
  const minimum = rate.dailyPhp * MINIMUM_WAGE.workingDaysPerMonth
  return amount < minimum ? `Below the estimated ${MINIMUM_WAGE.label}: ₱${minimum.toLocaleString('en-US')}/month (₱${rate.dailyPhp}/day × ${MINIMUM_WAGE.workingDaysPerMonth} days; effective ${rate.effective}). You can still submit. PESO may ask you to confirm the work schedule and applicable wage.` : ''
}
