# Document verification

Verification checks **consistency and evidence, not authenticity**. Automatic
approval only approves a pending first-version document. It never declines an
account or decides that fraud occurred. Warning/critical findings, unavailable
evidence, exceptions, samples and resubmissions are routed to PESO for review.
Admins can inspect every automatic approval, mark it checked, revoke it or hold
further automatic approval for the account. Phase 6 was intentionally skipped:
there is no in-person tier, office-hours setting or referral/posting gate.

## Settings and defaults

Admin-only `/api/admin/nsrp-automation/settings` uses `nsrp_auto_settings`.
Updates record administrator, values and time. Existing stored choices are
preserved; these are defaults for new/missing settings, not a migration.

| Key | Meaning | Default |
| --- | --- | --- |
| automaticApproval | Master switch | ON |
| applicant | Generated applicant NSRP Form 1 | ON |
| employer | Generated employer NSRP Form 2 | ON |
| birthCertificate | Birth certificates | ON |
| validId | Both valid ID slots | ON |
| minimumEvidence | Independent comparison/verified QR; alternative `none` is typed data only, not recommended | independent |
| auditPercent | Otherwise eligible documents held for review | 20% |
| rateLimit | Approvals per IP HMAC **and** normalized mobile HMAC in a rolling 24 hours | 5 |
| ocrTextReading | Local English OCR | ON |
| reviewToolsEnabled | New review queues/actions; OFF retains legacy manual review | ON |
| dataChecks | Expanded NSRP consistency/duplicate checks | ON |
| imageChecks | Quality and declared-detail checks | ON |
| crossChecks | Cross-document comparisons and explanations | ON |
| verificationEngineEnabled | Generalized automatic decision engine | ON |
| philsysQrVerification | Local issuer signature provider | ON, effectively unavailable without configured keys |

Turning off a control does not undo an existing approval. The master switch
stops new approvals. Per-type and engine switches also stop that approval path.
Turning off image reading does not manufacture independent evidence. The ON
banner and counts appear on admin pages. A saved legacy 10% sample stays 10%
until an admin changes it.

## Decision rules

`shared/verificationDecision.js` is the common eligibility function, version
`2026-11-03.5`. Each condition is checked on the server:

1. Master, engine and document-type switches are ON.
2. The current document is pending, version 1, and the email is verified.
3. Account is not restricted, suspended, closed or held for manual approval.
4. There are no open blocking warning/critical findings on the document/account,
   no duplicate/cross-account findings (even if dismissed), and no pending explanation.
5. Quality passed without warnings.
6. The evidence setting is satisfied: at least one meaningful independent match
   or verified signature. Self-declared matches never add independent evidence.
   Sex/address do not count as evidence. `none` explicitly skips this safeguard.
7. The document is not selected for the audit sample; the random draw is recorded
   once. A held sample cannot be repeatedly submitted to reroll its selection.
8. Shared atomic IP/mobile quota reservation succeeds.

Uploaded NSRP files never auto-approve. Resubmissions always require human
approval. Government, Recruitment & Placement Agency (Local), Licensed
Recruitment Agency (Overseas), and DO 174-17 Subcontractor Form 2s stay manual.
Generated NSRP may use independent cross-document comparisons. Employer Form 2
alone preserves the existing separate admin account decision; it does not grant
posting access. Applicant account status continues to require NSRP, birth
certificate and ID #1; ID #2 and supporting explanations are optional.

Ineligibility tags include Flagged, Could not be read, Not independent, Quality
warning, Audit sample, Resubmission, Uploaded file, Rate guard, Always manual,
Hold, Explanation, Email unverified and Auto-approval off. A failed signature or
hard technical check requests a neutral retake. Three failed versions are held
for an admin. Technical attempts never imply fraud or automatically decline.
Hard upload validation returns a 422 field error; no invalid bytes are accepted.

