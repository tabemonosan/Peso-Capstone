# NSRP data checks

Online applicant Form 1 and employer Form 2 submissions receive a server-side,
version-specific report before an automatic approval decision. Reports are stored
in `nsrp_auto_decisions`, with the document version, rules version, timestamp,
findings and severity counts. `clear` means no warning or critical findings;
`review` means warnings; `attention` means a critical finding.

The first rule set checks missing business/contact/work-preference fields,
employment/training date order, repeated-digit identifiers and duplicate TIN,
SSS/GSIS, Pag-IBIG and PhilHealth identifiers where structured data is available.
TIN comparisons include applicants and employers. Existing structured records
are checked as well as the hashed identifier registry. Findings contain codes,
not submitted values. Admins can inspect the report in Verification rules.

## Auto-approval

Only the NSRP document can be automatically approved. Birth certificates, both
valid IDs, other documents, job postings and accounts are never automatically
approved by this service. Existing applicant status calculation still requires
all three required documents to be approved. Employer Form 2 approval does not
grant employer access: the existing administrator account decision remains
required. The system records `System (auto-approval)` as the NSRP reviewer.

All of these conditions must hold:

- The server generated the NSRP from online answers; uploaded files remain manual.
- It is pending, version 1, and the account email is verified.
- A report for that document version was stored using the current rules version.
- The report is clear, with zero warnings/critical findings and no unresolved
  duplicate or cross-account finding. Informational findings are allowed.
- Auto-approval was enabled at account creation and is enabled at decision time.
  Accounts predating this feature have no creation stamp and stay manual.
- The account has no dismissed critical finding in any earlier check report.
- The employer is not Government, Recruitment & Placement Agency (Local),
  Licensed Recruitment Agency (Overseas), or DO 174-17 Subcontractor.
- The crypto-random audit sample did not select it (default 10%).
- Fewer than the configured limit (default 5; configurable 1–5) were reserved for
  either its IP or normalized mobile number in the preceding rolling 24 hours.

Age, sex, religion, disability, civil status and address are not inputs to these
checks or to auto-approval eligibility. Existing form validation is separate.
An ineligible check always means manual review; this service never rejects.

### Safeguards and administrator controls

Verification rules has applicant/employer switches (both ON by default), an
audit sample percentage (0–100), a rate guard limit, a settings audit history and
a date-filtered Auto-approval log. The log filters include Auto-approved,
Audit sample and Manual. Settings changes record the administrator and time.
Turning a switch off leaves existing approvals unchanged. Only new submissions
receive automatic decisions; there is no retrospective approval of old accounts.

Admin review shows the decision, time, rules version and check summary. Revoke
auto-approval requires a confirmation and a reason; it atomically returns the
current system-approved document to pending, records the reason/admin/time, and
notifies the owner. Accounts with an administrative restriction remain restricted.
The owner sees document status without sampling, eligibility tags or reports.
Applicants still need manual birth certificate and ID approval. Employers still
need an administrator's account decision.

Reports are stored before approval. A unique role/account/version decision key
prevents repeated or concurrent execution from approving/notifying twice. The
document write checks pending state, version and current account state, and
records the approval and its document history together. Approved documents use
the existing locks. A new version always requires manual review. Failures emit
one fixed, redacted line and leave a pending document for manual review.

The IP/mobile rate reservation is one atomic MongoDB update across both keys.
Only HMAC hashes are stored. Set `NSRP_HASH_SECRET` to a stable, high-entropy
secret in deployment (falls back to `JWT_SECRET`, then a randomly generated key
persisted in the server-only `nsrp_auto_private_keys` collection).
Changing this secret resets hash continuity, so avoid rotating it within a
24-hour rate window. A daily info-level notification directs admins to the log;
there is no individual admin notification for each automatic approval.

### Known limitations

The checks cannot prove authenticity. A convincing fake can pass the data check,
so the ID and birth certificate still require manual approval. Uploaded PDFs and
images are not OCR-checked. Duplicate comparisons cover structured identifiers,
not the contents of uploaded identification documents. Blank optional identifiers
provide no evidence for duplicate detection. This is a deliberately conservative
initial rule set, not a fraud detection or identity verification service.

Account/document approval is atomic within its MongoDB document. Reports, quotas,
notifications and the document live in separate records, without a distributed
transaction. An interrupted process can leave a Processing log record with the
document still pending, or reserve capacity without approving. These conditions
fail closed; a human must review them. Mail failures do not roll back an approval.
Notifications use the existing best-effort delivery system. A process interruption
after approval can prevent delivery or log finalization; there is no delivery retry
worker in this implementation. Supervisors should inspect stale Processing entries.

The rolling quota ledger is capped at 20,000 live reservations to stay below the
MongoDB document-size limit. At capacity it sends submissions to manual review.
The ledger prunes expired entries during reservation. Identifier claims are kept
for duplicate detection and need an organization-specific retention policy before
high-volume deployment. Old records that did not record dismissed findings cannot
be recognized as having a dismissed critical finding.

The IP guard uses Express's `req.ip`; forwarded headers are not trusted by
default. Behind a reverse proxy, multiple users can share the proxy IP and reach
the manual-review threshold together. Configure trusted proxy networks to match
the actual deployment before relying on distinct client-IP quotas.

## Files added or changed for auto-approval

- `shared/nsrpChecks.js`
- `shared/nsrp2Checks.js`
- `server/services/nsrpAutomation.js`
- `server/routes/nsrpAutomation.js`
- `server/models/collections.js`
- `server/index.js`
- `src/components/AdminNsrpAutomation.jsx`
- `src/components/VerificationDocsReviewModal.jsx`
- `src/App.jsx`
- `server/test/nsrpChecks.test.js`
- `server/test/integration/nsrpAutomation.integration.test.js`
- `server/test/integration/signup.integration.test.js` (explicit manual-review configuration for existing tests)
- `src/test/adminNsrpAutomation.test.jsx`
- `docs/nsrp-checks.md`
