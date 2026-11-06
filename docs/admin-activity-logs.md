# Admin activity logs

Admins can open **Activity Logs** in the sidebar to search administrative history
by admin email, action, or record ID and filter by Philippine calendar dates,
request type, and result. The list is paginated, with the newest entries first.

Logging starts when this feature is enabled. Existing document, verification,
referral, and account-deletion histories remain in their existing records.

The central API middleware records administrative changes by existing,
authenticated admins: applicant and employer approvals, account-deletion
decisions, job-title additions and deletions, document reviews, settings changes,
and similar record updates. Failed attempts at these changes are also recorded
with their result. Applicant and employer actions are excluded.

Views, downloads, polling, sign-ins, sign-outs, notification read receipts,
page-guide preferences, validation, and previews are excluded. Earlier entries
for this passive activity are filtered out of listings and pagination totals;
the stored history is retained. The same policy controls recording and listing.
The page shows clear action descriptions and results instead of HTTP details.

Each entry stores the admin account ID and email, action description, timestamp,
HTTP method, redacted path, target record ID when available, response status, and
result. Request bodies, query strings, passwords, tokens, document contents,
private explanations, and extracted identity values are not stored. Only known
decision labels such as approve or decline are used in descriptions.

The collection is `activitylogs`. Date and admin indexes support the listing.
No API is provided to edit or delete entries. API access requires a valid admin
token and an existing admin account. Responses are marked `private, no-store`.
The middleware attempts to save an entry before completing the response. If the
audit database write fails, it emits a generic server error log and allows the
original response to finish; it does not undo an already completed business action.