Status/version/revision compare-and-set guards ensure one approval and one
version audit. Current controls/account conditions are re-read before the write.
`approvedBy=system`, reviewer `System (verification engine)`, provider, assurance,
rules version and rule-ID/level summary are recorded. Owners receive only neutral
status messages. `typed-only-override` is recorded if the admin chose `none`.

## Rule catalog

Rule IDs below are stable report identifiers. Braced patterns enumerate all
instances; they do not contain personal values. NSRP rule version is
`2026-11-03.2`, cross-check version `2026-11-03.4`. Findings record ruleId,
severity, fieldGroup, independent/self-declared evidence, resolution state,
dismissing admin and note. Extracted names, dates, numbers and text are never
stored in findings. Admin notes must not copy document values.

| Rule ID | Severity | Reason / treatment |
| --- | --- | --- |
| missing_{firstName,surname,cellphone,occupation1,employmentStatus} | warning | Required applicant data missing |
| junk_{firstName,surname,middleName} | warning | Digits, repeated characters or exact junk/keyboard placeholders |
| education_age | warning, advisory | Elementary 10, secondary 14, tertiary 16, graduate 20 years after birth |
| education_future | warning | Education year after the current year |
| education_order | warning | Education years out of level order |
| work_start_age | warning, advisory | Work before 15 years after birth |
| {workExperience,technicalTraining}_date_order | warning | End precedes start |
| {workExperience,technicalTraining}_future_end | warning | End date is in the future |
| present_job_end | warning | Present/current job also declares an end date |
| overlapping_full_time | warning | Overlap between non-part-time jobs |
| experience_age | warning, advisory | Experience exceeds age minus 15 |
| unemployed_present_job | warning | Unemployed with a present job |
| employed_without_history | info | Employed but no work history |
| married_under_18 | warning, advisory | Civil-status consistency reminder |
| height_range | warning | Outside 50–250 cm |
| salary_range | warning | Negative or above 9,999,999 |
| {tin,gsisSss,pagibig,philhealth,passportNo,cellphone}_repeated_digits | warning | All-same or fully sequential number |
| location_pair | warning, advisory | Applicant city/province not in the shared catalog |
| disposable_email | warning | Finite locally maintained disposable-domain list |
| missing_{companyName,contactName,phone,employerType,workforceSize,lineOfBusiness} | warning | Missing employer/contact data |
| junk_{companyName,contactName,lineOfBusiness} | warning | Exact junk/placeholder establishment/contact data |
| employer_mobile | warning | Invalid or junk mobile |
| employer_location_pair | warning, advisory | Employer city/province mismatch |
| contact_title_other | warning | Others lacks its specify value |
| government_free_email | info | Government contact uses a common free mail domain |
| agency_manual_license | info | Verify the agency license manually |
| duplicate_{tin,sss,pagibig,philhealth,passport} | critical | Same normalized identifier on another account |
| duplicate_{mobile,name_birth,establishment_city} | warning | Shared mobile/name-birth/establishment-city claim |
| duplicate_qr | critical | Same verified QR HMAC claimed by another account |
| id_number_format | warning | Advisory format/length check using existing shared number rules |
| id_expired | warning | Declared expiry is past |
| national_id_screenshot | warning | Digital screenshot needs careful admin inspection |
| declared_id_nsrp_difference | warning | Declared number differs from available NSRP number |
| cross_{birth,id}_{nsrp,birth}_{surname,firstName,middleName,suffix,dob,sex,placeOfBirth,idNumber} | conditional, below | Cross-document field-group comparison; only applicable document/reference combinations are emitted |
| cross_married_name | info | Maiden/married surname pattern avoids a false mismatch |
| cross_mononym | info | Single-name record avoids invented missing surname/middle flags |
| philsys_signature_invalid | critical technical finding | Known configured signature cannot verify; neutral retake/manual review, never an authenticity/fraud decision |

