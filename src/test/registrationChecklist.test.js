import { describe, it, expect } from 'vitest'
import { registrationChecklist, registrationProgress } from '../../server/utils/registration.js'

const docSlot = { uploads: 1, versions: [{ version: 1, status: 'pending', uploadedAt: new Date() }] }

// Applicant who has every required step done — but no skills
const completeApplicant = {
  email: 'complete@peso.gov',
  profile: {
    firstName: 'Juan',
    lastName: 'Cruz',
    name: 'Juan Cruz',
    location: 'Legazpi City',
    summary: 'Hardworking applicant.',
    skills: [],
  },
  verificationDocuments: {
    nsrpForm: docSlot,
    birthCertificate: docSlot,
    validId1: docSlot,
    resume: docSlot,
  },
}

describe('registrationChecklist (skills optional)', () => {
  it('has exactly 7 required applicant steps, none of them skills', () => {
    const checklist = registrationChecklist(completeApplicant, 'Applicant')
    expect(checklist).toHaveLength(7)
    expect(checklist.map((item) => item.key)).not.toContain('skills')
    expect(checklist.map((item) => item.label)).toEqual([
      'Full name',
      'Location',
      'Short bio / about me',
      'NSRP Registration Form',
      'Birth Certificate',
      'Valid ID',
      'Resume (PDF, DOCX, JPG, or PNG)',
    ])
  })

  it('registrationProgress completes for an applicant missing only skills', () => {
    const progress = registrationProgress(completeApplicant, 'Applicant')
    expect(progress.complete).toBe(true)
    expect(progress.done).toBe(7)
    expect(progress.total).toBe(7)
  })

  it('also completes when skills are undefined or unparseable', () => {
    expect(registrationProgress({ ...completeApplicant, profile: { ...completeApplicant.profile, skills: undefined } }, 'Applicant').complete).toBe(true)
    expect(registrationProgress({ ...completeApplicant, profile: { ...completeApplicant.profile, skills: 'not-an-array' } }, 'Applicant').complete).toBe(true)
  })

  it('still blocks applicants missing real required steps', () => {
    const missingDocs = { ...completeApplicant, verificationDocuments: { nsrpForm: docSlot } }
    const progress = registrationProgress(missingDocs, 'Applicant')
    expect(progress.complete).toBe(false)
    expect(progress.total).toBe(7)
    expect(progress.done).toBe(4) // name, location, summary, nsrpForm
  })
})
