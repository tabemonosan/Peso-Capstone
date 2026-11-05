# Retrieve details from a completed NSRP

During applicant signup, choose **I already have a filled NSRP form**, select the PDF, then select **Retrieve from NSRP**. Review the extracted values, confirm that they match the document, and select **Use these details**. Basic information is filled in for review; education, training, work history, and checked skills are saved when registration completes. Manual entry remains available if extraction fails or is skipped.

Existing applicants with an uploaded NSRP have the same action on **Applicant Profile**. Save or cancel active profile edits first. Import fills empty fields and adds missing qualifications without replacing existing edits, personal bios, traits, images, or an established registration reference. Repeating an import does not duplicate qualifications. Corrections to an established identity/reference still use the existing document correction process.

The reader supports the portal's standard two-page NSRP Form 1, including typed PDF text and marked skill boxes. Other layouts support matching named form fields or explicitly labelled text. Scans receive a limited local English OCR fallback; handwriting, rotated scans, unfamiliar layouts, and continuation sheets may require manual entry. Only the first two pages are read. Short printed years in employment/training ranges are retained as printed rather than assigning a century. Unreadable values are left blank; the applicant must review all results.

Extraction runs locally in a worker with a 45-second timeout, bounded page dimensions, a five-page/5 MB input limit, and at most two concurrent readers. No document text is sent to an external AI service. Document contents are treated as data. Login email, signatures, certification and document approval decisions are never imported. The existing private NSRP storage and employer-facing field restrictions continue to apply.

Signup extraction requires an unused email verification proof. Existing profile extraction requires the owner's applicant session. Results carry a 30-minute signed proof bound to the owner and PDF SHA-256; altered, expired or replaced-source proofs are rejected. Profile saving requires explicit confirmation and rejects concurrent profile changes. File bytes, extracted private identifiers and import proofs are not persisted in browser drafts. Server responses are marked `no-store`.

Implementation: `server/routes/nsrpImport.js`, `server/services/nsrpImport*.js`, `shared/nsrpImport.js`, and `src/components/NsrpImportReview.jsx`, integrated into signup and Applicant Profile. Existing PDF rendering packages are production dependencies.

Validation includes generated PDF extraction, checkbox detection, blank/malformed files, partial layouts, source-bound proofs, real-database signup/profile saves, owner access, preservation of profile edits, and browser review/autofill/file replacement flows. The supplied NSRP-Dioneda PDF was checked locally and is not included in the repository.

## How to undo this

Revert the commit that adds this feature, then run `npm ci` and rebuild. No database migration is required. Profiles already enriched by applicants remain stored; reverting the code does not delete their information.
