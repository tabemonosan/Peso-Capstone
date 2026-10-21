import 'dotenv/config'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { PDFDocument } from 'pdf-lib'
import { Applicant, Employer } from '../models/collections.js'

const base = 'http://localhost:4000'
const timestamp = Date.now()
const incompleteEmail = `regtest-incomplete-${timestamp}@example.com`
const signupEmail = `regtest-complete-${timestamp}@example.com`
const approvedEmployerEmail = `regtest-employer-${timestamp}@example.com`
const applicantJobId = new mongoose.Types.ObjectId()
const token = jwt.sign({ email: incompleteEmail, role: 'Applicant' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '5m' })
const signupToken = jwt.sign({ email: signupEmail, role: 'Applicant' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '5m' })
const employerToken = jwt.sign({ email: approvedEmployerEmail, role: 'Employer' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '5m' })

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal')

try {
  const signup = await fetch(`${base}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: incompleteEmail, password: 'Password1!', consent: true }),
  })
  assert.equal(signup.status, 400, 'signup without required profile fields and documents must fail')
  assert.equal(await Applicant.exists({ email: incompleteEmail }), null, 'failed signup must not create an account')

  const completeSignup = new FormData()
  completeSignup.append('email', signupEmail)
  completeSignup.append('password', 'Password1!')
  completeSignup.append('consent', 'true')
  completeSignup.append('name', 'Complete Test Applicant')
  completeSignup.append('location', 'Legazpi City')
  completeSignup.append('skills', 'Customer service, Data entry')
  completeSignup.append('summary', 'A test profile for registration validation.')
  completeSignup.append('id1Type', 'SSS')
  const pdf = new Blob([Buffer.from('%PDF-1.4\nTest document')], { type: 'application/pdf' })
  const png = new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(64)])], { type: 'image/png' })
  completeSignup.append('nsrpForm', pdf, 'nsrp.pdf')
  completeSignup.append('birthCertificate', png, 'birth.png')
  completeSignup.append('validId1Front', png, 'id.png')
  completeSignup.append('resume', pdf, 'resume.pdf')

  const completeResponse = await fetch(`${base}/api/signup`, { method: 'POST', body: completeSignup })
  const completeBody = await completeResponse.json()
  assert.equal(completeResponse.status, 200, `complete signup should succeed: ${completeBody.error || ''}`)
  assert.equal(completeBody.user.registration.complete, true)
  assert.equal(completeBody.user.registration.done, 8)
  assert.equal(completeBody.user.registration.total, 8)
  const resumeDocument = completeBody.user.verificationDocuments.find((document) => document.docKey === 'resume')
  assert.equal(resumeDocument.required, true)
  assert.equal(resumeDocument.status, 'pending')
  assert.equal(resumeDocument.latest.originalName, 'resume.pdf')

  const nsrpAnswers = {
    surname: 'Test',
    firstName: 'Applicant',
    dob: '1995-04-20',
    placeOfBirth: 'Legazpi City',
    sex: 'Female',
    civilStatus: 'Single',
    addressStreet: '1 Main Street',
    addressBarangay: 'Centro',
    addressCity: 'Legazpi City',
    addressProvince: 'Albay',
    email: signupEmail,
    cellphone: '09171234567',
    employmentStatus: 'Unemployed',
    activelyLooking: 'Yes',
    willingImmediately: 'Yes',
    fourPs: 'No',
    occupation1: 'Customer Service Representative',
  }
  let previewResponse = await fetch(`${base}/api/nsrp/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signupToken },
    body: JSON.stringify({ surname: nsrpAnswers.surname }),
  })
  let previewBody = await previewResponse.json()
  assert.equal(previewResponse.status, 422, 'incomplete NSRP preview must be rejected')
  assert.ok(previewBody.fieldErrors.firstName)
  assert.ok(previewBody.fieldErrors.dob)

  previewResponse = await fetch(`${base}/api/nsrp/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signupToken },
    body: JSON.stringify({ ...nsrpAnswers, surname: 'S'.repeat(81), dob: 'not-a-date', sex: 'Unknown', email: 'not-an-email' }),
  })
  previewBody = await previewResponse.json()
  assert.equal(previewResponse.status, 422, 'invalid field values must be rejected server-side')
  assert.ok(previewBody.fieldErrors.surname)
  assert.ok(previewBody.fieldErrors.dob)
  assert.ok(previewBody.fieldErrors.sex)
  assert.ok(previewBody.fieldErrors.email)

  previewResponse = await fetch(`${base}/api/nsrp/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signupToken },
    body: JSON.stringify(nsrpAnswers),
  })
  assert.equal(previewResponse.status, 200, 'valid NSRP answers should generate a PDF preview')
  const previewPdf = Buffer.from(await previewResponse.arrayBuffer())
  assert.deepEqual([...previewPdf.subarray(0, 4)], [0x25, 0x50, 0x44, 0x46])
  assert.equal((await PDFDocument.load(previewPdf)).getPageCount(), 2, 'zero education/training/work rows should preserve the original two-page official form without continuation pages')
  const beforeConfirm = await Applicant.findOne({ email: signupEmail })
  assert.equal(beforeConfirm.verificationDocuments.nsrpForm.versions.length, 1, 'preview generation must not supersede or save a document')

  const oneRowAnswers = {
    ...nsrpAnswers,
    education: [{ level: 'College', school: 'Test University', course: 'Information Technology', year: '2020' }],
    technicalTraining: [{ name: 'Computer Systems Servicing', provider: 'TESDA', course: 'NC II', year: '2021' }],
    workExperience: [{ company: 'Test Company', position: 'Support Staff', startDate: '2022-01-01', endDate: '2023-01-01' }],
    skills: ['Customer service', 'Data entry'],
  }
  previewResponse = await fetch(`${base}/api/nsrp/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signupToken },
    body: JSON.stringify(oneRowAnswers),
  })
  assert.equal(previewResponse.status, 200, 'single education, training, and work rows should render')
  const oneRowPdf = Buffer.from(await previewResponse.arrayBuffer())
  assert.ok((await PDFDocument.load(oneRowPdf)).getPageCount() >= 2)

  previewResponse = await fetch(`${base}/api/nsrp/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signupToken },
    body: JSON.stringify({ ...nsrpAnswers, education: [{ level: 'College' }] }),
  })
  previewBody = await previewResponse.json()
  assert.equal(previewResponse.status, 422, 'partially filled rows must return per-field validation errors')
  assert.ok(previewBody.fieldErrors['education[0].school'])

  const tenRowAnswers = {
    ...oneRowAnswers,
    education: Array.from({ length: 10 }, (_, index) => ({ level: 'Level ' + (index + 1), school: index === 9 ? 'S'.repeat(120) : 'School ' + (index + 1), course: 'Course ' + (index + 1), year: String(2010 + index) })),
    technicalTraining: Array.from({ length: 10 }, (_, index) => ({ name: 'Training ' + (index + 1), provider: 'Provider ' + (index + 1), course: 'Specialization ' + (index + 1), year: String(2010 + index) })),
    workExperience: Array.from({ length: 10 }, (_, index) => ({ company: 'Company ' + (index + 1), position: 'Position ' + (index + 1), startDate: String(2000 + index) + '-01-01', endDate: String(2001 + index) + '-01-01' })),
  }
  previewResponse = await fetch(`${base}/api/nsrp/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signupToken },
    body: JSON.stringify(tenRowAnswers),
  })
  assert.equal(previewResponse.status, 200, 'ten rows in each section should render without breaking the PDF')
  const tenRowPdf = Buffer.from(await previewResponse.arrayBuffer())
  assert.ok((await PDFDocument.load(tenRowPdf)).getPageCount() >= 3, 'ten-row sections should flow across continuation pages')

  await Applicant.updateOne({ email: signupEmail }, { $set: { emailVerified: true } })
  await mongoose.connection.collection('jobpostings').insertOne({
    _id: applicantJobId,
    title: 'Test Posting',
    company: 'Test Employer',
    status: 'approved',
    createdBy: approvedEmployerEmail,
    applicants: [],
  })
  const applicationResponse = await fetch(`${base}/api/jobs/${applicantJobId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signupToken },
    body: JSON.stringify({ answers: tenRowAnswers }),
  })
  assert.equal(applicationResponse.status, 200, 'confirming the NSRP preview should submit the application')
  const savedApplicant = await Applicant.findOne({ email: signupEmail })
  const savedNsrp = savedApplicant.verificationDocuments.nsrpForm
  assert.equal(savedNsrp.versions.length, 2)
  assert.equal(savedNsrp.versions[0].status, 'superseded')
  assert.equal(savedNsrp.versions[1].status, 'pending')
  assert.equal(savedNsrp.versions[1].mimetype, 'application/pdf')
  assert.equal(savedApplicant.profile.education.length, 10)
  assert.equal(savedApplicant.profile.technicalTraining.length, 10)
  assert.equal(savedApplicant.profile.workExperience.length, 10)
  assert.ok(savedApplicant.profile.skills.includes('Customer service'))

  await Applicant.create({
    email: incompleteEmail,
    passwordHash: await bcrypt.hash('Password1!', 10),
    emailVerified: true,
    profile: { name: 'Legacy Incomplete Applicant' },
  })

  await Employer.create({
    email: approvedEmployerEmail,
    passwordHash: await bcrypt.hash('Password1!', 10),
    emailVerified: true,
    verificationStatus: 'approved',
    companyName: 'Test Employer',
    contactName: 'Test Contact',
    phone: '09171234567',
    profile: { location: 'Legazpi City' },
  })
  await mongoose.connection.collection('employerrequests').insertOne({
    email: approvedEmployerEmail,
    status: 'approved',
    location: 'Legazpi City',
    requirementsFile: {
      originalName: 'nsrp-registration.pdf',
      mimetype: 'application/pdf',
      size: 12,
      data: Buffer.from('%PDF-1.4\n'),
    },
  })
  let employerResponse = await fetch(`${base}/api/profile`, {
    headers: { Authorization: 'Bearer ' + employerToken },
  })
  let employerBody = await employerResponse.json()
  assert.equal(employerResponse.status, 200)
  assert.equal(employerBody.registration.complete, true, 'approved employers with a stored requirements PDF must not be prompted to complete registration')
  employerResponse = await fetch(`${base}/api/jobs?status=mine`, {
    headers: { Authorization: 'Bearer ' + employerToken },
  })
  assert.equal(employerResponse.status, 200, 'approved employers with stored requirements must pass the registration gate')

  let response = await fetch(`${base}/api/jobs?status=approved`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  let body = await response.json()
  assert.equal(response.status, 403)
  assert.equal(body.code, 'REGISTRATION_INCOMPLETE')

  response = await fetch(`${base}/api/notifications`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  body = await response.json()
  assert.equal(response.status, 403)
  assert.equal(body.code, 'REGISTRATION_INCOMPLETE')

  response = await fetch(`${base}/api/profile`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  body = await response.json()
  assert.equal(response.status, 200, 'profile checklist must remain accessible')
  assert.equal(body.registration.complete, false)
  assert.equal(body.registration.total, 8)
  assert.equal(body.registration.checklist.find((item) => item.key === 'resume').done, false)

  response = await fetch(`${base}/api/applicants/${(await Applicant.findOne({ email: incompleteEmail }))._id}/verification-documents`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.documents.find((document) => document.docKey === 'resume').status, 'missing')
  assert.equal(body.documents.find((document) => document.docKey === 'resume').required, true)

  const invalidDocx = new FormData()
  invalidDocx.append('document', new Blob([Buffer.from('not a zip')], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), 'resume.docx')
  response = await fetch(`${base}/api/profile/verification-documents/resume`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: invalidDocx,
  })
  assert.equal(response.status, 400, 'DOCX resume uploads must have a ZIP file signature')

  const validDocx = new FormData()
  validDocx.append('document', new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.alloc(32)])], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), 'resume.docx')
  response = await fetch(`${base}/api/profile/verification-documents/resume`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: validDocx,
  })
  body = await response.json()
  assert.equal(response.status, 200, `valid DOCX resume upload should succeed: ${body.error || ''}`)
  assert.equal(body.docKey, 'resume')
  assert.equal(body.status, 'pending')
  const incompleteApplicant = await Applicant.findOne({ email: incompleteEmail })
  response = await fetch(`${base}/api/applicants/${incompleteApplicant._id}/verification-documents`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  body = await response.json()
  const uploadedResume = body.documents.find((document) => document.docKey === 'resume')
  assert.equal(uploadedResume.uploadsUsed, 1)
  assert.ok(uploadedResume.latest.url, 'uploaded resumes should have a signed expiring document URL')
  response = await fetch(new URL(uploadedResume.latest.url, base))
  assert.equal(response.status, 200, 'signed resume URLs should stream the uploaded file')
  const streamedDocx = Buffer.from(await response.arrayBuffer())
  assert.deepEqual([...streamedDocx.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04])

  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(64)])
  const form = new FormData()
  form.append('document', new Blob([pngBuffer], { type: 'image/png' }), 'nsrp.png')
  response = await fetch(`${base}/api/profile/verification-documents/nsrpForm`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form,
  })
  assert.equal(response.status, 200, 'required documents must remain uploadable before completion')

  console.log('Registration gate checks passed.')
} finally {
  await Applicant.deleteOne({ email: incompleteEmail })
  await Applicant.deleteOne({ email: signupEmail })
  await Employer.deleteOne({ email: approvedEmployerEmail })
  await mongoose.connection.collection('employerrequests').deleteOne({ email: approvedEmployerEmail })
  await mongoose.connection.collection('jobpostings').deleteOne({ _id: applicantJobId })
  await mongoose.connection.collection('jobapplications').deleteOne({ jobId: applicantJobId })
  await mongoose.disconnect()
}
