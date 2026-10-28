import fs from 'fs'
import path from 'path'
import * as fontkit from 'fontkit'
import { PDFDocument, rgb } from 'pdf-lib'
import {
  NSRP_PAGE, NSRP_TEXT_FIELDS, NSRP_CHECKBOXES, NSRP_LANGUAGES,
  NSRP_EDUCATION, NSRP_TRAINING, NSRP_ELIGIBILITY, NSRP_WORK_EXPERIENCE,
  NSRP_MAX_ROWS_PER_SECTION, NSRP_SIGNATURE,
} from './nsrpLayout.js'
import { NSRP_SKILL_LAYOUT_KEY, normalizeSkillLabel } from '../shared/nsrpSkills.js'
import { NSRP_ROW_LIMITS } from '../shared/nsrpTableLimits.js'

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'NSRP-Form-1-Jobseeker-Reg-Form.pdf')
const FONT_CANDIDATES = [
  path.join(process.cwd(), 'server', 'assets', 'arial.ttf'),
  'C:\\Windows\\Fonts\\arial.ttf',
]
const FONT_BOLD_CANDIDATES = [
  path.join(process.cwd(), 'server', 'assets', 'arialbd.ttf'),
  'C:\\Windows\\Fonts\\arialbd.ttf',
]

// Resolve a skills selection to PDF checkbox layout keys plus the Others line
// text. Fixed options tick their own box; only true leftovers go to Others.
// Exported for tests so a key can never silently lose its layout entry.
export const nsrpSkillMarks = (skills, othersText) => {
  const marks = []
  const leftovers = []
  for (const skill of skills || []) {
    const normalized = normalizeSkillLabel(skill)
    if (!normalized) continue
    const key = NSRP_SKILL_LAYOUT_KEY.get(normalized)
    if (key === 'skillOthers') continue // Others box is marked below only when there is text
    if (key) marks.push(key)
    else leftovers.push(String(skill).trim())
  }
  const othersLine = String(othersText || '').trim() || leftovers.join(', ')
  if (othersLine || (skills || []).some((skill) => normalizeSkillLabel(skill) === 'others')) {
    marks.push('skillOthers')
  }
  return { marks: [...new Set(marks)], othersLine }
}

const MARK_INSET = 2 // pt from box edges
// The two diagonal line segments of a checkbox mark (exported for tests)
export const nsrpMarkSegments = (spec) => {
  const { x, y, w, h } = spec.box
  return [
    { x1: x + MARK_INSET, y1: y + MARK_INSET, x2: x + w - MARK_INSET, y2: y + h - MARK_INSET },
    { x1: x + MARK_INSET, y1: y + h - MARK_INSET, x2: x + w - MARK_INSET, y2: y + MARK_INSET },
  ]
}

// Debug overlay (grid + field boxes) is opt-in: NSRP_DEBUG=1 or ?debug=1.
export const nsrpDebugEnabled = (flag) => flag === true || flag === '1' || process.env.NSRP_DEBUG === '1'

const loadFontBytes = (candidates) => {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate)
  }
  return null
}

const formatDate = (value) => {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim())
  if (!match) return String(value)
  return `${match[2]}/${match[3]}/${match[1]}` // mm/dd/yyyy
}

// Two-digit year for narrow range cells (training duration, work dates).
export const formatDateShort = (value) => {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim())
  if (!match) return String(value)
  return `${match[2]}/${match[3]}/${match[1].slice(2)}` // mm/dd/yy
}

const toCaps = (value) => String(value ?? '').toUpperCase()

// Short forms for the narrow "If undergraduate, what level?" cell
const shortLevel = (value) => {
  const text = String(value ?? '').trim()
  return text
    .replace(/(\d+)(st|nd|rd|th)\s*year/i, '$1 yr')
    .replace(/^undergrad(uate)?$/i, 'Undergrad')
}

// "18000 - 22000" -> "18,000 - 22,000"
const formatNumberGroups = (value) => String(value ?? '').replace(/\d+/g, (digits) => Number(digits).toLocaleString('en-US'))

// Shrink text to fit maxWidth: default size -> down to 6 pt -> truncate with "..."
// Exported for tests (shrink-to-fit guarantees).
export function fitText(font, rawValue, maxWidth, size) {
  let value = String(rawValue ?? '').trim()
  if (!value) return { text: '', size }
  let current = size
  while (current > 6 && font.widthOfTextAtSize(value, current) > maxWidth) current -= 0.5
  if (font.widthOfTextAtSize(value, current) <= maxWidth) return { text: value, size: current }
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, current) > maxWidth) {
    value = value.slice(0, -1)
  }
  return { text: `${value}...`, size: current }
}

