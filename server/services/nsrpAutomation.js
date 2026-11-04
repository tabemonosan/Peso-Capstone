import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { checkNsrp, checkSummary, NSRP_RULES_VERSION, normalizedText } from '../../shared/nsrpChecks.js'
import { checkNsrp2 } from '../../shared/nsrp2Checks.js'
import { VERIFICATION_DEFAULTS, REVIEWER_LABELS, openFlags } from '../../shared/verification.js'

export const SYSTEM_REVIEWER = REVIEWER_LABELS.system
const DEFAULTS = VERIFICATION_DEFAULTS
const DAY = 86400000
const MANUAL_TYPES = new Set(['government', 'recruitment & placement agency (local)', 'licensed recruitment agency (overseas)', 'do 174-17 subcontractor'])
const normalizeMobile = (value) => String(value || '').replace(/\D/g, '').replace(/^63(?=9\d{9}$)/, '0')

export function manualReason({ sourceType, version, emailVerified, enabledAtCreation, enabled, dismissedCritical, employerType, report }) {
  if (sourceType !== 'generated') return 'Uploaded file'
  if (version !== 1) return 'Resubmission'
  if (!enabledAtCreation || !enabled) return 'Auto-approval off'
  if (!emailVerified) return 'Email unverified'
  if (dismissedCritical) return 'Always manual: dismissed critical finding'
  if (MANUAL_TYPES.has(String(employerType || '').trim().toLowerCase().replace(/,\s*subcontractor$/, ' subcontractor'))) return 'Always manual: agency type'
  const blocking = report?.findings?.filter(f => f.approvalBlocking !== false) || []
  if (report?.rulesVersion !== NSRP_RULES_VERSION || checkSummary(blocking).level !== 'clear'
    || report?.findings?.some((finding) => /duplicate|cross_account/.test(finding.code))) return 'Needs attention'
  return ''
}

