# Applicant review reasons and pending corrections

Applicants awaiting verification see **Why your account is under review** on
Home, immediately below Account status. It lists the unverified required
documents, a neutral explanation, whether a correction can be made, and the
remaining upload allowance. **Review and update documents** opens My Documents
inside Profile directly. Review information refreshes while the Home card is open.

`GET /api/profile/review-status` is owner-scoped and private/no-store. It maps
current document metadata and the matching verification decision to public
templates. It never returns decision records, raw findings, sampling details,
thresholds, private notes, extracted values or internal exception text. Submitted
NSRP forms are registration reference data, so they are omitted from the list of
documents awaiting approval. A missing NSRP still needs submission. Unreadable/quality cases offer
clearer-copy guidance. Routine staff review does not imply a problem with the
applicant. The same explanations appear alongside documents in My Documents.

Applicants with `under_review` accounts can edit NSRP reference details or upload
a replacement for a pending document. This exposes the existing server workflow;
an admin does not have to reject the document first. Approved identity documents stay
locked and use the existing correction-request process. The five-upload cap,
waitlist correction limits, version history, background checks and employment
restrictions remain enforced. Updates return to PESO review and do not promise
automatic approval. NSRP has no separate approval requirement. Updating its
reference reopens earlier identity approvals for comparison with the new details.
For verified accounts the reference is locked until PESO reopens the correction.

Validation covers Home-to-My-Documents navigation, pending NSRP editing, real
database document/NSRP replacements, owner-only access, privacy of reasons,
approved locks and upload caps. No database migration, dependencies or settings
were added.

NSRP reference validation: the full suite passed **1,144 tests in 108 files**.
The follow-up dashboard/reference checks passed **22 tests in two files**.
Production build and lint passed with existing warnings. The integration checks
include matching IDs approved without NSRP approval, concurrent reference changes,
correction requests with review tools on/off, reference locks, and upload limits.

## How to undo this

Revert the commit containing this change with `git revert <commit>` and run the
tests/build. There are no new settings, database fields or collections to remove.
Existing submitted document versions and review history must be retained.
Reverting the NSRP-reference change restores the earlier NSRP approval gate;
retained reference submissions may then need the former review workflow. Do not
delete reference reports, submitted versions, or identity review history.
