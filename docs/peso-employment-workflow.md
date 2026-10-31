# PESO referrals and employment updates

PESO facilitates employment and retains the applicant's NSRP form. Employers
receive the referred applicant's name, email, phone, city/province, skills,
education, training, work experience, and profile summary. They do not receive
NSRP answers, signatures, birth certificates, or identification documents.
Existing NSRP document routes remain restricted to PESO administrators and,
where supported, the applicant who owns the document.

Hiring communication takes place directly between employer and applicant.
Accepting a referral is not confirmation that the applicant was hired.
Declined referrals remain available to the employer for outcome reporting.

Applicants may apply only after PESO approves their required documents. The API
also rejects applications after the posting's deadline, using the Philippine
calendar date (applications remain open throughout the deadline date). Referrals
require an approved posting and approved applicants with active accounts.

Employers report Hired, Not hired, or Deployed from Reports. Applicants report
Hired or Deployed from Employment updates only after the employer accepts the
PESO referral. Pending/declined referrals and direct applications do not expose
the report form; the server enforces the same acceptance rule. The employer decides deployment timing;
the portal records official outcomes and does not schedule deployment.

Both reporters may provide an optional actual hire/deployment date and notes
to PESO (up to 1,000 characters). Future dates are rejected. Each party has a
separate report; changes preserve the previous status, date, notes, and report
time. An applicant report does not confirm or replace the employer's report.
PESO sees the reporter, outcome, date, notes, report time, and previous updates.
Employer-reported hires prompt the applicant to submit their own update.

Legacy reports without a reporter role are treated as employer reports.
Dashboard hire totals include employer Hired/Deployed reports and exclude
applicant reports and Not hired outcomes. Applicant reports do not suppress
employer reporting reminders. Ratings require a Hired/Deployed outcome.

NSRP forms and saved answers are excluded from the automatic document purge.
Supporting document binaries retain the existing retention period (30 days by
default); their review metadata remains. Previously deleted files cannot be
recovered by this change. No database migration or live-data rewrite is needed.

Verification:

```powershell
npx.cmd vitest run server/test/integration/employmentReporting.integration.test.js src/test/employmentReporting.test.jsx src/test/dashboard.test.js src/test/sharedFormStyles.test.js
npm.cmd run lint
npm.cmd run build
```

Manual checks: sign in as each role; review a referral summary as employer;
submit an employer outcome; submit the applicant's independent update; reopen
both screens to confirm persistence; check both statements and history as admin.
Confirm the employer cannot open applicant NSRP/verification document endpoints.
