import mongoose from 'mongoose'
import { Applicant } from '../models/collections.js'
import { loadDocumentFile } from '../utils/documentFiles.js'
import { readQr, readOcr } from './localImageReading.js'
import { normalizedText } from '../../shared/nsrpChecks.js'
import { IMAGE_LIMITS } from '../../shared/documentImage.js'
import { crossChecks, extractDocumentFields } from '../../shared/crossChecks.js'
export async function reserveOcr() {
  const collection = mongoose.connection.db.collection('verification_ocr_usage')
  const id = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  await collection.updateOne({ _id: id }, { $setOnInsert: { count: 0 } }, { upsert: true })
  return (await collection.updateOne({ _id: id, count: { $lt: IMAGE_LIMITS.ocrDailyCap } }, { $inc: { count: 1 } })).modifiedCount === 1
}
export async function processApplicantImages({ accountId, docKey, version, settings, consumeQr = async () => {}, onFinished = async () => {}, readers = { readQr, readOcr } }) {
  try {
    const account = await Applicant.findById(accountId).lean()
    const versions = account?.verificationDocuments?.[docKey]?.versions || []
    const document = versions.at(-1)
    if (!document || document.version !== version || document.status !== 'pending' || !settings.imageChecks) return
    const file = await loadDocumentFile(accountId, docKey, version)
    if (!file) return
    let qr = { found: false, domain: null, allowlisted: false }, comparisons = [{ fieldGroup: 'document', result: 'could_not_read', evidence: 'independent' }]
    if (file.mimetype !== 'application/pdf') {
      const buffer = Buffer.from(file.data)
      qr = await readers.readQr(buffer, consumeQr)
      if (settings.ocrTextReading) {
        let birthValues
        if (settings.crossChecks && docKey.startsWith('validId')) {
          const birthVersion = account.verificationDocuments?.birthCertificate?.versions?.at(-1)?.version
          const birthFile = birthVersion && await loadDocumentFile(accountId, 'birthCertificate', birthVersion)
          if (birthFile?.mimetype?.startsWith('image/')) birthValues = (await readers.readOcr(Buffer.from(birthFile.data), text => ({ values: extractDocumentFields(text) }), { reserve: reserveOcr })).values
        }
        const report = await readers.readOcr(buffer, text => {
          const normalized = normalizedText(text), nsrp = account.profile?.nsrp || {}
          const fields = [['name', [nsrp.firstName || account.profile?.firstName, nsrp.surname || account.profile?.lastName]], ['birth date', [nsrp.dob]], ['ID number', [document.declaredDetails?.number]]]
          const parsed = extractDocumentFields(text)
          const expectedNumber = nsrp[{ SSS: 'gsisSss', Passport: 'passportNo', 'Pag-IBIG': 'pagibig' }[document.declaredDetails?.idType]] || document.declaredDetails?.number
          const cross = settings.crossChecks && Object.keys(parsed).length ? crossChecks({ nsrp: { ...nsrp, idNumber: expectedNumber }, ...(docKey === 'birthCertificate' ? { birth: { values: parsed, evidence: 'independent' } } : { birth: birthValues ? { values: birthValues, evidence: 'independent' } : {}, ids: [{ values: parsed, evidence: 'independent' }] }) }) : null
          return { comparisons: [...fields.map(([fieldGroup, values]) => ({ fieldGroup, result: values.every(Boolean) && values.every(value => normalized.includes(normalizedText(value))) ? 'match' : 'could_not_read', evidence: 'independent' })), ...(cross?.comparisons || [])], findings: cross?.findings || [] }
        }, { reserve: reserveOcr })
        if (report.comparisons) comparisons = report.comparisons
        if (report.findings) document.findings = [...(document.findings || []).filter(f => !f.ruleId.startsWith('cross_')), ...report.findings]
      }
    }
    const index = versions.length - 1, base = `verificationDocuments.${docKey}.versions.${index}`
    await Applicant.collection.updateOne({ _id: account._id, [`${base}.version`]: version, [`${base}.status`]: 'pending', [`verificationDocuments.${docKey}.versions`]: { $size: versions.length } }, { $set: { [`${base}.qr`]: qr, [`${base}.imageComparisons`]: comparisons, [`${base}.findings`]: document.findings || [] } })
    await onFinished()
  } catch { console.error('[verification] local image check unavailable; document remains pending') }
}
