import mongoose from 'mongoose'
import { Applicant } from '../models/collections.js'
import { loadDocumentFile } from '../utils/documentFiles.js'
import { readQr, readOcr } from './localImageReading.js'
import { normalizedText } from '../../shared/nsrpChecks.js'
import { IMAGE_LIMITS } from '../../shared/documentImage.js'
import { crossChecks, extractDocumentFields } from '../../shared/crossChecks.js'
import { PhilSysQrSignatureProvider } from './verificationProviders.js'
import { WAITLIST_LIMITS } from '../../shared/consistencyWaitlist.js'
import { readDocumentOcr } from './documentReading.js'
export async function reserveOcr() {
  const collection = mongoose.connection.db.collection('verification_ocr_usage')
  const id = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  await collection.updateOne({ _id: id }, { $setOnInsert: { count: 0 } }, { upsert: true })
  return (await collection.updateOne({ _id: id, count: { $lt: IMAGE_LIMITS.ocrDailyCap } }, { $inc: { count: 1 } })).modifiedCount === 1
}
export async function processApplicantImages({ accountId, docKey, version, settings, recheck = false, checkToken, consumeQr = async () => {}, onFinished = async () => {}, readers = { readQr, readOcr } }) {
  try {
    const account = await Applicant.findById(accountId).lean()
    const versions = account?.verificationDocuments?.[docKey]?.versions || []
    const document = versions.at(-1)
    if (!document || document.version !== version || (!recheck && document.status !== 'pending') || !settings.imageChecks) return { completed: false }
    const file = await loadDocumentFile(accountId, docKey, version)
    if (!file) return
    let qr = { found: false, domain: null, allowlisted: false }, comparisons = [{ fieldGroup: 'document', result: 'could_not_read', evidence: 'independent' }]
    const qrComparisons = [], qrFindings = []
    let pdfRead = false
    const nsrpValues = account.profile?.nsrp || { firstName: account.profile?.firstName, surname: account.profile?.lastName, middleName: account.profile?.middleName, dob: account.profile?.dob }
    {
      const buffer = Buffer.from(file.data)
      if (file.mimetype !== 'application/pdf') qr = await readers.readQr(buffer, async raw => {
        await consumeQr(raw)
        if (document.declaredDetails?.idType === 'PhilSys National ID' && settings.philsysQrVerification) {
          const result = await new PhilSysQrSignatureProvider().verify({ ...document, qrPayload: raw }, { nsrp: nsrpValues })
          if (result.verifiedQr) { qrComparisons.push(...result.comparisons.map(c => ({ ...c, reliable: true }))); qrFindings.push(...result.findings) }
        }
      })
      if (settings.ocrTextReading) {
        const report = await readDocumentOcr(file, (text, confidence) => {
          if (Number.isFinite(confidence) && confidence < WAITLIST_LIMITS.minOcrConfidence) return { comparisons: [{ fieldGroup: 'document', result: 'could_not_read', evidence: 'independent', reliable: false }], findings: [] }
          const normalized = normalizedText(text), nsrp = nsrpValues
          const fields = [['name', [nsrp.firstName || account.profile?.firstName, nsrp.surname || account.profile?.lastName]], ['birth date', [nsrp.dob]], ['ID number', [document.declaredDetails?.number]]]
          const parsed = extractDocumentFields(text)
          if (document.declaredDetails?.idType === 'PhilSys National ID') delete parsed.idNumber
          const expectedNumber = nsrp[{ SSS: 'gsisSss', Passport: 'passportNo', 'Pag-IBIG': 'pagibig' }[document.declaredDetails?.idType]] || document.declaredDetails?.number
          const cross = settings.crossChecks && Object.keys(parsed).length ? crossChecks({ nsrp: { ...nsrp, idNumber: expectedNumber }, ...(docKey === 'birthCertificate' ? { birth: { values: parsed, evidence: 'independent' } } : { ids: [{ values: parsed, evidence: 'independent' }] }) }) : null
          return { comparisons: [...fields.map(([fieldGroup, values]) => ({ fieldGroup, result: values.every(Boolean) && values.every(value => normalized.includes(normalizedText(value))) ? 'match' : 'could_not_read', evidence: 'independent' })), ...(cross?.comparisons || []).map(c => ({ ...c, reliable: Number.isFinite(confidence) && confidence >= WAITLIST_LIMITS.minOcrConfidence }))], findings: cross?.findings || [] }
        }, { reserve: reserveOcr }, readers.readOcr)
        if (report.comparisons) comparisons = report.comparisons
        pdfRead = file.mimetype === 'application/pdf' && comparisons.some(row => row.reliable === true)
        if (report.findings) document.findings = [...(document.findings || []).filter(f => !f.ruleId.startsWith('cross_')), ...report.findings]
      }
    }
    comparisons.push(...qrComparisons)
    document.findings = [...new Map([...(document.findings || []), ...qrFindings].map(f => [f.ruleId, f])).values()]
    const index = versions.length - 1, base = `verificationDocuments.${docKey}.versions.${index}`
    const updated = await Applicant.collection.updateOne({ _id: account._id, ...(checkToken ? { 'consistencyState.token': checkToken, 'consistencyState.status': 'checking' } : {}), [`${base}.version`]: version, [`${base}.status`]: document.status, [`verificationDocuments.${docKey}.versions`]: { $size: versions.length }, $or: [{ [`${base}.reviewRevision`]: document.reviewRevision || 0 }, ...(!document.reviewRevision ? [{ [`${base}.reviewRevision`]: { $exists: false } }] : [])] }, { $set: { [`${base}.qr`]: qr, [`${base}.imageComparisons`]: comparisons, [`${base}.findings`]: document.findings || [], ...(pdfRead ? { [`${base}.quality.warnings`]: (document.quality?.warnings || []).filter(warning => warning !== 'pdf_manual_reading') } : {}) } })
    await onFinished()
    return { completed: Boolean(updated.matchedCount) }
  } catch { console.error('[verification] local image check unavailable; document remains pending') }
}
