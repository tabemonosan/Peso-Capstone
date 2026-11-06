# Portal confirmations and notices

All application calls to browser `alert`, `confirm` and `prompt` have been
removed. These no longer display browser/hostname popups or block the page's
JavaScript event loop.

Referral Accept/Decline uses the existing portal `ConfirmDialog`, including
Cancel, an explicit action button, busy state, inline failure and Retry. No
mutation is sent before confirmation. Failed requests leave the referral
unchanged; a successful response updates its status and displays a success
notice. Duplicate submissions are blocked while a request is in flight.

Other former alerts now use `showNotice(text, type)` from
`src/utils/portalNotice.js`. The shared `PortalNotice` host is mounted outside
the authenticated App content, so login/signup errors and authenticated actions
use the same presentation. Existing App success/error messages also use it.

Supported types:

- **success**: action completed; automatically dismisses after six seconds.
- **info**: informational update; automatically dismisses after eight seconds.
- **warning**: needs attention; remains until dismissed.
- **error**: action failed or validation problem; remains until dismissed.

The host shows up to three recent messages, combines duplicate text/type
notices, has explicit Dismiss buttons and never steals keyboard focus. Errors
use `role=alert`; other notices use `role=status`. Inline field errors and
existing contextual portal dialogs remain in their own forms.

This changes presentation only; server notification records, unread counts and
navigation destinations remain unchanged. No new dependencies, environment
variables, migrations or database changes are needed.
