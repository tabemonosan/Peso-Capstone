# Application, interview and trust workflow

This update extends the existing application, automatic/manual referral,
employment outcome, notification, dashboard, RatingForm, CSM reviews, shared
confirmation dialogs and pagination. No live records were seeded or migrated.

## Applicant experience and privacy

The Applicant navigation includes **My applications**, ordered by last update
with server pagination and ascending/descending sorting. Cards stack on small
screens. Each shows the job, employer, status, last update and factual timeline.
Actions are derived on the server from the application, interview and report:

- Future invitation: Confirm, Request reschedule, Decline; suspension removes
  Confirm while leaving the other responses available.
- Active application before the interview: Withdraw. The server blocks
  withdrawal once the interview starts or an employment outcome is recorded.
- Pending employer no-show report: Respond within seven calendar days of the
  report timestamp; the deadline appears on the card.
- Delivered application: Report a problem to PESO.
- Recorded outcome or final review: View outcome.

Both `/api/workflow/mine` (paged) and the existing `/api/applications/mine`
(legacy array for inline job details) use the same field-by-field public DTO.
They never serialize private trust, routing queue, admin identities/reasons,
employer hire/contact notes, or report review notes. Interview messages intended
for the applicant and the applicant's own report response are visible. Admin
histories retain reasons. Withdrawn records remain in applicant history.

### Application stage graph and declining invitations

My applications now shows a responsive four-stage graph: invitation received,
invitation accepted, post-interview task, and hiring outcome. Confirmation moves
the highlight to stage 2; a recorded held/attended interview moves it to stage 3;
an existing employer hired/deployed/not-hired report moves it to stage 4. The
graph describes any employer-provided post-interview task; it does not invent a
task assignment or claim an unrecorded interview occurred. Final hiring uses
the existing employer outcome report, independently of referral acceptance.

Declining an interview invitation now closes that active application and
returns the applicant to Jobs. It is excluded from both applicant application
lists, and its job applicant marker is removed. Only postings that still meet
the existing availability and skill rules appear on the job board.

An eligible applicant may apply again to an available posting. The existing
unique application/referral records are reused, with a private snapshot of the
previous attempt and interview retained in `application_attempts`. This avoids
changing database indexes and retains prior evidence. Old interview actions
cannot be submitted against a new attempt. A reapplication requires fresh
application details/resume/consent, consumes a new quota reservation, and repeats
availability, verification, suspension and optional review-routing checks.
Failed reactivation restores the previous attempt; simultaneous submissions
publish only one application. Ordinary withdrawals and admin pullbacks retain
their existing rules and do not grant reapplication eligibility.

Validation for this extension: the full suite passed 827 tests across 85 files;
build and targeted lint passed. New graph tests cover all stages and missing
historical interview evidence. Integration tests cover decline visibility,
job-board return, successful and concurrent reapplication, closed jobs,
suspension, quota, manual routing, and rollback after publication failure.

## Existing ratings and reviews

`RatingForm` remains the employer's 1-5 rating and optional comment after an
employer hiring/deployment report. It submits to `/api/ratings`; the existing
API also supports an applicant rating the employer for the same hire report.
The author must be a participant, the recipient must match the hire report,
and one rating per author/hire report is allowed. A `not_hired` outcome cannot
be rated. The existing Reviews page uses CSM questionnaires/feedback and is a
separate feature; it is unchanged.

Ratings never read or update private trust. Existing recipient access is
preserved: applicants can still retrieve ratings addressed to themselves, and
employers can retrieve ratings addressed to themselves. Admins can retrieve
all ratings for a recipient. Another viewer can retrieve only ratings they
authored. This preserves the task's exception for existing applicant visibility.
No new applicant rating display or public review directory was added.

## Interviews, employer reports and confirmed events

The existing employer Referrals page now has interview controls. The employer
sets a future time, mode, location and applicant-facing message. The date picker
disables past dates/times using a minimum of the next available minute in
Philippine time; server validation independently requires a future time within
365 days. Location uses the shared Albay catalog: required municipality/city,
barangay and province dropdowns, plus an optional landmark. Changing city clears
the barangay, and the server rejects mismatched addresses. Online invitations
also require a meeting link. Existing saved location text remains readable. The
applicant confirms, requests another time with a reason, or declines with a
reason. Updated invitations need a fresh confirmation. A confirmed interview
that has started can be recorded as held or reported as a no-show by the
owning employer. No-show reporting starts here, never through ratings.

