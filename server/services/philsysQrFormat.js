// TO CONFIRM: PSA's production QR envelope and authorized public-key distribution.
// This adapter accepts a configured EdDSA JWS envelope. Other formats are unavailable,
// never treated as tampering. No production keys or guessed issuer formats are shipped.
export function decodePhilSysEnvelope(raw) {
  if (typeof raw !== 'string' || raw.length > 100000) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (header.alg !== 'EdDSA') return null
    return { header, signed: Buffer.from(parts[0] + '.' + parts[1]), signature: Buffer.from(parts[2], 'base64url'), payload: () => JSON.parse(Buffer.from(parts[1], 'base64url').toString()) }
  } catch { return null }
}
