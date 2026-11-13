import mongoose from 'mongoose'
import { Applicant } from '../models/collections.js'
import { loadDocumentFile } from '../utils/documentFiles.js'
import { readQr, readOcr } from './localImageReading.js'
import { IMAGE_LIMITS } from '../../shared/documentImage.js'
import { checkIdName } from '../../shared/idNameChecks.js'
import { readDocumentOcr } from './documentReading.js'
import { applicantNsrpReference } from './nsrpReference.js'
export async function reserveOcr() {
  const collection = mongoose.connection.db.collection('verification_ocr_usage')
  const id = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  await collection.updateOne({ _id: id }, { $setOnInsert: { count: 0 } }, { upsert: true })
  return (await collection.updateOne({ _id: id, count: { $lt: IMAGE_LIMITS.ocrDailyCap } }, { $inc: { count: 1 } })).modifiedCount === 1
}
export async function processApplicantImages({ accountId, docKey, version, settings, recheck = false, checkToken, consumeQr = async () => {}, onFinished = async () => {}, readers = { readQr, readOcr } }) {
  if (docKey === 'birthCertificate') return { completed: true, skipped: true }
  try {
    const account = await Applicant.findById(accountId).lean()
    const versions = account?.verificationDocuments?.[docKey]?.versions || []
    const document = versions.at(-1)
    if (!document || document.version !== version || (!recheck && document.status !== 'pending') || !settings.imageChecks) return { completed: false }
    const file = await loadDocumentFile(accountId, docKey, version)
    if (!file) return
    let qr = { found: false, domain: null, allowlisted: false }, comparisons = [{ fieldGroup: 'document', result: 'could_not_read', evidence: 'independent' }]
    let pdfRead = false
    const nsrpValues = applicantNsrpReference(account.profile)
    {
      const buffer = Buffer.from(file.data)
      if (file.mimetype !== 'application/pdf') qr = await readers.readQr(buffer, async raw => {
        await consumeQr(raw)
      })
      if (settings.ocrTextReading) {
        const report = await readDocumentOcr(file, (text, confidence, metadata) => checkIdName(text, confidence, nsrpValues, metadata), { nameOnly: true }, readers.readOcr)
        if (report.comparisons) comparisons = report.comparisons
        pdfRead = file.mimetype === 'application/pdf' && comparisons.some(row => row.reliable === true)
        if (report.findings) document.findings = [...(document.findings || []).filter(f => !f.ruleId.startsWith('cross_')), ...report.findings]
      }
    }
    document.findings = [...new Map([...(document.findings || [])].map(f => [f.ruleId, f])).values()]
    const index = versions.length - 1, base = `verificationDocuments.${docKey}.versions.${index}`
    const updated = await Applicant.collection.updateOne({ _id: account._id, ...(checkToken ? { 'consistencyState.token': checkToken, 'consistencyState.status': 'checking' } : {}), [`${base}.version`]: version, [`${base}.status`]: document.status, [`verificationDocuments.${docKey}.versions`]: { $size: versions.length }, $or: [{ [`${base}.reviewRevision`]: document.reviewRevision || 0 }, ...(!document.reviewRevision ? [{ [`${base}.reviewRevision`]: { $exists: false } }] : [])] }, { $set: { [`${base}.qr`]: qr, [`${base}.imageComparisons`]: comparisons, [`${base}.findings`]: document.findings || [], ...(pdfRead ? { [`${base}.quality.warnings`]: (document.quality?.warnings || []).filter(warning => warning !== 'pdf_manual_reading') } : {}) } })
    await onFinished()
    return { completed: Boolean(updated.matchedCount) }
  } catch { console.error('[verification] local image check unavailable; document remains pending') }
}
