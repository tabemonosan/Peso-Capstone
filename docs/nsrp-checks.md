# NSRP checks and automatic document review

The current rules, settings, providers, privacy boundaries, limitations and
rollback instructions are documented in [verification.md](verification.md).
The shared applicant/employer checks remain `shared/nsrpChecks.js` and
`shared/nsrp2Checks.js`; the generalized engine is in
`server/services/verificationEngine.js`. Existing NSRP automation supplies reports,
settings, HMAC duplicate claims and quotas, and delegates automatic decisions to
the generalized engine. It no longer provides a parallel production approval path.

Applicant NSRP Form 1 is the registration reference for birth-certificate and ID
comparisons and needs no separate approval, whether generated or uploaded.
Birth certificates, IDs and employer Form 2 remain subject to the versioned
decision gates; identity-document resubmissions remain manual. Employer document
approval preserves the separate account review.
Age/civil-status/address reminders are advisory; they never decide approval.
Default evidence is independent, default sampling is 20% for new settings, and
the shared rate guard is five approvals per IP/mobile HMAC per rolling 24 hours.
The explicit none mode is typed data only and not recommended.

Historical phase records explain the implementation sequence:
[Phase 1](verification-phase-1.md), [Phase 2](verification-phase-2.md),
[Phase 3](verification-phase-3.md), [Phase 4](verification-phase-4.md),
[Phase 5](verification-phase-5.md). Their statements about readers being pending
refer to that phase, not the final system. Phase 6 was intentionally skipped.
