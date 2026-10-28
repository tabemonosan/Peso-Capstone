// Server-side validation for applicant NSRP signatures and certification.
// Signatures arrive as data URLs (drawn PNG or uploaded PNG/JPG) inside the
// JSON answers payload and are validated by magic bytes, never by extension.

export const NSRP_SIGNATURE_MAX_BYTES = 1024 * 1024 // 1 MB

const DATA_URL_RE = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/

export class SignatureValidationError extends Error {
  constructor(message) {
    super(message)
    this.code = 'INVALID_SIGNATURE'
  }
}

const isPng = (buffer) => buffer.length > 4
  && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
const isJpg = (buffer) => buffer.length > 3
  && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff

// Returns null when no signature was provided; throws SignatureValidationError
// for invalid input. Never trusts the declared MIME type.
export function parseSignatureImage(input) {
  if (input === undefined || input === null || input === '') return null
  if (typeof input !== 'string') throw new SignatureValidationError('Signature must be an image.')
  const match = DATA_URL_RE.exec(input.trim())
  if (!match) throw new SignatureValidationError('Signature must be a PNG or JPG image.')
  let bytes
  try {
    bytes = Buffer.from(match[2], 'base64')
  } catch {
    throw new SignatureValidationError('Signature image could not be read.')
  }
  if (!bytes.length) throw new SignatureValidationError('Signature image is empty.')
  if (bytes.length > NSRP_SIGNATURE_MAX_BYTES) {
    throw new SignatureValidationError('Signature image must be 1 MB or smaller.')
  }
  if (isPng(bytes)) return { bytes, mimetype: 'image/png' }
  if (isJpg(bytes)) return { bytes, mimetype: 'image/jpeg' }
  throw new SignatureValidationError('Signature must be a PNG or JPG image.')
}

const toDateInputValue = (date) => date.toISOString().slice(0, 10) // yyyy-mm-dd

// The certification date and timestamp are stamped by the server at the moment
// of generation/confirmation; any client-supplied date is ignored. A signature
// is only valid together with the certification consent.
export function resolveCertification({ certified, signature }, now = new Date()) {
  const isCertified = certified === true || certified === 'true'
  if (signature && !isCertified) {
    throw new SignatureValidationError('Please certify that your information is true and correct before adding a signature.')
  }
  return {
    certified: isCertified,
    certificationDate: isCertified ? toDateInputValue(now) : '',
    certifiedAt: isCertified ? now : null,
  }
}
