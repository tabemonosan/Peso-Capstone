# Online CSM questionnaires

Approved applicants and employers can open Reviews and choose **Fill online — English** or **Fill online — Tagalog**. Original PDF links remain available. Both forms validate respondent details, Citizen's Charter answers, and all nine SQD ratings before submission. Name, address, email, and suggestions are optional. CC1 option 4 automatically sets CC2 and CC3 to N/A.

Responses are voluntary but linked internally to the authenticated account; the form explains this before submission. Account details are not automatically copied into optional fields. PESO staff complete the original form's office, service, transaction, and control-number fields separately.

The supplied PDFs have different SQD6 and SQD7 questions. The online form preserves the selected source version, and each stored response includes its language and `CSM-Online-v2` version. Do not aggregate these questions across languages as equivalent measurements.

`POST /api/csm/responses` validates and stores an immutable response in `csm_responses`, returns a dated reference receipt, and notifies administrators. A UUID `Idempotency-Key` prevents duplicate submissions when retrying the same request. Answers stay on the page after a failed request; leaving or refreshing the page discards unsubmitted answers.

Admins open **Reports → View client feedback**, or a feedback notification, to view submitted answers. `GET /api/csm/responses` is admin-only and supports paginated role and language filters. It excludes internal account IDs and idempotency metadata from its response. Authenticated users cannot browse other respondents' submissions.
