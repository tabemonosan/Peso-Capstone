import mongoose from 'mongoose'

// Retained records and orphaned claims must not reserve an identity forever.
export async function hasActiveOtherOwner(owners = [], owner, { Applicant, Employer }) {
  const candidates = owners.filter(entry => entry !== owner)
  const checks = await Promise.all([['Applicant', Applicant], ['Employer', Employer]].map(async ([role, Model]) => {
    const ids = candidates.filter(entry => entry.startsWith(`${role}:`)).map(entry => entry.slice(role.length + 1)).filter(mongoose.isValidObjectId)
    return ids.length > 0 && Boolean(await Model.exists({ _id: { $in: ids }, deletedAt: null }))
  }))
  return checks.some(Boolean)
}

export async function releaseApplicantClaims(id) {
  const owner = `Applicant:${id}`
  for (const name of ['nsrp_identifier_claims', 'verification_qr_claims']) {
    await mongoose.connection.db.collection(name).updateMany({ owners: owner }, { $pull: { owners: owner } })
  }
}
