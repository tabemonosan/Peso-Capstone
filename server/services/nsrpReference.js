import { IDENTITY_DOC_KEYS } from '../../shared/verificationDocs.js'

// Upload-path signups may have basic details without imported NSRP answers.
// Keep every name component, including suffixes printed with PhilSys given names.
export function applicantNsrpReference(profile = {}) {
  return profile.nsrp || {
    firstName: profile.firstName, surname: profile.lastName,
    middleName: profile.middleName, suffix: profile.suffix, dob: profile.dob,
  }
}

// An approval made against an earlier registration reference cannot be reused
// after that reference changes. Include version guards for atomic admin actions.
export function identityRecheckUpdate(account, by, at = new Date()) {
  const set = {}, unset = {}, push = {}, match = {}
  for (const key of [...IDENTITY_DOC_KEYS, 'validId2']) {
    const slot = account.verificationDocuments?.[key], versions = slot?.versions || []
    const current = versions.at(-1)
    if (current?.status !== 'approved') continue
    const base = `verificationDocuments.${key}.versions.${versions.length - 1}`
    match[`verificationDocuments.${key}.versions`] = { $size: versions.length }
    match[`${base}.status`] = 'approved'
    match[`${base}.reviewRevision`] = current.reviewRevision || { $in: [0, null] }
    set[`${base}.status`] = 'pending'
    set[`${base}.autoApproved`] = false
    set[`${base}.reviewRevision`] = (current.reviewRevision || 0) + 1
    set[`${base}.reviewReasons`] = ['Registration reference changed']
    for (const field of ['approvedBy', 'reviewedBy', 'reviewedAt', 'adminConfirmedBy', 'adminConfirmedAt']) unset[`${base}.${field}`] = ''
    push[`verificationDocuments.${key}.history`] = { action: 'revert', by, at, reason: 'NSRP reference reopened or changed. Compare this document with the current registration details.' }
  }
  return { set, unset, push, match }
}

export function reopenIdentityDocuments(account, by) {
  const { set, unset, push } = identityRecheckUpdate(account, by)
  for (const [path, value] of Object.entries(set)) account.set(path, value)
  for (const path of Object.keys(unset)) account.set(path, undefined)
  for (const [path, value] of Object.entries(push)) account.set(path, [...(account.get(path) || []), value])
}
