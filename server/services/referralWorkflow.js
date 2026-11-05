import { readReputation } from './trustPolicy.js'
import crypto from 'node:crypto'
import mongoose from 'mongoose'

export class ApplicationError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status }
}
const fail = (code, message, status) => { throw new ApplicationError(code, message, status) }
const dayKey = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
export const WITHDRAWN_REFERRALS = ['withdrawn_by_admin', 'withdrawn']

export function createReferralWorkflow({ Applicant, Employer, JobPosting, JobApplication, Referral, HireReport, Notification, notify, notifyAdmins, loadApplicant, loadEmployerVerification, loadNsrpFile }) {
  const db = () => mongoose.connection.db
  const config = () => db().collection('referral_settings')
  const quotas = () => db().collection('application_rate_limits')
  const audit = () => db().collection('referral_audit')
  let indexedDb
  const getSettings = async () => ({ automaticReferral: true, lowTrustRouting: false, history: [], ...(await config().findOne({ _id: 'settings' }) || {}) })
  async function setAutomatic(enabled, by) {
    if (typeof enabled !== 'boolean') fail('INVALID_SETTING', 'Automatic referral must be on or off.', 403)
    await config().updateOne({ _id: 'settings' }, { $set: { automaticReferral: enabled }, $push: { history: { action: 'automatic_referral_changed', enabled, by, at: new Date() } } }, { upsert: true })
    return getSettings()
  }
  async function setLowTrustRouting(enabled, by) {
    if (typeof enabled !== 'boolean') fail('INVALID_SETTING', 'Low-trust routing must be on or off.', 403)
    await config().updateOne({ _id: 'settings' }, { $set: { lowTrustRouting: enabled }, $push: { history: { action: 'low_trust_routing_changed', enabled, by, at: new Date() } } }, { upsert: true })
    return getSettings()
  }
  async function filledIds(job) {
    const reports = await HireReport.distinct('applicantId', { jobId: job._id, status: { $in: ['hired', 'deployed'] }, $or: [{ reportedByRole: 'Employer' }, { reportedByRole: { $exists: false } }] })
    return [...new Set([...(job.hiredApplicantIds || []), ...reports].map(String))].map((id) => new mongoose.Types.ObjectId(id))
  }
  async function receivingEmployer(job) {
    const { employer, status } = await loadEmployerVerification(job.createdBy)
    if (!employer || status !== 'approved' || employer.verificationStatus === 'restricted') fail('EMPLOYER_NOT_APPROVED', 'This employer is not accepting applications right now.', 403)
    if (employer.receivingApplicantsSuspendedAt) fail('EMPLOYER_APPLICATIONS_SUSPENDED', 'This employer is not accepting applications right now.', 403)
    return employer
  }
  async function checkEligibility({ email, jobId, manual = false, sharingConsent }) {
    if (!mongoose.isValidObjectId(jobId)) fail('JOB_UNAVAILABLE', 'This job is no longer accepting applications.')
    const applicant = await loadApplicant(email)
    if (applicant?.verificationStatus === 'waitlisted') fail('APPLICANT_WAITLISTED', 'Your account needs a review by PESO staff. Open My Documents to correct or explain a difference.', 403)
    if (!applicant || applicant.deletedAt || applicant.verificationStatus === 'restricted' || applicant.suspendedAt || applicant.applyingSuspendedAt) fail('APPLICANT_SUSPENDED', 'This account cannot apply right now. Please contact PESO.', 403)
    if (!applicant.emailVerified) fail('EMAIL_NOT_VERIFIED', 'Please verify your email before applying.', 403)
    if (applicant.verificationStatus !== 'approved') fail('APPLICANT_NOT_VERIFIED', 'PESO must approve your registration and documents before you apply.', 403)
    if (!manual && sharingConsent !== true && sharingConsent !== 'true') fail('SHARING_CONSENT_REQUIRED', 'Confirm that your profile summary may be shared with this employer.', 403)
    const job = await JobPosting.findById(jobId).lean()
    if (!job || job.status !== 'approved') fail('JOB_UNAVAILABLE', 'This job is no longer accepting applications.')
    if (job.acceptingApplications === false || job.deadline && +job.deadline < Date.now()) fail('APPLICATION_CLOSED', 'This job is no longer accepting applications.')
    if (job.slots > 0 && (await filledIds(job)).length >= job.slots) fail('JOB_FILLED', 'All available positions for this job have been filled.')
    const employer = await receivingEmployer(job)
    const existing = await JobApplication.findOne({ jobId: job._id, applicantEmail: applicant.email }).lean()
    const previousReferral = await Referral.findOne({ jobId: job._id, applicantId: applicant._id }).lean()
    const reapplying = existing?.deliveryStatus === 'withdrawn' && Boolean(existing.invitationDeclinedAt)
    const reusableReferral = previousReferral?.status === 'withdrawn' && previousReferral.history?.some(entry => entry.action === 'interview_declined') && (reapplying || manual && existing?.deliveryStatus === 'pending_admin') ? previousReferral : null
    if (previousReferral && !reusableReferral || !manual && !reapplying && (existing || (job.applicants || []).some((entry) => entry.email === applicant.email))) fail('ALREADY_APPLIED', 'You have already applied for this job.')
    if (manual && existing && !reapplying && !['pending_admin', undefined].includes(existing.deliveryStatus)) fail('ALREADY_APPLIED', 'This application has already been processed.')
    const today = await quotas().findOne({ _id: `account:${applicant._id}:${dayKey()}` })
    if ((!existing || reapplying) && (today?.reservations?.length || 0) >= 10) fail('DAILY_APPLICATION_LIMIT', 'You have reached the daily limit of 10 applications. Try again tomorrow.')
    return { applicant, job, employer, existing, reapplying, reusableReferral }
  }
  async function reserveQuota(applicantId, applicationId, ip) {
    if (indexedDb !== db()) {
      await quotas().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      indexedDb = db()
    }
    const now = new Date()
    const secretCollection = db().collection('application_private_keys')
    await secretCollection.updateOne({ _id: 'ip-hash' }, { $setOnInsert: { secret: crypto.randomBytes(32).toString('hex') } }, { upsert: true })
    const secret = (await secretCollection.findOne({ _id: 'ip-hash' })).secret
    const ipHash = crypto.createHmac('sha256', secret).update(String(ip || 'unknown')).digest('hex')
    const accountKey = `account:${applicantId}:${dayKey(now)}`
    const ipKey = `ip:${ipHash}:${Math.floor(+now / 600000)}`
    const reserved = []
    try {
      for (const [key, maximum, code, message] of [
        [accountKey, 10, 'DAILY_APPLICATION_LIMIT', 'You have reached the daily limit of 10 applications. Try again tomorrow.'],
        [ipKey, 60, 'APPLICATION_RATE_LIMITED', 'Too many applications were sent from this connection. Please try again in a few minutes.'],
      ]) {
        await quotas().updateOne({ _id: key }, { $setOnInsert: { reservations: [], expiresAt: new Date(+now + 2 * 86400000) } }, { upsert: true })
        const result = await quotas().updateOne({ _id: key, $expr: { $lt: [{ $size: '$reservations' }, maximum] } }, { $push: { reservations: { id: String(applicationId), at: now } } })
        if (!result.modifiedCount) fail(code, message)
        reserved.push(key)
      }
    } catch (error) {
      await quotas().updateMany({ _id: { $in: reserved } }, { $pull: { reservations: { id: String(applicationId) } } })
      throw error
    }
    return reserved
  }
  async function digest(applicationCount, referralCount) {
    const day = dayKey()
    const digests = db().collection('application_digest')
    await digests.updateOne({ _id: day }, { $inc: { applications: applicationCount, referrals: referralCount }, $setOnInsert: { notified: false } }, { upsert: true })
    const claim = await digests.updateOne({ _id: day, notified: false }, { $set: { notified: true } })
    if (claim.modifiedCount) await notifyAdmins({ type: 'application_referral_digest', title: 'Daily applications and referrals', message: 'Applications and referrals are recorded in Referrals and applications.', link: '/peso-referrals', metadata: { day } })
    const totals = await digests.findOne({ _id: day })
    await Notification.updateMany({ type: 'application_referral_digest', 'metadata.day': day, $and: [{ $or: [{ 'metadata.applications': { $exists: false } }, { 'metadata.applications': { $lte: totals.applications } }] }, { $or: [{ 'metadata.referrals': { $exists: false } }, { 'metadata.referrals': { $lte: totals.referrals } }] }] }, { $set: { message: `${day}: ${totals.applications} new application(s), ${totals.referrals} new referral(s).`, 'metadata.applications': totals.applications, 'metadata.referrals': totals.referrals } })
  }
  async function submit({ email, jobId, sharingConsent, nsrpFile, applicationDetails, resumeFile, ip, source = 'auto', adminId, adminEmail, reason }) {
    const manual = source === 'admin'
    if (manual && (typeof reason !== 'string' || !reason.trim() || reason.length > 500)) fail('REASON_REQUIRED', 'Enter a reason of 1 to 500 characters.', 403)
    const { applicant, employer, job, existing, reapplying, reusableReferral } = await checkEligibility({ email, jobId, manual, sharingConsent })
    await Promise.all([JobApplication.init(), Referral.init()])
    const settings = await getSettings()
    const reputation = !manual && settings.lowTrustRouting ? await readReputation(Applicant, applicant._id) : null
    const lowTrustReview = !manual && settings.lowTrustRouting && reputation.points < reputation.settings.atRiskBelow
    const automatic = manual || settings.automaticReferral && !lowTrustReview
    const now = new Date(), by = manual ? adminEmail : 'System'
    const id = existing?._id || new mongoose.Types.ObjectId()
    const initial = { action: manual ? 'manual_referral' : 'application_submitted', status: automatic ? 'pending' : 'pending_admin', by, reason: manual ? reason.trim() : undefined, at: now }
    const reservationId = reapplying ? crypto.randomUUID() : id
    let attemptSnapshot, archiveId, reactivatedReferral = false
    let created = false, claimedExisting = false, insertedReferral = false, pushed = false, quotaKeys = []
    try {
      if (existing) {
        const changed = await JobApplication.updateOne({ _id: id, $or: reapplying ? [{ deliveryStatus: 'withdrawn', invitationDeclinedAt: { $exists: true } }] : [{ deliveryStatus: 'pending_admin' }, { deliveryStatus: { $exists: false } }] }, { $set: { deliveryStatus: 'processing' } })
        if (!changed.modifiedCount) fail('ALREADY_APPLIED', 'This application has already been processed.')
        claimedExisting = true
        if (reapplying) {
          const Interview = mongoose.model('Interview')
          const [saved, meeting] = await Promise.all([JobApplication.findById(id).select('+nsrpFile.data +resumeFile.data +reviewQueue').lean(), Interview.findOne({ referralId: reusableReferral?._id, status: 'declined' }).lean()])
          if (!saved || !meeting || !reusableReferral) fail('APPLICATION_CHANGED', 'The declined invitation changed. Refresh and try again.')
          attemptSnapshot = { application: { ...saved, deliveryStatus: existing.deliveryStatus }, referral: reusableReferral, interview: meeting }
          archiveId = (await db().collection('application_attempts').insertOne({ applicationId: id, ...attemptSnapshot, archivedAt: now })).insertedId
          quotaKeys = await reserveQuota(applicant._id, reservationId, ip)
          await JobApplication.updateOne({ _id: id, deliveryStatus: 'processing' }, { $set: { nsrpFile: nsrpFile || await loadNsrpFile(applicant), applicationDetails: applicationDetails || saved.applicationDetails, resumeFile: resumeFile || saved.resumeFile, submittedAt: now, lastActivityAt: now, sharingConfirmedAt: manual ? saved.sharingConfirmedAt : now, jobTitle: job.title, employerName: employer.companyName || job.company, reviewQueue: lowTrustReview ? 'low_trust' : automatic ? '' : 'manual' } })
          await Interview.deleteOne({ _id: meeting._id, status: 'declined' })
        }
      } else {
        await JobApplication.create({ _id: id, jobId: job._id, applicantId: applicant._id, employerId: employer._id, applicantEmail: applicant.email, jobTitle: job.title, employerName: employer.companyName || job.company, reviewQueue: lowTrustReview ? 'low_trust' : automatic ? undefined : 'manual', nsrpFile: nsrpFile || await loadNsrpFile(applicant), applicationDetails, resumeFile, source, deliveryStatus: 'processing', sharingConfirmedAt: manual ? undefined : now, history: [], submittedAt: now })
        created = true
        quotaKeys = await reserveQuota(applicant._id, id, ip)
      }
      if (automatic) {
        if (reusableReferral) {
          const changed = await Referral.updateOne({ _id: reusableReferral._id, status: 'withdrawn' }, { $set: { status: 'pending', source, deliveryState: 'processing', referredBy: manual ? adminId : undefined }, $push: { history: initial } })
          if (!changed.modifiedCount) fail('APPLICATION_CHANGED', 'This application changed. Refresh and try again.')
          reactivatedReferral = true
        } else {
          await Referral.create({ _id: id, applicationId: id, jobId: job._id, applicantId: applicant._id, employerId: employer._id, referredBy: manual ? adminId : undefined, source, status: 'pending', deliveryState: 'processing', history: [initial], createdAt: now })
          insertedReferral = true
        }
      }
      await receivingEmployer(job)
      const openFilter = { _id: job._id, status: 'approved', acceptingApplications: { $ne: false }, $and: [
        { $or: [{ deadline: null }, { deadline: { $gte: new Date() } }] },
        { $or: [{ slots: null }, { slots: { $lte: 0 } }, { $expr: { $lt: [{ $size: { $ifNull: ['$hiredApplicantIds', []] } }, '$slots'] } }] },
      ] }
      if (!await JobPosting.exists(openFilter)) fail('APPLICATION_CLOSED', 'This job is no longer accepting applications.')
      if (!(job.applicants || []).some((entry) => entry.email === applicant.email)) {
        const changed = await JobPosting.updateOne({ ...openFilter, 'applicants.email': { $ne: applicant.email } }, { $push: { applicants: { email: applicant.email, appliedAt: now } } })
        if (!changed.modifiedCount) fail('APPLICATION_CLOSED', 'This job is no longer accepting applications.')
        pushed = true
      }
      await JobApplication.updateOne({ _id: id, deliveryStatus: 'processing' }, { $set: { applicantId: applicant._id, employerId: employer._id, source, deliveryStatus: automatic ? 'delivered' : 'pending_admin', ...(automatic ? { referralId: id } : {}) }, $unset: { ...(reapplying ? { invitationDeclinedAt: '' } : {}), ...(!automatic ? { referralId: '' } : {}) }, $push: { history: initial } })
      if (automatic) await Referral.updateOne({ _id: id, deliveryState: 'processing' }, { $set: { deliveryState: 'ready' } })
      if (lowTrustReview) await audit().insertOne({ action: 'application_routed_for_review', applicationId: id, applicantId: applicant._id, by: 'System', reason: 'Low-trust routing setting enabled', at: now })
    } catch (error) {
      if (insertedReferral) await Referral.deleteOne({ _id: id })
      if (created) await JobApplication.deleteOne({ _id: id })
      if (reactivatedReferral) await Referral.collection.replaceOne({ _id: reusableReferral._id }, reusableReferral)
      if (attemptSnapshot) {
        await JobApplication.collection.replaceOne({ _id: id }, attemptSnapshot.application)
        await mongoose.model('Interview').collection.replaceOne({ _id: attemptSnapshot.interview._id }, attemptSnapshot.interview, { upsert: true })
      }
      if (archiveId) await db().collection('application_attempts').deleteOne({ _id: archiveId })
      if (claimedExisting && !attemptSnapshot) await JobApplication.updateOne({ _id: id, deliveryStatus: { $in: ['processing', 'delivered'] } }, {
        $set: { deliveryStatus: existing.deliveryStatus || 'pending_admin', history: existing.history || [], ...(existing.source ? { source: existing.source } : {}), ...(existing.referralId ? { referralId: existing.referralId } : {}) },
        $unset: { ...(!existing.source ? { source: '' } : {}), ...(!existing.referralId ? { referralId: '' } : {}) },
      })
      if (pushed) await JobPosting.updateOne({ _id: job._id }, { $pull: { applicants: { email: applicant.email } } })
      if (quotaKeys.length) await quotas().updateMany({ _id: { $in: quotaKeys } }, { $pull: { reservations: { id: String(reservationId) } } })
      if (error.code === 11000) fail('ALREADY_APPLIED', 'You have already applied for this job.')
      if (error instanceof ApplicationError) throw error
      console.error('[application] delivery failed; request rolled back')
      fail('APPLICATION_UNAVAILABLE', 'Your application could not be submitted. Please try again.')
    }
    try {
      const metadata = { applicationId: String(id), ...(automatic ? { referralId: String(id) } : {}), applicantId: String(applicant._id), jobId: String(job._id), employerId: String(employer._id), source }
      await notify({ recipient: { id: applicant._id, role: 'Applicant', email: applicant.email }, type: 'application_submitted', title: 'Application submitted', message: automatic ? `Your application for "${job.title}" was shared with ${employer.companyName || job.company}.` : `Your application is being reviewed.`, email: true, link: '/jobs', metadata })
      if (automatic) await notify({ recipient: { id: employer._id, role: 'Employer', email: employer.email }, type: 'referral_received', title: 'New application received', message: `A new applicant is available for "${job.title}". Open Referrals to review their profile summary.`, email: true, link: '/referrals', metadata })
      await digest(created || reapplying ? 1 : 0, automatic ? 1 : 0)
      const recent = await JobApplication.countDocuments({ applicantId: applicant._id, submittedAt: { $gte: new Date(+now - 600000) } })
      if (recent >= 5) await JobApplication.updateOne({ _id: id }, { $push: { findings: { code: 'APPLICATION_BURST', severity: 'info', at: now } } })
    } catch { console.error('[application] notification or digest unavailable') }
    const savedJob = await JobPosting.findById(job._id).lean()
    delete savedJob.notesToAdmin
    savedJob.applicants = savedJob.applicants.filter((entry) => entry.email === applicant.email)
    return { success: true, applicationId: String(id), referralId: automatic ? String(id) : null, deliveryStatus: automatic ? 'delivered' : 'pending_admin', job: savedJob }
  }
  async function pullBack(id, by, reason) {
    if (!mongoose.isValidObjectId(id)) fail('INVALID_REFERRAL', 'Choose a valid referral.', 403)
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) fail('REASON_REQUIRED', 'Enter a reason of 1 to 500 characters.', 403)
    const entry = { action: 'pull_back', status: 'withdrawn_by_admin', reason: reason.trim(), by, at: new Date() }
    const referral = await Referral.findOneAndUpdate({ _id: id, status: { $nin: WITHDRAWN_REFERRALS } }, { $set: { status: 'withdrawn_by_admin' }, $push: { history: entry } }, { returnDocument: 'after' }).lean()
    if (!referral) fail('REFERRAL_ALREADY_WITHDRAWN', 'This application is already withdrawn or unavailable.')
    await JobApplication.updateOne({ jobId: referral.jobId, applicantEmail: (await Applicant.findById(referral.applicantId).select('email').lean())?.email }, { $set: { deliveryStatus: 'withdrawn_by_admin' }, $push: { history: entry } })
    await audit().insertOne({ ...entry, referralId: referral._id, applicantId: referral.applicantId, employerId: referral.employerId, jobId: referral.jobId })
    await notify({ recipient: { id: referral.applicantId, role: 'Applicant' }, type: 'application_review_update', title: 'Application update', message: 'Your application has returned to PESO review. It remains in your application history.', link: '/jobs', email: true })
    return referral
  }
  async function suspendEmployer(id, suspended, by, reason) {
    if (!mongoose.isValidObjectId(id)) fail('INVALID_EMPLOYER', 'Choose a valid employer.', 403)
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) fail('REASON_REQUIRED', 'Enter a reason of 1 to 500 characters.', 403)
    const entry = { action: suspended ? 'suspend_receiving' : 'resume_receiving', reason: reason.trim(), by, at: new Date() }
    const update = { $push: { applicationAccessHistory: entry }, ...(suspended ? { $set: { receivingApplicantsSuspendedAt: entry.at, receivingApplicantsSuspensionReason: reason.trim() } } : { $unset: { receivingApplicantsSuspendedAt: '', receivingApplicantsSuspensionReason: '' } }) }
    const employer = await Employer.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean()
    if (!employer) fail('INVALID_EMPLOYER', 'Employer not found.', 403)
    await audit().insertOne({ ...entry, employerId: employer._id })
    await notify({ recipient: { id: employer._id, role: 'Employer', email: employer.email }, type: 'employer_application_access', title: suspended ? 'Receiving applications suspended' : 'Receiving applications resumed', message: suspended ? 'PESO has paused new applications to your jobs. Existing applications remain on file.' : 'PESO has resumed new applications to your approved open jobs.', email: true, link: '/referrals' })
    if (suspended) await notifyAdmins({ type: 'employer_applications_suspended', title: 'Employer receiving applications suspended', message: `${employer.companyName} was suspended from receiving new applications.`, metadata: { employerId: String(id) }, link: '/peso-referrals' })
    return { id: String(id), suspended }
  }
  async function reserveHireSlot(job, applicantId) {
    const existing = await filledIds(job)
    const target = new mongoose.Types.ObjectId(applicantId)
    const occupied = { $setUnion: [{ $ifNull: ['$hiredApplicantIds', []] }, { $literal: existing }] }
    const previous = await JobPosting.collection.findOneAndUpdate({ _id: job._id, $expr: { $or: [
      { $in: [target, occupied] }, { $lte: [{ $ifNull: ['$slots', 0] }, 0] }, { $lt: [{ $size: occupied }, '$slots'] },
    ] } }, [{ $set: { hiredApplicantIds: { $setUnion: [occupied, [target]] } } }], { returnDocument: 'before' })
    if (!previous) fail('JOB_FILLED', 'All available positions for this job have been filled.')
  }
  return { getSettings, setAutomatic, setLowTrustRouting, checkEligibility, submit, pullBack, suspendEmployer, reserveHireSlot, filledIds, audit }
}
