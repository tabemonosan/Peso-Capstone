// @vitest-environment node
import { it, expect, vi } from 'vitest'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { inspectDocument } from '../services/imageQuality.js'
import { readQr, readOcr } from '../services/localImageReading.js'
import { qrSummary, validateDeclaredDetails, PHILSYS_TYPE } from '../../shared/documentImage.js'
const file = buffer => ({ buffer, mimetype: 'image/png', originalname: 'demo.png' })
async function normal() {
  const pixels = Buffer.alloc(800 * 500 * 3)
  for (let i = 0; i < pixels.length; i++) pixels[i] = ((i * 31) ^ (i >> 7)) % 220 + 15
  return sharp(pixels, { raw: { width: 800, height: 500, channels: 3 } }).png().toBuffer()
}
it('rejects undecodable, tiny and blank images with a field-safe 422', async () => {
  for (const buffer of [Buffer.from('not an image'), await sharp({ create: { width: 80, height: 50, channels: 3, background: 'white' } }).png().toBuffer(), await sharp({ create: { width: 800, height: 500, channels: 3, background: 'white' } }).png().toBuffer()]) await expect(inspectDocument(file(buffer))).rejects.toMatchObject({ status: 422 })
})
it('allows dark and blurry photos with warnings and accepts a normal photo', async () => {
  const normalFile = file(await normal())
  expect((await inspectDocument(normalFile)).passed).toBe(true)
  const dark = file(await sharp(await normal()).linear(0.15).png().toBuffer())
  expect((await inspectDocument(dark)).warnings).toContain('dark')
  const blurry = file(await sharp(Buffer.from('<svg width="800" height="500"><rect width="800" height="500" fill="white"/><rect x="80" y="80" width="600" height="40" fill="gray"/><rect x="80" y="220" width="500" height="40" fill="gray"/></svg>')).blur(15).png().toBuffer())
  const result = await inspectDocument(blurry)
  expect(result.warnings).toContain('blur')
})
it('does not mistake an alpha channel for blur in a clear PNG', async () => {
  const source = await normal()
  const opaque = await sharp(source).removeAlpha().png().toBuffer()
  const withAlpha = await sharp(source).ensureAlpha().png().toBuffer()
  expect((await sharp(withAlpha).metadata()).hasAlpha).toBe(true)
  const opaqueResult = await inspectDocument(file(opaque))
  const alphaResult = await inspectDocument(file(withAlpha))
  expect(opaqueResult.warnings).not.toContain('blur')
  expect(alphaResult.warnings).toEqual(opaqueResult.warnings)
})
it('autorotates EXIF images and strips metadata', async () => {
  const input = file(await sharp(await normal()).jpeg().withMetadata({ orientation: 6 }).toBuffer())
  const result = await inspectDocument(input)
  expect(result).toMatchObject({ width: 500, height: 800 })
  expect((await sharp(input.buffer).metadata()).orientation).toBeUndefined()
  expect((await sharp(input.buffer).metadata()).exif).toBeUndefined()
})
it('rejects malformed PDFs and PDFs over five pages', async () => {
  const pdf = await PDFDocument.create(); for (let i = 0; i < 6; i++) pdf.addPage()
  for (const buffer of [Buffer.from('%PDF-invalid'), Buffer.from(await pdf.save())]) await expect(inspectDocument({ ...file(buffer), mimetype: 'application/pdf' })).rejects.toMatchObject({ status: 422 })
})
it('accepts uploads without ID number or expiry, rejects matching supplied IDs and never collects a National ID number', () => {
  expect(validateDeclaredDetails({}, { idType: 'Passport', docKey: 'validId1' }).errors).toEqual({})
  expect(validateDeclaredDetails({}, { idType: 'SSS', docKey: 'validId1' }).errors).toEqual({})
  expect(validateDeclaredDetails({ number: '1234' }, { idType: 'SSS', otherNumber: '12-34' }).errors.number).toBeTruthy()
  const result = validateDeclaredDetails({ number: 'secret', format: 'Digital screenshot' }, { idType: PHILSYS_TYPE })
  expect(result.errors.number).toBeTruthy(); expect(result.details.number).toBeUndefined(); expect(result.warnings).toContain('national_id_screenshot')
})
it('handles QR domains without fetching URLs, including lookalikes and credentials', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
  try {
    expect(qrSummary('https://e-cert.psahelpline.ph/verify?code=secret')).toEqual({ found: true, domain: 'e-cert.psahelpline.ph', allowlisted: true })
    for (const url of ['https://psa.gov.ph.evil.example', 'https://user:secret@psa.gov.ph', 'http://psa.gov.ph', 'not a URL']) expect(qrSummary(url).allowlisted).toBe(false)
    expect(await readQr(await normal())).toMatchObject({ found: false })
    expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
it('reads OCR with locally bundled English data and returns comparison results only', async () => {
  const buffer = await sharp(Buffer.from('<svg width="900" height="400"><rect width="100%" height="100%" fill="white"/><text x="40" y="160" font-size="65" fill="black">JUAN CRUZ</text></svg>')).png().toBuffer()
  const result = await readOcr(buffer, text => ({ result: /JUAN/i.test(text) ? 'match' : 'could_not_read' }))
  expect(result).toEqual({ result: 'match' })
  expect(JSON.stringify(result)).not.toContain('JUAN')
}, 30000)
