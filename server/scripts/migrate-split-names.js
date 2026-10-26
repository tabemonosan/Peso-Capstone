// One-time migration: split the legacy single `profile.name` on applicants into
// firstName / middleName / lastName (best-effort: first word = first name, last
// word = last name, anything between = middle name; a trailing Jr./Sr./II/III/IV
// is moved to suffix). Migrated records are flagged with needsNameConfirmation so
// the user is asked to confirm their name on next login.
// The legacy `profile.name` field is kept untouched until the migration is verified.
//
// Run:  node server/scripts/migrate-split-names.js
// Dry run:  node server/scripts/migrate-split-names.js --dry-run
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import { Applicant } from '../models/collections.js'
import { splitFullName, formatFullName } from '../../shared/nameFields.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/peso-portal'
const dryRun = process.argv.includes('--dry-run')

async function run() {
  await mongoose.connect(mongoUri)
  console.log('Connected to', mongoUri, dryRun ? '(dry run)' : '')

  // Only applicants who still have a legacy name but no structured parts
  const applicants = await Applicant.find({
    'profile.name': { $exists: true, $nin: ['', null] },
    $or: [{ 'profile.firstName': { $in: ['', null] } }, { 'profile.firstName': { $exists: false } }],
  })

  const report = { ranAt: new Date().toISOString(), dryRun, migrated: [], skipped: [] }
  for (const applicant of applicants) {
    const legacyName = applicant.profile?.name || ''
    const parts = splitFullName(legacyName)
    if (!parts.firstName) {
      report.skipped.push({ id: String(applicant._id), email: applicant.email, name: legacyName, reason: 'could not split name' })
      continue
    }
    report.migrated.push({ id: String(applicant._id), email: applicant.email, from: legacyName, to: parts })
    if (!dryRun) {
      applicant.profile.firstName = parts.firstName
      applicant.profile.middleName = parts.middleName
      applicant.profile.lastName = parts.lastName
      applicant.profile.suffix = parts.suffix
      applicant.needsNameConfirmation = true
      await applicant.save() // pre-validate hook re-syncs profile.name via formatFullName
    }
  }

  const reportPath = path.join(__dirname, '..', 'reports', 'name-migration-report.json')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`Migrated: ${report.migrated.length}, skipped: ${report.skipped.length}`)
  console.log('Report written to', reportPath)
  if (report.migrated.length) {
    console.log('Sample:', JSON.stringify(report.migrated[0], null, 2))
    console.log('Full name check:', formatFullName(report.migrated[0].to))
  }

  await mongoose.disconnect()
  console.log('Done')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
