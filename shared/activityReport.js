import { manilaDate } from './jobPosting.js'
export const REPORT_PRESETS = [
  { value: 'today', label: 'Today' }, { value: 'week', label: 'Past week (7 days)' },
  { value: 'month', label: 'Past month (30 days)' }, { value: 'custom', label: 'Custom timeline' },
]
export function activityReportRange(input = {}, now = new Date()) {
  const preset = input.preset || 'today', today = manilaDate(now)
  if (!REPORT_PRESETS.some(item => item.value === preset)) throw new Error('Choose a valid report period.')
  const end = preset === 'custom' ? input.end : today
  const start = preset === 'custom' ? input.start : manilaDate(now, preset === 'week' ? -6 : preset === 'month' ? -29 : 0)
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!valid(start) || !valid(end)) throw new Error('Choose valid start and end dates.')
  if (start > end) throw new Error('The start date must be on or before the end date.')
  if (end > today) throw new Error('Choose an end date no later than today.')
  return { preset, start, end, timeZone: 'Asia/Manila', since: new Date(`${start}T00:00:00+08:00`), until: new Date(+new Date(`${end}T00:00:00+08:00`) + 86400000) }
}
export function activityReportCsv(report) {
  const cell = value => '"' + String(value ?? '').replace(/^[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"'
  const rows = [['PESO activity report'], ['Start date', report.range.start], ['End date (inclusive)', report.range.end], ['Time zone', report.range.timeZone], ['Generated at', report.generatedAt], [], ['Metric', 'Count', 'Date basis']]
  for (const metric of report.metrics) rows.push([metric.label, metric.count, metric.basis])
  rows.push([], ['Daily activity (days with records)'], ['Date', ...report.metrics.map(metric => metric.label)])
  for (const day of report.daily) rows.push([day.date, ...report.metrics.map(metric => day[metric.key] || 0)])
  rows.push([], ['Current status of records in the selected period'], ['Metric', 'Status', 'Count'])
  for (const metric of report.metrics) for (const row of metric.statuses || []) rows.push([metric.label, row.status, row.count])
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}
