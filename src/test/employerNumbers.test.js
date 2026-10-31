import { describe, expect, it } from 'vitest'
import { digits, mobileInput, validMobile, normalizeMobile, validLandline } from '../../shared/employerNumbers.js'
import { normalizeEmployerRegistrationDetails } from '../../server/employerRegistrationPdf.js'

describe('employer registration number limits', () => {
  it('limits numeric inputs and preserves the international mobile prefix', () => {
    expect(digits('123-456-789-012-345', 12)).toBe('123456789012')
    expect(digits('052-12345678901234567', 15)).toHaveLength(15)
    expect(mobileInput('+63 917 123 4567')).toBe('+639171234567')
    expect(mobileInput('0917123456789')).toBe('09171234567')
  })
  it('accepts only complete Philippine mobile numbers in either format', () => {
    for (const value of ['09171234567', '+639171234567']) expect(validMobile(value)).toBe(true)
    for (const value of ['08171234567', '12345678901', '+631234567890', '0917123456', '+6391712345678']) expect(validMobile(value)).toBe(false)
    expect(normalizeMobile('+639171234567')).toBe('09171234567')
  })
  it('validates telephone/fax lengths on the server including formatted numbers', () => {
    expect(validLandline('052-123-4567')).toBe(true)
    expect(validLandline('')).toBe(true)
    for (const value of ['123456', '1'.repeat(16), 'phone number']) {
      expect(validLandline(value)).toBe(false)
      expect(normalizeEmployerRegistrationDetails({ telephone: value }).fieldErrors).toHaveProperty('telephone')
      expect(normalizeEmployerRegistrationDetails({ fax: value }).fieldErrors).toHaveProperty('fax')
    }
  })
})
