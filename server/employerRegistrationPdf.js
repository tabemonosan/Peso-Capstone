import fs from 'fs/promises'
import path from 'path'
import { validLandline, LANDLINE_ERROR } from '../shared/employerNumbers.js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'NSRP-Form-2-Employer-Reg-Form.pdf')
const INK = rgb(0, 0, 0)
const EMPLOYER_TYPES = [
  'Government',
  'Private',
  'Recruitment & Placement Agency (Local)',
  'Licensed Recruitment Agency (Overseas)',
  'DO 174-17, Subcontractor',
]
const WORKFORCE_SIZES = ['Micro (1-9)', 'Small (10-99)', 'Medium (100-199)', 'Large (200 and up)']
const CONTACT_TITLES = ['Mr.', 'Ms.', 'Miss', 'Others']

const textValue = (value) => String(value ?? '').trim().replace(/\s+/g, ' ') || 'NA'

export function normalizeEmployerRegistrationDetails(input) {
  const keys = [
    'acronym', 'taxIdentificationNumber', 'employerType', 'workforceSize', 'lineOfBusiness',
    'address', 'barangay', 'cityMunicipality', 'province', 'contactTitle', 'otherContactTitle',
    'contactPosition', 'telephone', 'fax',
  ]
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Complete the establishment and contact details' }
  }
  if (keys.some((key) => input[key] !== undefined && typeof input[key] !== 'string')) {
    return { error: 'Employer registration details must be text' }
  }
  const details = Object.fromEntries(keys.map((key) => [key, String(input[key] || '').trim()]))
  for (const key of ['telephone', 'fax']) {
    if (!validLandline(details[key])) return { error: LANDLINE_ERROR, fieldErrors: { [key]: LANDLINE_ERROR } }
    details[key] = details[key].replace(/\D/g, '')
  }
  if (Object.values(details).some((value) => value.length > 200)) {
    return { error: 'Employer registration fields must be 200 characters or fewer' }
  }
  if (details.taxIdentificationNumber) {
    if (!/^[\d\s-]+$/.test(details.taxIdentificationNumber)) {
      return {
        error: 'Enter a TIN with 9 or 12 digits.',
        fieldErrors: { taxIdentificationNumber: 'Enter a TIN with 9 or 12 digits.' },
      }
    }
    details.taxIdentificationNumber = details.taxIdentificationNumber.replace(/\D/g, '')
    if (![9, 12].includes(details.taxIdentificationNumber.length)) {
      return {
        error: 'Enter a TIN with 9 or 12 digits.',
        fieldErrors: { taxIdentificationNumber: 'Enter a TIN with 9 or 12 digits.' },
      }
    }
  }
  if (!EMPLOYER_TYPES.includes(details.employerType) || !WORKFORCE_SIZES.includes(details.workforceSize)
    || !CONTACT_TITLES.includes(details.contactTitle) || !details.lineOfBusiness
    || !details.barangay || !details.cityMunicipality || !details.contactPosition
    || (details.contactTitle === 'Others' && !details.otherContactTitle)) {
    return { error: 'Complete all required establishment and contact details' }
  }
  return { details }
}

function drawValue(page, font, value, x, y, maxWidth, initialSize = 9, warnings = [], field = "formField", step = "establishment") {
  const text = textValue(value)
  let size = initialSize
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5
  let fittedText = text
  if (font.widthOfTextAtSize(fittedText, size) > maxWidth) {
    while (fittedText.length > 1 && font.widthOfTextAtSize(`${fittedText}...`, size) > maxWidth) {
      fittedText = fittedText.slice(0, -1)
    }
    fittedText = `${fittedText}...`
    warnings.push({ field, label: field, step, reason: "truncated" })
  } else if (size < initialSize) {
    warnings.push({ field, label: field, step, reason: "minimum-font-size" })
  }
  page.drawText(fittedText, { x, y, size, font, color: INK })
}

function drawSelection(page, font, selected, options) {
  const option = options.find(({ value }) => value === selected)
  if (option) page.drawText('X', { x: option.x + 1, y: option.y, size: 8, font, color: INK })
}

