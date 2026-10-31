export const TIN_ERROR = 'Enter a TIN with 9 or 12 digits.'
export const MOBILE_ERROR = 'Enter 09 followed by 9 digits, or +639 followed by 9 digits.'
export const LANDLINE_ERROR = 'Enter 7 to 15 digits, including the area or country code.'
export const digits = (value, limit) => String(value || '').replace(/\D/g, '').slice(0, limit)
export const mobileInput = (value) => String(value || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '').slice(0, String(value || '').startsWith('+') ? 13 : 11)
export const validMobile = (value) => /^(?:09\d{9}|\+639\d{9})$/.test(String(value || ''))
export const normalizeMobile = (value) => String(value || '').startsWith('+63') ? `0${String(value).slice(3)}` : String(value || '')
export const validLandline = (value) => !value || /^[\d\s()+-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, ''))