PESO reviews employer evidence and the applicant response. Confirmation must
wait for the applicant's response or expiry of the seven-day response window.
Dismissal is allowed earlier and causes no penalty. Problem reports are
resolved separately. Existing informational no-show records without an
employer/interview link cannot be converted into penalties.

The private value and event ledger are saved together in one atomic applicant
document update. Unique event keys prevent repeated penalties/credits on
retries. Employer statements, ratings, invitations and applicant responses do
not alter it. Only an admin-confirmed event does:

| Event | Default change | Evidence |
| --- | ---: | --- |
| Confirmed no-show | -20 | Employer interview report reviewed by PESO |
| Late cancellation | -10 | Applicant withdrawal within 24 hours before interview |
| Attended interview | +5 | Employer recorded held, then PESO confirmed |
| Hired | +10 | Employer hired/deployed report, then PESO confirmed |
| Manual adjustment | Admin-entered integer | Required reason and unique adjustment key |

Assumptions: initial value 100, bounded to 0-100; threshold constant 50;
24 hours defines late cancellation; one current interview per application.
These policy defaults are centralized in `trustPolicy.js`; attendance and hire
can still create audit events when already at the maximum. There is no
automatic suspension, penalty, or trust change from a rating. Existing
standalone MongoDB multi-document recovery limits still apply: report state,
notifications and external audit entries are separate writes. The trust ledger
itself is atomic and idempotent; retries can reconcile confirmed reports.

## Suspension and optional routing

In Admin **Referrals and applications**, applicant access controls require a
reason and shared confirmation dialog. Suspension sets a separate applying
flag, logs the decision, and notifies the applicant with the reason and a
link to appeal. It leaves verification status and login access intact.
Applying, manual/automatic referral eligibility, and accepting new interview
invitations all honor the flag. Lifting requires a reason, notifies the
applicant, and resolves pending suspension appeals. An applicant may have one
pending appeal. Existing account restriction remains a separate mechanism.

**Send applications from applicants with a low trust flag to admin review
first** defaults OFF. With automatic referral ON and this setting OFF, all
otherwise eligible applicants go directly to the employer. When ON, a private
value strictly below 50 queues the application; exactly 50 is normal. The
applicant sees only “Your application is being reviewed.” The employer receives
no referral/summary until approval. The admin approves or declines with a
reason and audit entry. Approved delivery uses the existing `source: admin`
path. The admin banner shows both settings' states. Turning the setting OFF
affects new submissions; existing queued applications still need review.
The pre-existing automatic-referral OFF switch continues to queue everyone
for manual referral independently of this optional routing setting.

## Aggregated counts and fake fixtures

All Dashboard cards and the admin report summary use the dashboard service's
MongoDB aggregations for application delivery statuses, future scheduled
interviews, held/attended interviews, pending/responded no-show reports,
confirmed/dismissed reports, problem reports, source totals and suspensions.
Employer application counts use a job ownership lookup and exclude queued
applications, rather than loading jobs or applicants into JavaScript.

The existing approved-posting seed script retains its posting examples and
exports a reusable full-cycle fixture. It creates only fictional accounts
under `example.invalid`, random unusable login credentials, and dummy documents.
It sends no email. The command requires a separate demo database and never
deletes data:

```powershell
npm run seed:workflow -- --database=peso-demo-workflow
```

Each invocation adds a new uniquely tagged fixture. Exact fixture totals:
7 applications (6 delivered, 1 review queue), 6 referrals (5 automatic, 1 admin),
2 future interviews, 1 held/attended interview and hire, 1 responded/dismissed
no-show, 1 responded/confirmed no-show with a trust event, 1 pending no-show,
1 problem report and 1 suspended applicant. The last queued example is created
through the real optional routing path; the seed leaves that setting OFF.

## Validation

- `npx vitest run --maxWorkers=4`: 82 files, 799 tests passed.
- `npm run build`: passed. Vite retains its bundle-size advisory.
- `npm run lint`: passed with existing repository warnings.
- `git diff --check`: passed.

The tests use disposable MongoDB databases with SMTP and mailbox DNS mocked.
They loop over applicant responses and UI statuses, check hidden data is absent,
verify rating independence, admin-only/idempotent events, seven-day deadlines,
soft suspension/login/appeal/lifting, automatic eligibility, optional routing
in both states, admin decisions, and exact aggregated seed totals. Browser
screenshots and production-database seeding were not performed.

