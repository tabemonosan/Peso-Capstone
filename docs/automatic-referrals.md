# Automatic referrals

See the [November 2 verification report](automatic-referrals-audit.md) for the
current manual-flow explanation, follow-up fixes, changed files, status/error
codes, validation results and operating assumptions.

Automatic referral defaults to ON. A fully verified applicant confirms sharing,
then submits one application. The same request creates a pending referral with
`source: auto`, and the job's employer can immediately read the approved profile
summary. PESO approval is no longer an intermediate step.

Previously, applying saved a private NSRP snapshot and an entry in
`job.applicants`. An administrator subsequently used `POST /api/referrals` to
create a separate pending referral. Only that referral exposed the applicant's
summary to the employer. The old queue component is retained behind the OFF
switch. Switching ON affects new applications; existing queued applications
still require a manual referral.

See [application, interview and trust changes](application-workflow.md) for the current interview, suspension, report and optional review-routing flow.

## Controls and timelines

Administrators open **Referrals and applications** for a list refreshed every
10 seconds, filters, sorting, pagination, and timeline details. Pull back,
suspend/resume receiving applicants, and manual referral use the existing
confirmation dialog and require a reason (1–500 characters). Settings changes
retain administrator and time; actions retain actor, reason, time and IDs in
record histories and/or the referral audit collection. Manual referrals use
`source: admin`; they can deliver a queued application or create an application
for a verified applicant. Eligibility also applies to manual referrals.

Suspending receipt blocks new applications while preserving and flagging
existing referrals. Pull back or applicant withdrawal preserves the record but
removes the employer's profile, contact details, suitability evidence and
response/report controls. Applicant history uses neutral wording and does not
expose the admin's reason. Employer history also excludes private reasons.

## Statuses

| Record | Values |
| --- | --- |
| Referral | Existing `pending`, `accepted`, `declined`; added `withdrawn_by_admin`, `withdrawn` |
| Application delivery | `processing` (internal), `pending_admin`, `delivered`, `withdrawn_by_admin`, `withdrawn`, `declined_by_admin` |
| Referral delivery | `processing` (internal), `ready` |
| Source | `auto`, `admin` |
| Employment outcomes | Existing employer `hired`, `not_hired`, `deployed`; applicant `hired`, `deployed` |

Acceptance remains an employer response, not confirmation of hiring. Existing
employment statements, history, ranking and notifications are reused. Employers can now invite applicants to one interview per application, update an invitation, and report attendance or a no-show. Applicants respond from My applications; PESO confirms evidence separately.

## Eligibility and error codes

`server/services/referralWorkflow.js` owns the common eligibility check. The
existing global account/session guards continue to apply.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 403 | `ACCOUNT_RESTRICTED`, `APPLICANT_SUSPENDED` | Existing global account guard or common eligibility rejects an inactive applicant |
| 403 | `EMAIL_NOT_VERIFIED`, `APPLICANT_NOT_VERIFIED` | Email or required registration documents are not approved |
| 403 | `EMPLOYER_NOT_APPROVED`, `EMPLOYER_APPLICATIONS_SUSPENDED` | Employer cannot receive new applicants |
| 403 | `SHARING_CONSENT_REQUIRED` | Applicant did not confirm sharing |
| 403 | `INVALID_APPLICATION_DETAILS`, `INVALID_RESUME` | Four-step application fields or resume fail validation |
| 403 | `NSRP_REQUIRED` | No retained NSRP snapshot is available |
| 409 | `JOB_UNAVAILABLE`, `APPLICATION_CLOSED`, `JOB_FILLED` | Posting is missing/unapproved, closed/expired, or at capacity |
| 409 | `ALREADY_APPLIED` | Existing application/referral or concurrent duplicate |
| 409 | `DAILY_APPLICATION_LIMIT`, `APPLICATION_RATE_LIMITED` | Daily account or connection quota exceeded |
| 409 | `APPLICATION_UNAVAILABLE` | Delivery failed and the request was rolled back |
| 409 | `APPLICATION_WITHDRAWN`, `REFERRAL_ALREADY_WITHDRAWN` | Further action on withdrawn/unavailable referral is blocked |
| 409 | `NOT_DELIVERED` | Pull back requested before delivery |
| 403 | `REASON_REQUIRED`, `INVALID_SETTING`, `INVALID_ACTION`, `INVALID_FILTER`, `INVALID_APPLICATION`, `INVALID_EMPLOYER`, `INVALID_REFERRAL` | Invalid control input |
| 403 | `REFERRAL_REQUIRED`, `REFERRAL_NOT_ACCEPTED` | Existing employment-report access rules |

