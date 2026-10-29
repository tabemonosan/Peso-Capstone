import { describe, it, expect } from 'vitest'
import { registrationChecklist, registrationProgress } from '../../server/utils/registration.js'

const docSlot = { uploads: 1, versions: [{ version: 1, status: 'pending', uploadedAt: new Date() }] }

// Applicant who has every required step done — no skills, no resume (both optional)
const completeApplicant = {
  email: 'complete@peso.gov',
  profile: {
    firstName: 'Juan',
    lastName: 'Cruz',
    name: 'Juan Cruz',
    location: 'Legazpi City',
    summary: '',
    skills: [],
  },
  verificationDocuments: {
    nsrpForm: docSlot,
    birthCertificate: docSlot,
    validId1: docSlot,
  },
}

describe('registrationChecklist (skills and resume optional)', () => {
  it('has exactly 5 required applicant steps: name, location, and the 3 required documents', () => {
    const checklist = registrationChecklist(completeApplicant, 'Applicant')
    expect(checklist).toHaveLength(5)
    expect(checklist.map((item) => item.key)).toEqual(['name', 'location', 'nsrpForm', 'birthCertificate', 'validId1'])
    expect(checklist.map((item) => item.key)).not.toContain('skills')
    expect(checklist.map((item) => item.key)).not.toContain('resume')
  })

  it('registrationProgress completes for an applicant without skills, bio, or resume', () => {
    const progress = registrationProgress(completeApplicant, 'Applicant')
    expect(progress.complete).toBe(true)
    expect(progress.done).toBe(5)
    expect(progress.total).toBe(5)
  })

  it('completes for an upload-path applicant (basic info only, no structured NSRP answers)', () => {
    const uploadPath = {
      email: 'upload@peso.gov',
      profile: { firstName: 'Juan', lastName: 'Cruz', name: 'Juan Cruz', location: 'Legazpi, Albay', summary: '' },
      verificationDocuments: { nsrpForm: docSlot, birthCertificate: docSlot, validId1: docSlot },
    }
    expect(registrationProgress(uploadPath, 'Applicant').complete).toBe(true)
  })

  it('still blocks applicants missing real required steps', () => {
    const missingDocs = { ...completeApplicant, verificationDocuments: { nsrpForm: docSlot } }
    const progress = registrationProgress(missingDocs, 'Applicant')
    expect(progress.complete).toBe(false)
    expect(progress.total).toBe(5)
    expect(progress.done).toBe(3) // name, location, nsrpForm
  })
})
