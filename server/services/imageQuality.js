import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { IMAGE_LIMITS } from '../../shared/documentImage.js'
export class DocumentImageError extends Error { constructor(message) { super(message); this.status = 422 } }
export async function inspectDocument(file) {
  if (file.mimetype === 'application/pdf') {
    try {
      const pdf = await PDFDocument.load(file.buffer, { ignoreEncryption: false })
      if (!pdf.getPageCount() || pdf.getPageCount() > IMAGE_LIMITS.maxPages) throw new Error('pages')
      return { passed: true, pages: pdf.getPageCount(), warnings: ['pdf_manual_reading'] }
    } catch { throw new DocumentImageError('Upload a readable PDF with at most 5 pages.') }
  }
  try {
    const image = sharp(file.buffer, { limitInputPixels: IMAGE_LIMITS.maxPixels, failOn: 'error' }).rotate()
    const { data, info } = await image.clone().raw().toBuffer({ resolveWithObject: true })
    if (Math.max(info.width, info.height) < IMAGE_LIMITS.minWidth || Math.min(info.width, info.height) < IMAGE_LIMITS.minHeight) throw new DocumentImageError('Upload an image at least 600 × 380 pixels.')
    const stats = await sharp(data, { raw: info }).stats()
    const mean = stats.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / 3
    const deviation = stats.channels.slice(0, 3).reduce((s, c) => s + c.stdev, 0) / 3
    if (deviation < IMAGE_LIMITS.blankDeviation) throw new DocumentImageError('The image appears blank. Please take another photo.')
    const warnings = []
    if (mean < IMAGE_LIMITS.darkMean) warnings.push('dark')
    if (mean > IMAGE_LIMITS.glareMean) warnings.push('glare')
    // Convolving RGBA also convolves alpha. A zero-sum edge kernel makes
    // constant alpha zero, erasing visible edges in otherwise clear PNGs.
    // Materialize opaque grayscale pixels before calculating edge contrast.
    const grayscale = await image.clone().flatten({ background: '#ffffff' }).removeAlpha().resize({ width: 600 }).greyscale().raw().toBuffer({ resolveWithObject: true })
    const edgePixels = await sharp(grayscale.data, { raw: grayscale.info }).convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], scale: 1 }).raw().toBuffer({ resolveWithObject: true })
    const edges = await sharp(edgePixels.data, { raw: edgePixels.info }).stats()
    if (edges.channels[0].stdev < IMAGE_LIMITS.blurDeviation) warnings.push('blur')
    if (info.width / info.height > 5 || info.height / info.width > 5) warnings.push('crop')
    // Sharp autorotates and strips EXIF/GPS because metadata is not copied.
    file.buffer = await image.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()
    file.size = file.buffer.length; file.mimetype = 'image/jpeg'; file.originalname = file.originalname.replace(/\.[^.]+$/, '.jpg')
    return { passed: true, width: info.width, height: info.height, warnings }
  } catch (error) {
    if (error instanceof DocumentImageError) throw error
    throw new DocumentImageError('The image could not be opened. Please upload another photo.')
  }
}
