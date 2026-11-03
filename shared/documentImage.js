export const IMAGE_LIMITS = Object.freeze({ minWidth: 600, minHeight: 380, maxPages: 5, maxPixels: 20000000, blankDeviation: 2, darkMean: 45, glareMean: 245, blurDeviation: 8, qrTimeout: 2000, ocrTimeout: 20000, ocrDailyCap: 200, ocrConcurrency: 1 })
export const PHILSYS_TYPE = 'PhilSys National ID'
export const PHILSYS_FORMATS = ['Card', 'Paper (ePhilID)', 'Digital screenshot']
export const BIRTH_COPY_TYPES = ['PSA e-Certificate', 'PSA copy on security paper']
// TO CONFIRM for every issuer workflow before enabling an external verification link.
export const QR_DOMAINS = ['psahelpline.ph', 'psa.gov.ph', 'philsys.gov.ph']
export function allowedQrDomain(domain) { return QR_DOMAINS.some(base => domain === base || domain.endsWith('.' + base)) }
export function qrSummary(text) {
  try { const url = new URL(text); return { found: true, domain: url.hostname.toLowerCase(), allowlisted: url.protocol === 'https:' && !url.username && !url.password && allowedQrDomain(url.hostname.toLowerCase()) } }
  catch { return { found: Boolean(text), domain: null, allowlisted: false } }
}
export function validateDeclaredDetails(input = {}, { docKey, idType, otherNumber, today = new Date().toISOString().slice(0, 10) } = {}) {
  const errors = {}, warnings = [], details = {}
  if (docKey === 'birthCertificate') {
    if (!BIRTH_COPY_TYPES.includes(input.copyType)) errors.copyType = 'Select the birth certificate copy type.'
    details.copyType = input.copyType
    if (input.copyType === BIRTH_COPY_TYPES[0]) details.referenceNumber = String(input.referenceNumber || '').trim().slice(0, 100)
  } else {
    details.idType = idType
    if (idType === PHILSYS_TYPE) {
      if (input.number) errors.number = 'Do not enter a PhilSys or card number.'
      if (!PHILSYS_FORMATS.includes(input.format)) errors.format = 'Select the National ID format.'
      details.format = input.format
      if (input.format === 'Digital screenshot') warnings.push('national_id_screenshot')
    } else {
      details.number = String(input.number || '').replace(/[\s-]/g, '').toUpperCase().slice(0, 40)
      if (!details.number) errors.number = 'Enter the ID number.'
      if (details.number && otherNumber && details.number === String(otherNumber).replace(/[\s-]/g, '').toUpperCase()) errors.number = 'Use a different ID number for each ID.'
      const lengths = { SSS: [10], Passport: [9], PRC: [7], 'Pag-IBIG': [12], UMID: [12], "Voter's ID": [16], 'Philippine Postal ID': [12] }
      if (details.number && lengths[idType] && !lengths[idType].includes(details.number.length)) warnings.push('id_number_format')
      details.expiry = String(input.expiry || '').slice(0, 10)
      if (idType === 'Passport' && !/^\d{4}-\d{2}-\d{2}$/.test(details.expiry)) errors.expiry = 'Enter the passport expiry date.'
      if (details.expiry && details.expiry < today) warnings.push('id_expired')
    }
  }
  return { details, errors, warnings }
}
