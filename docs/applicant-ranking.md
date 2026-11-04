# Job-specific applicant ranking

PESO's applied-applicant queues and employer referral lists put the highest fit
score first for each job. The employer endpoint ranks the full authorized job
pool before applying pagination. Rankings are computed from current structured
NSRP/profile qualifications, not stored as permanent labels on an applicant.
Equal scores preserve the original queue order. Existing referral and hiring
decisions remain manual.

## Inputs and weights

| Evidence | Weight | Rule |
| --- | ---: | --- |
| Required skills | 40 | Fraction of required skills matched, using the existing explicit broader-skill coverage rules. |
| Work experience | 25 | Related role/title evidence (60% of this component), plus recorded relevant years relative to the posting's experience requirement (40%). Overlapping intervals count once. |
| Technical training | 15 | Strongest relevant course/certificate match. Future-dated courses are excluded. Repeated courses do not add points. |
| Eligibility | 10 | Relevant recorded eligibility, when the posting states an eligibility/license/certification requirement. Expired or future-exam entries do not earn points. |
| Language/dialect proficiency | 5 | Recorded read/write/speak/understand proficiency in languages explicitly mentioned in the posting's requirements. Tagalog/Filipino and Bicol/Bikol are normalized. |
| Immediate availability | 5 | NSRP `willingImmediately` is exactly `Yes`. The badge and availability details are shown only for Yes. Other answers do not exclude applicants. |

If the posting states no eligibility or language requirement, that category has
zero weight for every candidate for that job. Earned points are divided by the
remaining maximum and shown as a score out of 100. Missing evidence receives no
points; it is not interpreted as a verified lack of ability. An applicant with
an uploaded form and no structured NSRP can therefore have a lower score.

Training, work and eligibility relevance uses deterministic normalized keyword
overlap against the job title, required skills and requirements. The strongest
matching row is used rather than rewarding applicants for entering many rows.
Work duration uses ISO calendar dates; a blank end date or `Present` is treated
as ongoing. Legacy profile training and work fields are supported when NSRP
arrays are absent. Eligibility without an expiry date is not assumed expired.

## Display and privacy

Cards/tables show rank, fit score, a top-match badge for the first positive score,
and expandable reasons and qualifications. Immediate availability is displayed
only when Yes. Employers receive a whitelist of training course/institution/
certificate/dates, eligibility title/rating/exam/expiry, language proficiency,
and work company/position/dates. Full NSRP answers, licence/identity numbers,
home/work addresses, birth date, sex, religion, disability and civil status are
not returned as ranking evidence or used in scoring. Existing ownership and
role checks continue to restrict employer access to their own referrals.

## Limits

This is an explainable comparison of recorded job qualifications, not an identity
check, competence test or probability of hiring success. Self-reported text can
be incomplete or inaccurate. Keyword matching does not understand every synonym,
complex language requirement (such as alternative languages), or equivalent
certification. Languages are recognized from a fixed list in the shared matcher;
new dialects need to be added to that list before earning language points.
No score verifies a licence or certificate with its issuer. PESO and employers
must review the evidence before deciding. Scores should only be compared for
the same job; they are not a general ranking of people.

The current employer endpoint loads its authorized referral pool before ranking
so that page size cannot change the best candidate. Very large deployments may
need a database-side ranking index or cache with the same scoring rules.