export function createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, notifyAdmins, recomputeApplicant, random = () => crypto.randomInt(1000000) / 1000000, runCheck, beforeApproval } = {}) {
  let documentEngine
  const db = () => mongoose.connection.db
  const decisions = () => db().collection('nsrp_auto_decisions')
  const settings = () => db().collection('nsrp_auto_settings')
  const identifiers = () => db().collection('nsrp_identifier_claims')
  const rates = () => db().collection('nsrp_auto_rate_guard')
  async function hash(kind, value) {
    let secret = process.env.NSRP_HASH_SECRET || process.env.JWT_SECRET
    if (!secret) {
      const keys = db().collection('nsrp_auto_private_keys')
      await keys.updateOne({ _id: 'hmac' }, { $setOnInsert: { secret: crypto.randomBytes(32).toString('hex') } }, { upsert: true })
      secret = (await keys.findOne({ _id: 'hmac' })).secret
    }
    return crypto.createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex')
  }

  async function getSettings() {
    await settings().updateOne({ _id: 'settings' }, { $setOnInsert: { ...DEFAULTS, history: [] } }, { upsert: true })
    return { ...DEFAULTS, ...await settings().findOne({ _id: 'settings' }) }
  }

  async function creationEnabled(role) {
    try { const config = await getSettings(); return Boolean(config.automaticApproval && config[role === 'Applicant' ? 'applicant' : 'employer']) }
    catch { console.error('[nsrp-auto] settings unavailable; manual review required'); return false }
  }

  async function updateSettings(changes, admin) {
    const allowed = Object.keys(DEFAULTS)
    if (Object.keys(changes).some((key) => !allowed.includes(key))) throw new Error('Unknown setting')
    for (const key of Object.keys(DEFAULTS).filter(key => typeof DEFAULTS[key] === 'boolean')) if (key in changes && typeof changes[key] !== 'boolean') throw new Error('Switches must be boolean')
    if ('minimumEvidence' in changes && !['independent', 'none'].includes(changes.minimumEvidence)) throw new Error('Choose independent or none evidence')
    if ('auditPercent' in changes && (!Number.isFinite(changes.auditPercent) || changes.auditPercent < 0 || changes.auditPercent > 100)) throw new Error('Audit percentage must be 0 to 100')
    if ('rateLimit' in changes && (!Number.isInteger(changes.rateLimit) || changes.rateLimit < 1 || changes.rateLimit > 5)) throw new Error('Rate limit must be 1 to 5 per 24 hours')
    if ('waitlistAttempts' in changes && (!Number.isInteger(changes.waitlistAttempts) || changes.waitlistAttempts < 1 || changes.waitlistAttempts > 5)) throw new Error('Correction chances must be 1 to 5')
    for (const key of ['pesoContact', 'pesoOfficeHours']) if (key in changes && (typeof changes[key] !== 'string' || !changes[key].trim() || changes[key].length > 300)) throw new Error('Enter PESO contact details and hours using 1 to 300 characters')
    await getSettings()
    await settings().updateOne({ _id: 'settings' }, { $set: changes, $push: { history: { changes, by: admin, at: new Date() } } })
    return getSettings()
  }

  // One atomic reservation checks BOTH limits. Bounded to avoid the BSON limit.
  // All stored keys are HMACs, never raw IPs, mobile numbers, or identifiers.
  async function reserveRate(key, ip, mobile, limit) {
    if (!ip || !mobile) return false
    const now = new Date()
    const cutoff = new Date(+now - DAY)
    await rates().updateOne({ _id: 'rolling' }, { $setOnInsert: { entries: [] } }, { upsert: true })
    const ipHash = await hash('ip', ip)
    const mobileHash = await hash('mobile', normalizeMobile(mobile))
    const count = (field, value) => ({ $size: { $filter: { input: '$entries', as: 'entry', cond: { $and: [{ $gt: ['$$entry.at', cutoff] }, { $eq: [`$$entry.${field}`, value] }] } } } })
    const result = await rates().updateOne({ _id: 'rolling', $expr: { $and: [
      { $lt: [count('ipHash', ipHash), limit] }, { $lt: [count('mobileHash', mobileHash), limit] },
      { $lt: [{ $size: { $filter: { input: '$entries', as: 'entry', cond: { $gt: ['$$entry.at', cutoff] } } } }, 20000] },
    ] } }, [{ $set: { entries: { $concatArrays: [
      { $filter: { input: '$entries', as: 'entry', cond: { $gt: ['$$entry.at', cutoff] } } },
      [{ key, ipHash, mobileHash, at: now }],
    ] } } }])
    return result.modifiedCount === 1
  }

  async function duplicateFindings(role, accountId, data) {
    const owner = `${role}:${accountId}`
    const fields = role === 'Applicant'
      ? [['tin', data.tin], ['sss', data.gsisSss], ['pagibig', data.pagibig], ['philhealth', data.philhealth]]
      : [['tin', data.registrationDetails?.taxIdentificationNumber]]
    const findings = []
    for (const [kind, raw] of fields) {
      const value = String(raw || '').replace(/\D/g, '')
      if (!value) continue
      const id = await hash(kind, value)
      await identifiers().updateOne({ _id: id }, { $addToSet: { owners: owner } }, { upsert: true })
      const claim = await identifiers().findOne({ _id: id })
      // Include records predating the identifier registry; never return their data.
      const applicantField = { tin: 'tin', sss: 'gsisSss', pagibig: 'pagibig', philhealth: 'philhealth' }[kind]
      const applicantDuplicate = await Applicant.exists({ ...(role === 'Applicant' ? { _id: { $ne: accountId } } : {}), [`profile.nsrp.${applicantField}`]: value })
      const employerDuplicate = kind === 'tin' && await EmployerRequest.exists({ ...(role === 'Employer' ? { email: { $ne: data.email } } : {}), 'registrationDetails.taxIdentificationNumber': value })
      if (claim.owners.some((entry) => entry !== owner) || applicantDuplicate || employerDuplicate) findings.push({ code: `duplicate_${kind}`, severity: 'critical' })
    }
    if ((await getSettings()).dataChecks) {
      const extra = role === 'Applicant'
        ? [['passport', normalizedText(data.passportNo), 'critical'], ['mobile', normalizeMobile(data.cellphone), 'warning'], ['name_birth', data.surname && data.firstName && data.dob ? normalizedText(data.surname + data.firstName + (data.middleName || '')) + ':' + data.dob : '', 'warning']]
        : [['mobile', normalizeMobile(data.phone), 'warning'], ['establishment_city', data.companyName && data.registrationDetails?.cityMunicipality ? normalizedText(data.companyName) + ':' + normalizedText(data.registrationDetails.cityMunicipality) : '', 'warning']]
      for (const [kind, value, severity] of extra) {
        if (!value) continue
        const id = await hash(kind, value)
        await identifiers().updateOne({ _id: id }, { $addToSet: { owners: owner } }, { upsert: true })
        if ((await identifiers().findOne({ _id: id })).owners.some(entry => entry !== owner)) findings.push({ code: 'duplicate_' + kind, severity, fieldGroup: 'registration', evidence: 'self-declared', status: 'open' })
      }
    }
    return findings
  }

  async function processSubmission({ role, accountId, ip }) {
    let key
    let approved = false
    try {
      const account = await (role === 'Applicant' ? Applicant : Employer).findById(accountId).select('+nsrpAutoEnabledAtCreation +holdAutoApproval').lean()
      if (!account) return
      const record = role === 'Applicant' ? account : await EmployerRequest.findOne({ email: account.email }).select('+nsrpAutoEnabledAtCreation').lean()
      if (!record) return
      const versions = role === 'Applicant' ? record.verificationDocuments?.nsrpForm?.versions : record.requirementsVersions
      const version = versions?.at(-1)
      if (!version || version.status !== 'pending') return
      key = `${role}:${accountId}:${version.version}`
      try {
        await decisions().insertOne({ _id: key, role, accountId: account._id, recordId: record._id, accountLabel: account.email, version: version.version, at: new Date(), result: 'Processing', rulesVersion: NSRP_RULES_VERSION })
      } catch (err) { if (err.code === 11000) return; throw err }
      const data = role === 'Applicant' ? account.profile?.nsrp || {} : record
      const report = runCheck ? await runCheck(role, data) : role === 'Applicant' ? checkNsrp(data) : checkNsrp2(data)
      if (!(await getSettings()).dataChecks && !runCheck) report.findings = report.findings.filter(f => /^missing_|^(workExperience|technicalTraining)_date_order$|^(tin|gsisSss|pagibig|philhealth)_repeated_digits$/.test(f.code))
      report.findings = [...report.findings, ...await duplicateFindings(role, account._id, data)]
      Object.assign(report, checkSummary(report.findings), { documentVersion: version.version, checkedAt: new Date() })
      // Store the report before deciding; subsequent approval is conditional on
      // exactly this pending version and unchanged account eligibility.
      await decisions().updateOne({ _id: key }, { $set: { report } })
      const config = await getSettings()
      const dismissedCritical = await decisions().findOne({ role, accountId: account._id, dismissedCritical: true })
      let reason = manualReason({ sourceType: version.sourceType, version: version.version, emailVerified: account.emailVerified,
        enabledAtCreation: record.nsrpAutoEnabledAtCreation === true, enabled: config.automaticApproval && config[role === 'Applicant' ? 'applicant' : 'employer'],
        dismissedCritical: Boolean(dismissedCritical), employerType: role === 'Employer' ? record.registrationDetails?.employerType : '', report })
      if (account.holdAutoApproval) reason = 'Hold'
      if (!reason && (account.applyingSuspendedAt || account.receivingApplicantsSuspendedAt || account.verificationStatus === 'restricted')) reason = 'Hold'
      const allFindings = role === 'Applicant' ? Object.values(account.verificationDocuments || {}).flatMap(slot => slot.versions?.at(-1)?.findings || []) : version.findings || []
      if (!reason && openFlags(allFindings).some(f => f.approvalBlocking !== false)) reason = 'Flagged'
      if (!reason && version.explanation?.status && version.explanation.status !== 'reviewed') reason = 'Explanation'
      // No independent reader exists in Phase 1. Typed data cannot satisfy the default.
      if (!reason && config.minimumEvidence === 'independent') reason = 'Not independent'
      if (documentEngine && !reason) reason = 'Engine review'
      let sampled = false
      if (!reason && random() * 100 < config.auditPercent) { reason = 'Audit sample'; sampled = true }
      if (!reason && !await reserveRate(key, ip, role === 'Applicant' ? data.cellphone || account.phone : record.phone, config.rateLimit)) reason = 'Rate guard'
      if (reason) {
        await decisions().updateOne({ _id: key }, { $set: { result: 'Manual', reason, sampled, report, finishedAt: new Date() } })
        const base = role === 'Applicant' ? `verificationDocuments.nsrpForm.versions.${versions.length - 1}` : `requirementsVersions.${versions.length - 1}`
        await (role === 'Applicant' ? Applicant : EmployerRequest).collection.updateOne({ _id: record._id, [`${base}.status`]: 'pending', [`${base}.version`]: version.version }, { $set: {
          [`${base}.reviewReasons`]: [reason], [`${base}.findings`]: report.findings.map(f => ({ ruleId: f.code, severity: f.severity, fieldGroup: f.fieldGroup || 'registration', evidence: 'self-declared', status: 'open', approvalBlocking: f.approvalBlocking !== false })),
        } })
        return
      }
      if (beforeApproval) await beforeApproval()
      const now = new Date()
      const index = versions.length - 1
      const base = role === 'Applicant' ? `verificationDocuments.nsrpForm.versions.${index}` : `requirementsVersions.${index}`
      const model = role === 'Applicant' ? Applicant : EmployerRequest
      const match = { _id: record._id, [`${base}.status`]: 'pending', [`${base}.version`]: 1,
        $or: [{ [`${base}.reviewRevision`]: version.reviewRevision || 0 }, ...(!version.reviewRevision ? [{ [`${base}.reviewRevision`]: { $exists: false } }] : [])],
        ...(role === 'Applicant' ? { emailVerified: true, verificationStatus: { $ne: 'restricted' }, deletedAt: { $exists: false }, 'verificationDocuments.nsrpForm.versions': { $size: 1 } } : { requirementsVersions: { $size: 1 }, status: { $in: ['pending', 'under_review'] } }) }
      const summary = JSON.stringify({ rulesVersion: NSRP_RULES_VERSION, ...report.summary })
      const latestConfig = await getSettings()
      const currentAccount = await (role === 'Applicant' ? Applicant : Employer).findById(accountId).select('+holdAutoApproval').lean()
      if (!latestConfig.automaticApproval || !latestConfig[role === 'Applicant' ? 'applicant' : 'employer'] || latestConfig.minimumEvidence !== 'none' || currentAccount?.holdAutoApproval) {
        await decisions().updateOne({ _id: key }, { $set: { result: 'Manual', reason: 'Controls changed during review', finishedAt: now } }); return
      }
      const set = { [`${base}.status`]: 'approved', [`${base}.reviewedBy`]: SYSTEM_REVIEWER, [`${base}.reviewedAt`]: now,
        [`${base}.autoApproved`]: true, [`${base}.approvedBy`]: 'system', [`${base}.autoApprovalSummary`]: [{ ruleId: 'nsrp-data-clear', level: 'clear' }], [`${base}.reviewReasons`]: [] }
      if (role === 'Employer') set['requirementsFile.status'] = 'approved'
      const push = role === 'Applicant'
        ? { 'verificationDocuments.nsrpForm.history': { action: 'auto-approved', reason: summary, by: SYSTEM_REVIEWER, at: now } }
        : { reviewHistory: { decision: 'approved', reason: `NSRP document only: ${summary}`, by: SYSTEM_REVIEWER, at: now } }
      const result = await model.collection.updateOne(match, { $set: set, $push: push })
      approved = result.modifiedCount === 1
      if (approved && role === 'Applicant' && recomputeApplicant) await recomputeApplicant(account._id)
      await decisions().updateOne({ _id: key }, { $set: { result: approved ? 'Auto-approved' : 'Manual', reason: approved ? '' : 'Changed during review', report, approvedAt: approved ? now : null, finishedAt: now } })
      if (approved) await notify({ recipient: { id: account._id, role, email: account.email }, type: 'document_approved', title: 'NSRP approved',
        message: role === 'Applicant' ? 'Your NSRP was approved after an automatic data check. Your other documents are still being reviewed by PESO.' : 'Your NSRP was approved. Your employer account is still being reviewed by PESO.',
        link: role === 'Applicant' ? '/profile?documents=1' : '/verification', email: true })
      if (approved && notifyAdmins) {
        // At most one info digest announcement per Manila calendar day.
        const digestKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
        const digest = await settings().updateOne({ _id: `digest:${digestKey}` }, { $setOnInsert: { at: new Date() } }, { upsert: true })
        if (digest.upsertedCount) await notifyAdmins({ type: 'nsrp_auto_digest', title: 'NSRP automatic review summary', message: 'Automatic NSRP decisions are available in Verification rules. Review the auto-approval log for the daily summary.', link: '/verification-rules', metadata: { severity: 'info' } })
      }
    } catch {
      console.error('[nsrp-auto] processing failed; manual review required')
      if (key && !approved) await decisions().updateOne({ _id: key }, { $set: { result: 'Manual', reason: 'Check or approval unavailable', finishedAt: new Date() } }).catch(() => {})
    }
  }

  async function revoke(id, admin, reason) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new Error('A reason of 1 to 500 characters is required')
    const decision = await decisions().findOne({ _id: id, result: 'Auto-approved' })
    if (!decision) return false
    const { role, accountId, recordId } = decision
    const index = decision.version - 1
    const base = role === 'Applicant' ? `verificationDocuments.nsrpForm.versions.${index}` : `requirementsVersions.${index}`
    const model = role === 'Applicant' ? Applicant : EmployerRequest
    const now = new Date()
    const set = { [`${base}.status`]: 'pending', [`${base}.reviewedBy`]: admin, [`${base}.reviewedAt`]: now, [`${base}.reviewReason`]: 'Your document has returned to PESO review.', [`${base}.autoApproved`]: false, [`${base}.reviewReasons`]: ['Revoked approval'] }
    if (role === 'Employer') { set['requirementsFile.status'] = 'pending'; set.status = 'under_review' }
    const push = role === 'Applicant' ? { 'verificationDocuments.nsrpForm.history': { action: 'revoke-auto-approval', reason: reason.trim(), by: admin, at: now } }
      : { reviewHistory: { decision: 'needs_resubmission', reason: `Revoke NSRP auto-approval: ${reason.trim()}`, by: admin, at: now } }
    push[`${base}.verificationAudit`] = { action: 'revoke', reason: reason.trim(), by: admin, at: now }
    const changed = await model.collection.updateOne({ _id: recordId, [`${base}.status`]: 'approved', [`${base}.reviewedBy`]: { $in: [SYSTEM_REVIEWER, 'System (auto-approval)'] } }, {
      $set: set, $push: push, $unset: { [`${base}.approvedBy`]: '', [`${base}.adminConfirmedBy`]: '', [`${base}.adminConfirmedAt`]: '', ...(role === 'Employer' ? { adminDecision: '', approvedAt: '', approvedBy: '' } : {}) },
    })
    if (!changed.modifiedCount) return false
    if (role === 'Applicant') await Applicant.updateOne({ _id: accountId, verificationStatus: { $ne: 'restricted' }, [`${base}.status`]: 'pending' }, { $set: { verificationStatus: 'under_review' }, $unset: { verificationReason: '' } })
    if (role === 'Employer') await Employer.updateOne({ _id: accountId }, { $set: { verificationStatus: 'under_review', approvalNoticePending: false } })
    await decisions().updateOne({ _id: id }, { $set: { result: 'Revoked', revokedAt: now, revokedBy: admin, revokeReason: reason.trim() } })
    await notify({ recipient: { id: accountId, role }, type: 'document_review_update', title: 'NSRP review update', message: 'Your NSRP has returned to PESO review.', email: true, link: '/profile' })
    return true
  }

  return { getSettings, updateSettings, creationEnabled, process: async payload => {
    await processSubmission(payload)
    if (documentEngine) await documentEngine.process({ ...payload, docKey: payload.role === 'Applicant' ? 'nsrpForm' : 'employerNsrpForm' })
  }, attachEngine: engine => { documentEngine = engine }, revoke, decisions, reserveRate, hash }
}
