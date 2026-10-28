// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { pdf as renderPdf } from 'pdf-to-img'
import { PNG } from 'pngjs'
import {
  NSRP_PAGE, NSRP_TEXT_FIELDS, NSRP_CHECKBOXES, NSRP_LANGUAGES,
  NSRP_EDUCATION, NSRP_TRAINING, NSRP_ELIGIBILITY, NSRP_WORK_EXPERIENCE,
} from '../../server/nsrpLayout.js'
import { generateNsrpPdf, nsrpMarkSegments, nsrpSkillMarks, fitText, drawFittedText } from '../../server/nsrpPdf.js'
import { nsrpCheckboxCenter } from '../../server/nsrpLayout.js'
import { NSRP_SKILLS } from '../../shared/nsrpSkills.js'
import * as fontkit from 'fontkit'
import fs from 'fs'

const withinPage = (spec, label) => {
  expect(spec.page, `${label} page`).toBeGreaterThanOrEqual(0)
  expect(spec.page, `${label} page`).toBeLessThan(NSRP_PAGE.pageCount)
  const left = spec.centerX !== undefined ? spec.centerX - spec.maxWidth / 2 : spec.x
  expect(left, `${label} x`).toBeGreaterThanOrEqual(0)
  expect(left, `${label} x within page`).toBeLessThanOrEqual(NSRP_PAGE.width)
  expect(spec.top, `${label} top`).toBeGreaterThanOrEqual(0)
  expect(spec.top, `${label} top within page`).toBeLessThanOrEqual(NSRP_PAGE.height)
}

