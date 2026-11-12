export function correctionGuidance({ docKey, canReplace = true, remaining, employer = false }) {
  if (!canReplace || remaining === 0) return {
    title: 'PESO review is needed',
    steps: [remaining === 0 ? 'Your upload limit has been reached. Contact PESO for help with this document.' : 'PESO must review or reopen this record before you can replace it.', 'Keep the current document on file. Check your notifications for PESO instructions.'],
    after: 'A restriction or declined account is not removed by uploading a different document.',
  }
  const replacement = employer
    ? 'Use Update NSRP Form 2 to correct establishment details, certify and sign the form, or choose Replace file for an updated PDF.'
    : docKey === 'nsrpForm'
      ? 'Use Update NSRP below to correct your registration details, or replace your uploaded NSRP file if that option is available.'
      : docKey?.startsWith('validId')
        ? 'In this document section, upload clear front and back images of the same ID. Make sure the name is readable and matches your NSRP. ID type is optional.'
        : 'In this document section, upload a clear, complete birth certificate with every edge and the printed details visible.'
  return {
    title: 'How to correct this submission',
    steps: ['Read the PESO feedback for this document and correct the stated problem.', replacement, employer ? 'Submit the corrected form for review. You do not need to register a new employer account.' : 'Submit the replacement using the upload button in this section. If a genuine difference needs explaining, use Explain a difference when available.'],
    after: `After submission, verification starts again and PESO may review the replacement. Check ${employer ? 'Account verification' : 'My Documents'} and Notifications for the result.${Number.isFinite(remaining) ? ` You have ${remaining} upload${remaining === 1 ? '' : 's'} remaining before this submission.` : ''}`,
  }
}
