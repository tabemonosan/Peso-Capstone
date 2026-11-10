import mongoose from 'mongoose'
import crypto from 'node:crypto'
import { DOCUMENT_KEYS, DOCUMENT_LABELS, REVIEW_ACTIONS, openFlags } from '../../shared/verification.js'
import { clearAuthorization } from './documentUpload.js'
import { needsManualChecklist, completeChecklist } from '../../shared/manualDocumentReview.js'
import { loadDocumentFile } from '../utils/documentFiles.js'
import { readOcr } from './localImageReading.js'
import { reserveOcr } from './imageChecks.js'
import { extractDocumentFields } from '../../shared/crossChecks.js'
import { WAITLIST_LIMITS } from '../../shared/consistencyWaitlist.js'
import { identityRecheckUpdate } from './nsrpReference.js'

const fail = (status, message) => { const error = new Error(message); error.status = status; throw error }
const oid = value => {
  if (!/^[a-f\d]{24}$/i.test(String(value))) fail(400, 'Invalid account ID')
  return new mongoose.Types.ObjectId(String(value))
}
const reasonText = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) fail(400, 'A reason of 1 to 500 characters is required')
  return value.trim()
}
const adminId = actor => String(actor.id || actor.sub || actor.email)

export function createDocumentVerification({ Applicant, Employer, EmployerRequest, automation, notify, recomputeApplicant }) {
  const nsrpDecisions = () => automation.decisions()
  async function locate({ role, accountId, docKey }) {
    if (!['Applicant', 'Employer'].includes(role) || !DOCUMENT_KEYS.includes(docKey)
      || (role === 'Employer') !== (docKey === 'employerNsrpForm')) fail(400, 'Invalid document type or role')
    const accountModel = role === 'Applicant' ? Applicant : Employer
    const account = await accountModel.findById(oid(accountId)).select('+holdAutoApproval +consistencyState').lean()
    if (!account || account.deletedAt) fail(404, 'Account unavailable')
    const model = role === 'Applicant' ? Applicant : EmployerRequest
    const record = role === 'Applicant' ? account : await EmployerRequest.findOne({ email: account.email }).lean()
    if (!record) fail(404, 'Document unavailable')
    const path = role === 'Applicant' ? `verificationDocuments.${docKey}.versions` : 'requirementsVersions'
    const versions = role === 'Applicant' ? record.verificationDocuments?.[docKey]?.versions : record.requirementsVersions
    const document = versions?.at(-1)
    if (!document) fail(404, 'Document unavailable')
    // Legacy reports remain usable without a data migration.
    if (!document.findings?.length && ['nsrpForm', 'employerNsrpForm'].includes(docKey)) {
      const decision = await nsrpDecisions().findOne({ _id: `${role}:${account._id}:${document.version}` })
      document.findings = (decision?.report?.findings || []).map(f => ({ ruleId: f.code, severity: f.severity, fieldGroup: 'registration', evidence: 'self-declared', status: decision.dismissals?.some(d => d.code === f.code) ? 'dismissed' : 'open' }))
    }
    return { accountModel, account, model, record, document, path, base: `${path}.${versions.length - 1}`, count: versions.length }
  }

  // Project only review metadata before combining queues. No file bytes or extracted text.
  function projection(role) {
    return { $project: {
      _id: 0, role: { $literal: role }, recordId: '$_id',
      accountId: role === 'Applicant' ? '$_id' : '$account._id', email: 1,
      accountStatus: '$verificationStatus', consistencyState: 1,
      holdAutoApproval: role === 'Applicant' ? { $ifNull: ['$holdAutoApproval', false] } : { $ifNull: ['$account.holdAutoApproval', false] },
      docKey: '$entry.docKey', version: '$entry.document.version', status: '$entry.document.status',
      sourceType: '$entry.document.sourceType', autoApproved: '$entry.document.autoApproved',
      approvedBy: '$entry.document.approvedBy', reviewedBy: '$entry.document.reviewedBy',
      adminConfirmedBy: '$entry.document.adminConfirmedBy', adminConfirmedAt: '$entry.document.adminConfirmedAt',
      at: { $ifNull: ['$entry.document.uploadedAt', '$createdAt'] },
      approvedAt: '$entry.document.reviewedAt', findings: { $ifNull: ['$entry.document.findings', []] },
      provider: '$entry.document.provider', assurance: '$entry.document.assurance', rulesVersion: '$entry.document.rulesVersion',
      reasons: { $ifNull: ['$entry.document.reviewReasons', []] }, explanation: '$entry.document.explanation',
      audit: { $concatArrays: [{ $ifNull: ['$entry.document.verificationAudit', []] }, { $ifNull: [role === 'Applicant' ? '$autoApprovalHoldHistory' : '$account.autoApprovalHoldHistory', []] }] }, autoApprovalSummary: '$entry.document.autoApprovalSummary',
    } }
  }
  async function list(query = {}) {
    const page = Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1))
    const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 25))
    const match = query.queue === 'auto' ? { status: 'approved', docKey: { $ne: 'nsrpForm' }, $or: [{ autoApproved: true }, { reviewedBy: { $in: ['System (auto-approval)', 'System (verification engine)'] } }] }
      : { $or: [
        { role: 'Employer', status: { $in: ['pending', 'needs_resubmission'] } },
        { role: 'Applicant', docKey: { $ne: 'nsrpForm' }, $or: [{ status: 'needs_resubmission' }, { status: 'pending', 'reasons.0': { $exists: true } }, { status: 'pending', holdAutoApproval: true }] },
        { findings: { $elemMatch: { severity: { $in: ['warning', 'critical'] }, status: { $ne: 'dismissed' } } } },
        { 'explanation.status': 'submitted' },
      ] }
    const filters = [match]
    if (query.waitlisted === 'true') filters.push({ accountStatus: 'waitlisted' })
    if (query.recordId) filters.push({ recordId: oid(query.recordId) })
    if (query.docKey) { if (!DOCUMENT_KEYS.includes(query.docKey)) fail(400, 'Invalid document type'); filters.push({ docKey: query.docKey }) }
    if (query.role) { if (!['Applicant', 'Employer'].includes(query.role)) fail(400, 'Invalid role'); filters.push({ role: query.role }) }
    if (query.checked === 'true') filters.push({ adminConfirmedAt: { $ne: null } })
    if (query.checked === 'false') filters.push({ adminConfirmedAt: null })
    const dates = {}
    for (const key of ['from', 'to']) if (query[key]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(query[key]) || Number.isNaN(Date.parse(query[key]))) fail(400, 'Use dates in YYYY-MM-DD format')
      dates[key === 'from' ? '$gte' : '$lt'] = new Date(+new Date(`${query[key]}T00:00:00+08:00`) + (key === 'to' ? 86400000 : 0))
    }
    if (Object.keys(dates).length) filters.push({ [query.queue === 'auto' ? 'approvedAt' : 'at']: dates })
    const direction = query.order === 'desc' ? -1 : 1
    const sortKey = ['at', 'approvedAt', 'docKey', 'email'].includes(query.sort) ? query.sort : 'at'
    const employerPipeline = [
      { $lookup: { from: Employer.collection.name, localField: 'email', foreignField: 'email', as: 'account' } },
      { $unwind: '$account' },
      { $set: { entry: { docKey: 'employerNsrpForm', document: { $arrayElemAt: ['$requirementsVersions', -1] } } } }, projection('Employer'),
    ]
    const [result] = await Applicant.aggregate([
      { $match: { deletedAt: { $exists: false } } },
      { $set: { entry: DOCUMENT_KEYS.filter(key => key !== 'employerNsrpForm').map(key => ({ docKey: key, document: { $arrayElemAt: [`$verificationDocuments.${key}.versions`, -1] } })) } },
      { $unwind: '$entry' }, projection('Applicant'),
      { $unionWith: { coll: EmployerRequest.collection.name, pipeline: employerPipeline } },
      { $set: { decisionKey: { $cond: [{ $in: ['$docKey', ['nsrpForm', 'employerNsrpForm']] }, { $concat: ['$role', ':', { $toString: '$accountId' }, ':', { $toString: '$version' }] }, { $concat: ['$role', ':', { $toString: '$accountId' }, ':', '$docKey', ':', { $toString: '$version' }] }] } } },
      { $lookup: { from: 'nsrp_auto_decisions', localField: 'decisionKey', foreignField: '_id', as: 'legacyDecision' } },
      { $set: { legacyDecision: { $arrayElemAt: ['$legacyDecision', 0] } } },
      { $set: {
        reasons: { $cond: [{ $and: [{ $eq: [{ $size: '$reasons' }, 0] }, { $eq: ['$legacyDecision.result', 'Manual'] }] }, ['$legacyDecision.reason'], '$reasons'] },
        findings: { $cond: [{ $eq: [{ $size: '$findings' }, 0] }, { $map: { input: { $ifNull: ['$legacyDecision.report.findings', []] }, as: 'finding', in: {
          ruleId: '$$finding.code', severity: '$$finding.severity', fieldGroup: 'registration', evidence: 'self-declared',
          status: { $cond: [{ $in: ['$$finding.code', { $map: { input: { $ifNull: ['$legacyDecision.dismissals', []] }, as: 'dismissal', in: '$$dismissal.code' } }] }, 'dismissed', 'open'] },
        } } }, '$findings'] },
      } },
      { $unset: ['legacyDecision', 'decisionKey'] },
      { $match: { $and: filters } },
      { $facet: { items: [{ $sort: { [sortKey]: direction, role: 1, accountId: 1, docKey: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } },
    ])
    const config = await automation.getSettings()
    const items = result.items.map(item => ({ ...item, label: DOCUMENT_LABELS[item.docKey], waitlistAttempts: config.waitlistAttempts,
      waitlisted: item.accountStatus === 'waitlisted',
      daysWaiting: item.consistencyState?.waitlistedAt ? Math.floor((Date.now() - +item.consistencyState.waitlistedAt) / 86400000) : 0,
      staleWaitlist: item.accountStatus === 'waitlisted' && !item.consistencyState?.pausedAt && Date.now() - +new Date(item.consistencyState?.lastActivityAt || item.consistencyState?.waitlistedAt) >= WAITLIST_LIMITS.staleDays * 86400000,
      overdue: Date.now() - +item.at >= 7 * 86400000,
      unresolved: openFlags(item.findings).length,
      reasons: [...new Set([
        ...(item.accountStatus === 'waitlisted' ? ['Cross-check mismatch'] : []),
        ...item.reasons, ...(openFlags(item.findings).length ? ['Flagged'] : []),
        ...(item.holdAutoApproval ? ['Hold'] : []),
        ...(item.explanation?.status === 'submitted' ? ['Explanation submitted'] : []),
        ...(item.status === 'needs_resubmission' ? ['Resubmission requested'] : []),
        ...(item.reasons.length === 0 && !openFlags(item.findings).length && item.explanation?.status !== 'submitted' && item.status === 'pending' ? ['Manual review'] : []),
      ])],
    }))
    return { items, total: result.count[0]?.total || 0, page, limit }
  }

  async function act(target, actor, input) {
    if (actor?.role !== 'Admin') fail(403, 'Admins only')
    if (!(await automation.getSettings()).reviewToolsEnabled) fail(409, 'Document review tools are switched off')
    const { action } = input
    if (!REVIEW_ACTIONS.includes(action)) fail(400, 'Unknown review action')
    if (action === 'resolve' && (typeof input.ruleId !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(input.ruleId))) fail(400, 'Invalid rule identifier')
    const reason = reasonText(input.reason)
    const ctx = await locate(target)
    const { accountModel, account, model, record, document, path, base, count } = ctx
    if (input.version !== document.version) fail(409, 'Document version changed; refresh the queue')
    const by = adminId(actor), at = new Date()
    if (action === 'approve' && needsManualChecklist(target.docKey) && !completeChecklist(input.checklist)) fail(400, 'Complete the manual document review checklist')
    const audit = { action, reason, by, at, ...(input.ruleId ? { ruleId: input.ruleId } : {}) }
    if (action === 'approve' && needsManualChecklist(target.docKey)) audit.checklist = input.checklist
    if (['hold', 'release-hold'].includes(action)) {
      const held = action === 'hold'
      const result = await accountModel.collection.updateOne({ _id: account._id, holdAutoApproval: { $ne: held } }, { $set: { holdAutoApproval: held }, $push: { autoApprovalHoldHistory: audit } })
      if (!result.modifiedCount) fail(409, 'Account hold already changed; refresh the queue')
      return { ok: true }
    }
    const set = {}, unset = {}, push = { [`${base}.verificationAudit`]: audit }
    const pending = ['pending', 'needs_resubmission'].includes(document.status)
    if (['approve', 'resubmit', 'decline'].includes(action)) {
      if (!pending) fail(409, 'Only pending documents can be decided')
      const unresolved = openFlags(document.findings).length
      if (action === 'approve' && input.unresolved !== unresolved) fail(409, 'Flags changed; confirm the unresolved flag count again')
      set[`${base}.status`] = action === 'approve' ? 'approved' : action === 'resubmit' ? 'needs_resubmission' : 'rejected'
      set[`${base}.reviewedBy`] = by; set[`${base}.reviewedAt`] = at
      // Applicant responses contain only these neutral messages, never the admin reason.
      set[`${base}.reviewReason`] = action === 'approve' ? '' : action === 'resubmit' ? 'Please upload a clearer or corrected document for PESO review.' : 'PESO could not approve this document. Please contact the office for assistance.'
      set[`${base}.reviewReasons`] = action === 'resubmit' ? ['Resubmission requested'] : []
      if (action === 'approve') { set[`${base}.approvedBy`] = by; set[`${base}.autoApproved`] = false }
      if (['submitted', 'requested'].includes(document.explanation?.status)) set[`${base}.explanation.status`] = 'reviewed'
    } else if (action === 'resolve') {
      const finding = document.findings?.find(f => f.ruleId === input.ruleId && f.status !== 'dismissed')
      if (!finding) fail(409, 'Open finding unavailable')
      set[`${base}.findings`] = document.findings.map(f => f === finding ? { ...f, status: 'dismissed', dismissedBy: by, note: reason } : f)
    } else if (action === 'explain') {
      set[`${base}.explanation`] = { status: 'requested', requestedAt: at }
      set[`${base}.reviewReasons`] = [...new Set([...(document.reviewReasons || []), 'Explanation requested'])]
    } else if (action === 'checked') {
      if (document.status !== 'approved' || !(document.autoApproved || /^System \(/.test(document.reviewedBy || ''))) fail(409, 'Only automatic approvals can be marked checked')
      if (document.adminConfirmedAt) fail(409, 'Already marked checked')
      set[`${base}.adminConfirmedAt`] = at; set[`${base}.adminConfirmedBy`] = by
    } else if (action === 'revoke') {
      if (document.status !== 'approved' && !(target.docKey === 'nsrpForm' && account.verificationStatus === 'approved')) fail(409, 'Only approved documents can be revoked')
      set[`${base}.status`] = 'pending'; set[`${base}.reviewReasons`] = ['Revoked approval']
      set[`${base}.autoApproved`] = false
      for (const key of ['approvedBy', 'adminConfirmedBy', 'adminConfirmedAt', 'reviewedBy', 'reviewedAt', 'reviewReason']) unset[`${base}.${key}`] = ''
      if (target.role === 'Applicant') unset[`verificationDocuments.${target.docKey}.correctionRequest`] = ''
    }
    if (target.role === 'Applicant' && ['approve', 'resubmit', 'decline', 'revoke'].includes(action)) {
      const historyAction = action === 'revoke' && (document.autoApproved || /^System \(/.test(document.reviewedBy || '')) ? 'revoke-auto-approval' : { approve: 'approved', resubmit: 'needs_resubmission', decline: 'rejected', revoke: 'revert' }[action]
      push[`verificationDocuments.${target.docKey}.history`] = { action: historyAction, reason: set[`${base}.reviewReason`] || 'PESO document review updated.', by, at }
    }
    if (target.role === 'Employer' && ['approve', 'decline', 'resubmit', 'revoke'].includes(action)) {
      set['requirementsFile.status'] = set[`${base}.status`]
      // Form 2 approval is document-only; preserve the separate employer account gate.
      if (action !== 'approve') { set.status = action === 'decline' ? 'declined' : action === 'resubmit' ? 'needs_resubmission' : 'under_review'; unset.adminDecision = ''; unset.approvedAt = ''; unset.approvedBy = '' }
    }
    const revision = document.reviewRevision || 0
    const match = { _id: record._id, [path]: { $size: count }, [`${base}.version`]: document.version, [`${base}.status`]: document.status,
      $or: [{ [`${base}.reviewRevision`]: revision }, ...(revision === 0 ? [{ [`${base}.reviewRevision`]: { $exists: false } }] : [])] }
    if (target.role === 'Applicant' && target.docKey !== 'nsrpForm' && action === 'approve' && account.verificationDocuments?.nsrpForm?.versions?.length) match['verificationDocuments.nsrpForm.versions'] = { $size: account.verificationDocuments.nsrpForm.versions.length }
    if (target.role === 'Applicant' && needsManualChecklist(target.docKey) && action === 'approve') {
      // Commit the staff decision and its waitlist resolution together. A new
      // token prevents an older background check from restoring these flags.
      const state = account.consistencyState || {}
      match['consistencyState.token'] = state.token || { $exists: false }
      match.verificationStatus = account.verificationStatus
      const issues = (state.issues || []).filter(issue => issue.docKey !== target.docKey)
      set.consistencyState = { ...state, token: crypto.randomUUID(), status: 'manual_review', issues,
        lastActivityAt: at, history: [...(state.history || []), { action: 'document-approved', docKey: target.docKey, reason, by, at }] }
      if (account.verificationStatus === 'waitlisted' && !issues.length) {
        set.verificationStatus = 'under_review'
        set.verificationReason = ''
      }
    }
    if (target.role === 'Applicant' && target.docKey === 'nsrpForm' && action === 'revoke') {
      const recheck = identityRecheckUpdate(account, by, at)
      Object.assign(set, recheck.set); Object.assign(unset, recheck.unset)
      Object.assign(push, recheck.push); Object.assign(match, recheck.match)
    }
    const changed = await model.collection.updateOne(match, { $set: set, $push: push, $inc: { [`${base}.reviewRevision`]: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) })
    if (!changed.modifiedCount) fail(409, 'Document changed; refresh the queue')
    if (['approve', 'decline', 'resubmit', 'checked'].includes(action)) await clearAuthorization(account._id, target.docKey, document.version)
    if (target.role === 'Applicant' && ['approve', 'decline', 'resubmit', 'revoke'].includes(action)) await recomputeApplicant(account._id)
    if (target.role === 'Applicant' && action === 'approve' && account.verificationStatus !== 'approved'
      && (await Applicant.findById(account._id).select('verificationStatus').lean())?.verificationStatus === 'approved') {
      await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'account_verified', title: 'Account verified', message: 'All your required documents were approved. Your account is now verified.', link: '/jobs', email: true })
    }
    if (target.role === 'Employer' && ['revoke', 'decline', 'resubmit'].includes(action)) await Employer.updateOne({ _id: account._id }, { $set: { verificationStatus: set.status, approvalNoticePending: false, verificationReason: set[`${base}.reviewReason`] || '' } })
    if (action === 'revoke') await nsrpDecisions().updateOne({ _id: ['nsrpForm', 'employerNsrpForm'].includes(target.docKey) ? `${target.role}:${account._id}:${document.version}` : `${target.role}:${account._id}:${target.docKey}:${document.version}`, result: 'Auto-approved' }, { $set: { result: 'Revoked', revokedBy: by, revokedAt: at, revokeReason: reason } })
    if (action === 'resolve' && ['nsrpForm', 'employerNsrpForm'].includes(target.docKey)) await nsrpDecisions().updateOne({ accountId: account._id, version: document.version }, {
      $push: { dismissals: { code: input.ruleId, reason, by, at } },
      ...(document.findings.find(f => f.ruleId === input.ruleId)?.severity === 'critical' ? { $set: { dismissedCritical: true } } : {}),
    })
    if (['approve', 'resubmit', 'decline', 'revoke', 'explain'].includes(action)) {
      const messages = { approve: 'Your document was approved by PESO.', resubmit: 'Please upload a clearer or corrected document for PESO review.', decline: 'PESO could not approve your document. Please contact the office for assistance.', revoke: 'Your document has returned to PESO review. You do not need to upload it again.', explain: 'PESO would like additional information about your document. Please contact the office.' }
      if (target.docKey === 'nsrpForm' && action === 'revoke') messages.revoke = 'PESO reopened your NSRP reference for correction. Your birth certificate and IDs will need to be checked again.'
      const label = target.role === 'Employer' ? 'NSRP Form 2' : ({ birthCertificate: 'Birth Certificate', validId1: 'Valid ID #1', validId2: 'Valid ID #2', nsrpForm: 'NSRP registration reference' }[target.docKey] || 'Document')
      const next = ['resubmit', 'decline'].includes(action) ? target.role === 'Applicant' ? ' Open My Documents, read PESO feedback in this document section, and use the available replacement or explanation options. If replacement is locked or your upload limit is reached, contact PESO. Verification starts again after a replacement.' : action === 'resubmit' ? ' Open Account verification, read the feedback, and use Update NSRP Form 2 or Replace file. Submit the corrected form for another review.' : ' Open Account verification to read the feedback and contact PESO about the next steps. A new registration is not required.' : ''
      await notify({ recipient: { id: account._id, role: target.role }, type: 'document_review_update', title: `${label}: review update`, message: `${messages[action]}${next}`, link: target.role === 'Applicant' ? '/profile?documents=1' : '/verification', email: true })
    }
    return { ok: true }
  }
  async function details(target) {
    const { account, document, record } = await locate(target)
    const secret = target.docKey === 'birthCertificate' ? await mongoose.connection.db.collection('verification_private').findOne({ _id: `${account._id}:${target.docKey}:${document.version}` }, { projection: { code: 1 } }) : null
    let readValues = {}
    const settings = await automation.getSettings()
    if (target.role === 'Applicant' && settings.ocrTextReading && settings.crossChecks && document.imageComparisons?.length) {
      const file = await loadDocumentFile(account._id, target.docKey, document.version)
      if (file?.mimetype?.startsWith('image/')) readValues = (await readOcr(Buffer.from(file.data), text => ({ values: extractDocumentFields(text) }), { reserve: reserveOcr })).values || {}
    }
    if (document.declaredDetails?.idType === 'PhilSys National ID') delete readValues.idNumber
    const previousExplanation = [...(record.verificationDocuments?.[target.docKey]?.versions || [])].reverse().find(v => v.explanation?.status === 'submitted')?.explanation
    return { declaredDetails: document.declaredDetails || {}, readValues, quality: document.quality, qr: document.qr, comparisons: document.imageComparisons || [], authorizationCode: secret?.code || '', nsrp: account.profile?.nsrp || {}, explanation: previousExplanation || document.explanation, version: document.version }
  }
  return { list, act, details }
}
