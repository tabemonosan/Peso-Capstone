# Applicant review reasons and pending corrections

Applicants awaiting verification see **Why your account is under review** on
Home, immediately below Account status. It lists the unverified required
documents, a neutral explanation, whether a correction can be made, and the
remaining upload allowance. **Review and update documents** opens My Documents
inside Profile directly. Review information refreshes while the Home card is open.

`GET /api/profile/review-status` is owner-scoped and private/no-store. It maps
current document metadata and the matching verification decision to public
templates. It never returns decision records, raw findings, sampling details,
thresholds, private notes, extracted values or internal exception text. Uploaded
NSRP forms explain that staff review is required; unreadable/quality cases offer
clearer-copy guidance. Routine staff review does not imply a problem with the
applicant. The same explanations appear alongside documents in My Documents.

Applicants with `under_review` accounts can edit pending NSRP details or upload
a replacement for a pending document. This exposes the existing server workflow;
an admin does not have to reject the document first. Approved documents stay
locked and use the existing correction-request process. The five-upload cap,
waitlist correction limits, version history, background checks and employment
restrictions remain enforced. Updates return to PESO review and do not promise
automatic approval.

Validation covers Home-to-My-Documents navigation, pending NSRP editing, real
database document/NSRP replacements, owner-only access, privacy of reasons,
approved locks and upload caps. No database migration, dependencies or settings
were added.

## How to undo this

Revert the commit containing this change with `git revert <commit>` and run the
tests/build. There are no new settings, database fields or collections to remove.
Existing submitted document versions and review history must be retained.
