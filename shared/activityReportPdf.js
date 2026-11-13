import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const WIDTH = 841.89, HEIGHT = 595.28, MARGIN = 34, BOTTOM = 44
const CONTENT = WIDTH - MARGIN * 2
const color = {
  ink: rgb(.13, .11, .14), muted: rgb(.43, .39, .43), accent: rgb(.67, .18, .39),
  soft: rgb(.98, .94, .96), line: rgb(.89, .85, .87), stripe: rgb(.98, .98, .985), white: rgb(1, 1, 1),
  grid: rgb(.70, .65, .68),
}
const dailyLabels = { applicants: 'Applicants', employers: 'Employers', jobs: 'Job posts', applications: 'Applications', referrals: 'Referrals', interviews: 'Interviews', outcomes: 'Hiring reports', noShows: 'No-shows' }

export async function activityReportPdf(report) {
  const document = await PDFDocument.create()
  document.setTitle(report.title)
  document.setAuthor('PESO Portal')
  document.setSubject(`Activity report: ${report.range.start} to ${report.range.end}`)
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  let page, y
  const safe = value => [...String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[–—]/g, '-')].map(char => {
    try { font.encodeText(char); return char } catch { return '?' }
  }).join('')
  const text = (value, x, baseline, size = 9, face = font, fill = color.ink) => page.drawText(safe(value), { x, y: baseline, size, font: face, color: fill })
  const wrap = (value, width, size = 9, face = font) => {
    const lines = []
    let current = ''
    for (const word of safe(value).split(/\s+/).filter(Boolean)) {
      if (current && face.widthOfTextAtSize(`${current}${word}`, size) > width) { lines.push(current); current = '' }
      for (const char of word) {
        if (face.widthOfTextAtSize(current + char, size) > width) { lines.push(current); current = '' }
        current += char
      }
      current += ' '
    }
    if (current.trim() || !lines.length) lines.push(current.trim())
    return lines.map(line => line.trim())
  }
  const date = value => new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' })
  const number = value => Number(value || 0).toLocaleString('en-PH')
  const addPage = () => {
    const first = document.getPageCount() === 0
    page = document.addPage([WIDTH, HEIGHT])
    page.drawRectangle({ x: 0, y: HEIGHT - 5, width: WIDTH, height: 5, color: color.accent })
    text('PESO PORTAL  /  EMPLOYMENT SERVICES', MARGIN, HEIGHT - 27, 8, bold, color.accent)
    const heading = wrap(report.title, CONTENT - 230, first ? 23 : 15, bold)
    heading.forEach((line, index) => text(line, MARGIN, HEIGHT - 56 - index * 26, first ? 23 : 15, bold))
    text(`${date(report.range.start)} - ${date(report.range.end)}`, WIDTH - MARGIN - 210, HEIGHT - 35, 10, bold)
    text(`Inclusive dates | ${report.range.timeZone || 'Asia/Manila'}`, WIDTH - MARGIN - 210, HEIGHT - 49, 8, font, color.muted)
    text(`Generated ${new Date(report.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`, WIDTH - MARGIN - 210, HEIGHT - 63, 7.5, font, color.muted)
    y = HEIGHT - 86 - (heading.length - 1) * 26
  }
  const ensure = height => { if (!page || y - height < BOTTOM) addPage() }
  const section = (title, followingHeight = 24) => {
    ensure(18 + followingHeight)
    text(title, MARGIN, y, 11, bold)
    y -= 18
  }
  const paragraph = (value, fill = color.muted) => {
    const lines = wrap(value, CONTENT, 8)
    for (const line of lines) { ensure(12); text(line, MARGIN, y, 8, font, fill); y -= 11 }
    y -= 9
  }
  const table = (title, headers, rows, widths, centered = []) => {
    const headerLines = headers.map((value, index) => wrap(value, widths[index] - 18, 8, bold))
    const headerHeight = Math.max(28, ...headerLines.map(lines => lines.length * 10 + 14))
    const rowLines = rows.map(row => row.map((value, index) => wrap(value, widths[index] - 18, 9)))
    const rowHeight = cells => Math.max(21, ...cells.map(lines => lines.length * 11 + 10))
    section(title, headerHeight + (rowLines.length ? rowHeight(rowLines[0]) : 21))
    const header = () => {
      let x = MARGIN
      headerLines.forEach((lines, index) => {
        page.drawRectangle({ x, y: y - headerHeight, width: widths[index], height: headerHeight, color: color.soft, borderColor: color.grid, borderWidth: .65 })
        lines.forEach((line, offset) => {
          const left = centered.includes(index) ? x + (widths[index] - bold.widthOfTextAtSize(line, 8)) / 2 : x + 9
          text(line, left, y - 13 - offset * 10, 8, bold, color.accent)
        })
        x += widths[index]
      })
      y -= headerHeight
    }
    header()
    rowLines.forEach((cells, rowIndex) => {
      const height = rowHeight(cells)
      if (y - height < BOTTOM) { addPage(); section(`${title} (continued)`, headerHeight + height); header() }
      let x = MARGIN
      cells.forEach((lines, index) => {
        page.drawRectangle({ x, y: y - height, width: widths[index], height, color: rowIndex % 2 === 0 ? color.stripe : color.white, borderColor: color.grid, borderWidth: .65 })
        lines.forEach((line, offset) => {
          const left = centered.includes(index) ? x + (widths[index] - font.widthOfTextAtSize(line, 9)) / 2 : x + 9
          text(line, left, y - 14 - offset * 11)
        })
        x += widths[index]
      })
      y -= height
    })
    y -= 16
  }

  addPage()
  section('Summary', 68)
  const gap = 8, cardWidth = (CONTENT - gap * 3) / 4
  for (let start = 0; start < report.metrics.length; start += 4) {
    const cards = report.metrics.slice(start, start + 4).map(metric => ({
      metric, labels: wrap(metric.label, cardWidth - 20, 9, bold), basis: wrap(metric.basis, cardWidth - 20, 7),
    }))
    const labelHeight = Math.max(...cards.map(card => card.labels.length)) * 10
    const basisHeight = Math.max(...cards.map(card => card.basis.length)) * 8
    const height = 42 + labelHeight + basisHeight
    ensure(height)
    cards.forEach(({ metric, labels, basis }, index) => {
      const x = MARGIN + index * (cardWidth + gap)
      page.drawRectangle({ x, y: y - height, width: cardWidth, height, color: color.white, borderColor: color.line, borderWidth: .7 })
      page.drawRectangle({ x, y: y - height, width: 3, height, color: color.accent })
      labels.forEach((line, offset) => text(line, x + 11, y - 14 - offset * 10, 9, bold))
      text(number(metric.count), x + 11, y - labelHeight - 28, 22, bold, color.accent)
      basis.forEach((line, offset) => text(line, x + 11, y - labelHeight - 42 - offset * 8, 7, font, color.muted))
    })
    y -= height + gap
  }
  y -= 5
  if (report.note) paragraph(report.note)

  if (report.daily.length) {
    const metricWidth = (CONTENT - 98) / report.metrics.length
    table('Daily activity', ['Date', ...report.metrics.map(metric => dailyLabels[metric.key] || metric.label)],
      report.daily.map(day => [date(day.date), ...report.metrics.map(metric => number(day[metric.key]))]),
      [98, ...report.metrics.map(() => metricWidth)], report.metrics.map((_, index) => index + 1))
  } else { section('Daily activity'); paragraph('No activity recorded for this period.') }

  const statuses = report.metrics.flatMap(metric => (metric.statuses || []).map(row => [metric.label, row.status.replaceAll('_', ' '), number(row.count)]))
  if (statuses.length) table('Current status breakdowns', ['Metric', 'Current status', 'Count'], statuses, [CONTENT * .45, CONTENT * .4, CONTENT * .15], [2])
  else { section('Current status breakdowns'); paragraph('No status breakdowns available for this period.') }

  document.getPages().forEach((sheet, index) => {
    sheet.drawLine({ start: { x: MARGIN, y: 33 }, end: { x: WIDTH - MARGIN, y: 33 }, thickness: .5, color: color.line })
    sheet.drawText('PESO Portal | Activity report', { x: MARGIN, y: 20, size: 7, font, color: color.muted })
    const label = `Page ${index + 1} of ${document.getPageCount()}`
    sheet.drawText(label, { x: WIDTH - MARGIN - font.widthOfTextAtSize(label, 7), y: 20, size: 7, font, color: color.muted })
  })
  return document.save()
}
