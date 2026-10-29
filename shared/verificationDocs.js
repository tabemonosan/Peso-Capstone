// Single source of truth for verification document slots.
// REQUIRED_DOC_KEYS: what an applicant needs for account verification —
// exactly NSRP, birth certificate, and Valid ID #1.
// The resume is no longer part of the applicant document system at all;
// stored legacy resume data is kept in the database but unreachable from the UI.
export const VERIFICATION_DOC_KEYS = ['nsrpForm', 'birthCertificate', 'validId1', 'validId2']
export const REQUIRED_DOC_KEYS = ['nsrpForm', 'birthCertificate', 'validId1']

export const VERIFICATION_DOC_LABELS = {
  nsrpForm: 'NSRP Registration Form',
  birthCertificate: 'Birth Certificate',
  validId1: 'Valid ID #1',
  validId2: 'Valid ID #2',
}

export const NSRP_SOURCE_LABELS = {
  uploaded: 'Uploaded by you',
  generated: 'Generated from your answers',
}
