# Automatic referral verification — November 2, 2026

The attached request was compared against the current implementation. Automatic
referral is already the default, and the existing manual queue remains behind
the OFF switch. This pass fixes gaps without rebuilding the application,
referral, notification or employment-report flows.

## How the manual flow works now

1. An administrator switches Automatic referral OFF. The change records the
   administrator and time; admin pages show the OFF banner.
2. A verified applicant submits the four-step application. The server stores
   the private JobApplication, its NSRP snapshot, resume and submitted answers,
   and an entry in `job.applicants`. Delivery status is `pending_admin`.
3. No referral or employer delivery notification is created. Employer job
   responses omit the queued applicant's contact details, and resume access is
   denied to the employer.
4. An admin uses the preserved manual queue or Create referral. The shared
   confirmation dialog requires a reason, and `POST /api/referrals` checks the
   same applicant, employer, vacancy, deadline, duplicate and quota rules.
5. Successful delivery creates a `pending` Referral with `source: admin`, links
   it to the application, retains the reason/actor/time in admin history, and
   makes the whitelisted summary available only to the job's employer.

With Automatic referral ON, steps 4–5 happen as part of the applicant's apply
request, with `source: auto` and the system as actor. No admin decision is
required. Switching ON applies to new submissions; existing queued applications
can still be delivered manually.

## Corrections in this pass

- Employer response JSON now uses the same public timeline whitelist as the
  employer list and applicant history. Admin/report reasons and admin email
  addresses stay private. The response includes the new public event so the
  employer timeline updates immediately.
- Employer approval/receiving suspension and the job deadline are rechecked
  during delivery. If they change after initial validation, newly created
  application/referral records and quota reservations are rolled back.
- A failed manual delivery fully restores the queued application's source,
  timeline and referral link, allowing retry without a dangling referral ID.
- The applicant job details panel shows “This employer is not accepting
  applications right now” and disables Apply when receipt is suspended. The
  public job response exposes only a suspension boolean, not the private reason.
- Oversight rejects invalid calendar dates, and fractional pagination values
  are normalized to integers rather than causing aggregation errors.

## Statuses and error codes

Existing referral statuses remain `pending`, `accepted`, `declined`, with
`withdrawn_by_admin` for admin pull back and `withdrawn` for applicant withdrawal.
Applications use `processing` internally, then `pending_admin` or `delivered`,
and retain the withdrawal statuses. Referral sources remain `auto` and `admin`.
Hiring/deployment statuses and their separate reporting histories are unchanged.

This pass adds no new codes. Relevant failures return:

| HTTP | Codes |
| --- | --- |
| 403 | `ACCOUNT_RESTRICTED`, `APPLICANT_SUSPENDED`, `EMAIL_NOT_VERIFIED`, `APPLICANT_NOT_VERIFIED` |
| 403 | `EMPLOYER_NOT_APPROVED`, `EMPLOYER_APPLICATIONS_SUSPENDED`, `SHARING_CONSENT_REQUIRED`, `NSRP_REQUIRED` |
| 403 | `REASON_REQUIRED`, `INVALID_SETTING`, `INVALID_ACTION`, `INVALID_FILTER`, `INVALID_APPLICATION`, `INVALID_EMPLOYER`, `INVALID_REFERRAL` |
| 403 | `INVALID_APPLICATION_DETAILS`, `INVALID_APPLICATION_EMAIL`, `INVALID_RESUME`, `REFERRAL_REQUIRED`, `REFERRAL_NOT_ACCEPTED` |
| 409 | `JOB_UNAVAILABLE`, `APPLICATION_CLOSED`, `JOB_FILLED`, `ALREADY_APPLIED` |
| 409 | `DAILY_APPLICATION_LIMIT`, `APPLICATION_RATE_LIMITED`, `APPLICATION_UNAVAILABLE`, `EMAIL_CHECK_UNAVAILABLE` |
| 409 | `APPLICATION_WITHDRAWN`, `REFERRAL_ALREADY_WITHDRAWN`, `NOT_DELIVERED` |

Existing authentication and employment-report form validation retain their
established HTTP responses. See the [main referral documentation](automatic-referrals.md)
for the meaning of each code and the complete original implementation file list.

## Every file changed in this pass

- `shared/employmentReporting.js` — common public history whitelist.
- `server/index.js` — safe employer response and public receiving-state flag.
- `server/services/applicantRanking.js` — reuse public history projection.
- `server/services/referralWorkflow.js` — delivery checks and full queued rollback.
- `server/routes/applicationHistory.js` — reuse public history projection.
- `server/routes/referralOversight.js` — calendar and pagination validation.
- `src/components/ApplicantJobBrowser.jsx` — friendly receiving-suspension state.
- `src/components/ReferralList.jsx` — update the public timeline after response.
- `server/test/integration/automaticReferral.integration.test.js` — privacy,
  late-state changes, rollback/retry, digest counts, receiving state and bad input.
- `src/test/inlineJobApplications.test.jsx` — paused employer message and Apply guard.
- `docs/automatic-referrals.md` — link this verification report.
- `docs/automatic-referrals-audit.md` — this report.

Other existing uncommitted edits were preserved.

## Validation

90 tests across eight files passed, including real temporary MongoDB integration
tests for concurrent duplicate submissions, daily/IP limits, simultaneous hires
at capacity, pull back/privacy, manual referral, suspend/resume, OFF/ON behavior,
authorization, daily digest and immediate problem/no-show notices. Production
build and lint passed; existing bundle-size and lint warnings remain. Tests mock
email and DNS and do not modify the configured application database.

```powershell
npx.cmd vitest run server/test/integration/automaticReferral.integration.test.js server/test/integration/fullLifecycle.integration.test.js server/test/integration/employmentReporting.integration.test.js server/test/integration/applicantRanking.integration.test.js server/test/integration/jobSkillMatching.integration.test.js src/test/automaticReferrals.test.jsx src/test/inlineJobApplications.test.jsx src/test/employmentReporting.test.jsx
npm.cmd run build
npm.cmd run lint
```

## Assumptions and operating limits

- The separately requested four-step application, local drafts and split job
  browsers are retained. Per your request to remove the preliminary prompt,
  sharing is explained in Review and confirmed by submitting the application.
- The separately requested application resume remains available to the owning
  employer only after delivery. NSRP documents, birth certificates, government
  ID numbers and identity document images remain private. Pull back/withdrawal
  also revokes employer resume access.
- Superseded by the [application workflow update](application-workflow.md): interview invitations, applicant responses, employer reports and PESO-confirmed events now use the existing referral and notification flow.
- The local standalone MongoDB uses unique indexes, conditional publication,
  atomic job-slot reservation and compensating rollback. It does not provide
  multi-document transaction commits: a process/database crash between writes
  can require operational recovery, and a failed hire-report write can retain
  a conservative slot reservation. These limits are detailed in the main docs.
- Legacy jobs without a positive slot count retain unlimited capacity. Quotas
  count successful new applications, including admin-created applications;
  delivering a queued application does not charge the account twice.
- No live referral/application data was deleted, migrated or rewritten.
