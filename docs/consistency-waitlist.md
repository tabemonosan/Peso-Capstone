# Consistency waitlist implementation

Branch: `prompt/consistency-waitlist`. Baseline: `2bcf341`.

## Existing features reused

The initial inspection found all three required foundations: `shared/crossChecks.js`,
OCR comparison in `server/services/imageChecks.js`, and the existing Flagged for
review queue. It also found the local QR/signature provider, metadata-only
findings, audited verification settings, five-upload document versioning,
registration gating, explanations, notifications, and shared light form controls.
No replacement comparison module, second document store or second review queue
was created.

## Rules and defaults

`shared/consistencyWaitlist.js` contains version `2026-11-04.1`, the status
vocabulary, field-group allowlist, timing limits and defaults. OCR confidence
controls are server-side; they are never returned to applicants.

| Setting | Default | Allowed values |
| --- | --- | --- |
| `waitlistOnMismatch` | true | Boolean |
| `waitlistAttempts` | 3 | Integer 1–5 |
| `pesoContact` | Contact your local PESO office. | Nonempty text, max 300 characters |
| `pesoOfficeHours` | Contact PESO to confirm office hours. | Nonempty text, max 300 characters |

These settings extend the existing `nsrp_auto_settings` record and its audit
history. The ON/OFF state appears in the existing settings banner. Turning the
master switch OFF releases existing waitlists to ordinary review and prevents
new waitlists. It does not approve any account or delete its audit history.

Only reliable independent significant surname/first-name, date-of-birth or
ID-number differences beyond existing tolerances cause mismatch waitlisting.
Verified QR comparisons use the existing configured local signature provider.
Typed-only differences, minor differences, unreadable/low-confidence results,
quality warnings alone and unsupported formats stay in normal review. Duplicate
identifier or QR findings go to staff review with a generic owner message and
no correction charge for that finding. Sensitive characteristics and addresses
are not decision inputs; the existing married-name exception avoids false flags.

## Account flow and access

- New status: `waitlisted`. Sub-reasons are `cross_check_mismatch` and `staff_review`;
  owners receive neutral messages, not these internal reason identifiers.
- `under_review → waitlisted` after eligible independent findings.
- `waitlisted → under_review` after a passing correction, staff release, or
  disabling the master switch. Existing normal approval rules remain separate.
- `waitlisted → declined` only through a reasoned admin decision. A dedicated
  marker prevents profile/document reads from silently undoing that decision.
- Already approved accounts are not scanned by reads or profile-only edits.
  A new document or formal NSRP update starts a new check.

The existing session guard enforces the restricted route allowlist. Login/logout,
profile view/edit, My Documents, document uploads, document explanations,
notifications and account settings remain accessible. Employment routes,
including applying, referrals, interview acceptance and employment reports,
return **403 APPLICANT_WAITLISTED**. Owners can read office contact information
and hours from the consistency status card. UI navigation follows the same
restriction pattern used for applicants awaiting verification.

Each successful submission starts an asynchronous check against the current
versions. The owner sees “Your documents are being checked”. A 90-second timeout
or reader failure returns to normal review. Job/version/review tokens prevent
old results from waitlisting a newer version or overriding an admin decision.
An expired checking state is also recovered when its owner next requests status.

## Corrections, explanations and staff review

The correction ledger is independent of the five-upload cap. The lower available
limit controls submission. A replacement, corrected NSRP, or changed unapproved
basic identity submission reserves the affected document chances atomically.
Simultaneous submissions cannot reserve the same last chance. Failed saves and
technical failures refund reservations. Grants add correction chances, without
raising the five-upload cap or deleting versions.

At zero chances, uploads for that correction are blocked and the owner is asked
to contact PESO. The existing Explain a difference form stays available without
a charge: married name, corrected record, late-registered birth, ID name variant,
or other; a note up to 300 characters and an optional supporting document. Its
existing supporting-file upload cap still applies. Explanations remain visible
to admins even after a replacement version is submitted.

The existing queue includes a Waitlisted filter, a sidebar badge, field groups,
evidence labels, chances used/left, explanation state, waitlisted date and days
waiting. The existing image viewer presents comparison results and reads values
transiently for authorized administrators; no extracted text is stored. New
controls offer release, request another document, resolve, grant and decline.
All require a reason and retain an audit entry. Release requires “I compared the
documents” and the current unresolved count, then returns the account to review.

Seven inactive days produce one reminder; thirty inactive days produce a stale
tag for staff. Pending explanations pause reminders and stale tagging. Resolving
the explanation restarts the inactivity clock. No timer declines or deletes an
account. New waitlists have a daily admin digest; explanations and last correction
attempts have notifications.

## Signup and privacy

Birth-certificate copy type is required. Existing ID-number and expiry controls
are reused, including the National ID exception that avoids collecting its
number. The optional Check my documents button calls a separate advisory endpoint:
typed-ID comparisons, missing back-side advice, expiry and quality checks only.
It does not run OCR, change eligibility or block submission.

Owners see document/field-group labels, neutral messages, chances remaining,
approximate-reading guidance, next steps and office details. They never receive
extracted values, comparison IDs, confidence thresholds, other-account details
or audit sampling information. Findings and waitlist metadata contain field
groups, results, severity, evidence labels, policy version and timestamps rather
than extracted names, dates or numbers. Reasons entered by staff must not copy
document values. No new logs include document text or request bodies.