## Changed files for this task

Earlier workspace changes are preserved. This task changes these files:

| File | Purpose |
| --- | --- |
| [package.json](../package.json) | Demo seed command |
| [server/index.js](../server/index.js) | Wire models/services/routes, rating visibility and aggregated dashboard |
| [server/models/collections.js](../server/models/collections.js) | Separate suspension flag and private trust ledger |
| [server/models/applicationWorkflow.js](../server/models/applicationWorkflow.js) | Interview, report and appeal records/indexes |
| [server/routes/applicationHistory.js](../server/routes/applicationHistory.js) | Safe legacy history, withdrawal gates, report reuse |
| [server/routes/applicationWorkflow.js](../server/routes/applicationWorkflow.js) | Participant/admin endpoints and safe pagination |
| [server/routes/referralOversight.js](../server/routes/referralOversight.js) | Review queue and routing setting |
| [server/services/applicationWorkflow.js](../server/services/applicationWorkflow.js) | Interviews, review, suspension, appeals and event confirmation |
| [server/services/applicationProgress.js](../server/services/applicationProgress.js) | Public DTO and joined progress aggregation |
| [server/services/referralWorkflow.js](../server/services/referralWorkflow.js) | Shared eligibility and optional queue routing |
| [server/services/trustPolicy.js](../server/services/trustPolicy.js) | Atomic event ledger and policy constants |
| [server/services/dashboard.js](../server/services/dashboard.js) | Aggregated workflow counts and employer ownership scope |
| [server/scripts/seed-approved-jobs.js](../server/scripts/seed-approved-jobs.js) | Reusable fake full-cycle fixture |
| [server/test/integration/applicationWorkflow.integration.test.js](../server/test/integration/applicationWorkflow.integration.test.js) | Endpoint, privacy, trust, suspension, routing and seed count tests |
| [server/test/integration/automaticReferral.integration.test.js](../server/test/integration/automaticReferral.integration.test.js) | Employer/interview no-show ownership |
| [shared/applicationProgress.js](../shared/applicationProgress.js) | Status labels and permitted next actions |
| [src/App.jsx](../src/App.jsx) | My applications navigation |
| [src/components/MyApplicationsPage.jsx](../src/components/MyApplicationsPage.jsx) | Applicant page and responses |
| [src/components/AdminApplicationWorkflow.jsx](../src/components/AdminApplicationWorkflow.jsx) | Admin reports, appeals, suspension and confirmation |
| [src/components/AdminReferralsPage.jsx](../src/components/AdminReferralsPage.jsx) | Queue decisions, settings/banner and reused controls |
| [src/components/EmployerInterviewPanel.jsx](../src/components/EmployerInterviewPanel.jsx) | Employer interview/report entry |
| [src/components/ReferralList.jsx](../src/components/ReferralList.jsx) | Mount employer controls beside existing outcomes/ratings |
| [src/components/ApplicantApplicationHistory.jsx](../src/components/ApplicantApplicationHistory.jsx) | Consistent inline status and actions |
| [src/components/ApplicationReportButton.jsx](../src/components/ApplicationReportButton.jsx) | Reuse problem-report form and reload callback |
| [src/components/RatingForm.jsx](../src/components/RatingForm.jsx) | Light control colors, unchanged rating behavior |
| [src/components/AllDashboard.jsx](../src/components/AllDashboard.jsx) | Workflow metric cards and application destination |
| [src/components/AllDashboard.test.jsx](../src/components/AllDashboard.test.jsx) | New My applications destination |
| [src/utils/applicationWorkflow.js](../src/utils/applicationWorkflow.js) | Shared request, date and light form helpers |
| [src/utils/notificationLinks.js](../src/utils/notificationLinks.js) | Safe My applications notification destination |
| [src/test/myApplications.test.jsx](../src/test/myApplications.test.jsx) | Status/action loop, privacy, sorting, pagination and appeal UI |
| [src/test/dashboard.test.js](../src/test/dashboard.test.js) | Assert aggregate employer scope |
| [docs/automatic-referrals.md](automatic-referrals.md) | Update current flow |
| [docs/automatic-referrals-audit.md](automatic-referrals-audit.md) | Mark superseded interview assumption |
| [docs/application-workflow.md](application-workflow.md) | Behavior, assumptions, seed and changed-file list |