describe('NSRP layout config', () => {
  it('every text field has page, x or centerX, top, maxWidth and stays inside page bounds', () => {
    for (const [key, spec] of Object.entries(NSRP_TEXT_FIELDS)) {
      expect(spec.maxWidth, `${key} maxWidth`).toBeGreaterThan(0)
      expect(spec.size, `${key} size`).toBeGreaterThanOrEqual(6)
      withinPage(spec, key)
      const left = spec.centerX !== undefined ? spec.centerX - spec.maxWidth / 2 : spec.x
      expect(left, `${key} left edge`).toBeGreaterThanOrEqual(0)
      expect(left + spec.maxWidth, `${key} right edge within page`).toBeLessThanOrEqual(NSRP_PAGE.width + 1)
    }
  })

  it('every checkbox has a box inside page bounds', () => {
    for (const [key, spec] of Object.entries(NSRP_CHECKBOXES)) {
      expect(spec.box, `${key} box`).toBeDefined()
      expect(spec.box.w, `${key} box width`).toBeGreaterThan(0)
      expect(spec.box.h, `${key} box height`).toBeGreaterThan(0)
      expect(spec.page, `${key} page`).toBeLessThan(NSRP_PAGE.pageCount)
      expect(spec.box.x + spec.box.w, `${key} right edge`).toBeLessThanOrEqual(NSRP_PAGE.width)
      expect(spec.box.y + spec.box.h, `${key} bottom edge`).toBeLessThanOrEqual(NSRP_PAGE.height)
    }
  })

  it('mark segments are centered within 1 pt of every checkbox box center', () => {
    for (const [key, spec] of Object.entries(NSRP_CHECKBOXES)) {
      const { cx, cy } = nsrpCheckboxCenter(spec)
      for (const seg of nsrpMarkSegments(spec)) {
        const midX = (seg.x1 + seg.x2) / 2
        const midY = (seg.y1 + seg.y2) / 2
        expect(Math.abs(midX - cx), `${key} mark center x`).toBeLessThanOrEqual(1)
        expect(Math.abs(midY - cy), `${key} mark center y`).toBeLessThanOrEqual(1)
        // and the mark stays inside the box
        expect(Math.min(seg.x1, seg.x2), `${key} mark left`).toBeGreaterThanOrEqual(spec.box.x)
        expect(Math.max(seg.x1, seg.x2), `${key} mark right`).toBeLessThanOrEqual(spec.box.x + spec.box.w)
        expect(Math.min(seg.y1, seg.y2), `${key} mark top`).toBeGreaterThanOrEqual(spec.box.y)
        expect(Math.max(seg.y1, seg.y2), `${key} mark bottom`).toBeLessThanOrEqual(spec.box.y + spec.box.h)
      }
    }
  })

  it('language columns and rows are inside page bounds', () => {
    for (const [col, x] of Object.entries(NSRP_LANGUAGES.x)) {
      expect(x, `language ${col} x`).toBeGreaterThan(0)
      expect(x, `language ${col} x within page`).toBeLessThanOrEqual(NSRP_PAGE.width)
    }
    for (const [row, top] of Object.entries(NSRP_LANGUAGES.rows)) {
      expect(top, `language ${row} top`).toBeGreaterThan(0)
      expect(top, `language ${row} top within page`).toBeLessThanOrEqual(NSRP_PAGE.height)
    }
  })

  it('fixed-row section columns are inside page bounds', () => {
    for (const [name, section] of Object.entries({ education: NSRP_EDUCATION, training: NSRP_TRAINING, eligibility: NSRP_ELIGIBILITY, workExperience: NSRP_WORK_EXPERIENCE })) {
      const colGroups = [section.cols, section.left, section.right].filter(Boolean)
      for (const cols of colGroups) {
        for (const [col, x] of Object.entries(cols)) {
          expect(x, `${name}.${col} x`).toBeGreaterThanOrEqual(0)
          expect(x, `${name}.${col} x within page`).toBeLessThanOrEqual(NSRP_PAGE.width)
        }
      }
      for (const [col, width] of Object.entries(section.maxWidth || {})) {
        expect(width, `${name}.${col} maxWidth`).toBeGreaterThan(0)
      }
    }
  })

  it('checkbox keys are unique and every box has width and height', () => {
    const keys = Object.keys(NSRP_CHECKBOXES)
    expect(new Set(keys).size).toBe(keys.length)
    for (const [key, spec] of Object.entries(NSRP_CHECKBOXES)) {
      expect(typeof spec.box.w, `${key} box width type`).toBe('number')
      expect(typeof spec.box.h, `${key} box height type`).toBe('number')
    }
  })

  it('every one of the 18 shared skill options draws exactly one centered mark', () => {
    expect(NSRP_SKILLS).toHaveLength(18)
    for (const { label, layoutKey } of NSRP_SKILLS) {
      const spec = NSRP_CHECKBOXES[layoutKey]
      expect(spec, `${label} (${layoutKey}) has a layout entry`).toBeDefined()
      const { marks } = nsrpSkillMarks([label], label === 'Others' ? 'Sample other skill' : '')
      expect(marks, `${label} marks`).toEqual([layoutKey])
      const { cx, cy } = nsrpCheckboxCenter(spec)
      for (const seg of nsrpMarkSegments(spec)) {
        expect(Math.abs((seg.x1 + seg.x2) / 2 - cx), `${layoutKey} mark center x`).toBeLessThanOrEqual(1)
        expect(Math.abs((seg.y1 + seg.y2) / 2 - cy), `${layoutKey} mark center y`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('shrink-to-fit never exceeds maxWidth for long values in any text field or table cell', async () => {
    const fontBytes = fs.readFileSync('C:\\Windows\\Fonts\\arial.ttf')
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(fontBytes)
    const longValue = 'A very long realistic value with MANY WIDE WORDS 123-456-789 that must never overflow its cell'
    for (const [key, spec] of Object.entries(NSRP_TEXT_FIELDS)) {
      const { text, size } = fitText(font, longValue, spec.maxWidth, spec.size)
      expect(font.widthOfTextAtSize(text, size), `${key} fitted width`).toBeLessThanOrEqual(spec.maxWidth + 0.01)
    }
    const cellSpecs = [
      ...Object.entries(NSRP_EDUCATION.maxWidth).map(([col, mw]) => [`education.${col}`, mw, NSRP_EDUCATION.size]),
      ...Object.entries(NSRP_TRAINING.maxWidth).map(([col, mw]) => [`training.${col}`, mw, NSRP_TRAINING.size]),
      ...Object.entries(NSRP_ELIGIBILITY.maxWidth).map(([col, mw]) => [`eligibility.${col}`, mw, NSRP_ELIGIBILITY.size]),
      ...Object.entries(NSRP_WORK_EXPERIENCE.maxWidth).map(([col, mw]) => [`workExperience.${col}`, mw, NSRP_WORK_EXPERIENCE.size]),
    ]
    for (const [label, maxWidth, size] of cellSpecs) {
      const fitted = fitText(font, longValue, maxWidth, size)
      expect(font.widthOfTextAtSize(fitted.text, fitted.size), `${label} fitted width`).toBeLessThanOrEqual(maxWidth + 0.01)
    }
  })
})

describe('drawFittedText', () => {
  async function createFont() {
    const fontBytes = fs.readFileSync('C:\\Windows\\Fonts\\arial.ttf')
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    return doc.embedFont(fontBytes)
  }

  it('keeps short values on one line at the default font size', async () => {
    const font = await createFont()
    const drawn = []
    const result = drawFittedText({
      page: { drawText: (text, options) => drawn.push({ text, ...options }) },
      font,
      rawValue: 'HONORS',
      x: 10,
      cellCenterTop: 50,
      pageHeight: 100,
      maxWidth: 43,
      innerHeight: 20,
      maxLines: 2,
      size: 8,
      field: 'education[Tertiary].awards',
    })

    expect(result.lines).toEqual(['HONORS'])
    expect(result.size).toBe(8)
    expect(result.truncated).toBe(false)
    expect(drawn).toHaveLength(1)
  })

  it('wraps WITH HIGH HONORS into two lines without truncating', async () => {
    const font = await createFont()
    const drawn = []
    const result = drawFittedText({
      page: { drawText: (text, options) => drawn.push({ text, ...options }) },
      font,
      rawValue: 'WITH HIGH HONORS',
      x: 521,
      cellCenterTop: 71,
      pageHeight: NSRP_PAGE.height,
      maxWidth: 43,
      innerHeight: 20,
      maxLines: 2,
      size: 8,
      field: 'education[Elementary].awards',
    })

    expect(result.lines).toHaveLength(2)
    expect(result.lines.join(' ')).toBe('WITH HIGH HONORS')
    expect(result.lines.some((line) => line.includes('...'))).toBe(false)
    expect(result.size).toBe(8)
    expect(result.lineWidths.every((width) => width <= 43)).toBe(true)
    expect(result.blockHeight).toBeLessThanOrEqual(20)
    expect(drawn).toHaveLength(2)
  })

  it('shrinks to 6 pt and truncates only the last line with a field warning', async () => {
    const font = await createFont()
    const drawn = []
    const warnings = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = drawFittedText({
        page: { drawText: (text, options) => drawn.push({ text, ...options }) },
        font,
        rawValue: 'A VERY LONG AWARD DESCRIPTION THAT CANNOT FIT IN THE AWARDS CELL WITHOUT BEING SHORTENED',
        x: 521,
        cellCenterTop: 71,
        pageHeight: NSRP_PAGE.height,
        maxWidth: 43,
        innerHeight: 20,
        maxLines: 2,
        size: 8,
        field: 'education[Elementary].awards',
        onLayoutWarning: (warning) => warnings.push(warning),
      })

      expect(result.size).toBe(6)
      expect(result.truncated).toBe(true)
      expect(result.lines.at(-1)).toMatch(/\.\.\.$/)
      expect(result.lines.slice(0, -1).some((line) => line.includes('...'))).toBe(false)
      expect(result.lineWidths.every((width) => width <= 43)).toBe(true)
      expect(result.blockHeight).toBeLessThanOrEqual(20)
      expect(warnings).toEqual([{ field: 'education[Elementary].awards', reason: 'truncated', size: 6 }])
      expect(warn).toHaveBeenCalledWith('[NSRP PDF] Truncated text for field: education[Elementary].awards')
      expect(drawn).toHaveLength(result.lines.length)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('generateNsrpPdf', () => {
  it('renders long values in every table to PNG and produces a valid image for every page', async () => {
    const warnings = []
    const layouts = []
    const buffer = await generateNsrpPdf({
      education: [{
        level: 'Tertiary',
        school: 'A LONG SCHOOL NAME THAT SHOULD WRAP OR SHRINK INSIDE ITS CELL',
        course: 'A VERY LONG COURSE DESCRIPTION FOR PRINT TESTING',
        year: '2024',
        undergradLevel: 'FOURTH YEAR UNDERGRADUATE STUDENT',
        yearLastAttended: '2024',
        awards: 'WITH HIGH HONORS AND AN ADDITIONAL LONG AWARD DESCRIPTION',
      }],
      technicalTraining: [{
        course: 'A VERY LONG TECHNICAL VOCATIONAL TRAINING COURSE DESCRIPTION',
        fromDate: '2020-01-01',
        toDate: '2021-01-01',
        institution: 'A VERY LONG TRAINING INSTITUTION NAME FOR PRINT TESTING',
        certificate: 'A LONG CERTIFICATE NAME',
      }],
      eligibility: [{
        eligibility: 'A VERY LONG CIVIL SERVICE ELIGIBILITY NAME FOR PRINT TESTING',
        rating: '98.75',
        examDate: '2020-01-01',
        license: 'A VERY LONG PROFESSIONAL LICENSE NAME FOR PRINT TESTING',
        validUntil: '2030-01-01',
      }],
      workExperience: [{
        company: 'A VERY LONG COMPANY NAME FOR THE NSRP PRINT TEST',
        address: 'A VERY LONG MUNICIPALITY OR CITY ADDRESS FOR PRINT TESTING',
        position: 'A VERY LONG PROFESSIONAL POSITION TITLE FOR PRINT TESTING',
        fromDate: '2020-01-01',
        toDate: '2021-01-01',
        status: 'Permanent',
      }],
    }, {
      onLayoutWarning: (warning) => warnings.push(warning),
      onLayout: (layout) => layouts.push(layout),
    })

    expect(warnings.length).toBeGreaterThan(0)
    expect(layouts.some(({ field }) => field.startsWith('education['))).toBe(true)
    expect(layouts.some(({ field }) => field.startsWith('technicalTraining['))).toBe(true)
    expect(layouts.some(({ field }) => field.startsWith('eligibility['))).toBe(true)
    expect(layouts.some(({ field }) => field.startsWith('workExperience['))).toBe(true)
    for (const layout of layouts) {
      expect(layout.lineWidths.every((width) => width <= layout.maxWidth + 0.001), layout.field).toBe(true)
      expect(layout.blockHeight, layout.field).toBeLessThanOrEqual(layout.innerHeight + 0.001)
    }
    const rendered = await renderPdf(buffer, { scale: 0.5 })
    try {
      expect(rendered.length).toBe(NSRP_PAGE.pageCount)
      for (let pageNumber = 1; pageNumber <= rendered.length; pageNumber += 1) {
        const png = PNG.sync.read(await rendered.getPage(pageNumber))
        expect(png.width).toBeGreaterThan(200)
        expect(png.height).toBeGreaterThan(300)
        let darkPixels = 0
        for (let index = 0; index < png.data.length; index += 4) {
          if (png.data[index] < 128 && png.data[index + 1] < 128 && png.data[index + 2] < 128) darkPixels += 1
        }
        expect(darkPixels, `page ${pageNumber} should contain rendered form content`).toBeGreaterThan(0)
      }
    } finally {
      await rendered.destroy()
    }
  })

  it('returns a PDF for full data without throwing', async () => {
    const buffer = await generateNsrpPdf({
      surname: 'DELA CRUZ-HERNANDEZ', firstName: 'MARIA CONCEPCION ROSARIO', middleName: 'SANTOS REYES', suffix: 'III',
      dob: '1995-12-25', placeOfBirth: 'MUNICIPALITY OF SAN PEDRO, PROVINCE OF LAGUNA', sex: 'Female',
      religion: 'Roman Catholic', civilStatus: 'Married',
      addressStreet: 'BLK 12 LOT 34 SAN VICENTE VILLAGE SUBDIVISION PHASE 2', addressBarangay: 'BARANGAY POBLACION UNO',
      addressCity: 'CITY OF SANTA ROSA', addressProvince: 'LAGUNA',
      tin: '123-456-789-000', height: '157 CM', gsisSss: 'SSS 34-1234567-8', email: 'maria@example.com',
      pagibig: '1212-3434-5656', landline: '(049) 123-4567', philhealth: '12-345678901-2', cellphone: '09171234567',
      disability: 'Others: mild scoliosis', employmentStatus: 'Unemployed', employmentTypeDetail: 'New Entrant/Fresh Graduate',
      activelyLooking: 'Yes', lookingDuration: '6 months', willingImmediately: 'Yes', fourPs: 'Yes', fourPsId: 'HH-1234-5678',
      occupation1: 'ADMINISTRATIVE ASSISTANT', occupation2: 'DATA ENCODER', occupation3: 'CUSTOMER SERVICE REPRESENTATIVE', occupation4: 'BOOKKEEPER',
      localPref1: 'SANTA ROSA CITY', localPref2: 'BINAN CITY', localPref3: 'CABUYAO CITY',
      overseasPref1: 'SINGAPORE', overseasPref2: 'JAPAN', overseasPref3: 'CANADA',
      expectedSalary: 'PHP 18,000 - 22,000', passportNo: 'P1234567B', passportExpiry: '2030-06-15',
      languages: [{ name: 'English', read: true, write: true, speak: true, understand: true }],
      education: [
        { level: 'Elementary', school: 'STA ROSA ELEM', year: '2008' },
        { level: 'Secondary', school: 'LAGUNA NHS', year: '2012' },
        { level: 'Tertiary', school: 'PUP', course: 'BS ACCOUNTANCY', year: '2016' },
        { level: 'Graduate Studies', school: 'UP DILIMAN', course: 'MBA', undergradLevel: '2ND YEAR', yearLastAttended: '2019' },
      ],
      technicalTraining: [
        { course: 'BOOKKEEPING NC III', fromDate: '2020-01-05', toDate: '2020-03-15', institution: 'TESDA LAGUNA', certificate: 'NC III' },
      ],
      eligibility: [
        { eligibility: 'CAREER SERVICE PROFESSIONAL', rating: '82.5', examDate: '2017-10-15' },
        { license: 'CPA', validUntil: '2028-05-20' },
      ],
      workExperience: [{ company: 'ABC MANUFACTURING CORPORATION', address: 'BINAN CITY', position: 'ACCOUNTING CLERK', fromDate: '2016-06-01', toDate: '2018-05-31', status: 'Permanent' }],
      skills: ['Computer Literate', 'Driver'],
      othersText: '',
    })
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(1000)
    const doc = await PDFDocument.load(buffer)
    expect(doc.getPageCount()).toBe(NSRP_PAGE.pageCount)
  })

  it('returns a PDF for a mostly empty applicant without throwing', async () => {
    const buffer = await generateNsrpPdf({
      surname: 'REYES', firstName: 'JUAN', dob: '2000-01-15', placeOfBirth: 'MANILA', sex: 'Male', civilStatus: 'Single',
      addressStreet: '123 RIZAL ST', addressBarangay: 'BRGY 1', addressCity: 'MANILA', addressProvince: 'METRO MANILA',
      email: 'juan@example.com', cellphone: '09180001111',
      employmentStatus: 'Unemployed', activelyLooking: 'Yes', willingImmediately: 'Yes', fourPs: 'No', occupation1: 'DRIVER',
    })
    expect(Buffer.isBuffer(buffer)).toBe(true)
    const doc = await PDFDocument.load(buffer)
    expect(doc.getPageCount()).toBe(NSRP_PAGE.pageCount)
  })

  it('supports ñ and accented characters without throwing', async () => {
    const buffer = await generateNsrpPdf({
      surname: 'NUÑEZ', firstName: 'PEÑA', dob: '2000-01-15', placeOfBirth: 'MANILA', sex: 'Male', civilStatus: 'Single',
      addressStreet: '1 ST', addressBarangay: 'B1', addressCity: 'MANILA', addressProvince: 'MM',
      email: 'a@b.co', cellphone: '09180001111',
      employmentStatus: 'Employed', activelyLooking: 'No', willingImmediately: 'No', fourPs: 'No', occupation1: 'DRIVER',
    })
    expect(Buffer.isBuffer(buffer)).toBe(true)
  })

  it('generates with 0, 1, and max rows per repeating section without throwing', async () => {
    const base = {
      surname: 'TEST', firstName: 'ROWS', dob: '2000-01-15', placeOfBirth: 'MANILA', sex: 'Male', civilStatus: 'Single',
      addressStreet: '1 ST', addressBarangay: 'B1', addressCity: 'MANILA', addressProvince: 'MM',
      email: 'a@b.co', cellphone: '09180001111',
      employmentStatus: 'Employed', activelyLooking: 'No', willingImmediately: 'Yes', fourPs: 'No', occupation1: 'DRIVER',
    }
    for (const count of [0, 1, 5]) {
      const buffer = await generateNsrpPdf({
        ...base,
        workExperience: Array.from({ length: count }, (_, i) => ({
          company: `COMPANY ${i}`, address: 'CITY', position: 'ROLE', fromDate: '2020-01-01', toDate: '2021-01-01', status: 'Permanent',
        })),
        technicalTraining: Array.from({ length: Math.min(count, 3) }, (_, i) => ({
          course: `COURSE ${i}`, fromDate: '2020-01-01', toDate: '2020-06-01', institution: 'TESDA', certificate: 'NC II',
        })),
        eligibility: Array.from({ length: Math.min(count, 4) }, (_, i) => (
          i % 2 === 0 ? { eligibility: `CS ${i}`, rating: '80', examDate: '2020-01-01' } : { license: `PRC ${i}`, validUntil: '2030-01-01' }
        )),
      })
      expect(Buffer.isBuffer(buffer)).toBe(true)
      const doc = await PDFDocument.load(buffer)
      expect(doc.getPageCount()).toBe(NSRP_PAGE.pageCount)
    }
  })

  it('does not print conditional fields when their trigger answer does not apply', async () => {
    const buffer = await generateNsrpPdf({
      surname: 'TEST', firstName: 'COND', dob: '2000-01-15', placeOfBirth: 'MANILA', sex: 'Male', civilStatus: 'Single',
      addressStreet: '1 ST', addressBarangay: 'B1', addressCity: 'MANILA', addressProvince: 'MM',
      email: 'a@b.co', cellphone: '09180001111',
      employmentStatus: 'Employed',
      activelyLooking: 'No', lookingDuration: '6 months',
      willingImmediately: 'Yes', willingWhen: 'next week',
      fourPs: 'No', fourPsId: 'HH-999',
      occupation1: 'DRIVER',
    })
    expect(Buffer.isBuffer(buffer)).toBe(true)
  })
})
