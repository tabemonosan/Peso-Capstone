import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { Applicant, Employer, Admin, Notification } from '../models/collections.js'
import { REQUIRED_DOC_KEYS } from '../../shared/verificationDocs.js'
import { VERIFICATION_DEFAULTS } from '../../shared/verification.js'
import { createNsrpAutomation } from '../services/nsrpAutomation.js'
import { createVerificationEngine } from '../services/verificationEngine.js'
import { createDocumentVerification } from '../services/documentVerification.js'
import { storeDocumentFile } from '../utils/documentFiles.js'

// Artificial comparison evidence is used ONLY to construct clearly labelled fake fixtures.
// This is not an OCR accuracy test or a PSA credential. No global settings are changed.
export async function seedVerificationScenarios({ tag = crypto.randomBytes(5).toString('hex') } = {}) {
  if (!/^[a-z0-9-]+$/i.test(tag)) throw new Error('Use an alphanumeric demo tag')
  const EmployerRequest = mongoose.model('EmployerRequest')
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 4)
  const admin = await Admin.create({ email: `verification-admin-${tag}@example.invalid`, passwordHash })
  const notify = value => Notification.create({ ...value, email: undefined })
  const notifyAdmins = value => notify({ ...value, recipient: { id: admin._id, role: 'Admin' } })
  const pdf = await PDFDocument.create(), page = pdf.addPage([700, 500]), font = await pdf.embedFont(StandardFonts.HelveticaBold)
  page.drawText('FICTIONAL DEMO - NOT VALID EVIDENCE', { x: 30, y: 300, size: 21, font, color: rgb(0.8, 0, 0) })
  const bytes = Buffer.from(await pdf.save())
  const recomputeApplicant = async id => {
    const account = await Applicant.findById(id)
    const approved = Boolean(account.verificationDocuments?.nsrpForm?.versions?.length) && ['birthCertificate', 'validId1'].every(key => account.verificationDocuments?.[key]?.versions?.at(-1)?.status === 'approved')
    await Applicant.updateOne({ _id: id }, { $set: { verificationStatus: approved ? 'approved' : 'under_review' } })
  }
  const base = createNsrpAutomation({ Applicant, Employer, EmployerRequest, notify, notifyAdmins, recomputeApplicant })
  const makeEngine = overrides => createVerificationEngine({ Applicant, Employer, EmployerRequest, automation: { ...base, getSettings: async () => ({ ...VERIFICATION_DEFAULTS, auditPercent: 0, ...overrides }) }, notify, notifyAdmins, recomputeApplicant, random: () => 0.5 })
  const engine = makeEngine({}), sampleEngine = makeEngine({ auditPercent: 100 }), typedDemoEngine = makeEngine({ minimumEvidence: 'none' })
  let index = 0
  const makeApplicant = async (label, firstName, surname, nsrpVersion = {}, extra = {}) => {
    index++
    const phone = '0918' + String(index).padStart(7, '0')
    const data = { surname, firstName, middleName: 'Dela Cruz', dob: '1990-01-01', placeOfBirth: 'Legazpi City', sex: 'Male', civilStatus: 'Single', cellphone: phone, email: `${label}-${tag}@example.invalid`, occupation1: 'Clerk', employmentStatus: 'Unemployed', addressCity: 'Legazpi', addressProvince: 'Albay', skills: [], education: [], workExperience: [], ...extra }
    const versions = key => [{ version: 1, status: 'pending', uploadedAt: new Date(), originalName: 'fictional-demo.pdf', mimetype: 'application/pdf', size: bytes.length, quality: { passed: true, warnings: [] }, declaredDetails: { demoFixture: true }, imageComparisons: [{ fieldGroup: 'name', result: 'match', evidence: 'independent' }], ...(key === 'nsrpForm' ? { sourceType: 'generated', ...nsrpVersion } : {}) }]
    const account = await Applicant.create({ email: data.email, passwordHash, emailVerified: true, nsrpAutoEnabledAtCreation: true, phone, profile: { firstName, lastName: surname, nsrp: data }, verificationDocuments: Object.fromEntries(REQUIRED_DOC_KEYS.map(key => [key, { uploads: 1, versions: versions(key) }])) })
    for (const key of REQUIRED_DOC_KEYS) await storeDocumentFile(account._id, key, 1, 'front', { originalname: 'fictional-demo.pdf', mimetype: 'application/pdf', size: bytes.length, buffer: bytes })
    return account
  }
  const runApplicant = async (account, instance = engine, all = false) => {
    base.attachEngine(instance)
    const ip = '203.0.113.' + index
    await base.process({ role: 'Applicant', accountId: account._id, ip })
    if (all) for (const docKey of ['birthCertificate', 'validId1']) await instance.process({ role: 'Applicant', accountId: account._id, docKey, ip })
  }
  const autoApproved = await makeApplicant('unflagged', 'Amelia', 'Rivera'); await runApplicant(autoApproved, engine, true)
  // Keep the scenario key for existing demo callers; clean applicant documents
  // now pass even when the employer audit-sampling percentage is 100%.
  const auditSample = await makeApplicant('sample', 'Benito', 'Santos'); await runApplicant(auditSample, sampleEngine, true)
  const explained = await makeApplicant('explained', 'Camila', 'Garcia')
  await Applicant.updateOne({ _id: explained._id }, { $set: { 'verificationDocuments.birthCertificate.versions.0.findings': [{ ruleId: 'cross_birth_nsrp_dob', severity: 'critical', fieldGroup: 'birth date', evidence: 'independent', status: 'open' }], 'verificationDocuments.birthCertificate.versions.0.explanation': { status: 'submitted', category: 'Corrected record', note: 'Fictional demonstration: a corrected record is pending.' } } })
  await runApplicant(explained)
  const reference = await Applicant.create({ email: `duplicate-reference-${tag}@example.invalid`, passwordHash, profile: { nsrp: { tin: '888888888' } } })
  const duplicateTin = await makeApplicant('duplicate', 'Daniel', 'Reyes', {}, { tin: '888888888' }); await runApplicant(duplicateTin)
  const uploadedNsrp = await makeApplicant('uploaded', 'Elena', 'Lopez', { sourceType: 'uploaded' }); await runApplicant(uploadedNsrp)
  const makeEmployer = async (label, employerType, instance) => {
    const email = `${label}-${tag}@example.invalid`, phone = label === 'employer-auto' ? '09189990001' : '09189990002'
    const account = await Employer.create({ email, passwordHash, emailVerified: true, companyName: 'Fictional Demonstration Establishment', contactName: 'Marina Santos', phone })
    await EmployerRequest.create({ email, passwordHash, companyName: account.companyName, contactName: account.contactName, phone, nsrpAutoEnabledAtCreation: true, status: 'under_review', registrationDetails: { employerType, workforceSize: 'Micro (1-9)', lineOfBusiness: 'Retail' }, requirementsFile: { originalName: 'fictional-demo.pdf', data: bytes, mimetype: 'application/pdf', size: bytes.length, version: 1, sourceType: 'generated', status: 'pending' }, requirementsVersions: [{ version: 1, sourceType: 'generated', status: 'pending', originalName: 'fictional-demo.pdf', uploadedAt: new Date() }] })
    base.attachEngine(instance); await base.process({ role: 'Employer', accountId: account._id, ip: label === 'employer-auto' ? '203.0.113.100' : '203.0.113.101' })
    return account
  }
  const autoEmployer = await makeEmployer('employer-auto', 'Private', typedDemoEngine)
  const agencyEmployer = await makeEmployer('employer-agency', 'Recruitment & Placement Agency (Local)', typedDemoEngine)
  const revoked = await makeApplicant('revoked', 'Francis', 'Cruz'); await runApplicant(revoked, engine, true)
  const review = createDocumentVerification({ Applicant, Employer, EmployerRequest, automation: { ...base, getSettings: async () => ({ ...VERIFICATION_DEFAULTS, auditPercent: 0 }) }, notify, recomputeApplicant })
  await review.act({ role: 'Applicant', accountId: String(revoked._id), docKey: 'birthCertificate' }, { role: 'Admin', id: String(admin._id) }, { action: 'revoke', version: 1, reason: 'Fictional example: supervisor requested another review.' })
  return { admin, cases: { autoApproved, auditSample, explained, duplicateTin, uploadedNsrp, autoEmployer, agencyEmployer, revoked }, reference, counts: { scenarios: 8, referenceAccounts: 1 } }
}
