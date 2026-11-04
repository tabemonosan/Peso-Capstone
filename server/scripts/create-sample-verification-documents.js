import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { pdf } from 'pdf-to-img'

const output = new URL('../../docs/sample-verification-documents/', import.meta.url)
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
  text('CAPSTONE TEST FIXTURE / FICTIONAL RECORD', 26, height - 80, 11, true)
  text(title, 26, height - 115, 23, true)
  let y = height - 153
  for (const [label, value] of fields) {
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
  text('All personal details are invented. This is not an official document.', 26, 26, 9)
  const bytes = await doc.save()
  await writeFile(new URL(`${name}.pdf`, output), bytes)
  const rendered = await pdf(Buffer.from(bytes), { scale: 2 })
  await writeFile(new URL(`${name}.png`, output), await rendered.getPage(1))
  // Reload the generated PDF to confirm it is a readable one-page upload.
  if ((await PDFDocument.load(bytes)).getPageCount() !== 1) throw new Error(`Invalid fixture: ${name}`)
  console.log(`Created ${name}.pdf and ${name}.png (${bytes.length} PDF bytes)`)
}

if (process.argv.includes('--second-set')) {
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