function wrapText(font, text, size, maxWidth, wrap) {
  if (!wrap) return [text]
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      const candidate = line ? `${line} ${word}` : word
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
      continue
    }

    if (line) {
      lines.push(line)
      line = ''
    }
    let fragment = ''
    for (const character of Array.from(word)) {
      const candidate = fragment + character
      if (fragment && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(fragment)
        fragment = character
      } else {
        fragment = candidate
      }
    }
    line = fragment
  }
  if (line) lines.push(line)
  return lines
}

function truncateLine(font, line, size, maxWidth) {
  let value = line
  while (value && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
    value = Array.from(value).slice(0, -1).join('')
  }
  return `${value}...`
}

export function drawFittedText({
  page, font, rawValue, x, cellCenterTop, pageHeight, maxWidth, innerHeight,
  maxLines = 1, size = 8, field, color, wrap = true, onLayoutWarning, onLayout, charLimit,
}) {
  const value = String(rawValue ?? '').trim()
  if (!value) return { lines: [], size, lineWidths: [], blockHeight: 0, truncated: false, shrunkToMinimum: false }

  const sizes = [size, 7.5, 7, 6.5, 6].filter((candidate, index, list) => (
    candidate <= size && list.indexOf(candidate) === index
  ))
  let lines = []
  let fittedSize = 6
  let truncated = false
  for (const candidateSize of sizes) {
    const candidateLines = wrapText(font, value, candidateSize, maxWidth, wrap)
    const lineHeight = candidateSize * 1.1
    const lineLimit = Math.min(maxLines, Math.floor((innerHeight + 0.001) / lineHeight))
    const widthsFit = candidateLines.every((line) => font.widthOfTextAtSize(line, candidateSize) <= maxWidth + 0.001)
    if (widthsFit && candidateLines.length <= lineLimit && candidateLines.length * lineHeight <= innerHeight + 0.001) {
      lines = candidateLines
      fittedSize = candidateSize
      break
    }
  }

  if (!lines.length) {
    fittedSize = sizes[sizes.length - 1]
    const lineHeight = fittedSize * 1.1
    const lineLimit = Math.max(1, Math.min(maxLines, Math.floor((innerHeight + 0.001) / lineHeight)))
    const wrapped = wrapText(font, value, fittedSize, maxWidth, wrap)
    lines = wrapped.slice(0, lineLimit)
    const lastLineDoesNotFit = font.widthOfTextAtSize(lines[lineLimit - 1], fittedSize) > maxWidth + 0.001
    if (wrapped.length > lineLimit || lastLineDoesNotFit) {
      lines[lineLimit - 1] = truncateLine(font, lines[lineLimit - 1], fittedSize, maxWidth)
      truncated = true
    }
  }

  const lineHeight = fittedSize * 1.1
  const blockHeight = lines.length * lineHeight
  const lineWidths = lines.map((line) => font.widthOfTextAtSize(line, fittedSize))
  if (lineWidths.some((width) => width > maxWidth + 0.001) || blockHeight > innerHeight + 0.001) {
    throw new Error(`NSRP text layout exceeds cell bounds for field: ${field}`)
  }
  const verticalOffset = Math.max(0, (innerHeight - blockHeight) / 2)
  const firstBaselineTop = cellCenterTop - innerHeight / 2 + 1.5 + verticalOffset + fittedSize
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: pageHeight - firstBaselineTop - index * lineHeight,
      size: fittedSize,
      font,
      color,
    })
  })

  const shrunkToMinimum = fittedSize === 6 && size > 6
  const warning = truncated || shrunkToMinimum
    ? {
      field,
      reason: truncated ? 'truncated' : 'minimum-font-size',
      size: fittedSize,
      length: value.length,
      ...(charLimit ? { limit: charLimit } : {}),
    }
    : null
  if (truncated) console.warn(`[NSRP PDF] Truncated text for field: ${field}`)
  if (warning) onLayoutWarning?.(warning)
  onLayout?.({ field, lines, lineWidths, blockHeight, maxWidth, innerHeight })

  return { lines, size: fittedSize, lineWidths, blockHeight, truncated, shrunkToMinimum, warning }
}