Cross-check severity is info for unreadable/no-middle/mononym/sex cases; warning
for minor or self-declared-only differences; critical for independently read
significant first/surname, birth date, place-of-birth or ID-number differences.
Middle name and suffix differences remain minor. Overall consistent means no
independent significant difference and at most one minor; otherwise minor
differences, or needs attention for any independent significant difference.
No comparison changes a status or rejects anyone on one field.

Quality checks are technical gate codes, not suspicion findings: undecodable,
tiny (<600×380, portrait accepted), blank (mean channel deviation <2), malformed
PDF or >5 pages are 422 failures. Dark (mean <45), glare (>245), low edge
deviation (<8) and extreme aspect ratio (>5) are soft warnings. Thresholds are
in IMAGE_LIMITS; decoded images are capped at 20 million pixels and stripped of
EXIF/GPS. Image heuristics are approximate. PDF contents are manual and tagged
`pdf_manual_reading`.

## Philippine cases and fairness

Normalization handles accents (Ñ/N), punctuation, Ma./Maria, Sto./Santo,
Dela/de la Cruz spacing, comma surname-first order, middle initials, NO MIDDLE
NAME/NMN/N/A, mononyms and common dates. Names up to six characters tolerate one
edit, longer names two. Swapped day/month is a minor difference. Married,
widowed or separated female applicants whose birth surname matches the NSRP
middle name get an informational surname explanation rather than a mismatch.
These sex/civil-status conditions only avoid flags.

Born-in-1950 applicants, late graduates, short surnames Ng/Wu, foreign names,
hyphens/apostrophes and part-time overlap are accepted. Age, civil status and
address reminders have approvalBlocking=false. Sex, religion and disability
never score a person. The address catalog currently covers the application's
Albay municipalities; location validation is separate from identity evidence.
Employer establishment/city duplication distinguishes establishments, not an
applicant's residential suitability. No addresses are cross-compared.

## Readers, providers and privacy

