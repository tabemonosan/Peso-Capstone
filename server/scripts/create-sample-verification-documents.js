import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { pdf } from 'pdf-to-img'

const dionedaSet = process.argv.includes('--nsrp-dioneda')
const output = new URL(`../../docs/sample-verification-documents/${dionedaSet ? 'dioneda/' : ''}`, import.meta.url)
await mkdir(output, { recursive: true })
const ink = rgb(0.12, 0.20, 0.29)
const red = rgb(0.72, 0.12, 0.12)

async function document(name, width, height, title, fields, back = false) {
  const doc = await PDFDocument.create()
  doc.setTitle(`${title} - fictional testing fixture`)
  doc.setSubject('SAMPLE - NOT VALID. No government issuer, seal, signature or verification code.')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([width, height])
  const text = (value, x, y, size = 12, heavy = false, color = ink) => page.drawText(value, { x, y, size, font: heavy ? bold : font, color })
  page.drawRectangle({ x: 0, y: height - 54, width, height: 54, color: ink })
  text('SAMPLE - NOT VALID', 26, height - 34, 23, true, rgb(1, 1, 1))
  text(dionedaSet ? 'CAPSTONE TEST FIXTURE / NSRP COMPARISON' : 'CAPSTONE TEST FIXTURE / FICTIONAL RECORD', 26, height - 80, 11, true)
  text(title, 26, height - 115, 23, true)
  let y = height - 153
  for (const [label, value] of fields) {
    if (dionedaSet) {
      text(`${label}: ${value}`, 26, y, 13)
      y -= 48
      continue
    }
    text(label.toUpperCase(), 26, y, 9, true)
    text(value, 26, y - 20, 15)
    y -= 56
  }
  if (back) {
    text('No QR code, barcode, official seal or signature.', 26, y - 3, 11)
    text('This sample cannot verify identity or citizenship.', 26, y - 25, 11)
  }
  page.drawLine({ start: { x: 26, y: 65 }, end: { x: width - 26, y: 65 }, color: red, thickness: 2 })
  text('FOR SOFTWARE TESTING ONLY', 26, 43, 12, true, red)
  text(dionedaSet ? 'Details copied from supplied NSRP. This is not an official document.' : 'All personal details are invented. This is not an official document.', 26, 26, 9)
  const bytes = await doc.save()
  await writeFile(new URL(`${name}.pdf`, output), bytes)
  const rendered = await pdf(Buffer.from(bytes), { scale: 2 })
  await writeFile(new URL(`${name}.png`, output), await rendered.getPage(1))
  // Reload the generated PDF to confirm it is a readable one-page upload.
  if ((await PDFDocument.load(bytes)).getPageCount() !== 1) throw new Error(`Invalid fixture: ${name}`)
  console.log(`Created ${name}.pdf and ${name}.png (${bytes.length} PDF bytes)`)
}

