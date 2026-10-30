# Applicant account deletion requests

Applicants use Profile → Account settings → Request account deletion. They
confirm their current password and may provide a reason. A confirmation dialog
explains that the request closes access after PESO approval and retains PESO
registration and employment records. Applicants can cancel a pending request.

Admins use Account Deletions. Approvals require confirmation; declines require
a reason. Applicants receive decline feedback in Account settings. Approved
requests remain in the admin history with a read-only retained PESO record.

The selected return policy allows a fresh registration with the same email:

- A pending or declined request leaves the existing account active.
- Approval disables the old account and invalidates its bearer sessions.
- The old account's NSRP files, referrals, reports, and other PESO records keep
  their existing account identity. This workflow does not erase those records.
- Email-based application and legacy notification references are detached before
  releasing the email. The archived account keeps the original email privately.
- A new registration receives a new account ID and must complete email proof,
  registration, and document verification again. It does not inherit old records.
- Old credentials do not sign into the retired account. An email can be reused
  only after approval, not while its request is pending.

New applicant JWTs include the account ID and session version. Legacy sessions
continue only for legacy accounts with session version zero; they cannot attach
to a new signup with a reused email. All authenticated applicant API requests
pass the account/session check, including profile and document operations.

Approval is resumable without requiring MongoDB replica-set transactions. A
processing request stays in the pending admin queue. A processing lease prevents
concurrent approvals; explicit failures release it for retry, and an interrupted
process lease expires after 15 minutes. Once the email has been released, retries
do not touch new records created with that email. Account closure does not
depend on successful delivery of its confirmation email.

No existing accounts are closed by installing this change. The new request
collection and indexes are created through the existing Mongoose startup.

Focused verification:

```powershell
npx.cmd vitest run server/test/integration/accountDeletion.integration.test.js src/test/accountDeletion.test.jsx
npm.cmd run build
```
