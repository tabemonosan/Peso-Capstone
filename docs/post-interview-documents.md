# Optional post-interview document task

After recording an interview as completed, the employer can choose **Add
optional document task** under step 3 in Applications and referrals. Select
any combination of:

- Background-check authorization form.
- Proof of certifications or degrees.
- Identity verification document.

Instructions (up to 1,000 characters) tell the applicant which authorization
form to complete and what proof is needed. Sending the request uses a
confirmation dialog. No task is required to record the hiring outcome.

Applicants see the task in My applications and upload each requested file
directly in the portal. Each requirement accepts one PDF, JPG or PNG file up
to 5 MB. Multiple certificates can be combined in a PDF of up to ten pages.
Images are decoded, orientation-normalized and stripped of EXIF/GPS metadata.
Unsupported, malformed, oversized and MIME-mismatched files are rejected.
This validates file readability/type, not document authenticity; no antivirus
or background-check provider is integrated.

Each requirement allows up to three uploads, including replacements. The
latest version is downloadable; old versions cannot be accessed through the
task download endpoint. When every requested file has been uploaded, the task
becomes **Ready for employer review**. The employer downloads the documents
and explicitly confirms **Mark document task complete**. This records server
time and the employer identity without changing the final hiring outcome or
claiming that a background check was performed. Uploads are closed after task
completion or a recorded hiring outcome. Expired files must be replaced
before completion, subject to the upload limit.

## Private storage and lifecycle

Interviews store only optional `postInterviewTask` metadata. File bytes are in
`post_interview_files`, selected out of ordinary queries. Access requires the
owning applicant, the approved employer who owns the referral, or a real admin
account. A withdrawn referral removes employer access. Downloads are
attachments with `private, no-store` and `nosniff` headers. Existing private
PESO verification uploads are never automatically shared with employers.

Files expire 90 days after upload. A MongoDB TTL index eventually deletes the
bytes, while the download endpoint enforces expiry immediately. Interview
metadata and audit history remain. Unreferenced files after an interrupted
upload also expire. Completion sends the exact reviewed file IDs and checks
them again in the database so an upload replacement cannot be silently
approved using an outdated review. Concurrent conflicting uploads return a
conflict; there are no distributed transactions across metadata, file storage
and notification writes.

Task request, upload and completion events are recorded in interview history;
notifications link each participant to their own view. The applicant lists
return a field-by-field task DTO with no file bytes or private actor fields.

## API

- `POST /api/workflow/interviews/:id/task`: employer request with
  `requirements` keys (`background_authorization`, `qualifications`, `identity`)
  and applicant-facing `instructions`.
- `POST /api/workflow/interviews/:id/task/:key/file`: owner applicant multipart
  upload, a single `file` field.
- `GET /api/workflow/interviews/:id/task/files/:fileId`: authorized download of
  the current, unexpired file.
- `POST /api/workflow/interviews/:id/task/complete`: employer completion with
  a `files` object mapping each requirement key to the reviewed file ID.

Existing employer interview and applicant application endpoints include the
task metadata. Tasks are available only for completed interviews on active
applications, and a new task cannot replace an already assigned task.

No new dependencies, environment variables, migrations, backfills or seeds.
Before production deployment, back up with
`mongodump --uri="<MongoDB URI>" --out="<backup folder>"`.

Rollback can revert the implementation without deleting historical tasks or
files. TTL cleanup still requires the collection/index to remain available.
Do not delete sensitive stored files or audit records as part of a code rollback.
