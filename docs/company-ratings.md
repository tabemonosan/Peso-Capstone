# Company star ratings

Applicants can rate a company from My Applications after the employer records
a Hired or Deployed outcome. The form accepts one integer score from 1 to 5
and an optional comment. One rating is allowed per applicant and hire report;
the server checks ownership, recipient, outcome, and duplicate submissions.
An applicant's self-reported outcome alone does not enable a company rating.

Applicant job cards and job details show the company's average score to one
decimal place and its review count, for example `PARKour ★ 3.5 (2 reviews)`.
Employer job cards also show the same summary. Unrated companies have no rating
label. The average includes applicant-to-employer scores only;
employer-to-applicant ratings are separate. Ratings do not affect reputation
points. Only aggregate scores and counts are added to job responses; reviewer
identities and written comments are not included. Reloading job listings
retrieves the latest average.
