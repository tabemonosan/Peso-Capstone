// One-off migration after the resume became optional (2026-10): recompute the
// account-level verificationStatus of applicants whose only missing required
// document was the resume. Required documents are now nsrpForm, birth
// certificate, and Valid ID #1 (see shared/verificationDocs.js).
//
// Usage: node server/scripts/recompute-verification-status.js [--dry-run]
import 'dotenv/config'
import mongoose from 'mongoose'
import { Applicant } from '../models/collections.js'
import { REQUIRED_DOC_KEYS } from '../../shared/verificationDocs.js'

const dryRun = process.argv.includes('--dry-run')

const latestVersion = (slot) => (slot?.versions?.length ? slot.versions[slot.versions.length - 1] : null)
const statusOf = (slot) => latestVersion(slot)?.status || 'missing'

await mongoose.connect(process.env.MONGODB_URI)

const applicants = await Applicant.find({}).lean()
let approved = 0
let declined = 0
let underReview = 0
let unchanged = 0

for (const applicant of applicants) {
  const docs = applicant.verificationDocuments || {}
  const rejected = REQUIRED_DOC_KEYS.filter((key) => statusOf(docs[key]) === 'rejected')
  let next
  if (rejected.length > 0) next = 'declined'
  else if (REQUIRED_DOC_KEYS.every((key) => statusOf(docs[key]) === 'approved')) next = 'approved'
  else next = 'under_review'

  if (next === applicant.verificationStatus) {
    unchanged += 1
    continue
  }
  if (next === 'approved') approved += 1
  else if (next === 'declined') declined += 1
  else underReview += 1
  // Never log the email address; report ids only.
  console.log(`applicant ${applicant._id}: ${applicant.verificationStatus} -> ${next}`)
  if (!dryRun) {
    await Applicant.updateOne({ _id: applicant._id }, { $set: { verificationStatus: next, ...(next === 'declined' ? {} : { verificationReason: undefined }) } })
  }
}

console.log(`${dryRun ? '[dry run] ' : ''}Done. approved: ${approved}, declined: ${declined}, under_review: ${underReview}, unchanged: ${unchanged}`)
await mongoose.disconnect()