export async function generateEmployerRegistrationPdf({
  companyName,
  email,
  phone,
  contactName,
  details,
  representativeName = contactName,
  certified = false,
  signatureImage = null,
}) {
  const pdf = await PDFDocument.load(await fs.readFile(TEMPLATE_PATH))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const [page, certificationPage] = pdf.getPages()
  const info = details || {}
  const warnings = []

  drawValue(page, font, companyName, 138, 620, 410, 9, warnings, "companyName", "establishment")
  drawValue(page, font, info.acronym, 149, 599, 400, 9, warnings, "acronym", "establishment")
  drawValue(page, font, info.taxIdentificationNumber, 164, 577, 385, 9, warnings, "taxIdentificationNumber", "establishment")
  drawSelection(page, font, info.employerType, [
    { value: 'Government', x: 125.8, y: 557.9 },
    { value: 'Private', x: 340.9, y: 557.9 },
    { value: 'Recruitment & Placement Agency (Local)', x: 125.8, y: 544.5 },
    { value: 'Licensed Recruitment Agency (Overseas)', x: 339.5, y: 544.5 },
    { value: 'DO 174-17, Subcontractor', x: 126, y: 531 },
  ])
  drawSelection(page, font, info.workforceSize, [
    { value: 'Micro (1-9)', x: 130.4, y: 510.1 },
    { value: 'Small (10-99)', x: 216.8, y: 510.1 },
    { value: 'Medium (100-199)', x: 312.4, y: 510.1 },
    { value: 'Large (200 and up)', x: 427.6, y: 510.1 },
  ])
  drawValue(page, font, info.lineOfBusiness, 235, 486, 310, 9, warnings, "lineOfBusiness", "establishment")
  drawValue(page, font, info.address, 81, 463, 465, 9, warnings, "street", "address")
  drawValue(page, font, info.barangay, 84, 446, 462, 9, warnings, "barangay", "address")
  drawValue(page, font, info.cityMunicipality, 122, 424, 424, 9, warnings, "municipality", "address")
  drawValue(page, font, info.province, 83, 402, 463, 9, warnings, "province", "address")
  drawSelection(page, font, info.contactTitle, [
    { value: 'Mr.', x: 69.6, y: 374.5 },
    { value: 'Ms.', x: 117.1, y: 374.5 },
    { value: 'Miss', x: 160, y: 374.5 },
    { value: 'Others', x: 207.2, y: 374.5 },
  ])
  if (info.contactTitle === 'Others') drawValue(page, font, info.otherContactTitle, 325, 374, 120, 9, warnings, "otherTitle", "contact")
  drawValue(page, font, contactName, 166, 351, 380, 9, warnings, "contactName", "contact")
  drawValue(page, font, info.contactPosition, 82, 329, 464, 9, warnings, "position", "contact")
  drawValue(page, font, info.telephone, 108, 308, 438, 9, warnings, "telephone", "contact")
  drawValue(page, font, phone, 90, 286, 456, 9, warnings, "mobile", "contact")
  drawValue(page, font, info.fax, 76, 264, 470, 9, warnings, "fax", "contact")
  drawValue(page, font, email, 108, 242, 438, 9, warnings, "email", "contact")

  drawValue(certificationPage, font, representativeName, 82, 168, 220, 8, warnings, "representative", "certification")
  // Registration does not create a vacancy. Make this explicit on the original
  // form's vacancy page instead of leaving its sections apparently unfinished.
  certificationPage.drawText('N/A - Submit vacancy and qualification details separately in Job Postings.', { x: 40, y: 807, size: 8, font, color: INK })
  certificationPage.drawText('N/A - No vacancy is created during account registration.', { x: 40, y: 550, size: 8, font, color: INK })
  certificationPage.drawText('Work type and qualification selections apply when a job is posted.', { x: 40, y: 293, size: 8, font, color: INK })
  for (const [x, y] of [[115, 771], [40, 735], [390, 687], [350, 667], [390, 646], [195, 608], [360, 608], [145, 456], [370, 456], [90, 437], [350, 437], [110, 420], [480, 420], [155, 390], [200, 332], [200, 313]]) {
    certificationPage.drawText('N/A', { x, y, size: 8, font, color: INK })
  }
  const certificationDate = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })
  drawValue(certificationPage, font, certificationDate, 398, 168, 118, 8, warnings, "certificationDate", "certification")
  if (certified) certificationPage.drawText('X', { x: 65, y: 170, size: 8, font, color: INK })
  if (signatureImage) {
    const image = signatureImage.mimetype === 'image/png'
      ? await pdf.embedPng(signatureImage.bytes)
      : await pdf.embedJpg(signatureImage.bytes)
    const scale = Math.min(170 / image.width, 27 / image.height)
    certificationPage.drawImage(image, { x: 90, y: 174, width: image.width * scale, height: image.height * scale })
  }

  return { buffer: Buffer.from(await pdf.save()), warnings }
}
