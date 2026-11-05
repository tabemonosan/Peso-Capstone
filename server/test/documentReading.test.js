// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readDocumentOcr } from '../services/documentReading.js'
import { compareDate, extractDocumentFields } from '../../shared/crossChecks.js'

async function document(pages = 1) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792])
    page.drawText('SAMPLE - NOT VALID', { x: 35, y: 720, size: 24, font })
    page.drawText('Date of birth: 2005-01-11', { x: 35, y: 640, size: 20, font })
  }
  return { mimetype: 'application/pdf', data: await doc.save() }
}

it('renders a PDF and compares the visible birth date using local OCR', async () => {
  const result = await readDocumentOcr(await document(), text => ({ result: compareDate(extractDocumentFields(text).dob, '2005-01-11') }))
  expect(result).toEqual({ result: 'match' })
  expect(JSON.stringify(result)).not.toContain('2005')
}, 30000)

it('combines bounded pages and uses the least confident page', async () => {
  const reader = vi.fn()
    .mockImplementationOnce(async (_bytes, compare) => compare('First name: Sample', 95))
    .mockImplementationOnce(async (_bytes, compare) => compare('Date of birth: 2005-01-11', 45))
  const compare = vi.fn((text, confidence) => ({ fields: extractDocumentFields(text), confidence }))
  const reserve = vi.fn()
  const result = await readDocumentOcr(await document(2), compare, { reserve }, reader)
  expect(result).toMatchObject({ fields: { firstName: 'Sample', dob: '2005-01-11' }, confidence: 45 })
  expect(reader).toHaveBeenCalledTimes(2)
  expect(reader.mock.calls[0][2]).toEqual({ reserve })
})

it('keeps invalid, over-limit and unavailable reads inconclusive', async () => {
  const reader = vi.fn(async () => ({ result: 'could_not_read' }))
  const compare = vi.fn()
  expect(await readDocumentOcr({ mimetype: 'application/pdf', data: Buffer.from('broken') }, compare, {}, reader)).toEqual({ result: 'could_not_read' })
  expect(await readDocumentOcr(await document(6), compare, {}, reader)).toEqual({ result: 'could_not_read' })
  expect(reader).not.toHaveBeenCalled()
  expect(await readDocumentOcr(await document(), compare, {}, reader)).toEqual({ result: 'could_not_read' })
  expect(compare).not.toHaveBeenCalled()
})
