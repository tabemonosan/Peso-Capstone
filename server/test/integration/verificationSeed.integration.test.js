// @vitest-environment node
import mongoose from 'mongoose'
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { startTestDb, stopTestDb } from './helpers.js'
vi.mock('../../mailer.js', async original => ({ ...await original(), sendEmail: vi.fn(async () => ({})), initMailer: vi.fn() }))
await import('../../index.js')
const { Applicant, Employer } = await import('../../models/collections.js')
const { seedVerificationScenarios } = await import('../../scripts/seed-approved-jobs.js')
beforeAll(startTestDb, 180000)
afterAll(stopTestDb)
it('seeds all eight fictional scenarios without changing the global approval switches', async () => {
 await mongoose.connection.db.collection('nsrp_auto_settings').insertOne({ _id: 'settings', automaticApproval: false, minimumEvidence: 'independent' })
 const { cases, counts } = await seedVerificationScenarios({ tag: 'verification-test' })
 expect(counts.scenarios).toBe(8)
 const load = async key => Applicant.findById(cases[key]._id).lean()
 expect((await load('autoApproved')).verificationStatus).toBe('approved')
 // A clean applicant remains verified even when the demo requests 100% sampling.
 expect((await load('auditSample')).verificationDocuments.birthCertificate.versions[0]).toMatchObject({ status: 'approved', reviewReasons: [] })
 expect((await load('explained')).verificationDocuments.birthCertificate.versions[0].explanation.status).toBe('submitted')
 expect((await load('duplicateTin')).verificationDocuments.nsrpForm.versions[0].findings.some(f => f.ruleId === 'duplicate_tin')).toBe(true)
 expect((await load('uploadedNsrp')).verificationDocuments.nsrpForm.versions[0]).toMatchObject({ status: 'pending', sourceType: 'uploaded' })
 const EmployerRequest = mongoose.model('EmployerRequest')
 expect((await EmployerRequest.findOne({ email: cases.autoEmployer.email })).requirementsVersions[0]).toMatchObject({ status: 'approved', autoApproved: true })
 expect((await EmployerRequest.findOne({ email: cases.agencyEmployer.email })).requirementsVersions[0].status).toBe('pending')
 expect((await load('revoked')).verificationDocuments.birthCertificate.versions[0]).toMatchObject({ status: 'pending', autoApproved: false })
 expect((await mongoose.connection.db.collection('nsrp_auto_settings').findOne({ _id: 'settings' })).automaticApproval).toBe(false)
 expect((await Employer.findById(cases.autoEmployer._id)).verificationStatus).toBe('under_review')
 expect((await Applicant.find({})).every(a => a.email.endsWith('@example.invalid'))).toBe(true)
})
