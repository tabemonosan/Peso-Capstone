# Reputation recovery policy

The existing private Applicant `trustEvents` ledger remains the source of truth.
`shared/reputation.js` contains the pure calculation, default settings, validation,
and the live policy text. No employer rating or demographic attribute is an
input. No score automatically suspends, declines, or blocks an applicant.

## Default policy

Applicants start at **100**, with a range of **0–100**. Confirmed no-shows cost
**10, 20, then 25** points, counted over the last **12 calendar months**.
Confirmed cancellations **strictly under 24 hours** before an interview cost
**5, then 10** points over the same period. An employer report alone never
deducts points: PESO still reviews the response or waits for the existing
seven-day response deadline before confirming a no-show.

Every full **7 days** without a new penalty restores **2 previously lost points**.
Recovery stops when the actual remaining loss is restored and cannot exceed
100. A new confirmed penalty restarts the quiet-period clock. A 20-point loss
therefore heals in exactly ten quiet weeks without any other activity.

Interview attendance earns **5** points automatically when the employer records
an interview as completed, passed, did not pass, not selected after interview,
or hired after interview. These all use the existing interview-completion path.
Only the first attendance event per employer in **30 days** qualifies. Repeated
outcomes, retries, reversals, and simultaneous submissions cannot bypass that
cooldown. A hire report without an interview does not invent an attendance event.
Confirmed employer-reported employment earns **10** points through the existing
PESO confirmation path. Invitations, seminar/training attendance, and employer
star ratings never earn reputation credits. New arbitrary positive adjustments
are rejected; old booked adjustments remain in history. Any new negative
administrative adjustment also shares the penalty cap.

Penalties are capped at **30 points in any 30 days**. Attendance/employment
credits are capped at **15 points in any 30 days**. Recovery and review refunds
are separate from that credit cap. Score boundaries can also reduce an event's
actual contribution; the applicant sees both the contribution and before/after
score, with a neutral explanation when a limit applies.

## Settings and audit

Admins edit **Referrals and applications → Reputation settings → Edit policy
values**. Saving opens the existing confirmation dialog and requires a private
reason. Values are stored in the existing `referral_settings` document; full
before/after values and actor/time/reason are retained in its history and
`referral_audit`. The existing low-trust routing switch remains separate and
audited. It defaults OFF. When ON, At risk applications go to PESO review before
employer delivery; the points never auto-decline the application.

All numeric settings below are editable. Values must be whole numbers, scores
remain within 0–100, durations must be positive, later penalties cannot be
smaller than earlier ones, and tier thresholds must fit the chosen range.
Changing starting/range values together must preserve that relationship.

| Setting | Key | Default |
| --- | --- | ---: |
| Starting points | `initialPoints` | 100 |
| Minimum points | `minimumPoints` | 0 |
| Maximum points | `maximumPoints` | 100 |
| First confirmed no-show penalty | `noShowFirst` | 10 |
| Second confirmed no-show penalty | `noShowSecond` | 20 |
| Later confirmed no-show penalty | `noShowLater` | 25 |
| First late cancellation penalty | `lateFirst` | 5 |
| Later late cancellation penalty | `lateLater` | 10 |
| Late cancellation window (hours) | `lateCancellationHours` | 24 |
| Penalty counting period (months) | `graduationMonths` | 12 |
| Recovery points per full period | `weeklyRecovery` | 2 |
| Recovery period (days) | `recoveryDays` | 7 |
| Interview attendance credit | `attendanceCredit` | 5 |
| Confirmed employment credit | `employmentCredit` | 10 |
| Attendance cooldown per employer (days) | `employerCooldownDays` | 30 |
| Maximum penalty points per window | `penaltyCap` | 30 |
| Penalty window (days) | `penaltyWindowDays` | 30 |
| Maximum credit points per window | `creditCap` | 15 |
| Credit window (days) | `creditWindowDays` | 30 |
| Good standing starts at | `goodStandingFrom` | 80 |
| At risk below | `atRiskBelow` | 50 |
| Send low-trust applications to admin review first (existing setting) | `lowTrustRouting` | OFF |

