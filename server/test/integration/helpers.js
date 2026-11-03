// Shared helpers for real-database (mongodb-memory-server) integration tests.
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { normalizeEmail } from '../../utils/emailVerification.js'
import { drainVerificationJobs } from '../../services/verificationJobs.js'

let mongod

export async function startTestDb() {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri('peso-integration'))
  return mongod
}

export async function stopTestDb() {
  await drainVerificationJobs()
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
}

export async function clearDb() {
  await drainVerificationJobs()
  const collections = await mongoose.connection.db.collections()
  for (const collection of collections) await collection.deleteMany({})
}

// Minimal answers object that passes validateNsrpAnswers (all required fields).
export function validNsrpAnswers(overrides = {}) {
  return {
    surname: 'Cruz',
    firstName: 'Juan',
    middleName: 'Santos',
    dob: '1990-01-01',
    placeOfBirth: 'Legazpi City',
    sex: 'Male',
    religion: 'Prefer not to say',
    height: '165',
    civilStatus: 'Single',
    addressStreet: '1 Main Street',
    addressBarangay: 'Bgy. 10 - Cabugao',
    addressCity: 'Legazpi',
    addressProvince: 'Albay',
    cellphone: '09171234567',
    employmentStatus: 'Unemployed',
    employmentTypeDetail: 'New Entrant/Fresh Graduate',
    activelyLooking: 'Yes',
    willingImmediately: 'Yes',
    fourPs: 'No',
    occupation1: 'Clerk',
    certified: true,
    skills: [],
    education: [],
    technicalTraining: [],
    eligibility: [],
    workExperience: [],
    languages: [],
    ...overrides,
  }
}

const PDF_HEADER = Buffer.from('%PDF-1.4\n')
const demoPdfParts = ['%PDF-1.4\n']
const demoOffsets = [0]
for (const object of ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 380] /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream']) {
  demoOffsets.push(Buffer.byteLength(demoPdfParts.join('')))
  demoPdfParts.push(`${demoOffsets.length - 1} 0 obj\n${object}\nendobj\n`)
}
const demoXref = Buffer.byteLength(demoPdfParts.join(''))
demoPdfParts.push(`xref\n0 5\n0000000000 65535 f \n${demoOffsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${demoXref}\n%%EOF\n`)
const DEMO_PDF = Buffer.from(demoPdfParts.join(''))
const DECLARED_DEMO = JSON.stringify({ birthCertificate: { copyType: 'PSA copy on security paper' }, validId1: { number: '4982761053' }, validId2: { number: 'PV8472059', expiry: '2035-01-01' } })

// A buffer with a valid PDF magic-byte signature at the requested size.
export function pdfBuffer(sizeBytes = 1024) {
  if (sizeBytes < PDF_HEADER.length) return Buffer.from(PDF_HEADER)
  if (sizeBytes < DEMO_PDF.length) return Buffer.from(DEMO_PDF)
  return Buffer.concat([DEMO_PDF, Buffer.alloc(sizeBytes - DEMO_PDF.length, 0x20)])
}

export const FIVE_MB = 5 * 1024 * 1024

// Attaches the standard document set to a supertest signup request.
export function attachDocuments(req, { size = 1024, resumeSize = size } = {}) {
  return req
    .field('verificationDetails', DECLARED_DEMO)
    .attach('birthCertificate', pdfBuffer(size), { filename: 'birth.pdf', contentType: 'application/pdf' })
    .attach('validId1Front', pdfBuffer(size), { filename: 'id1-front.pdf', contentType: 'application/pdf' })
    .attach('validId1Back', pdfBuffer(size), { filename: 'id1-back.pdf', contentType: 'application/pdf' })
    .attach('validId2Front', pdfBuffer(size), { filename: 'id2-front.pdf', contentType: 'application/pdf' })
    .attach('validId2Back', pdfBuffer(size), { filename: 'id2-back.pdf', contentType: 'application/pdf' })
    .attach('resume', pdfBuffer(resumeSize), { filename: 'resume.pdf', contentType: 'application/pdf' })
}

