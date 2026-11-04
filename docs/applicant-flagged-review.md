# Applicant document review

Applicant birth certificates and IDs that pass automatic verification are
verified without an additional administrator decision. Clean replacement uploads
use the same checks as first uploads. Random audit sampling applies to employer
documents, not applicant identity documents.

Only documents requiring attention enter the applicant admin queue: verification
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
