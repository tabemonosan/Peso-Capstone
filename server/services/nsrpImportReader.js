import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pdf } from 'pdf-to-img'
import sharp from 'sharp'
import { NSRP_PAGE, NSRP_TEXT_FIELDS, NSRP_CHECKBOXES, NSRP_LANGUAGES, NSRP_EDUCATION, NSRP_TRAINING, NSRP_ELIGIBILITY, NSRP_WORK_EXPERIENCE } from '../nsrpLayout.js'
import { NSRP_SKILLS } from '../../shared/nsrpSkills.js'
import { sanitizeNsrpImport, nsrpImportDate } from '../../shared/nsrpImport.js'
import { readOcr } from './localImageReading.js'
const require = createRequire(import.meta.url)
const templatePath = new URL('../../public/NSRP-Form-1-Jobseeker-Reg-Form.pdf', import.meta.url)
const docInitParams = { isEvalSupported: false, verbosity: 0 }
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
const error = message => { throw Object.assign(new Error(message), { status: 422 }) }

async function textPages(buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), ...docInitParams, useSystemFonts: false, standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replaceAll('\\', '/') + '/' })
  try {
    const document = await task.promise
    if (document.numPages < 1 || document.numPages > 5) error('Upload an NSRP PDF with at most 5 pages.')
    const pages = []
    for (let index = 0; index < Math.min(2, document.numPages); index++) {
      const page = await document.getPage(index + 1), viewport = page.getViewport({ scale: 1 })
      if (viewport.width * viewport.height > 5000000) error('The PDF page dimensions are too large. Upload a standard-size NSRP PDF.')
      const content = await page.getTextContent()
      const items = content.items.filter(item => item.str?.trim()).slice(0, 10000).map(item => ({ text: item.str, x: item.transform[4] * NSRP_PAGE.width / viewport.width, top: (viewport.height - item.transform[5]) * NSRP_PAGE.height / viewport.height, width: item.width * NSRP_PAGE.width / viewport.width }))
      const widgets = (await page.getAnnotations()).filter(item => item.subtype === 'Widget' && typeof item.fieldValue === 'string').map(item => ({ name: item.fieldName, value: item.fieldValue }))
      pages.push({ items, widgets })
    }
    return pages
  } finally { await task.destroy() }
}
function readRect(items = [], left, top, width, height) {
  return items.filter(item => item.x >= left - 2 && item.x < left + width && item.top >= top && item.top <= top + height).sort((a, b) => Math.abs(a.top - b.top) < 2 ? a.x - b.x : a.top - b.top).map(item => item.text).join(' ').trim()
}
function structured(pages, blank) {
  const text = pages[0]?.items || []
  const anchors = ['SURNAME', 'FIRST NAME', 'DATE OF BIRTH', 'PREFERRED OCCUPATION', 'EMAIL ADDRESS', 'PRESENT ADDRESS']
  const matches = anchors.filter(anchor => text.some(item => normalize(item.text) === normalize(anchor) && blank[0].items.some(base => normalize(base.text) === normalize(anchor) && Math.abs(base.x - item.x) < 5 && Math.abs(base.top - item.top) < 5))).length
  return matches >= 4
}
async function grayscale(buffer) { return sharp(buffer).flatten({ background: '#ffffff' }).removeAlpha().resize({ width: Math.round(NSRP_PAGE.width * 2), height: Math.round(NSRP_PAGE.height * 2), fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true }) }
function marked(actual, baseline, spec) {
  const { x, y, w, h } = spec.box, scale = 2
  const left = Math.round((x + 1.5) * scale), top = Math.round((y + 1.5) * scale), width = Math.floor((w - 3) * scale), height = Math.floor((h - 3) * scale)
  let ink = 0, center = 0
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    const offset = (top + dy) * actual.info.width + left + dx
    if (actual.data[offset] < 150 && baseline.data[offset] - actual.data[offset] > 45) { ink++; if (Math.abs(dx - width / 2) <= 3 && Math.abs(dy - height / 2) <= 3) center++ }
  }
  return ink / (width * height) >= 0.08 && center >= 2
}
function dateRange(text) {
  const dates = text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})|Present/gi) || []
  // Keep printed two-digit years verbatim; never infer their century.
  const date = value => nsrpImportDate(value) || (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(value || '') ? value : '')
  return { fromDate: date(dates[0]), toDate: /^present$/i.test(dates[1] || '') ? 'Present' : date(dates[1]) }
}
const labelled = text => {
  const aliases = { surname: 'surname|last name', firstName: 'first name|given name', middleName: 'middle name', suffix: 'suffix', dob: 'date of birth|birth date', cellphone: 'cellphone(?: number)?|mobile(?: number)?', addressCity: 'city|municipality(?:/city)?', addressProvince: 'province', placeOfBirth: 'place of birth' }
  return Object.fromEntries(Object.entries(aliases).flatMap(([field, label]) => {
    const match = new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:=]\\s*([^\\n]+)`, 'i').exec(text)
    return match ? [[field, match[1].trim()]] : []
  }))
}

export async function readNsrpPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024 || buffer.subarray(0, 5).toString() !== '%PDF-') error('Upload a readable NSRP PDF up to 5 MB.')
  const [pages, template] = await Promise.all([textPages(buffer), readFile(templatePath)])
  const blank = await textPages(template)
  const recognized = structured(pages, blank), raw = {}, warnings = []
  if (pages.length < 2) warnings.push('Only one page was available. Upload both NSRP pages to retrieve education, work history, and skills.')
  if (recognized) {
    const values = pages.map((page, index) => page.items.filter(item => !blank[index]?.items.some(base => normalize(base.text) === normalize(item.text) && Math.abs(base.x - item.x) < 2 && Math.abs(base.top - item.top) < 2)))
    raw.languages = Object.entries(NSRP_LANGUAGES.rows).map(([name, top]) => ({ name, ...Object.fromEntries(Object.entries(NSRP_LANGUAGES.x).map(([field, x]) => [field, /^(?:x|✓|✔)$/i.test(readRect(values[0], x - 8, top - 5, 16, 12))])) })).filter(row => ['read', 'write', 'speak', 'understand'].some(field => row[field]))
    for (const [field, spec] of Object.entries(NSRP_TEXT_FIELDS)) {
      if (['certificationDate', 'languageOther', 'skillOthersText'].includes(field)) continue
      const left = spec.x ?? spec.centerX - spec.maxWidth / 2
      const value = readRect(values[spec.page], left, spec.top - 3, spec.maxWidth + 2, 7)
      if (value) raw[field] = value
    }
    raw.othersText = readRect(values[1], NSRP_TEXT_FIELDS.skillOthersText.x, NSRP_TEXT_FIELDS.skillOthersText.top - 3, NSRP_TEXT_FIELDS.skillOthersText.maxWidth, 7)
    const languageOther = readRect(values[0], NSRP_TEXT_FIELDS.languageOther.x, NSRP_TEXT_FIELDS.languageOther.top - 3, NSRP_TEXT_FIELDS.languageOther.maxWidth, 7)
    if (languageOther) raw.languages.filter(row => row.name === 'Others').forEach(row => { row.otherName = languageOther })
    raw.education = Object.entries(NSRP_EDUCATION.rows).map(([level, top]) => ({ level, ...Object.fromEntries(Object.entries(NSRP_EDUCATION.cols).map(([field, x]) => [field, readRect(values[1], x, top - 2, NSRP_EDUCATION.maxWidth[field], NSRP_EDUCATION.innerHeight - 2)])) })).filter(row => row.school || row.course || row.year)
    const cell = (spec, field, top, x = spec.cols[field]) => readRect(values[1], x, top - 3, spec.maxWidth[field], 12)
    raw.technicalTraining = NSRP_TRAINING.rows.map(top => ({ ...Object.fromEntries(['course', 'institution', 'certificate'].map(field => [field, cell(NSRP_TRAINING, field, top)])), ...dateRange(cell(NSRP_TRAINING, 'duration', top)) })).filter(row => row.course || row.institution)
    raw.workExperience = NSRP_WORK_EXPERIENCE.rows.map(top => ({ ...Object.fromEntries(['company', 'address', 'position', 'status'].map(field => [field, cell(NSRP_WORK_EXPERIENCE, field, top)])), ...dateRange(cell(NSRP_WORK_EXPERIENCE, 'dates', top)) })).filter(row => row.company || row.position)
    raw.eligibility = NSRP_ELIGIBILITY.rows.map(top => Object.fromEntries([...Object.entries(NSRP_ELIGIBILITY.left), ...Object.entries(NSRP_ELIGIBILITY.right)].map(([field, x]) => [field, cell(NSRP_ELIGIBILITY, field, top, x)]))).filter(row => Object.values(row).some(Boolean))
    const [rendered, blankRendered] = await Promise.all([pdf(buffer, { scale: 2, docInitParams }), pdf(template, { scale: 2, docInitParams })])
    const checks = {}
    for (let page = 0; page < Math.min(2, pages.length); page++) {
      const [actual, baseline] = await Promise.all([grayscale(await rendered.getPage(page + 1)), grayscale(await blankRendered.getPage(page + 1))])
      for (const [field, spec] of Object.entries(NSRP_CHECKBOXES)) if (spec.page === page) checks[field] = marked(actual, baseline, spec)
    }
    await Promise.all([rendered.destroy(), blankRendered.destroy()])
    raw.skills = NSRP_SKILLS.filter(skill => checks[skill.layoutKey]).map(skill => skill.label)
    const choose = (field, options) => { const selected = options.filter(([checkbox]) => checks[checkbox]); if (selected.length === 1) raw[field] = selected[0][1]; else if (selected.length > 1) warnings.push(`Check the ${field} selection against your PDF.`) }
    choose('sex', [['sexMale', 'Male'], ['sexFemale', 'Female']])
    choose('civilStatus', [['civilSingle', 'Single'], ['civilMarried', 'Married'], ['civilWidowed', 'Widowed'], ['civilSeparated', 'Separated'], ['civilLiveIn', 'Live-in']])
    choose('employmentStatus', [['empEmployed', 'Employed'], ['empUnemployed', 'Unemployed']])
    choose('employmentTypeDetail', [['empWageEmployed', 'Wage Employed'], ['empSelfEmployed', 'Self Employed'], ['empNewEntrant', 'New Entrant/Fresh Graduate'], ['empFinishedContract', 'Finished Contract'], ['empResigned', 'Resigned'], ['empRetired', 'Retired'], ['empTerminatedLocal', 'Terminated/Laidoff (local)'], ['empTerminatedAbroad', 'Terminated/Laidoff (abroad)'], ['empTypeOthers', 'Others']])
    const disabilityOther = raw.disability
    delete raw.disability
    choose('disability', [['disabilityVisual', 'Visual'], ['disabilityHearing', 'Hearing'], ['disabilitySpeech', 'Speech'], ['disabilityPhysical', 'Physical'], ['disabilityOthers', 'Others']])
    if (raw.disability === 'Others' && disabilityOther) raw.disabilityOthers = disabilityOther
    choose('activelyLooking', [['lookingYes', 'Yes'], ['lookingNo', 'No']]); choose('willingImmediately', [['willingYes', 'Yes'], ['willingNo', 'No']]); choose('fourPs', [['fourPsYes', 'Yes'], ['fourPsNo', 'No']])
  } else {
    // Unknown layouts are deliberately conservative: labelled values only.
    const text = pages.flatMap(page => page.items.map(item => item.text)).join('\n')
    Object.assign(raw, labelled(text))
    for (const page of pages) for (const widget of page.widgets) {
      const field = Object.keys(NSRP_TEXT_FIELDS).find(field => normalize(field) === normalize(widget.name).replace(/[ _-]/g, ''))
      if (field && widget.value) raw[field] = widget.value
    }
    if (Object.keys(raw).length < 2 && text.length < 300) {
      const rendered = await pdf(buffer, { scale: 1.5, docInitParams })
      const ocr = await readOcr(await rendered.getPage(1), (text, confidence) => confidence >= 60 ? labelled(text) : {})
      if (!ocr?.result) Object.assign(raw, ocr)
      await rendered.destroy()
    }
    warnings.push('This layout could only be read partially. Unreadable fields and unconfirmed checkboxes were left blank.')
  }
  const { answers, unreadable } = sanitizeNsrpImport(raw)
  if (unreadable.length) warnings.push('Some values could not be read reliably and were left blank. Check them against the PDF.')
  const found = Object.entries(answers).filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value)).length
  if (!found) error('No completed NSRP details could be read. Try a clearer, typed PDF or enter the basic information manually.')
  return { answers, warnings, method: recognized ? 'standard-form' : 'partial', requiresReview: true }
}