// Sign a valid signup-email-proof token directly (bypasses the code flow for
// tests that only exercise the signup handler). Pass emailProof: null to omit.
export function emailProofFor(email, overrides = {}) {
  const secret = process.env.JWT_SECRET || 'dev-secret'
  return jwt.sign(
    { email: normalizeEmail(email), purpose: 'signup-email-proof', jti: crypto.randomBytes(16).toString('hex'), ...overrides.payload },
    secret,
    { expiresIn: '30m', ...overrides.sign },
  )
}

export function signupRequest(req, { email, password = 'Password123!', answers = validNsrpAnswers(), emailProof, resume = false, id1Type = 'SSS', ...rest } = {}) {
  const withFields = req
    .field('email', email)
    .field('password', password)
    .field('consent', 'true')
    .field('id1Type', id1Type)
    .field('id2Type', 'Passport')
    .field('verificationDetails', DECLARED_DEMO)
    .field('nsrpAnswers', JSON.stringify(answers))
  if (emailProof !== null) withFields.field('emailProof', emailProof || emailProofFor(email))
  const size = rest.size || 1024
  const withDocs = req => req
    .attach('birthCertificate', pdfBuffer(size), { filename: 'birth.pdf', contentType: 'application/pdf' })
    .attach('validId1Front', pdfBuffer(size), { filename: 'id1-front.pdf', contentType: 'application/pdf' })
    .attach('validId1Back', pdfBuffer(size), { filename: 'id1-back.pdf', contentType: 'application/pdf' })
    .attach('validId2Front', pdfBuffer(size), { filename: 'id2-front.pdf', contentType: 'application/pdf' })
    .attach('validId2Back', pdfBuffer(size), { filename: 'id2-back.pdf', contentType: 'application/pdf' })
  if (resume) withFields.attach('resume', pdfBuffer(rest.resumeSize || size), { filename: 'resume.pdf', contentType: 'application/pdf' })
  return withDocs(withFields)
}

export const validBasicInfo = (overrides = {}) => ({
  firstName: 'Juan',
  middleName: 'Santos',
  lastName: 'Cruz',
  suffix: '',
  dob: '1990-01-01',
  cellphone: '09171234567',
  addressCity: 'Legazpi',
  addressProvince: 'Albay',
  ...overrides,
})

// Upload-path signup: nsrpFile + basic information, no nsrpAnswers.
export function signupUploadRequest(req, { email, basic = validBasicInfo(), emailProof, nsrpFile } = {}) {
  const withFields = req
    .field('email', email)
    .field('password', 'Password123!')
    .field('consent', 'true')
    .field('nsrpMode', 'upload')
    .field('id1Type', 'SSS')
    .field('verificationDetails', DECLARED_DEMO)
  for (const [key, value] of Object.entries(basic)) withFields.field(key, value)
  if (emailProof !== null) withFields.field('emailProof', emailProof || emailProofFor(email))
  if (nsrpFile !== null) {
    withFields.attach('nsrpFile', nsrpFile || pdfBuffer(), { filename: 'nsrp.pdf', contentType: 'application/pdf' })
  }
  return withFields
    .attach('birthCertificate', pdfBuffer(), { filename: 'birth.pdf', contentType: 'application/pdf' })
    .attach('validId1Front', pdfBuffer(), { filename: 'id1-front.pdf', contentType: 'application/pdf' })
}

// Complete the four-step job application without changing signup documents.
export function jobApplicationRequest(req, { email = 'applicant@example.com', mobile = '09171234567', bachelorDegree = 'No', hasExperience = 'No', experience = '', resume = pdfBuffer() } = {}) {
  return req.field('sharingConsent', 'true')
    .field('applicationDetails', JSON.stringify({ email, mobile, bachelorDegree, hasExperience, experience }))
    .attach('resume', resume, { filename: 'resume.pdf', contentType: 'application/pdf' })
}
