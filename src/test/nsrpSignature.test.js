// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import {
  parseSignatureImage, resolveCertification, SignatureValidationError, NSRP_SIGNATURE_MAX_BYTES,
} from '../../server/nsrpSignature.js'

const makePngDataUrl = (width = 4, height = 4) => {
  const png = new PNG({ width, height })
  png.data.fill(255)
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}
// Minimal JPEG: SOI + APP0 marker is enough for magic-byte validation
const makeJpgDataUrl = () => `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64')}`

describe('parseSignatureImage', () => {
  it('accepts a valid PNG data URL', () => {
    const result = parseSignatureImage(makePngDataUrl())
    expect(result.mimetype).toBe('image/png')
    expect(result.bytes.length).toBeGreaterThan(0)
  })

  it('accepts a valid JPG data URL', () => {
    const result = parseSignatureImage(makeJpgDataUrl())
    expect(result.mimetype).toBe('image/jpeg')
  })

  it('returns null when no signature is provided', () => {
    expect(parseSignatureImage(undefined)).toBeNull()
    expect(parseSignatureImage('')).toBeNull()
  })

  it('rejects a non-image payload even with an image MIME type declared', () => {
    const fake = `data:image/png;base64,${Buffer.from('this is not an image').toString('base64')}`
    expect(() => parseSignatureImage(fake)).toThrow(SignatureValidationError)
  })

  it('rejects wrong types (e.g. GIF bytes)', () => {
    const gif = `data:image/gif;base64,${Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).toString('base64')}`
    expect(() => parseSignatureImage(gif)).toThrow(/PNG or JPG/)
  })

  it('rejects files over 1 MB', () => {
    const big = Buffer.alloc(NSRP_SIGNATURE_MAX_BYTES + 1)
    big[0] = 0x89; big[1] = 0x50; big[2] = 0x4e; big[3] = 0x47 // PNG magic
    const dataUrl = `data:image/png;base64,${big.toString('base64')}`
    expect(() => parseSignatureImage(dataUrl)).toThrow(/1 MB/)
  })

  it('rejects non-string and malformed input', () => {
    expect(() => parseSignatureImage(123)).toThrow(SignatureValidationError)
    expect(() => parseSignatureImage('not-a-data-url')).toThrow(SignatureValidationError)
  })
})

describe('resolveCertification', () => {
  it('stamps the date (yyyy-mm-dd) and timestamp from the server clock', () => {
    const now = new Date('2026-10-28T12:00:00.000Z')
    const result = resolveCertification({ certified: true, signature: null }, now)
    expect(result.certificationDate).toBe('2026-10-28')
    expect(result.certifiedAt).toBe(now)
  })

  it('ignores any client-supplied date — it cannot be set by the client', () => {
    const now = new Date('2026-10-28T12:00:00.000Z')
    const result = resolveCertification({ certified: true, signature: null, certificationDate: '1999-01-01' }, now)
    expect(result.certificationDate).toBe('2026-10-28')
  })

  it('requires certification when a signature is present', () => {
    expect(() => resolveCertification({ certified: false, signature: { bytes: Buffer.from([1]) } })).toThrow(SignatureValidationError)
  })

  it('produces no date when not certified', () => {
    const result = resolveCertification({ certified: false, signature: null })
    expect(result.certified).toBe(false)
    expect(result.certificationDate).toBe('')
    expect(result.certifiedAt).toBeNull()
  })
})
