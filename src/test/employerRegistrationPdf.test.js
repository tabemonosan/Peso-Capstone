// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { generateEmployerRegistrationPdf } from '../../server/employerRegistrationPdf.js'

describe('employer Form 2 generation', () => {
  it('preserves both pages and fills page two with registration context and certification', async () => {
    const { buffer } = await generateEmployerRegistrationPdf({ companyName: 'Example Works', email: 'hr@example.com', phone: '09171234567', contactName: 'Juan Cruz', representativeName: 'Jamie Cruz', certified: true, details: {} })
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
    try {
      const document = await task.promise
      expect(document.numPages).toBe(2)
      const page = await document.getPage(2)
      const text = (await page.getTextContent()).items.map((item) => item.str).join(' ')
      expect(text).toContain('Submit vacancy and qualification details separately in Job Postings.')
      expect(text).toContain('Jamie Cruz')
      expect(text).toContain('CERTIFICATION/AUTHORIZATION')
      expect(text).toContain('FOR USE OF PESO ONLY')
    } finally { await task.destroy() }
  })
})
