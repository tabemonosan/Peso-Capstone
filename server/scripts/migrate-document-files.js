// One-off migration: move embedded verification-document bytes out of the
// Applicant documents into the document_files collection. See
// server/utils/migrateDocumentFiles.js for the implementation.
//
// Usage: node server/scripts/migrate-document-files.js   (or: npm run migrate:document-files)
import 'dotenv/config'
import mongoose from 'mongoose'
import { migrateDocumentFiles } from '../utils/migrateDocumentFiles.js'

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
if (!uri) {
  console.error('Set MONGODB_URI (or MONGO_URI) before running this migration')
  process.exit(1)
}

try {
  await mongoose.connect(uri)
  const { movedFiles, migratedApplicants } = await migrateDocumentFiles()
  console.log(`Migration complete: moved ${movedFiles} file(s) from ${migratedApplicants} applicant(s) into document_files`)
} catch (err) {
  console.error('Migration failed:', err)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