if (dionedaSet) {
const identity = [
  ['Surname', 'Dioneda'],
  ['First name', 'Eliseo'],
  ['Middle name', 'Dajac'],
  ['Suffix', 'III'],
  ['Date of birth', '2003-06-11'],
  ['Sex', 'Male'],
]
await document('sample-birth-certificate-dioneda', 612, 792, 'CERTIFICATE OF LIVE BIRTH', [
  ['Reference number', 'TEST-BIRTH-DIONEDA-0001'],
  ...identity,
  ['Place of birth', 'NAGOTGOT, MANTIO, ALBAY'],
  ['Record status', 'Test fixture - no civil registry entry'],
])
await document('sample-id-front-dioneda', 640, 720, 'IDENTIFICATION CARD - FRONT', [
  ['Test ID type', 'Philippine Postal ID (test placeholder)'],
  ...identity,
  ['ID number', '000000000003'],
  ['Expiry date', 'December 31, 2030'],
])
await document('sample-id-back-dioneda', 640, 480, 'IDENTIFICATION CARD - BACK', [
  ['ID number', '000000000003'],
  ['Address', '258, IT-BA (POB.), MANITO, ALBAY'],
  ['Issuing organization', 'CAPSTONE Test Fixtures (fictional issuer)'],
], true)
await writeFile(new URL('README.md', output), `# Dioneda NSRP comparison fixtures

SAMPLE - NOT VALID. For local upload and OCR comparison testing only.
Identity and address copied from the user-supplied NSRP-Dioneda (2).pdf.
Birthplace preserves the source spelling MANTIO; present address says MANITO.
The source email is dionedaeliseo@gmail.com, not the requested account email dionedaeliseo2@gmail.com.
Parents' names are omitted because they are not provided in the NSRP.
Reference number, ID type, ID number and expiry are invented test values.
No official issuer, seals, signatures, QR codes or barcodes are included.

Upload either PDF or PNG per slot:
- sample-birth-certificate-dioneda: birth certificate.
- sample-id-front-dioneda: Valid ID front.
- sample-id-back-dioneda: back of the SAME Valid ID.

Test selectors: Philippine Postal ID; number 000000000003; expiry 2030-12-31.
Matching identity: Eliseo Dajac Dioneda III; DOB 2003-06-11; Male.
These files test field comparisons, not document authenticity or guaranteed approval.
No account or verification settings were changed.

Regenerate: node server/scripts/create-sample-verification-documents.js --nsrp-dioneda
`)
} else if (process.argv.includes('--second-set')) {
await document('sample-birth-certificate-2', 612, 792, 'CERTIFICATE OF LIVE BIRTH', [
  ['Reference number', 'TEST-BIRTH-2026-0002'],
  ['Full name', 'Ana Isabel Santos'],
  ['Date of birth', 'March 22, 2001'],
  ['Sex', 'Female'],
  ['Place of birth', 'Sample City, Philippines'],
  ["Mother's maiden name", 'Elena Ramos Garcia'],
  ["Father's name", 'Luis Mendoza Santos'],
  ['Record status', 'Fictional sample - no civil registry entry'],
])
await document('sample-id-front-2', 640, 480, 'IDENTIFICATION CARD - FRONT', [
  ['Test ID type', 'Philippine Postal ID (test placeholder)'],
  ['Full name', 'Ana Isabel Santos'],
  ['Date of birth / sex', 'March 22, 2001 / Female'],
  ['ID number / expiry', '000000000002 / December 31, 2030'],
])
await document('sample-id-back-2', 640, 480, 'IDENTIFICATION CARD - BACK', [
  ['Test ID number', '000000000002'],
  ['Address', '456 Demo Street, Sample City, Philippines'],
  ['Issuing organization', 'CAPSTONE Test Fixtures (fictional issuer)'],
], true)
} else {
await document('sample-birth-certificate', 612, 792, 'CERTIFICATE OF LIVE BIRTH', [
  ['Reference number', 'TEST-BIRTH-2026-0001'],
  ['Full name', 'Juan Miguel Dela Cruz'],
  ['Date of birth', 'January 15, 2000'],
  ['Sex', 'Male'],
  ['Place of birth', 'Sample City, Philippines'],
  ["Mother's maiden name", 'Maria Santos Reyes'],
  ["Father's name", 'Pedro Garcia Dela Cruz'],
  ['Record status', 'Fictional sample - no civil registry entry'],
])
await document('sample-id-front', 640, 480, 'IDENTIFICATION CARD - FRONT', [
  ['Test ID type', 'Philippine Postal ID (test placeholder)'],
  ['Full name', 'Juan Miguel Dela Cruz'],
  ['Date of birth / sex', 'January 15, 2000 / Male'],
  ['ID number / expiry', '000000000001 / December 31, 2030'],
])
await document('sample-id-back', 640, 480, 'IDENTIFICATION CARD - BACK', [
  ['Test ID number', '000000000001'],
  ['Address', '123 Test Street, Sample City, Philippines'],
  ['Issuing organization', 'CAPSTONE Test Fixtures (fictional issuer)'],
], true)
}
console.log(`Files saved to ${fileURLToPath(output)}`)
