# Sample verification uploads

Fictional documents marked **SAMPLE - NOT VALID** for local software testing.
Each document is available as a PDF and PNG. Upload either format per slot:

- `sample-birth-certificate`: birth certificate upload.
- `sample-id-front`: Valid ID #1 front.
- `sample-id-back`: optional Valid ID #1 back.

Use these matching applicant details:

| Field | Test value |
| --- | --- |
| First name | Juan |
| Middle name | Miguel |
| Last name | Dela Cruz |
| Date of birth | 2000-01-15 |
| Sex | Male |
| ID type | Philippine Postal ID |
| ID number | 000000000001 |
| ID expiry | 2030-12-31 |
| Birth certificate copy type | PSA e-Certificate (test selector only) |
| Birth certificate reference | TEST-BIRTH-2026-0001 |

The copy-type and ID-type selections exercise the app's form fields; the
fixtures are not issued by PSA or any ID authority. They contain no official
seals, signatures, QR codes or barcodes. They support upload, preview, OCR and
manual-review testing; successful identity authentication or automatic approval
is not expected. No verification checks are disabled by this generator.

Regenerate from the repository root:

```sh
node server/scripts/create-sample-verification-documents.js
```

## Second sample set

Files ending in `-2` contain a second fictional applicant, in PDF and PNG:
`sample-birth-certificate-2`, `sample-id-front-2`, and `sample-id-back-2`.

| Field | Test value |
| --- | --- |
| First name | Ana |
| Middle name | Isabel |
| Last name | Santos |
| Date of birth | 2001-03-22 |
| Sex | Female |
| ID type | Philippine Postal ID |
| ID number | 000000000002 |
| ID expiry | 2030-12-31 |
| Birth certificate copy type | PSA e-Certificate (test selector only) |
| Birth certificate reference | TEST-BIRTH-2026-0002 |

Regenerate only the second set:

```sh
node server/scripts/create-sample-verification-documents.js --second-set
```