// Scale a signature image into the signature line area, keeping its aspect
// ratio. Exported for tests: the result always stays inside the cell.
export const nsrpSignaturePlacement = (spec, imageWidth, imageHeight) => {
  if (!imageWidth || !imageHeight) return null
  const scale = Math.min(spec.maxWidth / imageWidth, spec.maxHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  const x = spec.x + (spec.maxWidth - width) / 2
  const top = spec.lineTop - spec.lineGap - height // image bottom sits just above the line
  return { x, top, width, height }
}

export async function generateNsrpPdf(answers, { debug = false, onLayoutWarning, onLayout, signatureImage, certificationDate } = {}) {
  const pdfDoc = await PDFDocument.load(fs.readFileSync(TEMPLATE_PATH))
  pdfDoc.registerFontkit(fontkit)
  // Font with ñ / accent support (pdf-lib standard fonts are WinAnsi-limited).
  const regularBytes = loadFontBytes(FONT_CANDIDATES)
  const boldBytes = loadFontBytes(FONT_BOLD_CANDIDATES)
  const font = regularBytes ? await pdfDoc.embedFont(regularBytes) : await pdfDoc.embedFont('Helvetica')
  const bold = boldBytes ? await pdfDoc.embedFont(boldBytes) : font
  const ink = rgb(0, 0, 0)
  const pages = pdfDoc.getPages()
  const H = NSRP_PAGE.height
  const drawTableCell = ({ rawValue, spec, col, rowTop, field, x, charLimit }) => drawFittedText({
    page: pages[spec.page],
    font,
    rawValue: toCaps(rawValue),
    x: x ?? spec.cols[col],
    cellCenterTop: rowTop,
    pageHeight: H,
    maxWidth: spec.maxWidth[col],
    innerHeight: spec.innerHeight,
    maxLines: spec.maxLines[col],
    size: spec.size,
    field,
    color: ink,
    wrap: !spec.singleLine?.includes(col),
    onLayoutWarning,
    onLayout,
    charLimit,
  })

  const write = (key, rawValue, override = {}) => {
    const spec = NSRP_TEXT_FIELDS[key]
    if (!spec) throw new Error(`Unknown NSRP field: ${key}`)
    let value = String(rawValue ?? '')
    if (!value.trim()) return
    if (spec.date) value = formatDate(value)
    if (spec.caps) value = toCaps(value)
    const size = override.size || spec.size
    const { text, size: fittedSize } = fitText(font, value, spec.maxWidth, size)
    if (!text) return
    // centerX: center the (possibly shrunk) text on the column's center point,
    // never starting left of the column's inner left edge.
    const x = spec.centerX !== undefined
      ? Math.max(spec.centerX - font.widthOfTextAtSize(text, fittedSize) / 2, spec.centerX - spec.maxWidth / 2)
      : spec.x
    pages[spec.page].drawText(text, { x, y: H - spec.top, size: fittedSize, font, color: ink })
  }

  // Exported shape for tests: the two diagonal line segments of a mark
  const mark = (key, checked) => {
    if (!checked) return
    const spec = NSRP_CHECKBOXES[key]
    if (!spec) throw new Error(`Unknown NSRP checkbox: ${key}`)
    const page = pages[spec.page]
    for (const seg of nsrpMarkSegments(spec)) {
      page.drawLine({
        start: { x: seg.x1, y: H - seg.y1 },
        end: { x: seg.x2, y: H - seg.y2 },
        thickness: 1.2,
        color: ink,
      })
    }
  }

  // I. Personal information
  for (const key of ['surname', 'firstName', 'middleName', 'suffix', 'dob', 'placeOfBirth', 'religion',
    'addressStreet', 'addressBarangay', 'addressCity', 'addressProvince', 'tin', 'height', 'gsisSss',
    'email', 'pagibig', 'landline', 'philhealth', 'cellphone',
    'occupation1', 'occupation2', 'occupation3', 'occupation4',
    'localPref1', 'localPref2', 'localPref3',
    'overseasPref1', 'overseasPref2', 'overseasPref3',
    'passportNo', 'passportExpiry']) {
    write(key, answers[key])
  }
  write('expectedSalary', formatNumberGroups(answers.expectedSalary))

  mark('sexMale', answers.sex === 'Male')
  mark('sexFemale', answers.sex === 'Female')
  mark('civilSingle', answers.civilStatus === 'Single')
  mark('civilMarried', answers.civilStatus === 'Married')
  mark('civilWidowed', answers.civilStatus === 'Widowed')
  mark('civilSeparated', answers.civilStatus === 'Separated')
  mark('civilLiveIn', answers.civilStatus === 'Live-in')

  // Disability: single select (Visual/Hearing/Speech/Physical) or Others + free text.
  // Tolerates comma-joined legacy values ("Visual, Hearing, Others").
  const disabilityParts = String(answers.disability || '').split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)
  mark('disabilityVisual', disabilityParts.includes('visual'))
  mark('disabilitySpeech', disabilityParts.includes('speech'))
  mark('disabilityHearing', disabilityParts.includes('hearing'))
  mark('disabilityPhysical', disabilityParts.includes('physical'))
  const knownDisabilities = new Set(['visual', 'hearing', 'speech', 'physical', 'others'])
  const disabilityLeftovers = disabilityParts.filter((part) => !knownDisabilities.has(part))
  const disabilityOthersText = answers.disabilityOthers || disabilityLeftovers.join(', ')
  if ((disabilityParts.includes('others') || disabilityLeftovers.length > 0) && disabilityOthersText) {
    mark('disabilityOthers', true)
    write('disability', disabilityOthersText)
  }

  mark('empEmployed', answers.employmentStatus === 'Employed')
  mark('empUnemployed', answers.employmentStatus === 'Unemployed')
  const typeDetail = (answers.employmentTypeDetail || '').toLowerCase()
  mark('empWageEmployed', answers.employmentStatus === 'Employed' && typeDetail.includes('wage'))
  mark('empSelfEmployed', answers.employmentStatus === 'Employed' && typeDetail.includes('self'))
  mark('empNewEntrant', typeDetail.includes('fresh') || typeDetail.includes('new entrant'))
  mark('empFinishedContract', typeDetail.includes('finished') || typeDetail.includes('contract'))
  mark('empResigned', typeDetail.includes('resigned'))
  mark('empRetired', typeDetail.includes('retired'))
  mark('empTerminatedLocal', typeDetail.includes('terminated') && typeDetail.includes('local'))
  if (typeDetail.includes('terminated') && typeDetail.includes('abroad')) {
    mark('empTerminatedAbroad', true)
    const country = answers.terminatedAbroadCountry
      || /abroad[:\s-(]*([^)]*)\)?$/i.exec(answers.employmentTypeDetail || '')?.[1]
    if (country) write('terminatedAbroadCountry', country)
  }
  if (typeDetail === 'others' || typeDetail.startsWith('others')) {
    mark('empTypeOthers', true)
    if (answers.employmentTypeOther) write('employmentTypeOther', answers.employmentTypeOther)
  }

  mark('lookingYes', answers.activelyLooking === 'Yes')
  mark('lookingNo', answers.activelyLooking === 'No')
  mark('willingYes', answers.willingImmediately === 'Yes')
  mark('willingNo', answers.willingImmediately === 'No')
  mark('fourPsYes', answers.fourPs === 'Yes')
  mark('fourPsNo', answers.fourPs === 'No')
  // Conditional fields print only when their trigger answer applies
  if (answers.activelyLooking === 'Yes') write('lookingDuration', answers.lookingDuration)
  if (answers.willingImmediately === 'No') write('willingWhen', answers.willingWhen)
  if (answers.fourPs === 'Yes') write('fourPsId', answers.fourPsId)
  if (answers.localPref1 || answers.localPref2 || answers.localPref3) mark('prefLocal', true)
  if (answers.overseasPref1 || answers.overseasPref2 || answers.overseasPref3) mark('prefOverseas', true)

  // III. Language proficiency — English and Filipino rows; anything else on "Others".
  const languages = Array.isArray(answers.languages) ? answers.languages : []
  for (const entry of languages) {
    const name = String(entry?.name || '').trim()
    if (!name) continue
    const normalized = name.toLowerCase()
    const rowTop = normalized === 'english' ? NSRP_LANGUAGES.rows.English
      : normalized === 'filipino' ? NSRP_LANGUAGES.rows.Filipino
      : NSRP_LANGUAGES.rows.Others
    if (normalized !== 'english' && normalized !== 'filipino') write('languageOther', toCaps(entry.otherName || name))
    const size = 9
    const width = bold.widthOfTextAtSize('X', size)
    for (const skill of ['read', 'write', 'speak', 'understand']) {
      if (!entry?.[skill]) continue
      pages[0].drawText('X', { x: NSRP_LANGUAGES.x[skill] - width / 2, y: H - rowTop - size * 0.35, size, font: bold, color: ink })
    }
  }

  // IV. Educational background — one row per level; Course only for Tertiary/Graduate Studies
  const educationByLevel = {}
  for (const row of answers.education || []) {
    if (row?.level) educationByLevel[String(row.level).trim()] = row
  }
  for (const [level, top] of Object.entries(NSRP_EDUCATION.rows)) {
    const row = educationByLevel[level]
    if (!row) continue
    const entries = { school: row.school, year: row.year, undergradLevel: shortLevel(row.undergradLevel), yearLastAttended: row.yearLastAttended, awards: row.awards }
    if (level === 'Tertiary' || level === 'Graduate Studies') entries.course = row.course
    for (const [col, raw] of Object.entries(entries)) {
      if (!raw) continue
      drawTableCell({
        rawValue: raw,
        spec: NSRP_EDUCATION,
        col,
        rowTop: top,
        field: `education[${level}].${col}`,
        charLimit: NSRP_ROW_LIMITS.education[col],
      })
    }
  }

  // V. Technical/vocational training — duration from/to, fixed rows, overflow noted
  drawFixedRows({
    rows: answers.technicalTraining || [],
    spec: NSRP_TRAINING,
    keys: { course: 'course', duration: 'duration', institution: 'institution', certificate: 'certificate' },
    section: 'technicalTraining',
    transform: (row) => ({
      ...row,
      duration: [row.fromDate, row.toDate].filter(Boolean).map(formatDateShort).join(' to '),
    }),
  })
  // VI. Eligibility / professional license — left = civil service rows, right = PRC rows
  const eligibilityRows = answers.eligibility || []
  const civilServiceRows = eligibilityRows.filter((row) => row?.eligibility || row?.rating || row?.examDate).slice(0, NSRP_ELIGIBILITY.rows.length)
  const prcRows = eligibilityRows.filter((row) => row?.license || row?.validUntil).slice(0, NSRP_ELIGIBILITY.rows.length)
  civilServiceRows.forEach((row, index) => {
    const top = NSRP_ELIGIBILITY.rows[index]
    const pair = { eligibility: row.eligibility, rating: row.rating, examDate: formatDate(row.examDate) }
    for (const [col, value] of Object.entries(pair)) {
      if (!value) continue
      drawTableCell({
        rawValue: value,
        spec: NSRP_ELIGIBILITY,
        col,
        rowTop: top,
        field: `eligibility[${index}].${col}`,
        x: NSRP_ELIGIBILITY.left[col],
        charLimit: NSRP_ROW_LIMITS.eligibility[col],
      })
    }
  })
  prcRows.forEach((row, index) => {
    const top = NSRP_ELIGIBILITY.rows[index]
    const pair = { license: row.license, validUntil: formatDate(row.validUntil) }
    for (const [col, value] of Object.entries(pair)) {
      if (!value) continue
      drawTableCell({
        rawValue: value,
        spec: NSRP_ELIGIBILITY,
        col,
        rowTop: top,
        field: `eligibility[${index}].${col}`,
        x: NSRP_ELIGIBILITY.right[col],
        charLimit: NSRP_ROW_LIMITS.eligibility[col],
      })
    }
  })

  // VII. Work experience — fixed rows with address and status columns
  drawFixedRows({
    rows: answers.workExperience || [],
    spec: NSRP_WORK_EXPERIENCE,
    keys: { company: 'company', address: 'address', position: 'position', dates: 'dates', status: 'status' },
    section: 'workExperience',
    transform: (row) => ({
      ...row,
      dates: [row.fromDate, row.toDate].filter(Boolean).map(formatDateShort).join(' to '),
    }),
  })

  // VIII. Other skills — fixed options tick their boxes; only true leftovers go to Others
  const { marks: skillMarks, othersLine } = nsrpSkillMarks(answers.skills, answers.othersText)
  for (const key of skillMarks) mark(key, true)
  if (othersLine) write('skillOthersText', othersLine)

  // CERTIFICATION/AUTHORIZATION — signature above the line, date on the Date line.
  // No signature: the line stays blank so the printed copy can be signed by hand.
  // The "For use of PESO only" block below is intentionally left untouched.
  if (signatureImage?.bytes?.length) {
    const image = signatureImage.mimetype === 'image/png'
      ? await pdfDoc.embedPng(signatureImage.bytes)
      : await pdfDoc.embedJpg(signatureImage.bytes)
    const placement = nsrpSignaturePlacement(NSRP_SIGNATURE, image.width, image.height)
    if (placement) {
      pages[NSRP_SIGNATURE.page].drawImage(image, {
        x: placement.x,
        y: H - placement.top - placement.height,
        width: placement.width,
        height: placement.height,
      })
    }
  }
  if (certificationDate) write('certificationDate', certificationDate)

  // Overflow note: fixed-row sections cap their rows
  const overflowNotes = []
  if ((answers.technicalTraining || []).length > NSRP_TRAINING.maxRows) overflowNotes.push('Additional training')
  if ((answers.workExperience || []).length > NSRP_WORK_EXPERIENCE.maxRows) overflowNotes.push('Additional work experience')
  const eligibilityCount = (answers.eligibility || []).filter((row) => row?.eligibility || row?.license).length
  if (eligibilityCount > NSRP_ELIGIBILITY.rows.length * 2) overflowNotes.push('Additional eligibility')
  if (overflowNotes.length) {
    pages[1].drawText(`${overflowNotes.join('; ')}: see attached sheet.`, { x: 36, y: H - 528, size: 7, font, color: ink })
  }

  // Debug overlay: grid + field boxes
  if (debug) {
    const gridColor = rgb(0.85, 0.85, 0.85)
    const boxColor = rgb(1, 0, 0)
    for (let pageIndex = 0; pageIndex < Math.min(pages.length, NSRP_PAGE.pageCount); pageIndex += 1) {
      const page = pages[pageIndex]
      for (let x = 0; x <= NSRP_PAGE.width; x += 50) {
        page.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness: 0.25, color: gridColor })
        page.drawText(String(x), { x: x + 1, y: H - 8, size: 5, font, color: gridColor })
      }
      for (let top = 0; top <= H; top += 50) {
        page.drawLine({ start: { x: 0, y: H - top }, end: { x: NSRP_PAGE.width, y: H - top }, thickness: 0.25, color: gridColor })
        page.drawText(String(top), { x: 1, y: H - top + 1, size: 5, font, color: gridColor })
      }
    }
    for (const spec of Object.values(NSRP_TEXT_FIELDS)) {
      const fieldX = spec.centerX !== undefined ? spec.centerX - spec.maxWidth / 2 : spec.x
      pages[spec.page].drawRectangle({ x: fieldX, y: H - spec.top - 2, width: spec.maxWidth, height: spec.size + 4, borderColor: boxColor, borderWidth: 0.5 })
    }
    for (const spec of Object.values(NSRP_CHECKBOXES)) {
      pages[spec.page].drawRectangle({ x: spec.box.x, y: H - spec.box.y - spec.box.h, width: spec.box.w, height: spec.box.h, borderColor: boxColor, borderWidth: 0.5 })
    }
  }

  return Buffer.from(await pdfDoc.save())

  function drawFixedRows({ rows, spec, keys, section, transform }) {
    const visible = rows.slice(0, spec.maxRows || NSRP_MAX_ROWS_PER_SECTION)
    visible.forEach((inputRow, index) => {
      const row = transform ? transform(inputRow) : inputRow
      const top = spec.rows ? spec.rows[index] : spec.firstRowTop + index * spec.rowStep
      if (top === undefined) return
      for (const [col, sourceKey] of Object.entries(keys)) {
        const raw = row?.[sourceKey] ?? row?.[col] ?? ''
        if (!raw) continue
        const sectionLimits = NSRP_ROW_LIMITS[section] || {}
        const charLimit = sourceKey === 'dates' || col === 'duration'
          ? (sectionLimits.fromDate || 10) + (sectionLimits.toDate || 10) + ' to '.length
          : sectionLimits[sourceKey] ?? sectionLimits[col]
        drawTableCell({
          rawValue: raw,
          spec,
          col,
          rowTop: top,
          field: `${section}[${index}].${sourceKey === 'dates' ? 'fromDate/toDate' : sourceKey}`,
          charLimit,
        })
      }
    })
  }
}
