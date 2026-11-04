# Admin approval and acceptance freeze investigation

## Reproduced cause

Shared `Modal` instances each remembered the current body overflow value.
Opening a confirmation inside a review dialog caused the child to remember
`hidden`. A successful review unmounted both; depending on cleanup order, the
child then restored `hidden` after the parent restored the original value.
The dialogs disappeared but page scrolling stayed locked. This was reproduced
in a regression test before fixing it.

The same investigation reproduced Escape bubbling from a confirmation to its
parent and closing both, and incorrect scroll restoration when independently
mounted dialogs closed out of order. OverlayModal also restarted its entire
focus/scroll effect whenever an inline close callback changed on rerender.

Both shared modal shells and the mobile job-filter sheet now use one counted
scroll lock. The original overflow style is restored only when the final lock
is released. Nested dialogs receive explicit layers, and only the top dialog
handles Escape/Tab. OverlayModal reads current close callbacks without
restarting its focus effect on every rerender.

## Related failure paths repaired

- Global App confirmations and the job-review dialog did not catch unexpected
  callback rejections. They now report the error and always release busy and
  in-flight guards, preserving cancel/retry controls.
- Notifications awaited optional SMTP delivery after saving the in-app entry.
  Job approvals, employer approvals, document reviews and interview/referral
  actions that await notifications could therefore wait on slow SMTP. Optional
  email now runs independently after the in-app notification is saved, with
  errors handled. SMTP connections/greetings have 10-second limits and socket
  inactivity has a 20-second limit. Delivery remains best effort, without a
  durable email queue or retry worker; restarting during delivery can lose an
  email, while the in-app notification remains stored.
- Job/employer/applicant review requests, document actions, workflow requests
  and employer referral responses now abort stalled fetches after 30 seconds
  awaiting response headers. They explain that the user must check current
  status before retrying: an aborted client request does not undo a committed
  server decision. This deadline does not cover a stalled response body after
  headers have already arrived.

These fixes cover shared approval/decline/revoke/resubmit confirmations and
other dialogs using the same modal shells. No database migrations, new
dependencies, environment variables, or live data operations are required.

## Validation

Regression tests reproduce nested approval closure, Escape isolation,
out-of-order modal cleanup, recovery and retry after a rejected job approval,
and notification completion while SMTP remains pending. Request helper tests
cover timeout/abort and successful/failed timer cleanup. Existing document,
job-review, mailer, notification and modal tests remain enabled.
