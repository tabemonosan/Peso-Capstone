import mongoose from 'mongoose'
import { inspectDocument, DocumentImageError } from './imageQuality.js'
import { validateDeclaredDetails, PHILSYS_TYPE } from '../../shared/documentImage.js'
export function parseDocumentDetails(value) {
  if (!value) return {}
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed }
  catch { throw new DocumentImageError('The declared document details could not be read.') }
}
export async function prepareDocument(file, docKey, idType, details = {}, otherNumber) {
  const validation = validateDeclaredDetails(details, { docKey, idType, otherNumber })
  if (Object.keys(validation.errors).length) throw new DocumentImageError(Object.values(validation.errors).join(' '))
  if (idType === PHILSYS_TYPE) delete validation.details.number
  const quality = await inspectDocument(file)
  return { quality, declaredDetails: validation.details, findings: validation.warnings.map(ruleId => ({ ruleId, severity: 'warning', fieldGroup: 'document details', evidence: 'self-declared', status: 'open' })) }
}
export async function saveAuthorization(accountId, docKey, version, input) {
  if (docKey !== 'birthCertificate' || input?.copyType !== 'PSA e-Certificate' || !input.authorizationCode) return
  const collection = mongoose.connection.db.collection('verification_private')
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await collection.updateOne({ _id: `${accountId}:${docKey}:${version}` }, { $set: { code: String(input.authorizationCode).slice(0, 100), expiresAt: new Date(Date.now() + 86400000) } }, { upsert: true })
}
export async function clearAuthorization(accountId, docKey, version) {
  await mongoose.connection.db.collection('verification_private').deleteOne({ _id: `${accountId}:${docKey}:${version}` })
}
