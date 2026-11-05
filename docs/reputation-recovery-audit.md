# Existing implementation inspected before changes

Baseline: `452ff26`, on `prompt/reputation-recovery`. The earlier verification
and first-visit guide work was committed and pushed on
`prompt/consistency-waitlist` before this branch was created.

| Area | What already existed | Reused extension |
| --- | --- | --- |
| Ledger | Applicant `trustEvents` private embedded ledger; idempotent event keys; cached `trustValue`; points clamped to 0–100 | Same ledger and private cache, with revision-guarded append-only updates and a shared pure calculation |
| No-shows | Employer reports, seven-day response window, applicant response, PESO confirm/dismiss, no deduction from a report alone | Same report and confirmation endpoints; graduated amounts and penalty review requests |
| Cancellation | Applicant cancellation metadata, admin confirmation of lateness | Same metadata/confirmation path; strictly under 24 hours and graduated penalties |
| Attendance | Employer marked interview held; separate PESO attendance confirmation | Employer outcomes now record the existing attendance event automatically, with the employer cooldown |
| Employment | Employer hire/deployment reports and PESO confirmation | Same confirmation path, with credit caps |
| Recovery | No weekly recovery or alternative decay job was found | Recovery calculated deterministically on read, with virtual recovery history rows |
| Applicant page | Owner-only points/history endpoint and paginated light-theme page with four static policy cards | Standing, forecast, live policy table, sort, scoped application links, and review form |
| Admin detail | Applicant selector, private points/events, manual adjustment controls | Private full ledger with recent confirmed no-show count and reasoned reversals; arbitrary positive adjustments disabled |
| Settings | `referral_settings`, audited automatic delivery/low-trust routing switches | Reputation policy in the same settings document, with before/after history and existing `referral_audit` |
| Review queue | Flagged document review page, review dialogs, document inspection and private binary storage | Reputation review section on that page, with supporting files in the existing `document_files` system |
| Notifications | Existing applicant/admin notifications and neutral application messages | Review requests to PESO; neutral applicant updates for attendance and review outcomes |
| Ratings/privacy | Employer star ratings separate from points; private ledger fields excluded by default | Preserved, with additional employer/other-applicant privacy tests |

No invitation-confirmation credit or seminar/training credit path was found.
No existing tests were deleted or skipped. Policy-specific expectations were
updated to the requested new defaults; fixtures that previously modified only
the cache now include the historical ledger loss they represent.