New events retain their nominal booked points and a policy snapshot. Historical
booked deltas are preserved rather than retroactively regraduated. Recovery,
rolling caps, standing thresholds, and forecasts use the current settings on
read. Changes to those settings can change the calculated result; original
ledger entries and settings audit history are never rewritten.

## Review process

Each confirmed penalty incident offers **Request review** once, even if a
rolling cap reduced its actual deduction to zero. The applicant selects:
Emergency or illness, Employer rescheduled, Never received the invitation,
Wrong report, or Other; adds a note of 1–300 characters; and may attach one
JPG, PNG, or PDF up to 5 MB. The existing image/PDF inspection and private
`document_files` storage are reused under the `reputationReview` slot. Only
the owner and authenticated PESO admins can download that evidence.

Requests appear in **Flagged for review → Reputation**. The same queue is
reachable from Referrals and applications. Requests do not freeze recovery,
applications, interviews, or other activity. Admins can:

- **Reverse:** append a reversal and immediately restore the applied points,
  subject to the score maximum.
- **Keep:** retain the penalty and give the applicant a neutral explanation.
- **Reduce:** append a reversal and smaller replacement together; restore the
  difference immediately. The original occurrence date is retained for the
  annual count. A reduction never removes points that have already recovered,
  and it does not restart the quiet-period clock.

Each action requires confirmation and a private audit note. Keep/Reduce also
require a separate neutral explanation explicitly intended for the applicant.
That public explanation can appear in the applicant's history/notification;
private admin notes and employer notes never do. Each decision is audited and
sends a neutral applicant notification. Replacement penalties do not open a
second request for the same incident. PESO can independently reverse any stored
event from the applicant's private ledger; pending requests on that event are
closed consistently. Derived recovery rows are not editable stored events.

## Calculation and history

The pure function replays timestamped events deterministically, including
virtual recovery entries, as of an explicit time. One embedded-ledger update,
guarded by `trustRevision`, appends an event/batch and updates the private cache
atomically; retries use existing event keys. This works on standalone MongoDB
without requiring multi-document transactions. Routing and displayed scores
read the calculation rather than trusting an outdated cache.

History is sorted and paginated. Each row shows the date, label, actual points,
before/after score, status, related application link where available, and review
availability. Empty history has no zero-item pagination line. Review status is
joined from the review record without modifying the original event. Reversal
entries preserve the original event rather than deleting it.

The private ledger, actor/reasons, audit snapshots, employer identity, internal
limit flags, and confirmed no-show count remain PESO-only. Applicants receive
an explicit allowlist of their own display fields; employers receive none of
the points, tiers, history, review evidence, or private flags. The admin no-show
count uses a rolling calendar-month window, including leap-year boundaries.

## Assumptions and known limitations

- Recovery periods and 30-day windows are elapsed UTC durations. The 12-month
  graduation/count window uses calendar months, not a fixed 365 days. Display
  dates use Asia/Manila. New penalty timestamps are PESO confirmation times.
- The forecast assumes no new penalties, credits, reversals, or policy changes.
  Credits can bring the date forward; new penalties can delay it.
- The policy's new default is enabled through the admin-editable values. Set
  recovery/credit/penalty point values to zero to disable those contributions.
- Old attendance events sometimes lack employer identity. Their existing
  booked credits are preserved, but the new employer cooldown cannot be
  established retroactively for those records. All new attendance credits
  require an employer identifier.
- Cache-only legacy scores without ledger evidence default to the configured
  starting score. No synthetic historical penalty is invented to match a cache.
- Existing negative manual adjustments remain readable/admin-auditable; new
  arbitrary positive adjustments are not an extra credit path.
- Outcomes and confirmed events still depend on employer reports and PESO
  judgment. File checks and review evidence do not independently establish
  that an interview happened or that a report is true.
- Admin event actions, review records, file storage, audit entries, and
  notifications span existing collections. The score/event batch itself is
  atomic; supporting failures are retryable and review decisions are claimed
  and finalized idempotently. An infrastructure outage may still require staff
  to retry a pending operation.
