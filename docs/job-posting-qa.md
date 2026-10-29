# Job posting request changes

The employer request and pending-request editor now share JobPostingFields. Validation rules and options live in shared/jobPosting.js and run in the browser and on POST/PUT /api/jobs. Invalid submissions return HTTP 422 with { error, fieldErrors }, keyed by form field name. Application dates use Philippine calendar days, from today through today + 90 days inclusive. Expired deadlines must be updated when editing. New deadlines expire at the end of the selected Philippine day.

Custom titles follow the existing Other/customTitle pattern: they are saved on the pending posting for PESO review. They do not automatically modify the administrator-managed Job Titles library. Exact catalog selections retain the library spelling.

City and province use the shared searchable city picker, derive the province, and are validated against shared/phLocations.js. City names use canonical list spelling. The compatibility location string is always "City/Municipality, Province" for on-site/hybrid jobs, and "Remote" for remote jobs. Remote city/province and negotiable salary amounts are cleared by the server. Skills are trimmed, deduplicated without regard to case, and stored as strings in an array. Suggestions include the existing skill library and this employer's previous requests. Private notes are included in admin and owner responses, and removed from job-seeker responses.

## Existing records

No database rewrite is required. Reads derive salaryMin = salaryMax from parseable legacy single-salary values, default frequency to Monthly, and preserve unparseable legacy salary text and old free-text locations. Legacy employment values map on read and when edited: Contract -> Contractual, Temporary -> Project-based, Internship -> Internship-OJT. Employment filtering includes both old and new stored values. Existing postings can still be approved/declined without filling the new request fields. Editing an old pending request requires completing the current form; unknown cities/provinces are not guessed from old addresses.

## Wage reference

Update only shared/minimumWage.js. The Albay portal uses the Region V private-sector reference under RBV-23: PHP455/day from 2026-04-08 and PHP480/day from 2026-12-01. Source: https://nwpc.dole.gov.ph/rtwpb-v-implements-first-tranche-of-%E2%82%B120-daily-wage-increase-for-bicol-workers-starting-april-8/

The warning estimates monthly wages using 26 working days, identifies the region/effective date, and never blocks submission. It applies only to Monthly salaries in a named Bicol province. Other provinces and Remote postings need an applicable regional reference before a warning can be provided. This estimate does not determine the legal wage for a particular work schedule.

## Files changed for this task

- shared/jobPosting.js
- shared/minimumWage.js
- src/components/JobTitlePicker.jsx
- src/components/JobPostingFields.jsx
- src/App.jsx
- src/components/JobsView.jsx
- server/index.js
- server/utils/jobFilters.js
- src/test/jobTitlePicker.test.jsx
- src/test/jobPosting.test.js
- src/test/jobPostingFields.test.jsx
- src/test/jobReviewFields.test.jsx
- server/test/integration/jobPosting.integration.test.js
- server/test/integration/employerVerification.integration.test.js
- docs/job-posting-qa.md

The pre-existing document filename/download changes and nsrpDocument.integration.test.js are separate workspace work and were preserved.

## Automated verification

Run npm.cmd run build and npm.cmd run lint. Focused tests:

    npx.cmd vitest run src/test/jobPosting.test.js src/test/jobTitlePicker.test.jsx src/test/jobPostingFields.test.jsx src/test/jobReviewFields.test.jsx src/test/jobFilters.test.js src/test/applicantNoSkillsJobs.test.jsx src/test/jobsBoardEmpty.test.jsx src/test/employerWaitlistNavigation.test.jsx server/test/integration/jobPosting.integration.test.js server/test/integration/employerVerification.integration.test.js

The API tests use an isolated in-memory MongoDB and stub email delivery; database notifications and review history are asserted.

## Manual QA

Use a development database, one verified employer, one PESO admin, one job seeker, and one employer still awaiting verification. These steps are a checklist to run manually, not a claim that a browser session has been completed.

