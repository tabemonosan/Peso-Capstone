import { describe, it, expect } from 'vitest'
import { activityReportRange, activityReportCsv } from '../../shared/activityReport.js'
import { activityReportPdf } from '../../shared/activityReportPdf.js'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
const now = new Date('2026-11-05T16:01:00Z')
const fixture = { title: 'PESO activity report', generatedAt: now.toISOString(), range: { start: '2026-11-06', end: '2026-11-06', timeZone: 'Asia/Manila' }, note: 'Current statuses of selected records.', metrics: [{ key: 'jobs', label: 'Job postings submitted', count: 2, basis: 'Submission date', statuses: [{ status: 'approved', count: 2 }] }], daily: [{ date: '2026-11-06', jobs: 2 }] }
const complete = {
  ...fixture,
  metrics: ['applicants', 'employers', 'jobs', 'applications', 'referrals', 'interviews', 'outcomes', 'noShows'].map((key, index) => ({
    key, label: ['Applicant registrations', 'Employer registrations', 'Job postings submitted', 'Applications submitted', 'Referrals created', 'Interviews scheduled', 'Hiring outcome reports', 'No-show reports'][index],
    count: index === 0 ? 6 : 1, basis: key === 'outcomes' ? 'Latest employer/PESO report date; applicant self-reports excluded' : 'Submission date',
    statuses: ['applications', 'referrals'].includes(key) ? [{ status: 'delivered', count: 1 }] : key === 'interviews' ? [{ status: 'attended', count: 1 }, { status: 'missed', count: 1 }] : [],
  })),
  daily: ['2026-11-07', '2026-11-08', '2026-11-13'].map(date => ({ date, applicants: 2, interviews: 1 })),
}
async function pdfPages(bytes) {
  const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true })
  try {
    const pdf = await task.promise, pages = []
    for (let index = 1; index <= pdf.numPages; index++) pages.push((await (await pdf.getPage(index)).getTextContent()).items)
    return pages
  } finally { await task.destroy() }
}
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
  it('fits the full eight-metric weekly report on one A4 landscape page', async () => {
    const pages = await pdfPages(await activityReportPdf(complete))
    expect(pages).toHaveLength(1)
    const text = pages[0].map(item => item.str).join(' ')
    for (const metric of complete.metrics) expect(text).toContain(metric.label)
    expect(text).toContain('Nov 13, 2026')
    expect(text).toContain('attended')
    expect(text).toContain('missed')
    expect(text).toContain('Page 1 of 1')
    for (const item of pages[0]) {
      expect(item.transform[4]).toBeGreaterThanOrEqual(33)
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(809)
    }
  })
  it('preserves every daily row and repeats table headings across page breaks', async () => {
    const daily = Array.from({ length: 70 }, (_, index) => ({ date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10), applicants: 1000 + index }))
    const pages = await pdfPages(await activityReportPdf({ ...complete, daily }))
    expect(pages.length).toBeGreaterThan(1)
    const allText = pages.flat().map(item => item.str).join(' ')
    for (const day of daily) expect(allText).toContain(day.applicants.toLocaleString('en-PH'))
    const lastDailyPage = pages.find(items => items.some(item => item.str === '1,069'))
    expect(lastDailyPage.map(item => item.str)).toEqual(expect.arrayContaining(['Date', 'Applicants']))
    pages.forEach((items, index) => expect(items.map(item => item.str)).toContain(`Page ${index + 1} of ${pages.length}`))
    expect(allText).toContain('Current status breakdowns')
    expect(allText).toContain('missed')
  })
})
