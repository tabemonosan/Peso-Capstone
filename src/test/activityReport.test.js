import { describe, it, expect } from 'vitest'
import { activityReportRange, activityReportCsv } from '../../shared/activityReport.js'
import { activityReportPdf } from '../../shared/activityReportPdf.js'
import { PDFDocument } from 'pdf-lib'
const now = new Date('2026-11-05T16:01:00Z')
const fixture = { title: 'PESO activity report', generatedAt: now.toISOString(), range: { start: '2026-11-06', end: '2026-11-06', timeZone: 'Asia/Manila' }, note: 'Current statuses of selected records.', metrics: [{ key: 'jobs', label: 'Job postings submitted', count: 2, basis: 'Submission date', statuses: [{ status: 'approved', count: 2 }] }], daily: [{ date: '2026-11-06', jobs: 2 }] }
describe('activity report dates and exports', () => {
  it.each([['today', '2026-11-06'], ['week', '2026-10-31'], ['month', '2026-10-08']])('resolves %s using Philippine calendar days', (preset, start) => {
    const range = activityReportRange({ preset }, now)
    expect(range.start).toBe(start)
    expect(range.end).toBe('2026-11-06')
    expect(range.until.toISOString()).toBe('2026-11-06T16:00:00.000Z')
    if (preset === 'today') expect(range.since.toISOString()).toBe('2026-11-05T16:00:00.000Z')
  })
  it.each([{ preset: 'invalid' }, { preset: 'custom', start: '2026-02-30', end: '2026-03-01' }, { preset: 'custom', start: '2026-11-06', end: '2026-11-05' }, { preset: 'custom', start: '2026-11-06', end: '2026-11-07' }])('rejects invalid or future ranges %j', input => expect(() => activityReportRange(input, now)).toThrow())
  it('exports the same preview data as CSV and escapes spreadsheet formulas', () => {
    const csv = activityReportCsv(fixture)
    expect(csv).toContain('"Job postings submitted","2","Submission date"')
    expect(csv).toContain('"2026-11-06","2"')
    expect(activityReportCsv({ ...fixture, metrics: [{ ...fixture.metrics[0], label: '=HYPERLINK("bad")' }] })).toContain("'=HYPERLINK")
  })
  it('creates a readable paginated PDF for long reports', async () => {
    const bytes = await activityReportPdf({ ...fixture, daily: Array.from({ length: 70 }, () => fixture.daily[0]) })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })
})
