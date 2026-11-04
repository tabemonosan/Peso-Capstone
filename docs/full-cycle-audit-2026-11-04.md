# Full-cycle audit — November 4, 2026

Audited commit: `d2727fe` on `prompt/document-verification`.

## Resolution

All five findings below have been addressed in the working tree:

1. New employer reports have a private deterministic submissionKey and a unique sparse index. Concurrent attempts return the saved report with EMPLOYER_REPORT_LOCKED; only the winning request sends notifications. A losing hire attempt releases its reservation if a not-hired report won. Existing reports without keys remain locked and are not rewritten or deleted.
2. Content screening evaluates every occurrence of a rule in each clause, applying negation separately to each match.
3. Age screening includes common minimum/maximum-age statements and Unicode-dash ranges. The policy version is now 2026-11-04.2.
4. Dismissed reports remain visible as history but no longer override the active interview status or block withdrawal solely because a dismissed report exists. Employer rescheduling controls are restored after dismissal, and new applicant invitation controls are available.
5. No-show submissions use the shared timeout. The dialog becomes usable after a timeout, and retry checks persisted report state before sending another POST.

Durable regression tests are in server/test/jobModeration.test.js,
server/test/integration/jobPosting.integration.test.js,
server/test/integration/applicationWorkflow.integration.test.js, and
src/test/employerInterviewResults.test.jsx. Targeted verification: **124 tests passed**.

Final verification after the fixes: **1,074 tests passed across 104 test files**
in 122.65 seconds. Production build and lint both passed with existing warnings.
The full suite includes 16 additional regression cases covering the audit fixes.

The hire-report submissionKey index is additive and sparse, so historical
duplicates without keys do not prevent index creation. Deployments must have
this unique index in place to enforce concurrent submission protection. Back up
the database before deployment, for example with
`mongodump --uri="<MongoDB URI>" --out="<backup folder>"`. No migration, cleanup,
or changes to a configured application database were run during this work.

The remaining sections describe the original audit observations before these fixes.

## Results and scope

- Existing regression suite: **1,058 passed, 104 test files**, 124.24 seconds.
- Production build: passed. Existing bundle advisory: main JavaScript chunk about 1.78 MB, 510 KB gzip.
- Lint: passed with existing warnings.
- Five additional targeted probes reproduced the five findings below. These probes asserted the observed faulty behavior; their passing results do not mean the behavior is correct.

The suite includes a connected HTTP lifecycle: applicant/employer email verification and signup, login, employer approval, posting approval, applicant document approval, job application/referral, employment reports, feedback, account closure, and fresh registration. Focused workflow tests exercise interview invitations, applicant responses, early result confirmation, post-interview document upload/review, PESO reputation decisions, withdrawal timing and one-time ratings.

Checks used temporary MongoDB databases, captured/mock email delivery and DOM component tests. The stalled-request reproduction used simulated time. No configured application database, live email service, or deployed environment was exercised. This was not a manual browser/device audit.

## Findings

### 1. High — duplicate employer employment reports under concurrent submission

Location: [server/index.js](../server/index.js), lines 3236–3254; hire-report indexes in [server/models/collections.js](../server/models/collections.js).

The server checks for an existing report, then separately inserts a new report. There is no unique index enforcing one report per applicant/job/employer/reporting party. Two tabs or overlapping retries can pass the check together, defeating the submitted-report lock.

Reproduction:

1. Create an approved employer, approved applicant, published job, and delivered referral.
2. Send eight concurrent authenticated `POST /api/hire-reports` requests with the same applicantId, jobId and referralId, and `status: "not_hired"`.
3. Query employer reports for that referral. The probe confirmed more than one persisted report, rather than one report and duplicate/conflict responses.

Impact: duplicate final statements and notifications; inconsistent report selection and inflated counts. The same non-atomic path accepts other employer outcome values, though the concurrency probe specifically used `not_hired`.

Suggested fix: enforce a stable reporting-party uniqueness key at the database level and atomically create the first report, returning the persisted report on retries. Account for historical reports without reportedByRole before adding an index.