## Error codes

| Code | Meaning |
| --- | --- |
| `APPLICANT_WAITLISTED` | Employment access paused; HTTP 403 |
| `WAITLIST_ATTEMPTS_EXHAUSTED` | Correction chances exhausted; HTTP 409 |
| `WAITLIST_CHANGED` | Concurrent update/review; refresh before retrying |
| `WAITLIST_REVIEW_REQUIRED` | Use dedicated waitlist review controls |
| `REASON_REQUIRED` | Admin review reason missing/invalid |
| `COMPARISON_REQUIRED` | Release comparison/count confirmation missing |
| `INVALID_ATTEMPTS` | Invalid chance grant |
| `INVALID_ACTION`, `INVALID_ACCOUNT`, `INVALID_DOCUMENT`, `DOCUMENT_UNAVAILABLE` | Invalid review input |

The existing upload-limit responses remain in place. Bad new admin inputs return
400/409 and non-admins receive 403. Infrastructure failures use neutral 503
responses. Missing birth-copy type produces a signup field error.

## Assumptions and limitations

This measures consistency, not authenticity: a consistent forgery can pass.
Phone-photo OCR is approximate, so false flags are expected. Human review is
the final decision. Unsupported/unreadable PDFs remain manual; no PDF fields or
production issuer formats/keys are guessed. Uploaded NSRP registration uses its
existing typed basic information as the comparison baseline. Local issuer
signature verification is unavailable unless legitimate keys are configured.

Release means returning to `under_review`, following the requested transition;
normal document approval is a separate staff action. No actual office phone
number or hours were invented. PESO must configure those values. Existing
approved accounts are not backfilled or rescreened by this rollout.

## Files changed

Full manifest relative to the baseline, including implementation, regression
fixtures and this documentation:

```text
docs/verification.md
docs/consistency-waitlist.md
server/index.js
server/models/collections.js
server/routes/documentVerification.js
server/routes/nsrpAutomation.js
server/services/consistencyWaitlist.js
server/services/documentVerification.js
server/services/imageChecks.js
server/services/localImageReading.js
server/services/nsrpAutomation.js
server/services/referralWorkflow.js
server/services/verificationEngine.js
server/utils/applicantSessions.js
server/test/consistencyWaitlist.test.js
server/test/integration/consistencyWaitlist.integration.test.js
shared/consistencyWaitlist.js
shared/verification.js
src/App.jsx
src/components/AdminDocumentVerification.jsx
src/components/AdminNsrpAutomation.jsx
src/components/AdminWaitlistActions.jsx
src/components/ApplicantSignupWizard.jsx
src/components/CheckDocumentsButton.jsx
src/components/ConsistencyWaitlistCard.jsx
src/components/DeclaredDocumentFields.jsx
src/components/MyDocumentsModal.jsx
src/components/MyDocumentsPage.jsx
src/components/VerificationDocumentsForm.jsx
src/test/consistencyWaitlist.test.jsx
src/test/nsrpWizardUpload.test.jsx
src/test/skillsSignup.test.jsx
```

Existing signup UI fixtures now choose a valid birth-certificate copy type;
assertions were preserved. No test was removed or skipped.

## Validation

Final verification: **1,121 tests passed across 107 files** (129.77 seconds).
Production build and lint passed with existing warnings. The changed-file
manifest above was checked against Git and contains all 32 affected files.
Implementation commits: `548aa26` (initial implementation) and `c4d0275`
(final safeguards and regression coverage).

Tests use temporary MongoDB databases and generated images marked SAMPLE with
fictional data. OCR/mail are stubbed for the new integration suite; a locally
generated signed test QR validates the independent-evidence path. There are no
external network calls or real document fixtures in those tests. Tests cover
access controls, neutral owner responses, correction limits and concurrency,
explanations, admin audit/reasons, reminders, disabled automation, timeouts,
low-confidence results, verified QR, preflight advice and approved-account safety.

## How to undo this

First switch **Waitlist on mismatch** OFF in Verification rules. This releases
affected accounts into ordinary review and preserves the audit trail. Back up
the database before a deployment or rollback:

```powershell
mongodump --uri="<MongoDB URI>" --out="<backup folder>"
git switch prompt/consistency-waitlist
git log --oneline 2bcf341..HEAD
```

Revert the implementation commits newest first, using the hashes shown by the
log; keep the audit/documentation commits if desired. Do not reset or force push:

```powershell
git revert --no-commit c4d0275 548aa26
git commit -m "Revert consistency waitlist implementation"
```

No dependencies, environment variables, database indexes or collections were
added. No migration or configured-database cleanup was run. New data lives in
`applicants.consistencyState`, `applicants.consistencyDeclined`, the four settings
listed above in `nsrp_auto_settings`, its existing audit history, and ordinary
notification records. These metadata fields may remain after rollback. If policy
requires removing them, first release waitlisted accounts through the switch,
take a backup, and remove only those new fields/settings in a separately reviewed
maintenance operation. Keep employment records, documents, versions and review
audit history. Removing the code alone while leaving accounts with a waitlisted
status would leave an unsupported status in the older implementation.
