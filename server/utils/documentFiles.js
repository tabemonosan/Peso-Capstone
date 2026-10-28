// Storage for verification-document binaries. The Applicant document holds only
// version metadata; the bytes live in the `document_files` collection so an
// applicant record stays far below MongoDB's 16 MB BSON limit even with a full
// set of 5 MB uploads (NSRP PDF + resume + birth certificate + two ID sides).
import { DocumentFile } from '../models/collections.js'

// Store (or replace) one side of a document version. `file` is a multer-style
// object: { originalname, mimetype, size, buffer }.
export async function storeDocumentFile(applicantId, slot, version, side, file) {
  await DocumentFile.findOneAndUpdate(
    { applicant: applicantId, slot, version, side },
    {
      $set: {
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        data: file.buffer,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

// Load one side of a document version, including the select:false bytes.
// Returns null when no externalized file exists (pre-migration records still
// embed their bytes on the Applicant document; callers fall back to those).
export async function loadDocumentFile(applicantId, slot, version, side = 'front') {
  return DocumentFile.findOne({ applicant: applicantId, slot, version, side })
    .select('+data')
    .lean()
}

export async function deleteApplicantDocumentFiles(applicantId) {
  await DocumentFile.deleteMany({ applicant: applicantId })
}
