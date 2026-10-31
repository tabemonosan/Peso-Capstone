# Full-cycle regression checks

Run all automated checks from the repository root:

```powershell
npx.cmd vitest run
npm.cmd run lint
npm.cmd run build
```

The connected lifecycle test uses Express over HTTP with a temporary MongoDB,
real password hashing and login tokens, and captured email delivery. It does not
use the configured application database or send real emails.

```powershell
npx.cmd vitest run server/test/integration/fullLifecycle.integration.test.js
```

The connected scenario exercises:

- Email code request/verification for applicant and employer signup.
- Uploaded NSRP registrations, logins, and employer approval.
- Job submission and approval; blocking applicants still awaiting document review.
- Document approval, expired-deadline rejection, application submission, and duplicate rejection.
- Employer NSRP access denial, PESO referral, and employer acceptance.
- Independent employer/applicant hiring statements, deployment updates, and admin history.
- English/Tagalog feedback submission, retry deduplication, and admin feedback listing.
- Account closure, invalidation of its login token, and retention of historical reports.
- Fresh registration with the same email, a new identity, and no inherited reports.

Additional focused tests cover refusal of referrals to unapproved postings or
restricted applicants, document rejection/resubmission, signup validation,
notifications, account deletion recovery, and UI navigation. Browser storage is
reset before each test; refresh behavior remains preserved within each test.

## Latest verification — October 31, 2026

- Full Vitest run: **585 passed, 0 failed, 63 test files**.
- Production build completed; the existing bundle-size advisory remains.
- Lint completed without errors; existing unused-variable and hook-dependency warnings remain.
- Local browser checks: 14 desktop/mobile views, no horizontal overflow or runtime errors.
- The job filter popup's computed background/text colors were white/black.

The audit fixed API gaps that allowed applications before applicant approval or
after a posting deadline, and referrals to unapproved postings or ineligible
applicants. Test setup now clears browser storage between independent cases,
and the older dashboard assertion matches the current Dashboard page.

Browser layout checks use fixture data. The connected HTTP lifecycle uses its
own temporary database. These checks do not certify a deployed server, live
email delivery, or external hosting/proxy configuration.
