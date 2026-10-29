// OPTIONAL cleanup for legacy resume data. Resumes are no longer part of the
// applicant document system; stored data was kept in place. This script LISTS
// what it would delete by default, and only deletes with --delete.
//
// Usage:
//   node server/scripts/cleanup-resumes.js            # list only (dry run)
//   node server/scripts/cleanup-resumes.js --delete   # actually delete
import 'dotenv/config'
import mongoose from 'mongoose'
import { Applicant, DocumentFile } from '../models/collections.js'

const deleting = process.argv.includes('--delete')

await mongoose.connect(process.env.MONGODB_URI)

const withLegacyFile = await Applicant.find({ 'resumeFile.data': { $exists: true } }).select('_id resumeFile.originalName resumeFile.size').lean()
const withSlot = await Applicant.find({ 'verificationDocuments.resume.versions.0': { $exists: true } }).select('_id verificationDocuments.resume').lean()
const storedFiles = await mongoose.connection.db.collection('document_files').find({ slot: 'resume' }).toArray()

const kb = (bytes) => `${Math.ceil((bytes || 0) / 1024)} KB`

console.log(deleting ? 'DELETE MODE — the following will be removed:' : 'DRY RUN — the following would be removed (rerun with --delete):')
console.log(`- Legacy embedded resumeFile on ${withLegacyFile.length} applicant(s)`)
for (const a of withLegacyFile) console.log(`    applicant ${a._id}: ${a.resumeFile?.originalName || 'resume'} (${kb(a.resumeFile?.size)})`)
console.log(`- verificationDocuments.resume slot on ${withSlot.length} applicant(s)`)
for (const a of withSlot) {
  const versions = a.verificationDocuments?.resume?.versions || []
  console.log(`    applicant ${a._id}: ${versions.length} version(s)`)
}
console.log(`- ${storedFiles.length} document_files row(s) with slot "resume"`)
for (const f of storedFiles) console.log(`    document_files ${f._id} (applicant ${f.applicant}, v${f.version} ${f.side}, ${kb(f.size)})`)

if (!deleting) {
  console.log('Nothing was deleted.')
} else {
  const fileResult = await mongoose.connection.db.collection('document_files').deleteMany({ slot: 'resume' })
  const legacyResult = await Applicant.updateMany({ 'resumeFile.data': { $exists: true } }, { $unset: { resumeFile: '' } })
  const slotResult = await Applicant.updateMany(
    { 'verificationDocuments.resume.versions.0': { $exists: true } },
    { $unset: { 'verificationDocuments.resume': '' } },
  )
  console.log(`Deleted ${fileResult.deletedCount} document_files row(s), cleared legacy resumeFile on ${legacyResult.modifiedCount} applicant(s), removed resume slot on ${slotResult.modifiedCount} applicant(s).`)
}

await mongoose.disconnect()