Unauthenticated requests retain existing authentication responses. NSRP field
errors retain the existing 422 response. Existing hire-report validation retains
400 responses. Invalid IDs and eligibility failures do not become HTTP 500.

## Privacy, limits and notices

Consent includes name, contact details, resume, qualifications and the NSRP
profile summary. Only the employer owning the job receives these after
delivery. NSRP PDFs, answers, signatures, government IDs, birth certificates
and identity document images remain private. Applying retains a private saved
NSRP snapshot without overwriting approved registration documents. Other
applicants' emails are removed from job-board responses. The Apply modal now
uses the [four-step application form](job-application-form.md), collecting a
separate resume rather than repeating the NSRP questionnaire.

The account limit is 10 successful new applications per Manila calendar day,
including admin-created applications. Delivering an already queued application
does not count twice. The connection limit is 60 submissions per fixed
10-minute window using an HMAC of the server-observed IP, with a random
database-held key; raw addresses are not stored in quota records. Counters expire
after two days. Five applications within 10 minutes add `APPLICATION_BURST`
with severity `info`, without suspension or a ranking penalty. Reverse-proxy
deployments should configure Express's trusted proxy policy for their topology
so the observed connection address is correct; this change does not trust
arbitrary forwarded headers.

Applicant/employer delivery notices reuse the notification service. Admins get
one updating daily application/referral digest, not one alert per application.
Problem and no-show reports and employer receiving suspension generate
immediate admin notices. A participant can submit one report of each type per
referral per Manila day. Existing employer response/hiring notices remain.

## Consistency and assumptions

Application and referral collections have unique applicant/job indexes. Hidden
`processing` records, conditional writes and compensation prevent concurrent
duplicates and expose referrals only after delivery completes. Failed delivery
releases quota reservations and removes newly created records. The local MongoDB
is standalone, so these coordinated writes are **not a multi-document database
transaction**: a process/database crash between writes can leave an internal
processing record needing operational recovery. Such records are hidden from
employers and the oversight list. A replica set and transaction-based delivery
would be required for crash-atomic multi-collection commits.

Vacancy reservations use one atomic job-document update, including historical
employer hire/deployment reports. Different simultaneous hires cannot exceed
the slots; reporting the same applicant as deployed does not consume another
slot. Applicant self-reports do not reserve slots. A failed report write can
conservatively retain a reservation; retrying the same applicant can complete
it without consuming another slot. Legacy postings with no positive slot count
remain unlimited. Deadlines created by the existing job form end at 23:59:59.999
in Manila. No application database records were deleted or migrated.

## Files changed for this task

Backend:

- `server/index.js`
- `server/models/collections.js`
- `server/services/referralWorkflow.js` (new)
- `server/services/applicantRanking.js` (withdrawal redaction in the existing ranking work)
- `server/routes/referralOversight.js` (new)
- `server/routes/applicationHistory.js` (new)

Frontend:

- `src/App.jsx`
- `src/components/JobsView.jsx`
- `src/components/ReferralList.jsx`
- `src/components/PesoReferralPanel.jsx`
- `src/components/AdminReferralsPage.jsx` (new)
- `src/components/ApplicantApplicationHistory.jsx` (new)
- `src/components/ApplicationReportButton.jsx` (new)

Tests:

- `server/test/integration/automaticReferral.integration.test.js` (new)
- `server/test/integration/fullLifecycle.integration.test.js`
- `server/test/integration/employmentReporting.integration.test.js`
- `server/test/integration/signup.integration.test.js`
- `src/test/automaticReferrals.test.jsx` (new)
- `src/App.test.jsx`

Documentation:

- `README.md`
- `docs/peso-employment-workflow.md`
- `docs/full-cycle-testing.md`
- `docs/automatic-referrals.md` (this file)

Other uncommitted files predate this task and were preserved.

## Verification

```powershell
npx.cmd vitest run src/test/automaticReferrals.test.jsx src/App.test.jsx server/test/integration/automaticReferral.integration.test.js server/test/integration/fullLifecycle.integration.test.js server/test/integration/employmentReporting.integration.test.js server/test/integration/signup.integration.test.js
npm.cmd run lint
npm.cmd run build
```

Integration tests use Express HTTP requests against a real temporary MongoDB
process with mocked email delivery, without changing the application database.

Verified November 2, 2026: 428 frontend/unit tests across 54 files and 81
integration tests across six files passed. The final focused rerun passed 36
tests after timeline and light-theme adjustments. Production build and lint
completed successfully; existing bundle-size and lint warnings remain.
