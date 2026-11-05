import mongoose from 'mongoose'
import { createHash } from 'node:crypto'
import { ReputationReview } from '../models/applicationWorkflow.js'
import { DocumentFile } from '../models/collections.js'
import { REVIEW_CATEGORIES } from '../../shared/reputation.js'
import { readReputation, appendTrustEvents } from './trustPolicy.js'
import { storeDocumentFile, loadDocumentFile } from '../utils/documentFiles.js'
import { inspectDocument } from './imageQuality.js'
import { ApplicationError } from './referralWorkflow.js'
const fail = (code, message, status = 422) => { throw new ApplicationError(code, message, status) }
const validId = value => typeof value === 'string' && mongoose.isValidObjectId(value)
export const publicReputationEventId = key => createHash('sha256').update(String(key)).digest('hex')

export function createReputationReviews({ Applicant, notify, notifyAdmins, now = () => new Date() }) {
  const audit = entry => mongoose.connection.db.collection('referral_audit').updateOne({ _id: entry.key }, { $setOnInsert: { ...entry, at: now() } }, { upsert: true })
  const message = (applicantId, text) => notify({ recipient: { id: applicantId, role: 'Applicant' }, type: 'reputation_review_update', title: 'Reputation review update', message: text, link: '/my-reputation' })
  async function request(account, body, file) {
    if (typeof body.eventId !== 'string' || !/^[a-f0-9]{64}$/.test(body.eventId) || !REVIEW_CATEGORIES.includes(body.category) || typeof body.note !== 'string' || !body.note.trim() || body.note.length > 300) fail('INVALID_REVIEW', 'Choose a reason and enter a note of 1 to 300 characters.')
    const state = await readReputation(Applicant, account._id, now())
    const event = state.events.find(row => publicReputationEventId(row.key) === body.eventId && row.penalty && (row.nominalPoints < 0 || row.change < 0) && row.status !== 'reversed' && !row.virtual)
    if (!event) fail('PENALTY_UNAVAILABLE', 'Choose an applied penalty from your own history.', 403)
    if (event.replaces) fail('ALREADY_REQUESTED', 'This penalty has already been reviewed.', 409)
    if (file) {
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype) || file.size > 5 * 1024 * 1024) fail('INVALID_FILE', 'Upload one JPG, PNG, or PDF up to 5 MB.')
      // Reuse the document inspection and private binary storage. No public URL.
      await inspectDocument(file)
    }
    const supportingVersion = (account.trustEvents || state.account.trustEvents || []).findIndex((row, index) => (row.key || `legacy:${index}`) === event.key) + 1
    await ReputationReview.init()
    let review
    try {
      review = await ReputationReview.create({ applicantId: account._id, eventKey: event.key, applicationId: event.applicationId, category: body.category, note: body.note.trim(), ...(file ? { supportingVersion, originalName: file.originalname } : {}) })
      if (file) await storeDocumentFile(account._id, 'reputationReview', supportingVersion, 'front', file)
    } catch (error) {
      if (review) { await ReputationReview.deleteOne({ _id: review._id }); await DocumentFile.deleteMany({ applicant: account._id, slot: 'reputationReview', version: supportingVersion }) }
      if (error.code === 11000) fail('ALREADY_REQUESTED', 'A review has already been requested for this penalty.', 409)
      throw error
    }
    await audit({ key: `reputation-request:${review._id}`, action: 'reputation_review_requested', applicantId: account._id, reviewId: review._id, eventKey: event.key, by: 'Applicant' })
    await notifyAdmins({ type: 'reputation_review_requested', title: 'Reputation review requested', message: 'An applicant requested review of a reputation penalty. Open Flagged for review.', link: '/verification-flagged', metadata: { reviewId: String(review._id) } })
    return { ok: true, id: String(review._id), status: 'pending' }
  }
  async function decide(admin, reviewId, body) {
    if (!validId(reviewId) || !['reverse', 'keep', 'reduce'].includes(body.action) || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000) fail('INVALID_DECISION', 'Choose a decision and enter an admin note of 1 to 1,000 characters.')
    if (body.action !== 'reverse' && (typeof body.publicReason !== 'string' || !body.publicReason.trim() || body.publicReason.length > 300)) fail('PUBLIC_REASON_REQUIRED', 'Enter a neutral explanation for the applicant (up to 300 characters).')
    const review = await ReputationReview.findById(reviewId).select('+adminNote').lean()
    if (!review) fail('REVIEW_UNAVAILABLE', 'Review unavailable.', 404)
    if (!['pending', 'processing'].includes(review.status)) fail('REVIEW_COMPLETE', 'This review already has a decision.', 409)
    if (review.status === 'processing' && (review.decision !== body.action || review.reviewedBy !== admin.email)) fail('REVIEW_CHANGED', 'Another decision is being processed.', 409)
    const state = await readReputation(Applicant, review.applicantId, now())
    const target = state.events.find(row => row.key === review.eventKey)
    const alreadyApplied = state.account.trustEvents?.some(event => event.key === `review:${reviewId}:reverse`)
    if (!target || target.status === 'reversed' && !alreadyApplied) fail('EVENT_CHANGED', 'The event was already reversed. Refresh the queue.', 409)
    if (body.action === 'reduce' && (!Number.isInteger(body.reducedPoints) || body.reducedPoints < 0 || body.reducedPoints >= -target.change)) fail('INVALID_REDUCTION', 'Enter a smaller penalty amount, including zero.')
    const claim = await ReputationReview.updateOne({ _id: review._id, status: 'pending' }, { $set: { status: 'processing', decision: body.action, reviewedBy: admin.email, adminNote: body.reason.trim(), publicReason: (body.publicReason || '').trim(), reducedPoints: body.reducedPoints } })
    if (!claim.modifiedCount && review.status !== 'processing') fail('REVIEW_CHANGED', 'Another decision is being processed.', 409)
    try {
      if (body.action !== 'keep') {
        const entries = [{ key: `review:${reviewId}:reverse`, type: 'reversal', targetKey: review.eventKey, ...(body.action === 'reduce' ? { replacementPoints: body.reducedPoints } : {}), applicationId: target.applicationId, by: admin.email, reason: body.reason, at: now() }]
        if (body.action === 'reduce' && body.reducedPoints > 0) entries.push({ key: `review:${reviewId}:replacement`, type: target.type, points: -body.reducedPoints, replaces: target.key, occurrenceAt: target.occurrenceAt || target.at, applicationId: target.applicationId, employerId: target.employerId, by: admin.email, reason: body.reason, at: now() })
        await appendTrustEvents(Applicant, review.applicantId, entries)
      }
    } catch (error) { await ReputationReview.updateOne({ _id: review._id, status: 'processing' }, { $set: { status: 'pending' } }); throw error }
    await audit({ key: `reputation-decision:${reviewId}`, action: `reputation_review_${body.action}`, applicantId: review.applicantId, reviewId: review._id, eventKey: review.eventKey, by: admin.email, reason: body.reason.trim(), publicReason: (body.publicReason || '').trim(), reducedPoints: body.reducedPoints })
    const status = { reverse: 'reversed', keep: 'kept', reduce: 'reduced' }[body.action]
    const finalized = await ReputationReview.updateOne({ _id: review._id, status: 'processing' }, { $set: { status, reviewedAt: now() } })
    if (finalized.modifiedCount) await message(review.applicantId, `PESO ${status === 'kept' ? 'kept' : status === 'reduced' ? 'reduced' : 'reversed'} the reviewed penalty. ${status === 'reversed' ? 'Your points have been recalculated.' : (body.publicReason || '').trim()} Open My reputation for the decision and points history.`)
    return { ok: true, status }
  }
  async function reverse(admin, applicantId, body) {
    if (!validId(applicantId) || typeof body.eventKey !== 'string' || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000) fail('INVALID_REVERSAL', 'Choose an event and enter a reason.')
    const state = await readReputation(Applicant, applicantId, now())
    const event = state.events.find(row => row.key === body.eventKey && row.status !== 'reversed' && !row.virtual)
    if (!event) fail('EVENT_UNAVAILABLE', 'Event unavailable or already reversed.', 409)
    const applied = await appendTrustEvents(Applicant, applicantId, [{ key: `admin-reverse:${event.key}`, type: 'reversal', targetKey: event.key, applicationId: event.applicationId, by: admin.email, reason: body.reason, at: now() }])
    if (applied) {
      await ReputationReview.updateMany({ applicantId, eventKey: event.key, status: { $in: ['pending', 'processing'] } }, { $set: { status: 'reversed', decision: 'reverse', reviewedBy: admin.email, reviewedAt: now(), adminNote: body.reason, publicReason: '' } })
      await audit({ key: `reputation-reverse:${applicantId}:${event.key}`, action: 'reputation_event_reversed', applicantId: new mongoose.Types.ObjectId(applicantId), eventKey: event.key, by: admin.email, reason: body.reason })
      await message(applicantId, 'PESO reversed a reputation event and recalculated your points. Open My reputation to view the updated history.')
    }
    return { ok: true, applied }
  }
  async function file(actor, reviewId) {
    if (!validId(reviewId)) fail('FILE_UNAVAILABLE', 'File unavailable.', 404)
    const review = await ReputationReview.findById(reviewId).lean()
    if (!review?.supportingVersion) fail('FILE_UNAVAILABLE', 'File unavailable.', 404)
    const owner = actor.role === 'Applicant' && await Applicant.exists({ _id: review.applicantId, email: actor.email, deletedAt: { $exists: false } })
    if (actor.role !== 'Admin' && !owner) fail('FORBIDDEN', 'File unavailable.', 403)
    const stored = await loadDocumentFile(review.applicantId, 'reputationReview', review.supportingVersion)
    if (!stored) fail('FILE_UNAVAILABLE', 'File unavailable.', 404)
    return { ...stored, name: review.originalName }
  }
  return { request, decide, reverse, file }
}
