# Phase 4: cross-document comparison and explanations

`shared/crossChecks.js` contains pure name/date/ID comparison rules, normalization,
edit distance, middle initials, no-middle-name markers, mononyms, comma name order,
and the married-name exception. Addresses are never compared. Sex can only avoid
a flag and never provides approval evidence. Self-declared matches are typo
checks, never independent evidence or an attention-level result. A report never
changes a status or rejects an applicant. Independent significant differences
require human attention; unreadable fields are informational.

OCR parsing supports explicit English field labels. Unlabelled/uncertain fields
stay unreadable, not mismatched. For image IDs the worker can read a birth image
transiently for cross-document comparisons. Only field-group results, rule IDs,
severity, and evidence are saved. The admin viewer can re-read labelled values
on demand; those values are returned only to an administrator and never stored.
OCR jobs use a bounded queue (one active, at most 20 queued) and the shared daily
cap. PDF contents still remain manual; no issuer data is invented.

The `crossChecks` setting defaults ON and gates cross-document reading and
explanation submission. Applicants may send a category and up to 300 characters,
with one optional supporting PDF/JPG/PNG through the existing version/file store.
The optional `supportingExplanation` slot is not a verification requirement.
Explanations enter the flagged queue without changing document approval or
blocking the applicant. Notifications contain neutral field-group guidance,
never comparisons, personal values, duplicate findings, or another account.
The existing retention purge also covers supporting explanation files.

No dependencies/environment variables added. New stored data: comparison results,
explanation category/note/status, audit entries, and optional supporting-file
metadata/bytes. Extracted text and values are transient only.

The required full-suite run exposed an existing hiring-report mount-effect race
that could clear a date just entered by the user. `HireReportForm.jsx` now resets
fields only when its input report/outcome actually changes. The existing date
assertions were retained.

## How to undo this phase

Find the commit with `git log --oneline --grep="Add cross-document comparisons"`,
then `git revert <phase-4-commit>`. Remove `crossChecks` from settings if needed.
No packages require uninstalling. Preserve/export explanations and audit entries
before removing the optional supportingExplanation slot, its corresponding
document_files records, and new comparison/explanation metadata. No local database
changes or seeds were run during implementation.

## Files changed

- server/index.js
- server/models/collections.js
- server/services/documentUpload.js
- server/services/documentVerification.js
- server/services/imageChecks.js
- server/services/localImageReading.js
- server/test/integration/documentVerification.integration.test.js
- shared/verification.js
- shared/verificationDocs.js
- src/components/AdminDocumentImageViewer.jsx
- src/components/AdminNsrpAutomation.jsx
- src/components/MyDocumentsModal.jsx
- docs/verification-phase-4.md
- server/test/crossChecks.test.js
- shared/crossChecks.js
- src/components/DocumentExplanationForm.jsx
- src/components/HireReportForm.jsx
