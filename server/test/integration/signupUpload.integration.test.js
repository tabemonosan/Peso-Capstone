// @vitest-environment node
import { jobApplicationRequest } from './helpers.js'
import { Employer } from '../../models/collections.js'
// Integration tests for the upload-path sign-up (nsrpMode: 'upload') and the
// optional resume, against a real MongoDB (mongodb-memory-server) over HTTP.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import sharp from 'sharp'


// DNS is deterministic; no external mailbox or DNS service is contacted in tests.
vi.mock('node:dns/promises', () => ({ Resolver: class {
  async resolveMx(domain) {
    if (domain === 'gmail.comsds') throw Object.assign(new Error('Domain not found'), { code: 'ENOTFOUND' })
    return [{ priority: 10, exchange: 'mail.example.test' }]
  }
} }))
vi.mock('../../mailer.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    sendEmail: vi.fn(async () => ({ delivered: true })),
    sendVerificationEmail: vi.fn(async () => ({ delivered: true })),
  }
})

const { app } = await import('../../index.js')
const { Applicant } = await import('../../models/collections.js')
const { startTestDb, stopTestDb, clearDb, signupRequest, signupUploadRequest, validBasicInfo, pdfBuffer, FIVE_MB } = await import('./helpers.js')


const applicantCount = () => mongoose.connection.db.collection('applicants').countDocuments()
const documentFileCount = () => mongoose.connection.db.collection('document_files').countDocuments()
const upload = (email, options = {}) => signupUploadRequest(request(app).post('/api/signup'), { email, ...options })

beforeAll(async () => {
  await startTestDb()
}, 180000)
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearDb()
})

describe('POST /api/signup with nsrpMode upload', () => {
  it.each([['png', 'image/png'], ['jpeg', 'image/jpeg']])('rejects a genuine %s NSRP without creating an account or storing documents', async (extension, contentType) => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).toFormat(extension).toBuffer()
    const response = await upload(`image-${extension}@example.com`, { nsrpFile: null }).attach('nsrpFile', image, { filename: `nsrp.${extension}`, contentType })
    expect(response.status).toBe(422)
    expect(response.body.fieldErrors.nsrpFile).toBe('The NSRP form must be a PDF file.')
    expect(await applicantCount()).toBe(0)
    expect(await documentFileCount()).toBe(0)
  })

  it('applies PDF-only validation when replacing an NSRP and still accepts PDF replacements', async () => {
    const signup = await upload('replace-nsrp@example.com').expect(200)
    const headers = { Authorization: `Bearer ${signup.body.token}` }
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer()
    const response = await request(app).post('/api/profile/verification-documents/nsrpForm').set(headers).attach('document', image, { filename: 'nsrp.png', contentType: 'image/png' }).expect(400)
    expect(response.body.error).toBe('The NSRP form must be a PDF file.')
    expect((await Applicant.findOne({ email: 'replace-nsrp@example.com' })).verificationDocuments.nsrpForm.versions).toHaveLength(1)
    await request(app).post('/api/profile/verification-documents/nsrpForm').set(headers).attach('document', pdfBuffer(), { filename: 'replacement.pdf', contentType: 'application/pdf' }).expect(200)
    expect((await Applicant.findOne({ email: 'replace-nsrp@example.com' })).verificationDocuments.nsrpForm.versions).toHaveLength(2)
  })

  it('creates the applicant with basic info, one uploaded NSRP (pending), other docs, and no resume', async () => {
    const res = await upload('uploader@example.com')
    expect(res.status).toBe(200)
    expect(res.body.user.emailVerified).toBe(true)

    const applicant = await Applicant.findOne({ email: 'uploader@example.com' }).lean()
    expect(applicant.profile.firstName).toBe('Juan')
    expect(applicant.profile.lastName).toBe('Cruz')
    expect(applicant.profile.location).toBe('Legazpi, Albay')
    expect(applicant.phone).toBe('09171234567')
    expect(applicant.profile.phone).toBe('09171234567')
    expect(applicant.profile.dob).toBe('1990-01-01')
    expect(applicant.profile.addressCity).toBe('Legazpi')
    expect(applicant.profile.addressProvince).toBe('Albay')
    expect(applicant.profile.nsrp).toBeUndefined() // no structured answers on the upload path

    const docs = applicant.verificationDocuments
    expect(docs.nsrpForm.versions).toHaveLength(1)
    expect(docs.nsrpForm.versions[0].status).toBe('pending')
    expect(docs.nsrpForm.versions[0].sourceType).toBe('uploaded')
    expect(docs.birthCertificate.versions).toHaveLength(1)
    expect(docs.validId1.versions).toHaveLength(1)
    expect(docs.resume).toBeUndefined() // resume not collected at sign-up

    // Exactly one NSRP document, bytes retrievable from document_files
    const stored = await mongoose.connection.db.collection('document_files')
      .findOne({ applicant: applicant._id, slot: 'nsrpForm', version: 1, side: 'front' })
    expect(stored).toBeTruthy()
    expect(stored.data.buffer.subarray(0, 4).toString()).toBe('%PDF')

    // Registration gate: complete with basic info + 3 required docs
    expect(res.body.user.registration.complete).toBe(true)
  }, 60000)

  it('rejects an invalid nsrpMode with 422 and stores nothing', async () => {
    const res = await signupUploadRequest(request(app).post('/api/signup'), { email: 'bad-mode@example.com' })
      .field('nsrpMode', 'carrier-pigeon')
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.nsrpMode).toBeTruthy()
    expect(await applicantCount()).toBe(0)
    expect(await documentFileCount()).toBe(0)
  }, 60000)

  it('rejects a missing NSRP file in upload mode', async () => {
    const res = await upload('no-file@example.com', { nsrpFile: null })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.nsrpFile).toBeTruthy()
    expect(await applicantCount()).toBe(0)
  }, 60000)

  it('rejects a wrong file type (magic bytes)', async () => {
    const res = await upload('bad-type@example.com', { nsrpFile: Buffer.from('this is plain text, not a pdf') })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.nsrpFile).toBeTruthy()
    expect(await applicantCount()).toBe(0)
    expect(await documentFileCount()).toBe(0)
  }, 60000)

  it('rejects an oversized NSRP file', async () => {
    const res = await upload('too-big@example.com', { nsrpFile: pdfBuffer(FIVE_MB + 1024) })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.nsrpFile).toBeTruthy()
    expect(await applicantCount()).toBe(0)
  }, 60000)

  it('rejects invalid basic info (phone, dob age) with 422, never 500', async () => {
    const res = await upload('bad-basic@example.com', { basic: validBasicInfo({ cellphone: '123', dob: '2999-01-01', suffix: 'asdsa' }) })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.cellphone).toBeTruthy()
    expect(res.body.fieldErrors.dob).toBeTruthy()
    // suffix is sanitized to '' by the shared name validator, never reaching the enum
    expect(await applicantCount()).toBe(0)
  }, 60000)

  it('ignores nsrpAnswers when sent in upload mode', async () => {
    const res = await signupUploadRequest(request(app).post('/api/signup'), { email: 'both@example.com' })
      .field('nsrpAnswers', JSON.stringify({ surname: 'IGNORED' }))
    expect(res.status).toBe(200)
    const applicant = await Applicant.findOne({ email: 'both@example.com' }).lean()
    expect(applicant.profile.lastName).toBe('Cruz')
    expect(applicant.profile.nsrp).toBeUndefined()
  }, 60000)
})

