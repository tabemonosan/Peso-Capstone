import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { enqueueVerification } from './verificationJobs.js'
import { processApplicantImages } from './imageChecks.js'
import { WAITLIST_RULES_VERSION, WAITLIST_DEFAULTS, WAITLIST_LIMITS, WAITLIST_DOCUMENTS, WAITLIST_GROUPS, WAITLIST_MESSAGE, WAITLIST_TIP, consistencyIssues, waitlistIssueMessage, isManuallyApproved } from '../../shared/consistencyWaitlist.js'
import { VERIFICATION_DOC_LABELS } from '../../shared/verificationDocs.js'
import { isSharedPhoneFinding } from '../../shared/verificationFindings.js'

const DAY = 86400000
const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }) }
export function createConsistencyWaitlist({ Applicant, automation, notify, notifyAdmins, readImages = processApplicantImages, verifyDocument = async () => {}, recomputeApplicant = async () => {}, now = () => new Date(), timeoutMs = WAITLIST_LIMITS.timeoutMs }) {
  const get = id => Applicant.findById(id).select('+consistencyState').lean()
  const settings = async () => ({ ...WAITLIST_DEFAULTS, ...await automation.getSettings() })
  const latest = (account, key) => account.verificationDocuments?.[key]?.versions?.at(-1)
  const remaining = (state, key, config) => Math.max(0, config.waitlistAttempts + (state.grants?.[key] || 0) - (state.used?.[key] || 0))
  const snapshot = account => Object.fromEntries(WAITLIST_DOCUMENTS.map(key => [key, latest(account, key)?.version || 0]))
  const unchanged = (a, b) => WAITLIST_DOCUMENTS.every(key => a[key] === b[key])
  async function publicState(id, ip) {
    let [account, config] = await Promise.all([get(id), settings()])
    if (!account || account.deletedAt) fail('ACCOUNT_UNAVAILABLE', 'Account unavailable.', 403)
    // Refresh obsolete phone flags and flags already settled by staff approval.
    // A policy recheck does not count as an applicant correction attempt.
    const approvedIssue = account.consistencyState?.issues?.some(issue => isManuallyApproved(latest(account, issue.docKey)))
    const obsoleteIssue = account.consistencyState?.issues?.some(issue => !WAITLIST_DOCUMENTS.includes(issue.docKey) || issue.reasonCode === 'cross_check_mismatch' && !WAITLIST_GROUPS.includes(issue.fieldGroup))
    const oldDuplicateReview = account.consistencyState?.rulesVersion !== WAITLIST_RULES_VERSION && account.consistencyState?.issues?.some(issue => issue.reasonCode === 'staff_review')
    const refreshedDuplicateReview = account.verificationStatus === 'waitlisted' && account.consistencyState?.status !== 'checking' && account.consistencyState?.issues?.some(issue => issue.reasonCode === 'staff_review') && await automation.refreshDuplicateFindings(id)
    const policyChanged = Boolean(account.consistencyState?.rulesVersion && account.consistencyState.rulesVersion !== WAITLIST_RULES_VERSION)
    if (['under_review', 'waitlisted'].includes(account.verificationStatus) && account.consistencyState?.status !== 'checking' && (policyChanged || account.verificationStatus === 'waitlisted' && (approvedIssue || obsoleteIssue || oldDuplicateReview || refreshedDuplicateReview || account.consistencyState?.rulesVersion !== WAITLIST_RULES_VERSION && Object.values(account.verificationDocuments || {}).some(slot => slot.versions?.at(-1)?.findings?.some(isSharedPhoneFinding))))) {
      await begin(id, 'policy', undefined, ip)
      account = await get(id)
    }
    if (account.consistencyState?.status === 'checking' && +now() - +new Date(account.consistencyState.startedAt) >= timeoutMs) {
      await finish(id, account.consistencyState.token, 'timeout')
      account = await get(id)
    }
    const state = account.consistencyState || {}, active = account.verificationStatus === 'waitlisted'
    return { status: account.verificationStatus, checking: state.status === 'checking' && +now() - +new Date(state.startedAt) < timeoutMs,
      waitlisted: active, message: active ? WAITLIST_MESSAGE : '', tip: WAITLIST_TIP, contact: config.pesoContact, officeHours: config.pesoOfficeHours,
      issues: active ? (state.issues || []).map(issue => ({ document: issue.docKey, label: VERIFICATION_DOC_LABELS[issue.docKey], fieldGroup: issue.reasonCode === 'staff_review' ? 'document' : issue.fieldGroup, message: waitlistIssueMessage(issue), chancesLeft: issue.reasonCode === 'staff_review' ? null : remaining(state, issue.docKey, config), canResubmit: issue.reasonCode !== 'staff_review' && remaining(state, issue.docKey, config) > 0 && (account.verificationDocuments?.[issue.docKey]?.uploads || 0) < 5 })) : [] }
  }
  async function assertSubmission(id, docKey) {
    const [account, config] = await Promise.all([get(id), settings()])
    const state = account?.consistencyState || {}
    if (account?.verificationStatus !== 'waitlisted' || !config.waitlistOnMismatch) return
    const affected = (state.issues || []).filter(i => i.reasonCode !== 'staff_review' && (i.docKey === docKey || docKey === 'nsrpForm'))
    if (affected.some(i => remaining(state, i.docKey, config) === 0)) fail('WAITLIST_ATTEMPTS_EXHAUSTED', 'Please contact the PESO office. Staff will review your case. You can still explain a difference.')
  }
  async function canCorrect(id, docKey) {
    const [account, config] = await Promise.all([get(id), settings()])
    const state = account?.consistencyState || {}
    const issues = (state.issues || []).filter(i => i.reasonCode !== 'staff_review' && (i.docKey === docKey || docKey === 'nsrpForm'))
    return account?.verificationStatus === 'waitlisted' && issues.length > 0 && issues.every(i => remaining(state, i.docKey, config) > 0)
  }
  async function reserveSubmission(id, docKey) {
    for (let retry = 0; retry < 5; retry++) {
      const [account, config] = await Promise.all([get(id), settings()])
      if (account?.verificationStatus !== 'waitlisted') return null
      const state = account.consistencyState || {}
      const docKeys = [...new Set((state.issues || []).filter(i => i.reasonCode !== 'staff_review' && (i.docKey === docKey || docKey === 'nsrpForm')).map(i => i.docKey))]
      if (!docKeys.length) return null
      if (docKeys.some(key => remaining(state, key, config) === 0)) fail('WAITLIST_ATTEMPTS_EXHAUSTED', 'Please contact the PESO office. Staff will review your case. You can still explain a difference.')
      const reservation = { key: crypto.randomUUID(), docKeys }, token = crypto.randomUUID()
      const match = { _id: account._id, verificationStatus: 'waitlisted', 'consistencyState.token': state.token }
      const changed = await Applicant.collection.updateOne(match, { $set: { 'consistencyState.token': token, [`consistencyState.reservations.${reservation.key}`]: docKeys }, $inc: Object.fromEntries(docKeys.map(key => [`consistencyState.used.${key}`, 1])) })
      if (changed.modifiedCount) return reservation
    }
    fail('WAITLIST_CHANGED', 'Another correction is being submitted. Refresh before trying again.')
  }
  async function cancelReservation(id, reservation) {
    if (!reservation) return
    await Applicant.collection.updateOne({ _id: new mongoose.Types.ObjectId(id), [`consistencyState.reservations.${reservation.key}`]: { $exists: true } }, { $unset: { [`consistencyState.reservations.${reservation.key}`]: '' }, $inc: Object.fromEntries(reservation.docKeys.map(key => [`consistencyState.used.${key}`, -1])) })
  }
  async function begin(id, changedDoc = 'nsrpForm', reservation, ip, retry = 0) {
    // Capture successful submission versions, never OCR text or typed identifiers.
    const [account, config] = await Promise.all([get(id), settings()])
    if (!account || account.deletedAt || ['restricted', 'declined'].includes(account.verificationStatus)) return
    const previous = account.consistencyState || {}, token = crypto.randomUUID(), at = now(), versions = snapshot(account)
    const used = { ...previous.used }, charged = (reservation?.docKeys || []).map(key => `${key}:reservation:${reservation.key}`)
    for (const key of reservation ? [] : new Set((previous.issues || []).filter(i => i.reasonCode !== 'staff_review' && (i.docKey === changedDoc || ['nsrpForm', 'basic'].includes(changedDoc))).map(i => i.docKey))) {
      const chargeKey = `${key}:${changedDoc}:${changedDoc === 'basic' ? token : versions[changedDoc]}`
      if (!(previous.attemptKeys || []).includes(chargeKey)) { used[key] = (used[key] || 0) + 1; charged.push(chargeKey) }
    }
    const state = { ...previous, token, status: 'checking', startedAt: at, lastActivityAt: at, versions, changedDoc, used, charged, attemptKeys: [...(previous.attemptKeys || []), ...charged], rulesVersion: WAITLIST_RULES_VERSION }
    state.reservations = { ...state.reservations }
    if (reservation) delete state.reservations[reservation.key]
    const match = { _id: account._id, ...(previous.token ? { 'consistencyState.token': previous.token } : { 'consistencyState.token': { $exists: false } }) }
    const result = await Applicant.collection.updateOne(match, { $set: { consistencyState: state } })
    if (!result.modifiedCount) { if (retry < 4) return begin(id, changedDoc, reservation, ip, retry + 1); return }
    enqueueVerification(() => run(id, token, config, ip))
    return token
  }
  async function run(id, token, config, ip) {
    let timer
    try {
      const account = await get(id)
      if (account?.consistencyState?.token !== token) return
      const work = (async () => {
        for (const docKey of ['validId1', 'validId2']) {
          if (isManuallyApproved(latest(account, docKey))) continue
          const version = latest(account, docKey)?.version
          if (version) {
            const result = await readImages({ accountId: id, docKey, version, settings: config, recheck: true, checkToken: token })
            if (!result?.completed) return 'unavailable'
          }
        }
        // Refresh all comparisons before deciding, so an old mismatch on another
        // document cannot block a clean correction against the current reference.
        for (const docKey of ['validId1', 'validId2']) {
          if (isManuallyApproved(latest(account, docKey))) continue
          if (latest(account, docKey)?.version) await verifyDocument({ role: 'Applicant', accountId: id, docKey, checkToken: token, ip })
        }
        return 'complete'
      })()
      const result = await Promise.race([work, new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs) })])
      await finish(id, token, result)
    } catch { await finish(id, token, 'unavailable').catch(() => {}) }
    finally { clearTimeout(timer) }
  }
  async function finish(id, token, outcome) {
    const [account, config] = await Promise.all([get(id), settings()])
    const state = account?.consistencyState
    if (!state || state.token !== token || state.status !== 'checking' || !unchanged(state.versions, snapshot(account)) || account.deletedAt || ['restricted', 'declined'].includes(account.verificationStatus)) return
    const issues = outcome === 'complete' && config.waitlistOnMismatch && config.crossChecks && config.imageChecks ? consistencyIssues(account.verificationDocuments).map(i => ({ ...i, rulesVersion: WAITLIST_RULES_VERSION, at: now() })) : []
    const active = issues.length > 0, wasWaitlisted = account.verificationStatus === 'waitlisted'
    const nextStatus = active ? 'waitlisted' : wasWaitlisted ? 'under_review' : account.verificationStatus
    const next = { ...state, issues, status: outcome === 'complete' ? 'finished' : 'manual_review', finishedAt: now(), ...(active && !wasWaitlisted ? { waitlistedAt: now(), remindedAt: null } : {}) }
    if (outcome !== 'complete') for (const charge of state.charged || []) { const key = charge.split(':')[0]; next.used[key] = Math.max(0, (next.used[key] || 0) - 1) }
    const result = await Applicant.collection.updateOne({ _id: account._id, 'consistencyState.token': token, 'consistencyState.status': 'checking', verificationStatus: account.verificationStatus }, { $set: { consistencyState: next, verificationStatus: nextStatus, ...(active ? { verificationReason: WAITLIST_MESSAGE } : wasWaitlisted ? { verificationReason: '' } : {}) } })
    if (!result.modifiedCount) return
    // Notify staff after scanning, only if this upload still needs review.
    const changed = latest(account, state.changedDoc)
    if (['validId1', 'validId2'].includes(state.changedDoc) && changed?.status === 'pending') {
      await notifyAdmins({ type: 'document_resubmitted', title: 'Document needs review', message: 'An uploaded document could not be verified automatically. Open the document review queue.', link: '/verification-flagged', metadata: { applicantId: String(account._id), docKey: state.changedDoc } })
    }
    const transition = !active && outcome === 'complete' ? await recomputeApplicant(id) : null
    if (transition?.becameVerified) await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'account_verified', title: 'Account verified', message: 'All your required documents passed verification. Your account is now verified.', link: '/jobs', email: true })
    if (active && !wasWaitlisted) {
      await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'consistency_waitlisted', title: 'PESO review needed', message: `${WAITLIST_MESSAGE} Open My Documents to see what you can correct or explain.`, link: '/profile?documents=1' })
      await notifyAdmins({ type: 'consistency_waitlisted', title: 'Cross-check mismatch', message: 'An applicant requires consistency review. Open Flagged for review.', link: '/verification-flagged' })
    } else if (!active && wasWaitlisted) await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'consistency_review_update', title: 'Document check completed', message: transition?.becameVerified ? 'Your corrected documents passed verification. Your account is verified and no admin review is needed.' : 'The cross-check flags are cleared. Open My Documents to see any remaining verification steps.', link: '/profile?documents=1' })
    if (active && state.charged?.length && issues.some(i => i.reasonCode !== 'staff_review' && remaining(next, i.docKey, config) === 0)) await notifyAdmins({ type: 'consistency_last_attempt', title: 'Correction chances used', message: 'An applicant needs staff review after using the available correction chances.', link: '/verification-flagged' })
  }
  async function explanation(id) {
    await Applicant.collection.updateOne({ _id: new mongoose.Types.ObjectId(id), verificationStatus: 'waitlisted' }, { $set: { 'consistencyState.pausedAt': now(), 'consistencyState.lastActivityAt': now() } })
  }
  async function act(id, actor, input) {
    if (actor?.role !== 'Admin') fail('FORBIDDEN', 'Admins only.', 403)
    if (!mongoose.isValidObjectId(id)) fail('INVALID_ACCOUNT', 'Choose a valid account.', 400)
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) fail('REASON_REQUIRED', 'Enter a reason using 1 to 500 characters.', 400)
    if (!['release', 'grant', 'request', 'resolve', 'decline'].includes(input.action)) fail('INVALID_ACTION', 'Choose a review action.', 400)
    const account = await get(id), state = account?.consistencyState || {}
    if (account?.verificationStatus !== 'waitlisted') fail('WAITLIST_CHANGED', 'This account is not waitlisted. Refresh the queue.')
    if (input.token !== state.token) fail('WAITLIST_CHANGED', 'The documents or review changed. Refresh the queue before deciding.')
    if (input.action === 'release' && (input.compared !== true || input.unresolved !== (state.issues || []).length)) fail('COMPARISON_REQUIRED', 'Confirm that you compared the documents and refresh the unresolved flag count.', 400)
    if (['grant', 'request', 'resolve'].includes(input.action) && !WAITLIST_DOCUMENTS.includes(input.docKey)) fail('INVALID_DOCUMENT', 'Choose a document.', 400)
    const grant = input.action === 'grant' ? input.attempts : input.action === 'request' ? input.attempts || 0 : 0
    if (!Number.isInteger(grant) || grant < 0 || grant > 5 || input.action === 'grant' && !grant) fail('INVALID_ATTEMPTS', 'Grant 1 to 5 additional chances.', 400)
    const next = { ...state, token: crypto.randomUUID(), status: 'finished', grants: { ...state.grants, ...(grant ? { [input.docKey]: (state.grants?.[input.docKey] || 0) + grant } : {}) }, history: [...(state.history || []), { action: input.action, reason: input.reason.trim(), by: actor.email, at: now(), docKey: input.docKey, attempts: grant }] }
    if (input.action === 'resolve') { next.issues = (state.issues || []).filter(i => i.docKey !== input.docKey); next.pausedAt = null; next.lastActivityAt = now() }
    const status = input.action === 'decline' ? 'declined' : input.action === 'release' || input.action === 'resolve' && !next.issues.length ? 'under_review' : 'waitlisted'
    if (status !== 'waitlisted') next.issues = []
    const set = { consistencyState: next, verificationStatus: status, consistencyDeclined: input.action === 'decline', verificationReason: status === 'waitlisted' ? WAITLIST_MESSAGE : input.action === 'decline' ? 'PESO completed its review. Please contact the office for assistance.' : '' }
    if (input.action === 'request') {
      const versions = account.verificationDocuments?.[input.docKey]?.versions || []
      if (!versions.length) fail('DOCUMENT_UNAVAILABLE', 'Document unavailable.', 400)
      set[`verificationDocuments.${input.docKey}.versions.${versions.length - 1}.status`] = 'needs_resubmission'
      set[`verificationDocuments.${input.docKey}.versions.${versions.length - 1}.reviewReason`] = 'Please submit another copy for PESO review.'
    }
    if (input.action === 'resolve') {
      const versions = account.verificationDocuments?.[input.docKey]?.versions || []
      versions.forEach((version, index) => { if (version.explanation?.status === 'submitted') set[`verificationDocuments.${input.docKey}.versions.${index}.explanation.status`] = 'reviewed' })
    }
    const changed = await Applicant.collection.updateOne({ _id: account._id, 'consistencyState.token': state.token, verificationStatus: 'waitlisted' }, { $set: set })
    if (!changed.modifiedCount) fail('WAITLIST_CHANGED', 'This review changed. Refresh and try again.')
    await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'consistency_review_update', title: 'PESO review update', message: 'PESO updated your document review. Open My Documents or contact the office for the next steps.', link: '/profile?documents=1' })
    return { ok: true, status }
  }
  async function daily() {
    const config = await settings()
    const accounts = await Applicant.find({ verificationStatus: 'waitlisted', deletedAt: { $exists: false } }).select('+consistencyState').lean()
    for (const account of accounts) {
      const state = account.consistencyState || {}
      if (state.pausedAt || state.remindedAt || +now() - +new Date(state.lastActivityAt || state.waitlistedAt) < WAITLIST_LIMITS.reminderDays * DAY) continue
      const changed = await Applicant.collection.updateOne({ _id: account._id, 'consistencyState.token': state.token, 'consistencyState.remindedAt': null }, { $set: { 'consistencyState.remindedAt': now() } })
      if (changed.modifiedCount) await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'waitlist_reminder', title: 'Document review reminder', message: `Please open My Documents to correct or explain a difference, or contact PESO. ${config.pesoContact}`, link: '/profile?documents=1' })
    }
    const day = now().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const end = new Date(`${day}T00:00:00+08:00`), start = new Date(+end - DAY)
    const guard = await mongoose.connection.db.collection('nsrp_auto_settings').updateOne({ _id: `waitlist-digest:${day}` }, { $setOnInsert: { at: now() } }, { upsert: true })
    const fresh = accounts.filter(a => +new Date(a.consistencyState?.waitlistedAt) >= +start && +new Date(a.consistencyState?.waitlistedAt) < +end).length
    if (guard.upsertedCount && fresh) await notifyAdmins({ type: 'waitlist_digest', title: 'Daily waitlist summary', message: `${fresh} applicants newly waitlisted for document review.`, link: '/verification-flagged' })
  }
  async function disable(actor) {
    const accounts = await Applicant.find({ verificationStatus: 'waitlisted' }).select('+consistencyState').lean()
    for (const account of accounts) {
      const state = account.consistencyState || {}
      const changed = await Applicant.collection.updateOne({ _id: account._id, verificationStatus: 'waitlisted', 'consistencyState.token': state.token }, { $set: { verificationStatus: 'under_review', verificationReason: '', 'consistencyState.token': crypto.randomUUID(), 'consistencyState.status': 'manual_review', 'consistencyState.issues': [] }, $push: { 'consistencyState.history': { action: 'waitlist-switch-off', by: actor.email, reason: 'Waitlist on mismatch switched off.', at: now() } } })
      if (changed.modifiedCount) await notify({ recipient: { id: account._id, role: 'Applicant' }, type: 'consistency_review_update', title: 'PESO review update', message: 'Your account has returned to normal PESO review. Open My Documents for the next steps.', link: '/profile?documents=1' })
    }
  }
  return { begin, finish, run, publicState, assertSubmission, canCorrect, reserveSubmission, cancelReservation, act, explanation, daily, disable }
}
