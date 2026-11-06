# Applicant reputation and one-time employer ratings

The reputation ledger, weekly recovery, graduated penalties, review process,
admin settings, privacy rules, defaults, and rollback instructions are documented
in [Reputation recovery policy](reputation-recovery.md). The implementation
extends the existing ledger and workflows without resetting accounts.

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
