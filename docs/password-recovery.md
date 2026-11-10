# Password recovery

The sign-in page's Forgot password button opens an email recovery dialog. It works
for Applicants, Employers, Admins, Staff, and Super Admins with a registered email.

1. Request a six-digit code using the registered email.
2. Enter the code within 10 minutes.
3. Choose and confirm a new password using the shared password policy.
4. Return to sign-in. Existing sessions have ended.

Email recovery uses the existing SMTP/Ethereal mailer. Real inbox delivery requires
SMTP configuration. Ethereal is a development preview inbox. The mailer's fallback
does not deliver emails or reveal verification codes in application logs.

The API gives the same request response for unknown and disabled accounts. Each
address has a 60-second resend cooldown and a five-code hourly limit, and IP limits
apply. A code allows at most five verification attempts and can be verified once.
Verification issues an opaque reset token valid for 10 minutes, usable once and
bound to the account, its email, and its current session version. Resending replaces
the old challenge. Signup codes cannot be used for password recovery. Only hashes
of recovery codes and reset tokens are stored. No passwords, codes, or recovery
tokens are stored in browser storage. Recovery never removes account restrictions
or changes document verification status. Closed and disabled accounts cannot be
recovered into active access.

Super Admin can also use Internal Accounts → Reset password for an active Admin or
Staff account. This requires confirmation and a reason. The result shows a new
generated initial password once with Copy login details. All existing sessions and
outstanding email reset proofs become invalid. The account holder must choose their
own password on the next sign-in. Other Super Admin accounts and the operator's own
account cannot be reset through this control; email recovery is available instead.

Administrative resets appear in Activity Logs without the generated password.
Employer sessions now include and verify a session version so employer password
recovery ends their old sessions as well. Existing employer tokens remain accepted
at version zero until a password reset occurs.
