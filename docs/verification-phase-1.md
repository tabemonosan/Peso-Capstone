# Document verification: Phase 1 foundations

The system checks consistency and evidence, not authenticity. It never infers
fraud or automatically declines an account. This phase extends the existing NSRP
automation, document versions, file storage, notification service, modal, and
confirmation dialog. It introduces no image reader or new provider.

## Settings

Settings use the existing `nsrp_auto_settings` document, with administrative
changes appended to its `history` with the administrator and timestamp. Existing
saved values are preserved; missing settings use the shared defaults and are
persisted when the administrator saves them. No migration is required.

| Key | Admin control | Default |
| --- | --- | --- |
| `automaticApproval` | Automatic approval master switch | ON |
| `applicant` | Generated applicant NSRP Form 1 | ON |
| `employer` | Generated employer NSRP Form 2 | ON |
| `birthCertificate` | Birth certificates | ON |
| `validId` | Valid IDs, both slots | ON |
| `minimumEvidence` | Independent, or None: typed data only, not recommended | `independent` |
| `auditPercent` | Audit sample percentage | 20 |
| `rateLimit` | Rolling approvals per IP HMAC and normalized mobile HMAC per 24 hours | 5 |
| `ocrTextReading` | OCR text reading | ON |
| `reviewToolsEnabled` | Document review queues and new actions | ON |

The existing NSRP engine obeys the master switch, role switch, evidence setting,
and account hold. No independent reader exists in Phase 1, so the default evidence
setting leaves new NSRPs pending with `Not independent`. The `none` option permits
the existing generated-NSRP approval path, including its sampling, quotas,
duplicate guards, and first-version restriction. It is an explicit opt-out of
the independent-evidence safeguard. Image OCR and automatic approval of birth
certificates or IDs remain unavailable until their later phases. Their switches
are prepared here and do not start image processing.

Saved audit percentages (including an existing 10%) remain unchanged. The new
20% default applies to a settings document created after this change. Turn the
master switch OFF to stop further automatic approvals. Review tools can be
disabled separately, retaining the original review fallback. Existing approvals
are not retroactively changed by a settings edit.

## Document records and privacy

Applicant versions and employer Form 2 versions share the verification metadata:
`autoApproved`, `approvedBy`, `autoApprovalSummary`, `adminConfirmedBy`,
`adminConfirmedAt`, and `findings`. Findings hold only `ruleId`, severity,
field group, evidence category, open/dismissed status, dismissing administrator,
and an administrative note. No extracted names, dates, ID numbers, or recognized
document text are collected or stored by this phase. Administrators must not put
personal document values in notes.

Additional metadata consists of `reviewReasons`, explanation request/submission
state, `reviewRevision`, and `verificationAudit`. Shared constants and a rules
version live in `shared/verification.js`. Existing document keys are imported
from `shared/verificationDocs.js` to retain one source of truth.

Account holds use `holdAutoApproval` and `autoApprovalHoldHistory`. These fields
are excluded from ordinary model queries. The admin queue explicitly projects
only review metadata and never returns file bytes or passwords. Owner document
and employer verification responses use their existing field whitelists. New
review actions send neutral status messages, not the administrative reason,
findings, sampling details, hashes, or rules. Existing legacy notes are retained;
there is no data rewrite in this phase.

## Review queues and actions

The light-theme sidebar adds **Flagged for review**, with a count, and
**Auto-approved**. Both paginate and sort on the server. The flagged queue starts
oldest first and highlights submissions waiting at least seven days. It includes
pending manual reviews, open warning/critical findings, audit samples, submitted
explanations, resubmission requests, and exceptions, with reason tags. Legacy NSRP
reports are read without a migration. The automatic list recognizes both old and
new system reviewer labels and filters by document type, dates in Asia/Manila,
and checked/unchecked state.

New actions require an admin, a reason of 1–500 characters, and the current
document version. Document updates use conditional status/version/revision
checks, with the audit entry in the same database update.

- Approve requires confirmation of the current unresolved warning/critical count.
  It does not dismiss those findings.
- Request resubmission records `needs_resubmission`; the applicant may replace
  that document without declining the account. The dialog prefills field-group
  reminders from findings.
- Decline is an explicit human decision and records `rejected` on the document.
- Resolve flag requires a note and records the administrator. A dismissed
  critical NSRP finding retains the existing manual-review safeguard.
