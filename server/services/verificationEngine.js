import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { DECISION_RULES_VERSION, decisionReason } from '../../shared/verificationDecision.js'
import { REVIEWER_LABELS } from '../../shared/verification.js'
import { checkNsrp, normalizedText } from '../../shared/nsrpChecks.js'
import { checkNsrp2 } from '../../shared/nsrp2Checks.js'
import { LocalChecksProvider, PhilSysQrSignatureProvider } from './verificationProviders.js'
import { readQr } from './localImageReading.js'
import { loadDocumentFile } from '../utils/documentFiles.js'
import { clearAuthorization } from './documentUpload.js'
const advisory = new Set(['education_age', 'work_start_age', 'experience_age', 'married_under_18', 'location_pair', 'employer_location_pair'])
const safeFinding = f => ({ ruleId: String(f.ruleId || f.code || 'provider_inconclusive').slice(0, 100), severity: ['info', 'warning', 'critical'].includes(f.severity) ? f.severity : 'info', fieldGroup: String(f.fieldGroup || 'document').slice(0, 60), evidence: f.evidence === 'independent' ? 'independent' : 'self-declared', status: f.status === 'dismissed' ? 'dismissed' : 'open', approvalBlocking: advisory.has(f.ruleId || f.code) ? false : f.approvalBlocking !== false })
export function createVerificationEngine({ Applicant, Employer, EmployerRequest, automation, notify, notifyAdmins, recomputeApplicant, random = () => crypto.randomInt(1000000) / 1000000, providers, beforeApproval } = {}) {
  const decisions = () => automation.decisions()
  async function process({ role, accountId, docKey, ip, checkToken }) {
    const key = ['nsrpForm', 'employerNsrpForm'].includes(docKey) ? `${role}:${accountId}:` : `${role}:${accountId}:${docKey}:`
    let decisionKey, approved = false, locked = false
    try {
      const accountModel = role === 'Applicant' ? Applicant : Employer
      const account = await accountModel.findById(accountId).select('+holdAutoApproval +verificationFailureCounts +consistencyState').lean()
      if (!account) return
      if (checkToken && (account.consistencyState?.token !== checkToken || account.consistencyState?.status !== 'checking')) return
      const model = role === 'Applicant' ? Applicant : EmployerRequest
      const record = role === 'Applicant' ? account : await EmployerRequest.findOne({ email: account.email }).lean()
      const path = role === 'Applicant' ? `verificationDocuments.${docKey}.versions` : 'requirementsVersions'
      const versions = role === 'Applicant' ? record?.verificationDocuments?.[docKey]?.versions : record?.requirementsVersions
      const document = versions?.at(-1)
      if (!document || document.status !== 'pending') return
      decisionKey = key + document.version
      await decisions().updateOne({ _id: decisionKey }, { $setOnInsert: { role, accountId: account._id, recordId: record._id, accountLabel: account.email, docKey, version: document.version, at: new Date(), result: 'Ready' } }, { upsert: true })
      const lock = await decisions().updateOne({ _id: decisionKey, result: { $in: ['Ready', 'Manual'] }, reason: { $nin: ['Audit sample', 'Resubmission', 'Uploaded file', 'Always manual', 'Revoked approval', 'Retake requested', 'Technical attempts: admin review', 'Check or approval unavailable'] } }, { $set: { result: 'Processing', docKey } })
      if (!lock.modifiedCount) return
      locked = true
      const settings = await automation.getSettings(), nsrpDocument = ['nsrpForm', 'employerNsrpForm'].includes(docKey)
      const nsrp = account.profile?.nsrp || { firstName: account.profile?.firstName, surname: account.profile?.lastName, dob: account.profile?.dob }
      const oldDecision = await decisions().findOne({ _id: decisionKey })
      const report = nsrpDocument ? oldDecision.report || (role === 'Applicant' ? checkNsrp(nsrp) : checkNsrp2(record)) : null
      const currentDocument = { ...document, quality: nsrpDocument && document.sourceType === 'generated' ? { passed: true, warnings: [] } : document.quality }
      const allVersions = role === 'Applicant' ? Object.values(account.verificationDocuments || {}).map(slot => slot.versions?.at(-1)).filter(Boolean) : [document]
      let findings = [...allVersions.flatMap(v => v.findings || []), ...(report?.findings || [])].map(safeFinding)
      let comparisons = [...(document.imageComparisons || [])], verifiedQr = false
      if (docKey === 'nsrpForm') comparisons = allVersions.flatMap(v => v.imageComparisons || [])
      let selectedProvider = new LocalChecksProvider(), providerResult = await selectedProvider.verify(currentDocument, { nsrp })
      if (providers) { selectedProvider = providers; providerResult = await providers.verify(currentDocument, { nsrp, accountId: String(accountId) }) }
      else if (document.declaredDetails?.idType === 'PhilSys National ID' && settings.philsysQrVerification) {
        const file = await loadDocumentFile(accountId, docKey, document.version)
        const provider = new PhilSysQrSignatureProvider()
        let raw = ''
        if (file?.mimetype?.startsWith('image/')) await readQr(Buffer.from(file.data), text => { raw = text })
        providerResult = await provider.verify({ ...currentDocument, qrPayload: raw }, { nsrp })
        if (providerResult.verifiedQr) {
          const qrHash = await automation.hash('philsys_qr', raw)
          const registry = mongoose.connection.db.collection('verification_qr_claims'), owner = `${role}:${accountId}`
          await registry.updateOne({ _id: qrHash }, { $addToSet: { owners: owner } }, { upsert: true })
          if ((await registry.findOne({ _id: qrHash })).owners.some(value => value !== owner)) findings.push(safeFinding({ ruleId: 'duplicate_qr', severity: 'critical', evidence: 'independent' }))
        }
        raw = ''
      }
      if (document.declaredDetails?.number) {
        const kind = { Passport: 'passport', SSS: 'sss', 'Pag-IBIG': 'pagibig' }[document.declaredDetails.idType]
        if (kind) {
          const id = await automation.hash(kind, kind === 'passport' ? normalizedText(document.declaredDetails.number) : document.declaredDetails.number.replace(/\D/g, ''))
          const claims = mongoose.connection.db.collection('nsrp_identifier_claims'), owner = `${role}:${accountId}`
          await claims.updateOne({ _id: id }, { $addToSet: { owners: owner } }, { upsert: true })
          if ((await claims.findOne({ _id: id })).owners.some(value => value !== owner)) findings.push(safeFinding({ ruleId: 'duplicate_' + kind, severity: 'critical', fieldGroup: 'identifiers' }))
        }
      }
      findings = [...new Map([...findings, ...(providerResult.findings || []).map(safeFinding)].map(f => [f.ruleId, f])).values()]
      comparisons.push(...(providerResult.comparisons || [])); verifiedQr = providerResult.verifiedQr === true
      const context = { settings, docKey, document: currentDocument, account: { ...account, employerType: record.registrationDetails?.employerType }, findings, comparisons, verifiedQr, pendingExplanation: allVersions.some(v => ['requested', 'submitted'].includes(v.explanation?.status)) }
      let reason = decisionReason(context), sampled = false
      if (document.qr?.domain && !document.qr.allowlisted) reason = 'Flagged'
      const base = `${path}.${versions.length - 1}`, at = new Date()
      if (verifiedQr && role === 'Applicant') await model.collection.updateOne({ _id: record._id, ...(checkToken ? { 'consistencyState.token': checkToken, 'consistencyState.status': 'checking' } : {}), [`${base}.version`]: document.version, [`${path}`]: { $size: versions.length } }, { $set: { [`${base}.imageComparisons`]: [...(document.imageComparisons || []), ...(providerResult.comparisons || []).map(c => ({ ...c, reliable: true }))] } })
      if (providerResult.result === 'failed') {
        const counter = await accountModel.findOneAndUpdate({ _id: account._id }, { $inc: { [`verificationFailureCounts.${docKey}`]: 1 } }, { returnDocument: 'after' }).select('+verificationFailureCounts').lean()
        const attempts = counter.verificationFailureCounts[docKey]
        await model.collection.updateOne({ _id: record._id, [`${base}.status`]: 'pending', [`${base}.version`]: document.version }, { $set: { [`${base}.status`]: attempts >= 3 ? 'pending' : 'needs_resubmission', [`${base}.technicalAttempts`]: attempts, [`${base}.findings`]: findings, [`${base}.reviewReasons`]: [attempts >= 3 ? 'Technical attempts: admin review' : 'Retake requested'], [`${base}.reviewReason`]: 'Please take a clearer photo and submit it for PESO review.' } })
        reason = attempts >= 3 ? 'Technical attempts: admin review' : 'Retake requested'
        await notify({ recipient: { id: account._id, role }, type: 'document_review_update', title: 'Document review update', message: 'Please take a clearer photo and submit it for PESO review.', link: role === 'Applicant' ? '/profile?documents=1' : '/verification' })
      } else {
        if (!reason) {
          if (oldDecision.sampleDraw === undefined) await decisions().updateOne({ _id: decisionKey, sampleDraw: { $exists: false } }, { $set: { sampleDraw: random() } })
          sampled = (await decisions().findOne({ _id: decisionKey })).sampleDraw * 100 < settings.auditPercent
          if (sampled) reason = 'Audit sample'
        }
        if (!reason && !await automation.reserveRate(decisionKey, ip, account.phone || nsrp.cellphone || record.phone, settings.rateLimit)) reason = 'Rate guard'
        if (!reason) {
          if (beforeApproval) await beforeApproval()
          const freshSettings = await automation.getSettings(), freshAccount = await accountModel.findById(accountId).select('+holdAutoApproval').lean()
          const freshVersions = role === 'Applicant' ? Object.values(freshAccount.verificationDocuments || {}).map(slot => slot.versions?.at(-1)).filter(Boolean) : allVersions
          reason = decisionReason({ ...context, settings: freshSettings, account: { ...freshAccount, employerType: record.registrationDetails?.employerType }, findings: [...findings, ...freshVersions.flatMap(v => v.findings || []).map(safeFinding)], pendingExplanation: freshVersions.some(v => ['requested', 'submitted'].includes(v.explanation?.status)) })
        }
        if (!reason) {
          const revision = document.reviewRevision || 0
          const match = { _id: record._id, [path]: { $size: 1 }, [`${base}.version`]: 1, [`${base}.status`]: 'pending', $or: [{ [`${base}.reviewRevision`]: revision }, ...(revision === 0 ? [{ [`${base}.reviewRevision`]: { $exists: false } }] : [])] }
          if (checkToken) Object.assign(match, { 'consistencyState.token': checkToken, 'consistencyState.status': 'checking' })
          const set = { [`${base}.status`]: 'approved', [`${base}.autoApproved`]: true, [`${base}.approvedBy`]: 'system', [`${base}.reviewedBy`]: REVIEWER_LABELS.system, [`${base}.reviewedAt`]: at, [`${base}.provider`]: providerResult.provider, [`${base}.assurance`]: providerResult.assurance, [`${base}.rulesVersion`]: DECISION_RULES_VERSION, [`${base}.autoApprovalSummary`]: [{ ruleId: settings.minimumEvidence === 'none' ? 'typed-only-override' : verifiedQr ? 'verified-qr' : 'eligible-evidence', level: 'clear' }], [`${base}.reviewReasons`]: [] }
          if (role === 'Employer') set['requirementsFile.status'] = 'approved'
          const historyPath = role === 'Applicant' ? `verificationDocuments.${docKey}.history` : 'reviewHistory'
          const event = role === 'Applicant' ? { action: 'auto-approved', by: REVIEWER_LABELS.system, at, reason: DECISION_RULES_VERSION } : { decision: 'approved', by: REVIEWER_LABELS.system, at, reason: 'Document auto-approved: ' + DECISION_RULES_VERSION }
          approved = (await model.collection.updateOne(match, { $set: set, $push: { [historyPath]: event, [`${base}.verificationAudit`]: { action: 'auto-approved', reason: DECISION_RULES_VERSION, by: 'system', at } } })).modifiedCount === 1
          if (!approved) reason = 'Changed during review'
          if (approved && role === 'Applicant') {
            const transition = await recomputeApplicant(account._id)
            if (transition?.becameVerified) await notify({ recipient: { id: account._id, role }, type: 'account_verified', title: 'Account verified', message: 'All your required documents were approved. Your account is now verified.', link: '/jobs', email: true })
          }
          if (approved) await notify({ recipient: { id: account._id, role }, type: 'document_approved', title: 'Document approved', message: 'Your document was approved after an automatic check. PESO may still review it.', link: role === 'Applicant' ? '/profile?documents=1' : '/verification', email: true })
        }
        if (reason) await model.collection.updateOne({ _id: record._id, [`${base}.status`]: 'pending', [`${base}.version`]: document.version }, { $set: { [`${base}.reviewReasons`]: [reason], [`${base}.findings`]: findings } })
      }
      await decisions().updateOne({ _id: decisionKey }, { $set: { result: approved ? 'Auto-approved' : 'Manual', reason: reason || '', sampled, provider: providerResult.provider, assurance: providerResult.assurance, evidenceMode: settings.minimumEvidence, rulesVersion: DECISION_RULES_VERSION, ...(approved ? { approvedAt: at } : {}), finishedAt: new Date() } })
      await clearAuthorization(account._id, docKey, document.version)
    } catch {
      console.error('[verification] provider or decision unavailable; manual review required')
      if (decisionKey && locked && !approved) await decisions().updateOne({ _id: decisionKey }, { $set: { result: 'Manual', reason: 'Could not be read', finishedAt: new Date() } }).catch(() => {})
    }
  }
  async function digest() {
    try {
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      const end = new Date(day + 'T00:00:00+08:00'), start = new Date(+end - 86400000)
      const rows = await decisions().find({ at: { $gte: start, $lt: end } }, { projection: { result: 1, reason: 1 } }).toArray()
      if (!rows.length) return
      const guard = await mongoose.connection.db.collection('nsrp_auto_settings').updateOne({ _id: 'verification-digest:' + day }, { $setOnInsert: { at: new Date() } }, { upsert: true })
      if (!guard.upsertedCount) return
      const counts = { automatic: rows.filter(r => r.result === 'Auto-approved').length, flagged: rows.filter(r => r.result === 'Manual').length, samples: rows.filter(r => r.reason === 'Audit sample').length, revoked: rows.filter(r => r.result === 'Revoked').length }
      await notifyAdmins({ type: 'verification_digest', title: 'Daily document verification summary', message: `${counts.automatic} automatically approved; ${counts.flagged} require review; ${counts.samples} audit samples; ${counts.revoked} revoked.`, link: '/verification-rules', metadata: counts })
    } catch { console.error('[verification] daily digest unavailable') }
  }
  return { process, digest }
}
