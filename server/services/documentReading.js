import { PDFDocument } from 'pdf-lib'
import { pdf } from 'pdf-to-img'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { IMAGE_LIMITS } from '../../shared/documentImage.js'
import { readOcr } from './localImageReading.js'

const require = createRequire(import.meta.url)
const fontDirectory = pathToFileURL(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep).href

// Read rendered pages rather than trusting hidden PDF text. OCR text stays
// inside comparison callbacks and is never stored or returned to users.
export async function readDocumentOcr(file, compare, options = {}, reader = readOcr) {
  if (file.mimetype !== 'application/pdf') return reader(Buffer.from(file.data), compare, options)
  let rendered
  try {
    const metadata = await PDFDocument.load(Buffer.from(file.data))
    const pages = metadata.getPages()
    if (!pages.length || pages.length > IMAGE_LIMITS.maxPages) return { result: 'could_not_read' }
    const largestSide = Math.max(...pages.flatMap(page => [page.getWidth(), page.getHeight()]))
    if (!Number.isFinite(largestSide) || largestSide <= 0) return { result: 'could_not_read' }
    rendered = await pdf(Buffer.from(file.data), { scale: Math.min(2, 2200 / largestSide), docInitParams: { standardFontDataUrl: fontDirectory } })
    const texts = [], confidences = []
    for (let index = 1; index <= rendered.length; index++) {
      const page = await reader(await rendered.getPage(index), (text, confidence) => ({ text, confidence }), options)
      if (typeof page.text !== 'string' || !Number.isFinite(page.confidence)) return { result: 'could_not_read' }
      texts.push(page.text)
      confidences.push(page.confidence)
    }
    return await compare(texts.join('\n'), Math.min(...confidences))
  } catch { return { result: 'could_not_read' } }
  finally { await rendered?.destroy() }
}