- Ask for explanation records a request and sends a neutral request to contact
  PESO. The self-service explanation form belongs to Phase 4.
- Mark checked records the administrator and time on an automatic approval.
- Revoke returns an approved document to pending, clears its current approval
  and confirmation metadata, retains the audit, recomputes access, and notifies
  the owner. Administrative restrictions remain in effect.
- Hold/release auto-approval records an account-level audit entry.

The older applicant modal uses the same action service when the review tools
switch is ON. It also requires an approval reason and unresolved-flag confirmation.
The original NSRP dismiss/revoke routes synchronize their document and decision
records through that service. Existing employer account review requires a reason
and confirmation of document flags, and records the version audit. Approving
Form 2 alone in the new queue preserves the separate employer account approval
gate; it does not grant posting access.

Applicant verification continues to require NSRP, birth certificate, and ID #1.
ID #2 remains optional. Approved documents remain locked. Existing file retention
and storage are unchanged. Provider-level decision rules, image processing,
cross-checks, explanation uploads, and the in-person tier belong to later phases.

## Validation

The added MongoDB integration tests cover settings and audits, permission checks,
queue pagination/filtering/sorting, reason requirements for all actions, concurrent
approval, stale versions, confirmation metadata, revocation, holds, legacy-report
resolution, applicant/employer privacy, and the independent-evidence default.
Interface tests cover filters, paging, seven-day highlighting, sidebar counts,
approval confirmation, prefilled reasons, finding resolution, and checked filters.
Existing approval fixtures now supply reasons and acknowledge current flags;
their lifecycle and access assertions remain intact.

No dependencies or environment variables were added. Existing
`NSRP_HASH_SECRET`, `JWT_SECRET`, and `VERIFICATION_DOC_RETENTION_DAYS` remain in use.
`.env` and `.env.*` remain ignored, with `.env.example` permitted.

## Files changed

- `shared/verification.js`
- `server/models/verification.js`
- `server/models/collections.js`
- `server/services/documentVerification.js`
- `server/services/nsrpAutomation.js`
- `server/routes/documentVerification.js`
- `server/routes/nsrpAutomation.js`
- `server/index.js`
- `server/test/integration/documentVerification.integration.test.js`
- `server/test/integration/employerVerification.integration.test.js`
- `server/test/integration/fullLifecycle.integration.test.js`
- `server/test/integration/nsrpAutomation.integration.test.js`
- `server/test/integration/signup.integration.test.js`
- `src/App.jsx`
- `src/components/AdminDocumentVerification.jsx`
- `src/components/AdminNsrpAutomation.jsx`
- `src/components/MyDocumentsModal.jsx`
- `src/components/VerificationDocsReviewModal.jsx`
- `src/test/adminDocumentVerification.test.jsx`
- `src/test/adminNsrpAutomation.test.jsx`
- `src/test/verificationDocsReview.test.jsx`
- `docs/nsrp-checks.md`
- `docs/verification-phase-1.md`

## How to undo this phase

Find the phase commit, then revert that specific commit on the working branch:

```powershell
git log --oneline --grep="Add document verification foundations"
git revert <phase-1-commit>
```

No dependencies need uninstalling. No database changes or seed execution were
performed against local data while implementing this phase; integration tests
use disposable MongoDB instances. If the updated app has subsequently been used,
reverting code does not reverse administrative decisions or notifications.

Before reverting after real usage, export the affected records or make a backup:

```powershell
mongodump --uri="<your MongoDB URI>" --db="<your database>" --out="backups/pre-verification-rollback"
```

New database fields that can be removed after preserving the audit are the
verification-version fields listed above in applicant documents and employer
requests, and the two account hold fields in applicants/employers. New settings
keys are `automaticApproval`, `birthCertificate`, `validId`, `minimumEvidence`,
`ocrTextReading`, and `reviewToolsEnabled`. The existing applicant/employer
switches, audit percentage, rate limit, and settings history predate this phase;
restore their saved prior values instead of deleting the shared settings store.
The original default audit percentage was 10. Do not delete `document_files` or
the existing NSRP decision/identifier/rate collections to undo this phase.

If any documents now have `needs_resubmission`, review them and return them to
an appropriate legacy status before reverting: older applicant clients do not
understand that status. Keep audit history when undoing decisions. No destructive
database cleanup is performed automatically.
