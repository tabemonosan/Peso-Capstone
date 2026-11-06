# Phase 2: NSRP consistency checks

Shared applicant and employer checks now cover chronology, employment consistency,
plausibility, junk inputs, repeated/sequential identifiers, catalog locations,
disposable emails, and employer-specific reminders. Thresholds live in
`CHECK_LIMITS`. Findings contain identifiers and categories only, never submitted
values. Checks do not change a document status; the separate engine decides.

Age, civil status, and address findings have `approvalBlocking: false`. This
resolves the specification's fairness conflict: those checks may suggest a typo
but never decide approval. Sex, religion, and disability are not inspected.
Late graduation, birth in 1950, short/foreign surnames, and overlapping part-time
work are accepted. The Preview panel is advisory and displays only field-group
reminders, with Fix buttons, never duplicate findings or detection rules.

New `dataChecks` setting defaults ON. Disabling it retains the original NSRP
checks and identifier guards, and disables the expanded server checks/claims.
Duplicate claims use the existing HMAC registry with MongoDB's unique `_id`
index. Added claims cover passport, mobile, normalized name/birth date, and
employer establishment/city. TIN comparisons still span account roles. Claims
are recorded on NSRP save/submission; old accounts acquire the extra claims on
their next submission, without a migration. Applicant responses never reveal
another account. The disposable-domain list is intentionally finite.

Files: `shared/nsrpChecks.js`, `shared/nsrp2Checks.js`, `shared/verification.js`,
`server/models/verification.js`, `server/services/nsrpAutomation.js`,
`server/utils/redact.js`, `server/test/nsrpConsistency.test.js`,
`server/test/integration/nsrpAutomation.integration.test.js`,
`server/test/integration/documentVerification.integration.test.js`,
`src/components/NsrpDoubleCheckPanel.jsx`, `src/components/ApplicantSignupWizard.jsx`,
`src/components/AdminNsrpAutomation.jsx`, and this report.

## How to undo this phase

Use `git log --oneline --grep="Expand NSRP consistency"`, then
`git revert <phase-2-commit>`. No dependencies or environment variables were
added. Remove the new `dataChecks` settings key if the app has been used, and
preserve/export audit history. The new HMAC claims share the existing identifier
collection; do not delete the collection. A restore from the pre-phase dump can
remove newly created claims if needed. No local database was changed during
implementation; integration tests use disposable MongoDB instances.
