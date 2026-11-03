# Phase 3: document images and declared details

`imageChecks` defaults ON. Sharp checks decodability, minimum 600×380 dimensions
(portrait orientation accepted), blank content, darkness, glare, blur and extreme
crop ratios. Images are autorotated and re-encoded without EXIF/GPS. PDFs must
decode and contain at most five pages; their contents remain manual in this
phase and receive `pdf_manual_reading`. Blur/crop heuristics are approximate.
Hard errors return 422; warnings remain uploadable. Browser feedback offers
Retake/Use anyway for detected soft issues; server checks are authoritative.

Declared metadata includes ID number/expiry, required passport expiry, and
birth-certificate copy type/reference. PhilSys Card/Paper/Digital formats never
collect a PhilSys/card number. Duplicate declared numbers are rejected; format
and expiry discrepancies are warnings. Existing document slots and storage are
reused. Consent mentions automatic image/consistency checks.

Local QR decoding runs in a worker with a two-second timeout. Only found/domain
and allowlist outcome are retained; decoded URLs are never fetched. The
allowlist is psahelpline.ph, psa.gov.ph, philsys.gov.ph and genuine subdomains,
marked TO CONFIRM for each issuer workflow. Admin buttons use fixed official
destinations, not decoded URL paths. Lookalikes, credentials and HTTP are not
linkable. Official references: [PSA e-Certificate verification](https://e-cert.psahelpline.ph/verify),
[PSA e-Certificate FAQ](https://psahelpline.ph/faq/PSA-ECert), and
[PSA National ID advisory](https://psa.gov.ph/content/public-advisory-37).
The newer everify.gov.ph workflow is outside the requested allowlist and is not
silently added. Public-key/QR integration remains TO CONFIRM in Phase 5.

Tesseract English data and its worker/core are resolved from installed local
dependencies. No runtime language downloads occur. OCR runs outside uploads,
one at a time per server process, with a 20-second timeout and a shared MongoDB
daily cap of 200. It returns comparisons only; unreadable fields are inconclusive,
never mismatches. PDF OCR is not enabled: those uploads stay manual. Normal
uploads do not wait for OCR. The runtime English data ships with the dependency,
not a network URL. Actual local OCR is covered by a generated-image test.

PSA authorization codes live only in `verification_private`, never document/list
responses, logs, URLs or notifications. An admin details endpoint can read the
code. It expires after 24 hours via a TTL index and is removed when an admin
records a result (engine cleanup is added in Phase 5). Reference numbers remain.
Existing supporting-file retention is unchanged. Daily OCR usage stores counts,
not personal data.

The admin queue viewer adds image zoom/rotation, front/back, and declared/NSRP
details side by side. Manual supporting-document approval requires a recorded
five-item checklist. Applicant/employer response whitelists hide the new fields.
Header-only PDF test fixtures were replaced with genuinely decodable generated
PDFs; checks were not weakened to accept corrupt files.

Dependencies: `sharp`, `jsqr`, `tesseract.js`, `@tesseract.js-data/eng`.
No new environment variables. The npm installation reports existing dependency
audit advisories; dependency upgrades outside these additions were not applied.

## How to undo this phase

Find the commit with `git log --oneline --grep="Add local document image"`, then
`git revert <phase-3-commit>`. To remove installed additions, use
`npm.cmd uninstall sharp jsqr tesseract.js '@tesseract.js-data/eng'` (or run
`npm.cmd ci` after reverting the lockfile). Remove the `imageChecks` setting,
quality/declared/QR/comparison metadata and manual checklist audit additions
only after preserving audits. `verification_private` contains expiring codes;
`verification_ocr_usage` contains daily counts. Do not remove document_files.
No local database was changed or seeded; tests use disposable databases.

## Files changed

- package-lock.json
- package.json
- server/index.js
- server/models/verification.js
- server/routes/documentVerification.js
- server/services/documentVerification.js
- server/test/integration/documentVerification.integration.test.js
- server/test/integration/fullLifecycle.integration.test.js
- server/test/integration/helpers.js
- server/test/integration/nsrpAutomation.integration.test.js
- shared/verification.js
- src/App.jsx
- src/components/AdminDocumentVerification.jsx
- src/components/AdminNsrpAutomation.jsx
- src/components/ApplicantSignupWizard.jsx
- src/components/ConfirmDialog.jsx
- src/components/EmployerSignupWizard.jsx
- src/components/MyDocumentsModal.jsx
- src/components/VerificationDocsReviewModal.jsx
- src/components/VerificationDocumentsForm.jsx
- src/test/adminDocumentVerification.test.jsx
- src/test/nsrpWizardUpload.test.jsx
- src/test/skillsSignup.test.jsx
- src/test/verificationDocsReview.test.jsx
- docs/verification-phase-3.md
- server/services/documentUpload.js
- server/services/imageChecks.js
- server/services/imageQuality.js
- server/services/localImageReading.js
- server/services/qrWorker.js
- server/test/documentImages.test.js
- shared/documentImage.js
- shared/manualDocumentReview.js
- src/components/AdminDocumentImageViewer.jsx
- src/components/DeclaredDocumentFields.jsx
- src/components/ManualDocumentChecklist.jsx
