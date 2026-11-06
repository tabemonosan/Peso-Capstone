import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
export async function activityReportPdf(report) {
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica), bold = await document.embedFont(StandardFonts.HelveticaBold)
  let page, y
  const addPage = () => {
    page = document.addPage([842, 595]); y = 545
    page.drawRectangle({ x: 0, y: 565, width: 842, height: 30, color: rgb(.68, .18, .40) })
    page.drawText('PESO PORTAL | ACTIVITY REPORT', { x: 38, y: 575, size: 10, font: bold, color: rgb(1, 1, 1) })
    page.drawText(`Page ${document.getPageCount()}`, { x: 752, y: 22, size: 9, font })
  }
  const line = (text, heading = false) => {
    const safe = String(text).replace(/[^\x20-\x7E]/g, '-')
    const words = safe.split(' '), lines = []; let current = ''
    for (const word of words) { if ((current + word).length > 120) { lines.push(current); current = '' } current += word + ' ' }
    lines.push(current.trimEnd())
    for (const row of lines) { if (!page || y < 48) addPage(); page.drawText(row, { x: 38, y, font: heading ? bold : font, size: heading ? 12 : 10 }); y -= 19 }
  }
  line(report.title, true)
  line(`${report.range.start} to ${report.range.end} (inclusive) | Asia/Manila`)
  line(`Generated: ${new Date(report.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`)
  line('Summary', true)
  for (const metric of report.metrics) line(`${metric.label}: ${metric.count} | ${metric.basis}`)
  line(report.note)
  line('Daily activity (days with records)', true)
  for (const metric of report.metrics) line(`${metric.key}: ${metric.label}`)
  if (!report.daily.length) line('No activity recorded for this period.')
  for (const day of report.daily) line(`${day.date} | ${report.metrics.map(metric => `${metric.key}: ${day[metric.key] || 0}`).join(' | ')}`)
  line('Current status breakdowns', true)
  for (const metric of report.metrics) if (metric.statuses?.length) { line(metric.label, true); for (const row of metric.statuses) line(`${row.status.replaceAll('_', ' ')}: ${row.count}`) }
  return document.save()
}