describe('online path without a resume', () => {
  it('creates the account with a generated NSRP and no resume', async () => {
    const res = await signupRequest(request(app).post('/api/signup'), { email: 'no-resume@example.com', resume: false })
    expect(res.status).toBe(200)
    const applicant = await Applicant.findOne({ email: 'no-resume@example.com' }).lean()
    expect(applicant.verificationDocuments.nsrpForm.versions[0].sourceType).toBe('generated')
    expect(applicant.verificationDocuments.resume).toBeUndefined()
  }, 60000)

  it('counts only the 3 required documents and ignores a missing resume', async () => {
    const signup = await signupRequest(request(app).post('/api/signup'), { email: 'counted@example.com', resume: false })
    // All 3 required pending (not rejected/missing): nothing needs attention
    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${signup.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.attentionCount).toBe(0)
    const resumeDoc = res.body.verificationDocuments.find((d) => d.docKey === 'resume')
    expect(resumeDoc).toBeUndefined()
    const requiredDocs = res.body.verificationDocuments.filter((d) => d.required)
    expect(requiredDocs.map((d) => d.docKey).sort()).toEqual(['birthCertificate', 'nsrpForm', 'validId1'])
  }, 60000)

  it('reaches verified status without a signup resume and supplies one when applying', async () => {
    const signup = await signupRequest(request(app).post('/api/signup'), { email: 'apply-no-resume@example.com', resume: false })
    // Admin approves the 3 required documents
    await Applicant.updateOne(
      { email: 'apply-no-resume@example.com' },
      { $set: {
        'verificationDocuments.nsrpForm.versions.0.status': 'approved',
        'verificationDocuments.birthCertificate.versions.0.status': 'approved',
        'verificationDocuments.validId1.versions.0.status': 'approved',
      } },
    )
    const JobPosting = mongoose.model('JobPosting')
    await Employer.create({ email: 'boss@example.com', passwordHash: 'unused', emailVerified: true, verificationStatus: 'approved', companyName: 'Acme' })
    const job = await JobPosting.create({ title: 'Clerk', company: 'Acme', status: 'approved', createdBy: 'boss@example.com' })
    const res = await jobApplicationRequest(request(app)
      .post(`/api/jobs/${job._id}/apply`)
      .set('Authorization', `Bearer ${signup.body.token}`), { email: 'apply-no-resume@example.com' })
    expect(res.status).toBe(200)
  }, 60000)
})
