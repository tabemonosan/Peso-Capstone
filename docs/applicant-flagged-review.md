# Applicant document review

Applicant IDs that pass automatic verification are
verified without an additional administrator decision. Clean replacement uploads
use the same checks as first uploads. Random audit sampling applies to employer
documents, not applicant identity documents.

Birth certificates remain required supporting uploads. They show as Received,
without OCR, NSRP comparisons, automatic approval, or an admin review requirement.
Account verification requires a submitted NSRP, a birth certificate upload, and
an approved Valid ID #1. Older birth-certificate flags do not block verification;
legacy certificate waitlists are rechecked without charging correction attempts.

Only identity documents requiring attention enter the applicant admin queue: verification
findings, insufficient evidence, unreadable documents, requested corrections,
submitted explanations, explicit holds, or unavailable/disabled verification.
An upload still being checked is not considered verified and is not sent to the
admin queue until a check produces a review reason. Existing approvals remain
verified; corrections to verified information still use the correction request.

The applicant document screen shows Checking, Verified, or Flagged for review.
The explanation action appears only for documents needing attention. NSRP remains
the registration reference and does not require independent approval. A cleared
waitlist check recomputes account verification after all identity checks finish.

No saved accounts or verification settings are migrated by this change. Existing
pending documents take the updated path when their verification check runs again.

ID type is optional metadata for signup and replacement uploads. ID verification
compares only the name read from the front image with the NSRP name; birth date,
ID number, expiry date, and ID type do not participate in that comparison.
Combined surname/given/middle-name rows retain the complete name so multiple
first names are not split incorrectly. OCR checks the name row confidence and
re-reads the license name region when available. Unreadable names still require
review. Older pending checks are refreshed when document status is opened,
without charging correction attempts. Account holds and duplicate-identity
review remain in effect.
