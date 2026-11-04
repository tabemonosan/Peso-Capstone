# Phase 5: providers and automatic approval

The generalized server engine uses one versioned decision function for applicant
NSRP, birth certificates, IDs and employer Form 2. Existing NSRP submission code
becomes report-only when the generalized engine is attached, preventing a second
approval writer. It shares the settings, HMAC registry, quota ledger, document
versions, status recomputation, notifications and audit log.

Every approval requires the master/type/engine switches, pending first version,
verified email, no suspension/restriction/hold, no open blocking warning/critical
or duplicate/cross-account finding, no pending explanation, a clean quality gate,
and the configured independent evidence. Generated NSRP can use independent
cross-document evidence. Typed-only mode is explicitly recorded as an override.
Uploaded NSRPs and resubmissions always remain manual. Agency/government employer
types remain manual. Employer document approval preserves the separate account
approval gate. Protected demographic/location reminders never decide approval.

Eligible audit selection is recorded once and never rerolled; selected documents
stay pending. The rolling IP/mobile guard uses the existing atomic HMAC ledger.
Status/version/revision compare-and-set guards approve once and write the version
audit in the same update. Settings/account conditions are re-read before approval.
Background readers also honor admin revision changes. Stale jobs never replace
a newer version. Exceptions log a fixed line and leave status pending.

Providers implement verify(document, context), returning provider/result/assurance,
findings and rulesVersion. LocalChecksProvider has low assurance and fails only
hard technical checks. ThirdPartyEkycProvider is an unavailable, network-free
interface; MockEkycProvider is disabled unless explicitly instantiated in a
sandbox. There are no live third-party calls.

PhilSysQrSignatureProvider is unavailable without PHILSYS_PUBLIC_KEYS. It checks
Ed25519/EdDSA signatures locally, compares whitelisted name/birth-date fields in
memory, and discards the payload. A salted HMAC detects reuse across accounts.
No card number, photo, fingerprint, decoded payload or recognized text is saved.
The isolated adapter currently accepts an EdDSA JWS envelope. **TO CONFIRM:** the
actual PSA QR encoding and authorized key source. Unsupported formats return
unavailable, not a failed signature. Test keys/envelopes are demonstrations,
not evidence of production PSA compatibility. Configuring a guessed public key
or QR format is not sufficient to deploy issuer verification.

New settings: verificationEngineEnabled=ON, philsysQrVerification=ON (effective
unavailable/off without keys). Existing master/type/evidence/OCR/check settings
still apply. PHILSYS_PUBLIC_KEYS is a JSON key map by kid, with PEM or JWK public
keys. No private keys are configured. Test QR images use the new dev-only qrcode
dependency and generated Ed25519 keys. Actual decoder/database tests caught and
fixed BSON Binary conversion and grayscale-to-RGBA handling.

Failed signatures/technical checks request a neutral retake; three failed versions
go to admin review, without declining. Repeated processing of a failed version
does not increment attempts. Hard upload failures return 422 field errors and
notify admins after three attempts on an existing account. Birth authorization
codes are cleared when the engine records its result.

The admin banner/dashboard shows auto-approved/flagged/sample/revoked counts.
The log records provider, assurance, evidence mode and rules version. A counted
digest covers the preceding Manila day, with one notification per day. It runs
at startup and once per 24 hours. Reader work is bounded and separate from upload
latency. Tests drain background jobs between databases rather than skipping work.

Limitations: OCR on PDFs remains manual. No PSA production keys/format or licensed
eKYC service are bundled. Queues, quotas, logs, notifications and documents span
multiple MongoDB records, without distributed transactions: crashes can leave a
Processing log or consume a quota reservation without approval. Status/audit writes
are atomic per document; notifications are best effort, with no durable retry
worker. A running process is needed for background work and digest scheduling.

## How to undo this phase

Find `git log --oneline --grep="Connect verification providers"`, then
`git revert <phase-5-commit>`. Remove the dev-only qrcode package with
`npm.cmd uninstall --save-dev qrcode`, or restore installed dependencies using
the reverted lockfile and npm.cmd ci. Remove PHILSYS_PUBLIC_KEYS configuration;
remove new settings verificationEngineEnabled/philsysQrVerification if used.
Preserve/export provider/version audits, failure counts, decision evidence modes,
verification_qr_claims HMACs and daily digest markers before cleanup. Do not delete
the existing NSRP settings/decision/identifier/quota stores or document_files.
No local database or seed was changed during implementation.

## Files changed

- package-lock.json
- package.json
- server/index.js
- server/models/verification.js
- server/routes/documentVerification.js
- server/routes/nsrpAutomation.js
- server/services/documentVerification.js
- server/services/imageChecks.js
- server/services/localImageReading.js
- server/services/nsrpAutomation.js
- server/services/qrWorker.js
- server/test/integration/documentVerification.integration.test.js
- server/test/integration/helpers.js
- server/utils/documentFiles.js
- shared/documentImage.js
- shared/verification.js
- src/components/AdminDocumentVerification.jsx
- src/components/AdminNsrpAutomation.jsx
- docs/verification-phase-5.md
- server/services/philsysQrFormat.js
- server/services/verificationEngine.js
- server/services/verificationJobs.js
- server/services/verificationProviders.js
- server/test/integration/verificationEngine.integration.test.js
- server/test/verificationDecision.test.js
- shared/verificationDecision.js
