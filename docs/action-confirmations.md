# Action confirmations

The browser entry point installs a confirmation boundary for API writes (`POST`,
`PUT`, `PATCH`, and `DELETE`). Actions without a detailed confirmation use the
shared `ActionConfirmations` dialog before their request reaches the server.
Cancelling sends no request and returns an unsuccessful `ACTION_CANCELLED`
response so the calling form can leave its submitting state.

Existing `ConfirmDialog` actions retain their detailed dialogs and do not receive
a second prompt. Invitation sends, employment reports, post-interview uploads,
and logout have explicit confirmations. Invitation confirmation shows the time,
mode, registered address, and applicant message before sending.

Reads, sign-in/token verification, previews, validation, NSRP import previews,
notification read markers, and passive page-guide/approval-notice state are
exempt. These requests do not submit business decisions. Sending verification
email, submitting registration, saving profiles/settings, uploading documents,
job requests, applications, ratings, and deletes require confirmation.

The fallback queues concurrent requests, sits above existing modal layers, and
removes aborted requests. `fetchWithTimeout` waits for confirmation before
starting its network timer, so time spent reviewing a confirmation cannot cause
a request timeout. Neither credentials nor request bodies are shown in generic
confirmation messages.

When adding an action, prefer a descriptive `ConfirmDialog` with its consequences
and a cancellation path that preserves entered values. The boundary provides
coverage for API writes without their own confirmation.