- Full calculation replays the private ledger; displayed history is paginated.
  Large historical ledgers may eventually need a separately designed cache or
  archival strategy. This change does not truncate or rebuild them.

## Verification

The final full-suite run passed **1,209 tests, with zero failures or skipped
tests**. The final review-focused checks also passed after the last concurrency
guard. The production build and lint checks passed. Desktop (1440 px) and mobile
(390 px) browser previews covered normal, empty, and At risk standings, the
request form, admin settings, and the flagged queue: no runtime exceptions or
horizontal overflow; visible form controls had white backgrounds.

Tests cover graduation, calendar-month boundaries, rolling caps, exact recovery
weeks, bounded recovery, same-employer cooldowns, legacy credits, reversals,
reductions after recovery, owner/admin authorization, optional evidence,
review outcomes/audits/notifications, and live settings. Existing workflow
tests retain report/response privacy and idempotency assertions. Prior tests
that edited only a cached score now include the ledger loss their fixture
represents; default-amount expectations use the new policy constants.

## How to undo this

Revert the commits on `prompt/reputation-recovery` in newest-first order with
ordinary `git revert` commits, then redeploy/restart the application. Keep all
ledger, review, file, and audit data; do not reset or drop the database. Earlier
code uses the old cached scoring system and does not understand derived weekly
recovery, so review the recorded points and settings history before reverting
the calculation in a deployment that has already accepted new events.

For policy tuning alone, restore the defaults through the admin settings form
with a reason. This records another audit entry and preserves the prior values.

## Changed-file manifest

The earlier verification/page-guide commits were pushed separately and are not part of this feature diff.

- [docs/reputation-recovery-audit.md](../docs/reputation-recovery-audit.md)
- [docs/reputation-recovery.md](../docs/reputation-recovery.md)
- [docs/reputation.md](../docs/reputation.md)
- [server/index.js](../server/index.js)
- [server/models/applicationWorkflow.js](../server/models/applicationWorkflow.js)
- [server/models/collections.js](../server/models/collections.js)
- [server/routes/applicationWorkflow.js](../server/routes/applicationWorkflow.js)
- [server/scripts/seed-approved-jobs.js](../server/scripts/seed-approved-jobs.js)
- [server/services/applicationWorkflow.js](../server/services/applicationWorkflow.js)
- [server/services/referralWorkflow.js](../server/services/referralWorkflow.js)
- [server/services/reputationReviews.js](../server/services/reputationReviews.js)
- [server/services/reputationSettings.js](../server/services/reputationSettings.js)
- [server/services/trustPolicy.js](../server/services/trustPolicy.js)
- [server/test/integration/applicationWorkflow.integration.test.js](../server/test/integration/applicationWorkflow.integration.test.js)
- [server/test/integration/reputationRecovery.integration.test.js](../server/test/integration/reputationRecovery.integration.test.js)
- [server/test/reputation.test.js](../server/test/reputation.test.js)
- [shared/reputation.js](../shared/reputation.js)
- [src/App.jsx](../src/App.jsx)
- [src/components/AdminApplicationWorkflow.jsx](../src/components/AdminApplicationWorkflow.jsx)
- [src/components/AdminDocumentVerification.jsx](../src/components/AdminDocumentVerification.jsx)
- [src/components/AdminReferralsPage.jsx](../src/components/AdminReferralsPage.jsx)
- [src/components/AdminReputation.jsx](../src/components/AdminReputation.jsx)
- [src/components/ApplicantReputationPage.jsx](../src/components/ApplicantReputationPage.jsx)
- [src/components/EmployerInterviewPanel.jsx](../src/components/EmployerInterviewPanel.jsx)
- [src/components/MyApplicationsPage.jsx](../src/components/MyApplicationsPage.jsx)
- [src/components/VerificationDocsReviewModal.jsx](../src/components/VerificationDocsReviewModal.jsx)
- [src/test/adminDocumentVerification.test.jsx](../src/test/adminDocumentVerification.test.jsx)
- [src/test/adminReputation.test.jsx](../src/test/adminReputation.test.jsx)
- [src/test/applicantReputation.test.jsx](../src/test/applicantReputation.test.jsx)
