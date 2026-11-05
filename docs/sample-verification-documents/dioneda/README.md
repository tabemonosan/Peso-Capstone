# Dioneda NSRP comparison fixtures

SAMPLE - NOT VALID. For local upload and OCR comparison testing only.
Identity and address copied from the user-supplied NSRP-Dioneda (2).pdf.
Birthplace preserves the source spelling MANTIO; present address says MANITO.
The source email is dionedaeliseo@gmail.com, not the requested account email dionedaeliseo2@gmail.com.
Parents' names are omitted because they are not provided in the NSRP.
Reference number, ID type, ID number and expiry are invented test values.
No official issuer, seals, signatures, QR codes or barcodes are included.

Upload either PDF or PNG per slot:
- sample-birth-certificate-dioneda: birth certificate.
- sample-id-front-dioneda: Valid ID front.
- sample-id-back-dioneda: back of the SAME Valid ID.

Test selectors: Philippine Postal ID; number 000000000003; expiry 2030-12-31.
Matching identity: Eliseo Dajac Dioneda III; DOB 2003-06-11; Male.
These files test field comparisons, not document authenticity or guaranteed approval.
No account or verification settings were changed.

Regenerate: node server/scripts/create-sample-verification-documents.js --nsrp-dioneda
