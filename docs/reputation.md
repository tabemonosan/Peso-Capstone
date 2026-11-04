# Applicant reputation and one-time employer ratings

Applicants have **100 initial reputation points**, bounded between 0 and 100.
The implementation reuses the existing `trustValue` and `trustEvents` ledger;
existing confirmed events are preserved. Accounts without stored points show
100, and future events apply against that baseline. No mass reset, backfill or
migration is run.

Applicants open **My reputation** in their navigation to see their own current
points, policy and paginated history. Employers cannot view these points. PESO
retains its existing admin controls and private evidence/audit reasons. The
applicant history returns standardized event labels, actual before/after
points, actual point change and server timestamp; it excludes admin identities,
raw private notes and internal event keys. Ordinary applicant and employer
profile/application endpoints still exclude the private ledger fields.

## Point policy

| PESO-confirmed event | Points |
| --- | ---: |
| Interview no-show | −20 |
| Applicant cancellation within 24 hours before an interview | −10 |
| Interview attendance | +5 |
| Reported hire or deployment | +10 |

The shared `shared/reputation.js` policy drives the displayed rules and server
constants. Positive events recover points up to 100; losses stop at zero.
History shows the actual change after those limits, which can be zero.

No-show reports do not deduct points on submission. The applicant has the
existing seven-day response opportunity. PESO must review the response or wait
for the deadline and confirm the report. Late cancellations also require PESO
confirmation. Events are applied once using the existing atomic ledger key;
retries cannot repeat the same penalty. Confirmed changes trigger an in-app
notification linking to My reputation. No new automatic suspension is added.

PESO may restore points or make reasoned manual adjustments through its existing
controls. Applicants can explain missed interviews in My applications and
contact PESO to request review of a completed decision.

Suggested future review categories include a confirmed failure to start an
agreed job without notice, or deliberate falsification established through
independent evidence. These are **not new automatic penalties** in this
implementation. Emergencies, declining an offer, unemployment, low star ratings,
document OCR mismatches or unsupported allegations must not be treated as
confirmed misconduct on their own.

## Employer ratings

An employer can rate a particular applicant **once across jobs and hire
reports**. Eligible employer feedback remains a 1–5 integer score and an optional
comment of up to 1,000 characters. It never adds or deducts reputation points.
Applicant feedback about employers retains the existing per-hire-report rule.

The form checks the authenticated user's saved ratings before showing controls.
After a successful submission, or an already-rated response, it disappears and
the employer sees **You have already rated this applicant**. Reopening the page
checks persisted records again. Failed status checks offer a retry without
showing an unchecked submit form.

New ratings carry a private `submissionKey`, with a unique sparse index to
reject concurrent duplicate endpoint submissions. Existing ratings without the
key are preserved and checked before accepting new feedback. Existing duplicate
historical ratings are not deleted or rewritten. The key is excluded from API
responses. Comments, recipient roles, object IDs and integer score bounds are
validated on the server.

`GET /api/workflow/reputation?page=1` is owner-only for applicants and returns
private/no-store responses. Existing `GET /api/ratings/:userId` author/recipient
permissions remain unchanged.

No new dependencies or environment variables. The new rating index is additive
and does not require rewriting existing records. Before deployment, back up with
`mongodump --uri="<MongoDB URI>" --out="<backup folder>"`.

Rollback can revert this code without resetting points, deleting audit events,
or removing ratings. Keep historical records and backups intact.