### 2. High — applicant fee demands can bypass automatic moderation

Location: [server/services/jobModeration.js](../server/services/jobModeration.js), lines 20–30.

Screening checks only the first match of each rule in a clause. If that match is negated, it ignores later positive matches in the same clause.

Reproduction:

1. Use an approved, email-verified employer older than seven days, matching company, ordinary salary/slots and low posting volume.
2. Submit an otherwise valid posting whose description is `No placement fee, pay a registration fee to apply.`
3. `POST /api/jobs` returns HTTP 200 and `status: "approved"`; the content decision has no findings.

Impact: a posting requesting applicant payment can be published without PESO review. This contradicts the documented rule that a separate positive fee requirement still triggers review.

Suggested fix: examine every match and apply negation to each occurrence, with tests covering a negated first match followed by a positive match in the same clause.

### 3. Medium — minimum-age requirements are missed by moderation

Location: age_restriction rule in [server/services/jobModeration.js](../server/services/jobModeration.js), line 12.

The age rule covers selected ranges and phrases but misses a straightforward minimum-age requirement.

Reproduction: under the same eligible employer/posting conditions as finding 2, submit `Applicants must be at least 25 years old.` The real posting endpoint returns HTTP 200 with `status: "approved"`, and screening produces no findings.

Impact: explicit age restrictions bypass the intended equal-opportunity review queue. This finding concerns routing according to portal policy, not a legal determination about a particular job.

Suggested fix: include common minimum/maximum-age and eligibility phrasings and send uncertain restrictions for manual review.

### 4. Medium — dismissed no-show reports keep overriding interview progress

Locations: [server/services/applicationProgress.js](../server/services/applicationProgress.js), line 14; [shared/applicationProgress.js](../shared/applicationProgress.js), line 13; invitation controls in [src/components/EmployerInterviewPanel.jsx](../src/components/EmployerInterviewPanel.jsx).

Any historical no-show report overrides the current interview status in the applicant DTO, including a dismissed report. The actions helper treats no_show_dismissed as terminal. The employer invitation button is also hidden whenever any no-show report exists, including a dismissed one.

Reproduction:

1. Invite an applicant to a future interview and have them confirm.
2. Employer submits an early no-show report with an explicit reason/confirmation.
3. PESO dismisses the report as mistaken.
4. A new invitation submitted through the workflow endpoint succeeds, but `GET /api/workflow/mine` returns interview.status `invited`, overall status `no_show_dismissed`, and no confirm action.

Impact: a dismissed allegation can leave the application paused and hide applicant response controls for a new invitation. The normal employer UI also offers no updated-invitation button after dismissal, despite the server accepting that reschedule.

Suggested fix: preserve the dismissed report in history while deriving active progress/actions from the current interview; allow appropriate employer controls after dismissal.

### 5. Medium — stalled no-show submission can lock the confirmation dialog

Locations: [src/components/EmployerInterviewPanel.jsx](../src/components/EmployerInterviewPanel.jsx), line 34; [src/components/ConfirmDialog.jsx](../src/components/ConfirmDialog.jsx), lines 57 and 106.

The no-show POST uses raw fetch without the timeout wrapper used by the interview-completed action. While it is pending, the modal disables confirmation, Cancel, Escape and backdrop dismissal.

Reproduction:

1. Open a confirmed interview, select Report no-show, and enter a reason.
2. Stall the POST response indefinitely in a network mock.
3. Confirm and advance simulated time by 60 seconds.
4. The dialog still displays disabled Working... and Cancel buttons, with no timeout error. The POST has no AbortSignal.

Impact: a stalled request recreates the frozen-screen symptom until the network settles or the page reloads.

Suggested fix: use the shared timeout mechanism and restore a usable error/recovery state. After a timeout, check whether the server saved the report before allowing a retry.

## Original audit scope

Application code was not changed during the initial audit. The subsequent fixes
and regression coverage are recorded in Resolution above. Nothing has been
committed or pushed as part of this resolution task.