QR decoding is local, asynchronous and limited to two seconds. Decoded URLs
are never fetched. Only found/domain/allowlist outcome is retained. HTTPS issuer
domains psahelpline.ph, psa.gov.ph, philsys.gov.ph and true subdomains are allowed
for fixed admin verification buttons. Lookalikes, credentials and non-HTTPS
destinations have no link. This allowlist is **TO CONFIRM** per issuer workflow.
See [PSA's e-Certificate portal](https://e-cert.psahelpline.ph/verify),
[e-Certificate FAQ](https://psahelpline.ph/faq/PSA-ECert),
[PSA National ID advisory](https://psa.gov.ph/content/public-advisory-37), and
[PSA's key/documentation request reference](https://psa.gov.ph/sites/default/files/citizen-charter/citizens-charter-2nd-edition.pdf).
The newer everify.gov.ph site is outside the requested allowlist; it was not
silently added.

LocalChecksProvider has low assurance. PhilSysQrSignatureProvider validates
configured Ed25519/EdDSA signatures locally and compares whitelisted data in
memory. Its isolated adapter accepts an EdDSA JWS demonstration envelope.
**TO CONFIRM: production PSA QR encoding and authorized public-key source.** No
PSA keys are bundled or guessed. Missing keys and unsupported formats return
unavailable. Test-generated keys/QR images do not establish PSA compatibility.
Only a salted HMAC of a verified QR enters the duplicate registry; payload,
card number, photograph and biometric fields are discarded. National ID/card
numbers are not requested, extracted into comparisons, or shown in the admin OCR
value view. ThirdPartyEkycProvider is network-free and unavailable; its mock is
disabled unless explicitly instantiated in a sandbox. No live eKYC calls exist.

English Tesseract data, worker and core resolve locally from dependencies.
OCR is outside uploads, with a 20-second timeout, one active task, at most 20
queued and 200 per Manila day across the database. Failed/unreadable fields are
inconclusive, never a fabricated mismatch. Labelled English fields and positive
text matches provide comparisons. Admins may re-read labelled values transiently;
recognized text/values never enter reports, logs or owner responses. PDFs are not
OCR-read in this implementation and stay manual.

Birth copy type and optional reference are admin details. Optional authorization
codes live in a separate private collection with a 24-hour TTL, never list
queries, URLs, notifications or logs. An admin-only, no-store detail response may
show the code; admin/engine result cleanup deletes it and retains the reference.
Declared non-PhilSys ID details are stored for admin comparison; the prohibition
on extracted data concerns automated readings/reports, not the already required
NSRP profile or declared details. Signed document URLs retain existing access
checks and redacted logs. Supporting files expire after 30 days by default;
NSRP is retained. Supporting explanation files follow the same purge.

## Admin and applicant workflows

Flagged for review sorts oldest first, paginates, tags reasons, highlights seven
days and has a sidebar count. Auto-approved filters type/date/checked state.
Admin actions require reasons and audit entries. Approve confirms the current
unresolved count. Manual identity-document approval requires the five-point
checklist. Request resubmission prefills field-group reminders. Decline is always
a human action. Resolve flag requires a note. Ask for explanation sends neutral
guidance. Mark checked records the admin/time; revoke returns pending and
notifies; account holds and the master kill switch stop further approvals.

Applicants see neutral status messages and advisory Preview reminders, never
findings, sampling, hashes or another account. Explain a difference accepts a
category, at most 300 characters and one optional supporting file through the
existing file/version store. It never changes approval or blocks the applicant.
The admin viewer offers front/back, zoom/rotate, declared/NSRP details, comparison
results/evidence and the explanation. Stored audit notes are admin-only.

Daily counted digests cover the preceding Manila day, at startup and every
24 hours, once per day. Admin counts/logs cover automatic approvals, flagged
items, samples and revocations. Notifications are best effort.

## Dependencies and environment

New runtime dependencies: sharp, jsqr, tesseract.js, @tesseract.js-data/eng.
New dev dependency: qrcode (generated QR test fixtures). Versions are pinned by
package-lock.json. No live network API provider is introduced.

PHILSYS_PUBLIC_KEYS is the new optional environment variable: a JSON object
keyed by a confirmed issuer kid, whose values contain a PEM public key (`pem`)
or JWK (`jwk`). It must never contain private keys. Existing NSRP_HASH_SECRET
provides a stable HMAC secret, falling back to JWT_SECRET and then the existing
server-private persisted random key. VERIFICATION_DOC_RETENTION_DAYS remains 30
(0 disables purge). .env/.env.* are ignored; .env.example contains comments only.

## Known limitations

- Consistency is not authenticity: a consistent forgery can pass.
- A valid signature proves issuance of the signed data, not that this applicant
  owns it. No face matching or liveness check exists.
- OCR on phone photos is approximate. An incorrect but plausible read can flag
  a difference; unreadable fields and PDF contents require a human.
- Birth certificates and most IDs cannot be verified with their issuers without
  issuer access. The PSA QR adapter/key source remains unconfirmed for production.
- The default evidence requirement, audit sample, rate guard, Mark checked,
  revoke, holds, kill switch, logs and manual exceptions reduce risk; they do
  not prove ownership or authenticity. The `none` override increases that risk.
- Quota, logs, notifications and document writes are separate records without a
  distributed transaction. Crashes may leave a Processing entry, consume capacity
  without approving, or lose a notification. Per-document status/audit writes are
  atomic and conditional. There is no durable job/notification retry worker.
- Background processing/digests need a running server. The bounded queue can
  return inconclusive when busy. Hash-claim retention needs an operational policy;
  secret rotation breaks duplicate continuity. Shared/proxy IPs can trigger quotas.
- Existing legacy owner-visible review notes are retained; no historical data
  rewrite or migration was performed.

Future work: authorized PSA relying-party access with confirmed formats/keys,
a licensed eKYC provider, durable job delivery, issuer/ownership verification,
and wider document-language/PDF reading support.

## Fictional seed scenarios

The existing command is restricted to an explicitly selected peso-demo-* database:

```powershell
npm.cmd run seed:workflow -- --database=peso-demo-verification
```

It preserves workflow examples and adds an automatically approved applicant,
audit sample, independent mismatch with explanation, duplicate TIN, uploaded-NSRP
manual case, employer Form 2 automatic approval, always-manual agency, and revoked
automatic approval. One extra fictional reference account supplies the duplicate
TIN. All emails use example.invalid; documents are visibly marked FICTIONAL DEMO.
Synthetic comparison evidence constructs these examples; it is not an OCR or PSA
credential test. The employer example explicitly demonstrates typed-only mode
in an isolated fixture engine; real global settings are not weakened. A separate
test exercises the actual generated signed QR image/decoder/database path.
No seed command was run against local data during implementation.

## Phase records and files

- Phase 1 f29b52a: [foundations](verification-phase-1.md).
- Phase 2 da89876: [NSRP rules/duplicates](verification-phase-2.md).
- Phase 3 3af6d27: [images/readers/viewer](verification-phase-3.md).
- Phase 4 80e7f07: [cross-checks/explanations](verification-phase-4.md).
- Phase 5 708d46a: [providers/decision engine](verification-phase-5.md).
- Phase 6 skipped by instruction.
- Phase 7: documentation, privacy review, fictional seeds and final checks.

Final checks also corrected the existing interview panel's initial loading
state, so it no longer briefly claims that no invitation exists while its saved
invitation is loading. Existing progress assertions were retained.

Every changed file is listed by phase in [verification-files.md](verification-files.md).

## Final validation

Full-suite checkpoints passed: Phase 1 867 tests; Phase 2 883; Phase 3 891;
Phase 4 902; Phase 5 937; Phase 7 **939 tests across 93 files**. The final run
completed in 98.87 seconds. No tests were deleted, disabled or weakened to pass.
`npm.cmd run build` passed; Vite still reports the large bundle/chunk warning.
`npm.cmd run lint` passed with warnings. MongoDB deprecation and sandbox font-cache
warnings did not prevent the actual local OCR test from passing. The dependency
installation reported 18 audit advisories (5 moderate, 10 high, 3 critical);
automatic dependency upgrades outside the task were not applied. Secret-signature
and whitespace checks passed. No local migration/seed command was run; the
fictional seed was tested only in a disposable MongoDB instance.

## How to undo this phase and the whole feature

For Phase 7 alone, find its commit with
`git log --oneline --grep="Document verification rules and fictional seed scenarios"`,
then `git revert <phase-7-commit>`. No Phase 7 dependencies/settings/collections
are added. The seed only adds explicitly requested demo data if you run it;
the implementation never ran it against local data. Keep/export any demo data
you want before removing individual seeded example.invalid records.

To undo the complete verification feature while preserving the pre-existing work
snapshot 4e1d617, use the exact final feature commit rather than a later HEAD:

```powershell
git switch prompt/document-verification
git revert --no-commit 4e1d617..<phase-7-commit>
git commit -m "Revert document verification feature"
npm.cmd ci
```

The reverted lockfile removes the four runtime packages and dev-only qrcode.
No branch deletion, reset, clean, force push or automatic database deletion is
needed. Back up before changing data:

```powershell
mongodump --uri="<your MongoDB URI>" --db="<your database>" --out="backups/pre-verification-rollback"
```

Remove newly introduced settings keys, version/provider/comparison/explanation/
checklist metadata, hold/failure fields, optional supportingExplanation slot,
private code and QR-claim/OCR-count records only after preserving the audit and
reviewing actual usage. Existing applicant/employer/auditPercent/rateLimit keys
and NSRP settings, decision, identifier and rate stores predate this feature:
restore prior values rather than deleting shared stores. Do not delete unrelated
document_files, workflow/referral data or the baseline work. Review any new
needs_resubmission statuses before reverting to older clients. Code rollback
does not undo administrative decisions, sent notifications or data written after
deployment. No migrations, dependency uninstalls or database cleanup were run.
