# Four-step job application

The Apply modal uses these steps:

1. Contact details: valid email and exactly 11 numeric mobile digits, prefilled
   from the account where available.
2. Resume: one PDF or DOCX, required, maximum 5 MB.
3. Qualifications: Yes/No for completing a bachelor's degree and having work
   experience. A Yes experience answer requires a description of at most 20
   characters. No clears the description. Both degree answers are accepted.
4. Review: shows all answers and the filename, with Back for corrections and
   an explicit Submit application button.

The Review step validates all required fields. Next validates the current
step. Apply opens the form directly, without a separate sharing prompt. The
Review step explains sharing before Submit application.

Every answer and the current step are saved automatically in browser local
storage, under a key scoped to the applicant and job. The selected resume is
stored separately in IndexedDB, preserving the file when reopening or refreshing
the form. Drafts remain after cancellation, closing, refresh, validation errors
or a failed submission. Successful submission clears that job's draft and saved
resume. Drafts are local to the browser/device; storage failures show a warning
and do not prevent the applicant from completing the form.

`POST /api/jobs/:id/apply` accepts multipart form data with `sharingConsent`,
`applicationDetails` (JSON with email, mobile, bachelorDegree, hasExperience,
experience), and a `resume` file. Shared validation runs in browser and server;
the server also checks file signatures. Invalid answers return 403 with
`INVALID_APPLICATION_DETAILS` and field errors; invalid/oversized resumes return
403 with `INVALID_RESUME` or resume field errors. Eligibility is checked before
creating an application, and existing automatic/manual referral behavior is
preserved.

Contact emails use shared format validation (local part, domain labels, lengths,
and suffix). Before continuing from contact details, the browser calls the
authenticated `POST /api/applications/validate-email` endpoint. The server checks
DNS MX records to reject nonexistent or non-mail domains, including typos such
as `gmail.comsds`. Submission repeats that check. Invalid domains return 403
with `INVALID_APPLICATION_EMAIL`; temporary DNS failures return 409 with
`EMAIL_CHECK_UNAVAILABLE` and a retry message. The check does not verify that a
particular mailbox exists or that the applicant owns it, and sends no email.

Each application stores contact/qualification answers and a separate resume.
Binary data is excluded from ordinary queries and JSON responses. Employers
see the submitted contact details and qualifications alongside the existing
verified NSRP profile summary, with a Download resume button. The resume route
`GET /api/applications/:id/resume` permits the applicant owner, PESO admin, and
the approved employer owning an active delivered referral. Another employer
or applicant cannot download it. Queued, withdrawn and pulled-back applications
deny employer access; responses use no-store caching. The private saved NSRP
snapshot and registration verification documents retain their access rules.

The shared rules live in `shared/jobApplication.js`; the modal is
`src/components/JobApplicationWizard.jsx`. Application submission/storage uses
`src/App.jsx`, `server/index.js`, `server/services/referralWorkflow.js`, and the
existing JobApplication model. Resume access uses
`server/routes/applicationHistory.js` and
`src/components/ApplicationResumeButton.jsx`.

Focused checks:

```powershell
npx.cmd vitest run src/test/jobApplicationWizard.test.jsx src/App.test.jsx server/test/integration/automaticReferral.integration.test.js server/test/integration/fullLifecycle.integration.test.js server/test/integration/signup.integration.test.js server/test/integration/signupUpload.integration.test.js
npm.cmd run lint
npm.cmd run build
```
