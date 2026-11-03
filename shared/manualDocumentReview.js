export const MANUAL_CHECKLIST = { nameMatches: 'Name matches the NSRP', photoClear: 'Document and photo are clear', notExpired: 'Not expired, or no expiry applies', typeMatches: 'Document type matches', bothSides: 'Both sides reviewed, or back not required' }
export const needsManualChecklist = key => key === 'birthCertificate' || key?.startsWith('validId')
export const completeChecklist = checklist => Object.keys(MANUAL_CHECKLIST).every(key => checklist?.[key] === true)
