# Automatic job approval and safety screening

New submissions and employer edits to pending, approved and declined jobs run through local,
deterministic, versioned rules before publication. The default is enabled.
Existing jobs retain their status; nothing is backfilled or migrated.

## Automatic publication

A post is approved only when all content and context checks are clear, the
employer has verified email and an approved account, the account is at least
seven days old, the company matches the verified company, and the account is
not suspended or deleted. Normal input validation and verification gates still
apply. Employers may edit their own postings at any status. Every saved edit is
screened again on the server; request-supplied approval and moderation results
are ignored. A flagged edit changes the posting to pending and removes it from
applicant listings until approved. Clear eligible edits are published automatically.
Earlier moderation and review decisions remain in history, while obsolete
approval stamps and decline reasons are cleared. Existing applications are retained.

The employer sees whether the job was published or submitted for PESO review,
along with the current findings. PESO sees the same findings in the existing
job review dialog. Employers receive a publication notification; admins receive
an automatic-approval or pending-review notification. Admin approval/decline and
their existing review history remain available for manual decisions.

## Rules, version 2026-11-06.1

Every finding routes the posting to **pending**; the algorithm does not decline
jobs, penalize accounts, or declare legal violations.

| Code | Reason for review |
| --- | --- |
| `abusive_language` | Common English/Filipino profanity, insults or harassment signals |
| `hateful_content` | Targeted hate, dehumanization or threatening-language signals |
| `prohibited_mlm` | MLM, pyramid, downline or recruitment-based earning signals |
| `applicant_payment` | Applicant fees, deposits, investment or starter-kit requirements |
| `illegal_activity` | Money mules/laundering, document fraud, illegal drug activity, theft or illegal gambling signals |
| `explicit_content` | Explicit sexual-service or sexual-content recruitment signals |
| `age_restriction` | Explicit age range or preference signals |
| `gender_restriction` | Gender or civil-status restriction/preference signals, including common Filipino terms |
| `protected_trait_restriction` | Religion, disability, pregnancy, LGBT exclusion or appearance-preference signals |
| `high_risk_job` | Overseas, crypto/investment, guaranteed-earning or visa claims |
| `unusual_job_terms` | At least 100 vacancies; advertised upper pay at least PHP 5,000/hour, PHP 30,000/day or PHP 500,000/month |
| `content_uncertain` | Very little readable content or detected scripts outside supported English/Filipino screening |
| `unverified_account` | Incomplete email/account verification; route gates also block unverified employers |
| `restricted_account` | Suspended or deleted employer |
| `new_account` | Less than seven days old or missing creation date |
| `company_mismatch` | Posting company differs from verified employer company |
| `posting_volume` | More than three submissions/edits per hour or ten per day |
| `duplicate_posting` | Exact title, description and requirements match another pending/approved job from that employer |
| `automation_disabled` | Admin turned off automatic job approval |
| `screening_unavailable` | Settings, employer, counter or duplicate lookup failed |

Text is normalized with NFKC, case folding and removal of invisible zero-width
characters. Screening includes title, company, description, requirements and
private notes. Explicit local negation such as "No placement fee" or "No MLM"
does not itself trigger the corresponding rule; a separate positive requirement
still triggers review, including later matches in the same clause. Age screening
includes common minimum/maximum-age phrases and ranges using hyphens or Unicode
dashes. Inclusive language is not treated as an exclusion.

## Admin control and data

Open **Job Offers → Automatic job approval**. A reason is required to turn it
on or off. `GET/PUT /api/admin/job-moderation/settings` requires a real admin
account. The only writable setting is Boolean `enabled`; changes retain up to
100 audit events with admin email, timestamp and reason. Disabling affects
subsequent screenings and does not unpublish existing jobs.

Jobs store the latest `moderation` result and up to 20 `moderationHistory`
snapshots, plus normal approval actor/time/history. Applicant and unrelated
employer listing responses exclude both moderation fields and private notes.
Request payloads cannot supply approval or screening results.

Settings use `job_moderation_settings` (`_id: global`). Atomic counters use
`job_posting_counters`; hourly and daily buckets use fixed UTC boundaries and
include edits at every posting status and flagged submissions. TTL cleanup removes buckets
one day after the bucket ends. Requests just across a bucket boundary can use
both buckets; these are not rolling limits. Duplicates use exact comparisons,
not semantic matching, and simultaneous identical submissions can race the
duplicate lookup. Atomic volume limits still apply.

No new environment variables or dependencies. No migration, seed or backfill.
Before production changes, back up using
`mongodump --uri="<MongoDB URI>" --out="<backup folder>"`.

## Scope and limitations

These are transparent policy heuristics, not an AI classifier, authenticity
verification or a guarantee of legal compliance. Keyword rules can miss novel
scams, paraphrases, obfuscation, external link/image content or unsupported
languages, and can flag legitimate contextual mentions. No external URLs are
fetched. PESO must review flagged cases and monitor approved jobs. Exceptions,
including bona fide occupational qualifications, need human review.

Policy references checked for this implementation:
[Philippine RA 10911](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/70324)
addresses age discrimination in employment and includes exceptions;
[ILO fair recruitment principles](https://www.ilo.org/global/topics/labour-migration/publications/WCMS_536755/lang--en/index.htm)
inform applicant-payment screening. Portal review rules are deliberately broader
than a determination that a posting violates either source.

## Rollback

Turn off automatic job approval in the admin control to return new submissions
and pending edits to manual review. Existing approved jobs remain published;
review or decline individual jobs through the normal admin workflow as needed.
Reverting the implementation does not require deleting metadata, settings or
counter collections. Preserve audit records unless there is a separate approved
retention/cleanup decision.
