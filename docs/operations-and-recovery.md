# Correction instructions, email delivery, and backups

Applicants see correction instructions beside documents needing review in My
Documents. The instructions identify the file to replace, the available submission
controls, and what follows submission. Valid IDs require both sides; NSRP changes
use the NSRP editor. Exhausted upload chances and locked records direct the user
to PESO. Employers receive the corresponding NSRP Form 2 guidance in Account
verification. Correction instructions do not remove restrictions or bypass review.

## Email delivery

Admin and Super Admin can open Email Delivery to filter by status or search by
recipient/subject. Staff cannot access this screen or its API. Sent means accepted
by the configured SMTP provider, not verified inbox delivery. Delivery history
begins with emails sent after this feature is installed.

Email messages are recorded before delivery. Queued and failed notifications
survive restarts and retry automatically, with a lease preventing concurrent
workers from sending the same attempt. Retry delays are 1, 2, 4, and 8 minutes,
up to five attempts and a 24-hour lifetime. Admin can retry an eligible failed
notification manually after confirmation; the action appears in Activity Logs.
SMTP cannot guarantee exactly-once delivery if a process stops after the provider
accepts a message but before the database records the result.

Pending bodies are encrypted with AES-256-GCM. Keep EMAIL_DELIVERY_SECRET stable
across restarts (JWT_SECRET is the fallback). Message bodies are never returned
by the delivery API and are removed after success or the final failure. Expired
pending messages lose their encrypted body. Recipients and subjects remain in the
delivery history for administrators.

Verification codes and account-verification links are tracked but never retried:
request a fresh code/link from the relevant page, since a newer request can
invalidate the previous one. Standalone mail diagnostics without a database can
send directly; normal application sends are tracked in the connected database.

## Encrypted local backups

```powershell
npm run backup:create
npm run backup:verify -- .backups/<archive>.enc
npm run backup:restore -- .backups/<archive>.enc --database peso_restore_check
```

Backups default to `.backups/`; the first create generates a 32-byte AES encryption
key in `.backup-secrets/backup.key`. Both directories are ignored by Git. Preserve
the key separately when copying archives to another device. Without that exact key,
the archive cannot be restored. BACKUP_DIR and BACKUP_KEY_FILE override these paths.
Database credentials and other environment settings are not included in archives.

Each archive contains the database's collection data (including BSON dates, IDs,
and binary document files), indexes, view metadata, and `server/uploads` files.
The archive is streamed, compressed, and authenticated with AES-256-GCM. Verification
decrypts and checks the complete archive without writing to the database. Restore
authenticates the entire archive before making changes, requires an empty database
whose name contains `_restore_`, and refuses the source database. File restoration
uses a separate empty folder under `.backups/restored-files/<database>` unless
`--files-dir` is provided. Stored upload paths are mapped to that folder.

For a consistent point-in-time backup, pause application writes during creation:
this portable implementation reads collections in sequence and does not take a
MongoDB replica-set snapshot. Restored data is isolated; verify it before any
separately planned deployment or cutover. Backup creation does not delete older
archives. Monitor available disk space and manage archive retention separately.

## Windows daily schedule

```powershell
powershell -NoProfile -File scripts/schedule-backup.ps1 -Time 02:00
```

This installs the `PESO Daily Encrypted Backup` task for the current Windows user,
using the machine's local time. It runs while that user is signed in, starts missed
runs when available, and uses a hidden window. The last run output is stored in
`.backups/last-backup.log`. Inspect the task in Task Scheduler and keep the workspace,
Node installation, `.env`, and encryption key available. An existing task is not
overwritten by the installer.

## Connected workflow and recovery tests

`npm run test:workflow` runs against isolated MongoDB test databases. It covers
verified registration, employer and applicant review, job approval, application,
automatic referral, interview invitation/confirmation/completion, PESO attendance
confirmation, hiring statements, feedback, account closure and fresh registration.
It also verifies encrypted backup/restore of records and files, refusal to overwrite
data, tamper/wrong-key detection, durable email retries, concurrent retry exclusion,
expiration and email-delivery permissions. No real emails are sent by these tests.
