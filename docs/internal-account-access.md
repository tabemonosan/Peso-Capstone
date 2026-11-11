# Internal account access

All internal accounts use the existing `Admin` portal/session role. The stored
`adminLevel` identifies `super_admin`, `admin`, or `staff`; the interface shows
Super Admin, Admin, or Staff. Existing accounts without a level retain normal
Admin access. Public signup cannot create an internal account.

| Capability | Super Admin | Admin | Staff |
| --- | --- | --- | --- |
| Records, document inspection, job inspection, hiring updates | Yes | Yes | Yes |
| Internal notes, recommendations, hiring follow-ups | Yes | Yes | Yes |
| Routine referrals for eligible applicants and jobs | Yes | Yes | Yes |
| Final verification, employer and job decisions, reversals, restrictions | Yes | Yes | No |
| Job title changes | Yes | Yes | View only |
| Aggregate activity reports and exports | Yes | Yes | Yes |
| Account deletion requests | Decide | Inspect and recommend | No |
| Activity logs | All | Operational, excluding account/settings changes | Own only |
| Automation, referral, moderation and reputation settings | Edit | View | No |
| Internal accounts and access levels | Manage | No | No |

Recommendations are separate records; they do not change document, account,
application, or reported hiring status. Hiring updates preserve applicant and
employer statements; internal follow-up notes do not rewrite either statement.

The API loads the internal account on every authenticated request. Disabled
accounts and deleted internal accounts cannot use existing tokens.
Disabling an account also invalidates its sessions permanently; enabling it again
requires a new sign-in. URL capitalization does not change access permissions.
Access changes apply to existing sessions immediately at the API. Refreshing the portal
updates navigation and buttons. Token claims and request bodies cannot grant a
higher access level. Internal account changes require a reason and are audited.
Super Admin accounts cannot demote or disable themselves or another Super Admin
through the account manager, preserving system access.

Use the Super Admin's Internal Accounts page to create accounts and change Admin
or Staff access. Click Create account, enter a name and email, and select Admin
or Staff (the default). The server generates an initial password. The creation
result offers Copy login details; dismissing it clears those details from the
screen. Initial passwords are not stored in browser storage or exposed in account
lists. Account creation is audited automatically; access changes require a reason.

New internal accounts must choose their own password at first sign-in. Until then,
the API permits only profile reads and password change. The password change checks
the initial password, enforces the shared password policy, invalidates all initial
sessions, and issues a fresh session. Existing accounts keep their current passwords
and do not receive this requirement retroactively.

Super Admin can reset an active Admin or Staff account from its Reset password
button. A new initial password is shown once and existing sessions end. The account
holder must choose a personal password again. All users can recover their own
account using an email verification code from Forgot password on the sign-in page.
See [password recovery](password-recovery.md).

To provision the initial three accounts in the configured database:

```sh
node server/scripts/create-internal-accounts.js
```

The script creates missing accounts, hashes random passwords with bcrypt, and
prints initial credentials once. Re-running it preserves existing accounts.
No passwords are committed to the repository.

To create an additional Super Admin with a different email, run this from the
project root on the intended computer:

```sh
node server/scripts/create-super-admin.js laptop.superadmin@example.com "Laptop Super Admin"
```

Use an email you own for email recovery. The script uses that computer's `.env`
database, refuses existing email addresses, and displays a generated temporary
password once. Sign in and choose a new password when prompted. With a localhost
MongoDB connection, running this on your laptop creates the account only in your
laptop's database.

If an existing Super Admin's password is lost and email recovery is unavailable,
an operator with database access can run this on the intended computer:

```sh
node server/scripts/reset-super-admin.js superadmin@peso.local
```

This resets only the specified enabled Super Admin, displays a new temporary
password once, invalidates previous sessions, and requires a password change at
sign-in. It preserves other accounts and refuses missing, disabled, Admin, and
Staff accounts. The command uses the project `.env`; it does not reset an account
on another computer when the connection points to localhost.
