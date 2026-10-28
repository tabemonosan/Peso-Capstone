// Core of the document-file migration: moves embedded verification-document
// bytes (verificationDocuments.<slot>.versions[].data and .back.data) out of
// Applicant documents into the document_files collection. Assumes mongoose is
// already connected. Idempotent: records whose data was moved are skipped.
import mongoose from 'mongoose'
import { DocumentFile } from '../models/collections.js'

export const MIGRATED_SLOTS = ['nsrpForm', 'birthCertificate', 'validId1', 'validId2', 'resume']

export async function migrateDocumentFiles() {
  const applicants = mongoose.connection.db.collection('applicants')
  // Work on raw documents so we can see the select:false embedded buffers.
  const cursor = applicants.find({
    $or: MIGRATED_SLOTS.flatMap((slot) => [
      { [`verificationDocuments.${slot}.versions.data`]: { $exists: true } },
      { [`verificationDocuments.${slot}.versions.back.data`]: { $exists: true } },
    ]),
  })

  let movedFiles = 0
  let migratedApplicants = 0
  for await (const applicant of cursor) {
    const unsets = {}
    for (const slot of MIGRATED_SLOTS) {
      const versions = applicant.verificationDocuments?.[slot]?.versions || []
      for (let index = 0; index < versions.length; index += 1) {
        const version = versions[index]
        const sides = [['front', version], ['back', version.back]]
        for (const [side, doc] of sides) {
          if (!doc?.data) continue
          const raw = doc.data
          const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer || raw)
          await DocumentFile.findOneAndUpdate(
            { applicant: applicant._id, slot, version: version.version, side },
            {
              $set: {
                mimetype: doc.mimetype,
                size: doc.size || buffer.length,
                uploadedAt: doc.uploadedAt || new Date(),
                data: buffer,
              },
            },
            { upsert: true, setDefaultsOnInsert: true },
          )
          const path = side === 'back'
            ? `verificationDocuments.${slot}.versions.${index}.back.data`
            : `verificationDocuments.${slot}.versions.${index}.data`
          unsets[path] = ''
          movedFiles += 1
        }
      }
    }
    if (Object.keys(unsets).length) {
      await applicants.updateOne({ _id: applicant._id }, { $unset: unsets })
      migratedApplicants += 1
    }
  }
  return { movedFiles, migratedApplicants }
}