1. As the verified employer, open Request a Job Posting. Check the four sections and required indicators. Search by a partial library title; choose it with mouse and keyboard. Search for a novel title; select the inline Add option. Confirm there is one title input and no separate search/dropdown/custom-title input.
2. Start with an otherwise valid request. For each case below, blur the field, then submit. Confirm the message appears next to that field and no posting or notification is created. Correct it before testing the next case.

   | Field | Invalid cases |
   | --- | --- |
   | Title | Blank; custom title over 80 characters |
   | Description | Blank/whitespace; over 3,000 characters |
   | Additional requirements | Over 2,000 characters |
   | Location type | Blank or unsupported value |
   | City/Municipality, Province | Blank/whitespace for both On-site and Hybrid; over 80 characters; unknown city or mismatched province |
   | Employment type | Blank or unsupported value |
   | Education, experience | Unsupported dropdown values |
   | Skills | Empty; a tag over 60 characters; more than 30 tags; a non-array/non-string entry sent to the API |
   | Salary Min, Max | Blank while non-negotiable; nonnumeric; negative; fractional; over PHP9,999,999; maximum below minimum |
   | Pay frequency | Unsupported value |
   | Slots | Blank; zero; negative; fraction; over 999 |
   | Deadline | Blank; past; today + 91 days; invalid calendar date |
   | Notes to PESO Admin | Over 500 characters |

   Textarea/input length limits and native date/select widgets prevent some cases through normal typing. Use browser devtools to remove a length restriction or replay the request with an altered JSON body for those cases; the server must return 422 with the corresponding fieldErrors key. Replay invalid JSON bodies against both POST /api/jobs and PUT /api/jobs/:id. Check that API field errors populate inline if returned to the form.

3. Confirm today and day 90 are accepted. Enter 25000 and blur to confirm 25,000 displays; refocus to see raw digits. Type/paste letters and symbols and confirm they are stripped. Test all three pay frequencies, equal min/max, and a range. With Province = Albay, Monthly min = PHP1,000 should show the soft warning but submit successfully. Check negotiable disables amounts and stores null amounts. Switch to Remote: city/province disappear and are cleared in storage. Switch back to Hybrid: both are required.
4. Click several skill suggestions and confirm each immediately becomes a chip while the light dropdown remains open. The Add button is removed. Search suggestions, add a custom skill with Enter, try a case-insensitive duplicate, and remove with X or by clicking a selected suggestion again. Verify an array of unique strings in the API response. Confirm counters update, preview shows salary/location/requirements/slots/deadline, and private admin notes never appear in preview. Submit a complete request containing every new field. Verify only one pending posting and an admin notification are created.
5. Edit the pending posting, change all new fields, save, reload, and check persistence. As admin, open its pending review modal and verify title, description, requirements, city, province, location type, education, experience, employment type, skills, both salary amounts/range, frequency, negotiability, slots, deadline, and private notes. Approve through the confirmation dialog. Verify the employer sees APPROVED, the job seeker sees the public fields, and the employer receives the approval notification. Check private notes are absent from job-seeker API responses.
6. Submit another complete request. Decline it with a reason. Verify DECLINED, review history, and the employer notification include the reason. Approved postings remain read-only; attempts to edit via PUT must fail.
7. Open an existing posting that has only salary (for example PHP25,000), location, and employmentType = Contract, Temporary, or Internship. Confirm its salary and location still render, the employment label maps correctly, and employment filters find it. Approve/decline a legacy pending posting without editing it. Check an old free-text salary such as Competitive still displays. No migration should be needed.
8. As the employer awaiting verification, confirm request creation remains blocked. Repeat with an unverified email. Existing document verification/upload/review screens and notification navigation must still function.

## Address prefill and numeric follow-up

Employer now stores establishmentAddress.city and establishmentAddress.province as structured fields outside the PDF/profile text. Online registration takes these from Form 2 answers; upload registration sends the basic-information city/province. Login and GET /api/profile return the fields. The profile endpoint lazily persists valid older online Form 2 city/province answers onto Employer. Legacy upload addresses can be recovered when the stored text is an exact shared-list city or ends in a known city/province pair from the signup address serializer. Unrecognized text stays empty; PDF contents are not guessed.

The only pre-existing locations data was the Albay city/barangay dictionary inside App.jsx. It was moved without duplication to shared/phLocations.js, and a shared light CityProvinceFields searchable dropdown is now used by sign-up, create, and edit. No nationwide expansion was assumed. Years of experience remains the existing categorical dropdown. The earlier 90-day maximum deadline remains; the minimum is now today.

Location labels still store "City, Province". Filters serialize labels containing commas as arrays so city/province labels survive selection, refresh, multiple selections, and API requests. Old simple-location URLs remain supported.

Manual follow-up checks:

1. Register one employer online and one through PDF upload. Inspect Employer.establishmentAddress and GET /api/profile; both must contain canonical city/province. Open Create Job Posting and verify the saved address is prefilled. Choose a different branch, check province derivation, then use Reset to my address. Repeat in the pending edit form without overwriting the saved job location on open.
2. Open an older account without structured address answers. City/province must be empty with no messages on open or empty-field blur. Submit to show required errors. Older online accounts with valid registrationDetails recover their saved pair on login or profile read. Legacy uploaded addresses with an exact known city/province suffix also recover.
3. Type and paste letters, currency symbols, signs, and punctuation into both salary fields and slots. Only digits should remain. Salary formats with commas on blur, and posts plain numeric strings which the server stores as Numbers. Check salaries 0 and 9,999,999; slots 1 and 999. Invalid ranges must mark salaryMax and show "Maximum salary must be at least the minimum." below it.
4. Replay POST and PUT with letters, negative salaries, fractional salary/slots, slots 1000, salary 10000000, and a city/province mismatch. Expect 422 fieldErrors, never 500. Display returned errors under each matching field, verify red styling, scroll, and focus on the first invalid input. Today is valid; yesterday is invalid. Existing historical records remain reviewable under their original schema limits.
5. In admin review, check the canonical location and formatted salary range (for example PHP15,000 to PHP20,000). As a job seeker, select one and then multiple city/province filters, reload the URL, and confirm only matching postings appear. Check controls, errors, and surrounding job form areas retain the light theme.

Files changed in this follow-up: shared/phLocations.js; shared/jobPosting.js; src/components/CityProvinceFields.jsx; src/components/JobPostingFields.jsx; src/components/EmployerSignupWizard.jsx; src/App.jsx; src/App.css; src/hooks/useJobFilters.js; server/models/collections.js; server/index.js; server/utils/jobFilters.js; src/test/jobPostingAddress.test.jsx; src/test/jobPostingFields.test.jsx; src/test/jobPosting.test.js; src/test/jobReviewFields.test.jsx; server/test/integration/jobPosting.integration.test.js; server/test/integration/signup.integration.test.js; docs/job-posting-qa.md.

## Address inheritance regression fix

Root cause: address recovery originally ran only on GET /api/profile, while App fetched that endpoint once on mount before fresh sign-in. POST /api/login therefore returned no establishmentAddress for existing accounts. Legacy upload records also contained only the signup-serialized location string, so the earlier structured-only recovery skipped them. The restored-session user state additionally dropped the returned establishmentAddress.

Both login and profile reads now use the same server hydration helper. The shared resolver prioritizes saved structured fields and Form 2 answers, then accepts an exact catalog city or a known city/province suffix before an optional Landmark segment. Street names, unknown text, and landmark references alone never establish an address. Create Job Posting refreshes the profile before opening and normalizes older API payloads through the same resolver. Restored sessions retain the structured address.

The configured database was updated only where establishmentAddress.city was absent and a validated location could be recovered: 8 records updated and verified; 3 blank/unrecognized addresses left unchanged. No existing structured address was overwritten.

Regression checks: 35 focused component/API tests passed, plus production build. Tests cover fresh login recovery without a profile visit, uploaded legacy address recovery, existing signed-in session refresh, blank unknown addresses, and rejection of city names mentioned only in a street or landmark. Reopen the request form after refreshing the app; the registered location should appear without visiting Profile first.

Files changed for this regression: shared/phLocations.js; server/index.js; src/App.jsx; src/test/jobPostingAddress.test.jsx; server/test/integration/jobPosting.integration.test.js; docs/job-posting-qa.md.

Skill selection follow-up: create and edit now use a searchable light multi-select list. Clicking an option immediately updates the skills array and its selected checkmark; the list stays open for additional selections. Custom skills still use Enter. Regression verification: 18 component tests and production build passed. Files changed: src/components/JobPostingFields.jsx; src/test/jobPostingFields.test.jsx; docs/job-posting-qa.md.

## Posting city/province persistence fix

Existing postings had only the legacy full location string. Employer address recovery did not populate those posting fields. Shared normalization now recovers only an exact catalog city/province from the posting's own saved address, preserving a different branch; it never substitutes the employer's current address. Remote postings are not assigned a city/province. The admin review modal also normalizes older API responses, and the edit form already uses this normalization. Current POST/PUT validation continues to persist both fields explicitly.

Nine legacy postings in the configured database were backfilled with their own validated city/province; one unknown location was left unchanged. Office Clerk now stores Oas, Albay. The full original location text was preserved. Tests cover admin paginated/unpaginated responses, employer editing/reopening after a branch change, raw database persistence, and remote/unknown-address behavior. 81 focused tests and production build passed.

The live port-4000 API was also confirmed to be an older process returning no structured fields despite current source normalization. npm run server now enables Node watch mode, so subsequent server/shared changes reload automatically. The existing process was restarted with watch mode. Live HTTP verification returned Office Clerk city = Oas and province = Albay from the admin paginated API, and a deliberately invalid request returned 422 fieldErrors without creating a record.

Files changed for this correction: shared/phLocations.js; shared/jobPosting.js; src/components/JobsView.jsx; src/test/jobPosting.test.js; src/test/jobPostingAddress.test.jsx; src/test/jobReviewFields.test.jsx; server/test/integration/jobPosting.integration.test.js; package.json; docs/job-posting-qa.md.
