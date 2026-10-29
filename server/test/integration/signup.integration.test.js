// @vitest-environment node
// Integration tests for the NSRP sign-up flow against a real MongoDB
// (mongodb-memory-server). The Express app is exercised over HTTP via supertest.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { startTestDb, stopTestDb, clearDb, validNsrpAnswers, pdfBuffer, signupRequest, FIVE_MB } from './helpers.js'

// Failure injection switches, flipped by individual tests.
const failure = vi.hoisted(() => ({ pdf: false, createUser: false }))

vi.mock('../../nsrpPdf.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    generateNsrpPdf: (...args) => (failure.pdf
      ? Promise.reject(new Error('simulated PDF generation failure'))
      : actual.generateNsrpPdf(...args)),
  }
})

vi.mock('../../models/collections.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createUserInRole: (...args) => (failure.createUser
      ? Promise.reject(new Error('simulated database write failure'))
      : actual.createUserInRole(...args)),
  }
})

const { app } = await import('../../index.js')
const { Applicant } = await import('../../models/collections.js')
const { migrateDocumentFiles } = await import('../../utils/migrateDocumentFiles.js')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const applicantToken = (email) => jwt.sign({ email, role: 'Applicant' }, JWT_SECRET)
const adminToken = () => jwt.sign({ email: 'admin@example.com', role: 'Admin' }, JWT_SECRET)

const applicantCount = () => mongoose.connection.db.collection('applicants').countDocuments()
const documentFileCount = () => mongoose.connection.db.collection('document_files').countDocuments()

async function signup(email, options = {}) {
  return signupRequest(request(app).post('/api/signup'), { email, ...options })
}

// GET a binary endpoint and return the raw Buffer body.
function streamBinary(url) {
  return request(app)
    .get(url)
    .buffer(true)
    .parse((response, callback) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => callback(null, Buffer.concat(chunks)))
    })
}

beforeAll(async () => {
  await startTestDb()
  await mongoose.model('JobPosting').syncIndexes()
}, 180000)

afterAll(async () => {
  await stopTestDb()
})

beforeEach(async () => {
  await clearDb()
})

afterEach(() => {
  failure.pdf = false
  failure.createUser = false
})

describe('POST /api/signup (real database)', () => {
  it('maps saved NSRP phone and location into the admin list and review details', async () => {
    const applicant = await Applicant.create({
      email: 'mapped-details@example.com',
      passwordHash: 'unused',
      emailVerified: true,
      profile: {
        firstName: 'Maria',
        lastName: 'Santos',
        nsrp: {
          firstName: 'Maria',
          surname: 'Santos',
          dob: '1998-04-12',
          cellphone: '09171234567',
          addressCity: 'Quezon City',
          addressProvince: 'Metro Manila',
        },
      },
    })
    const headers = { Authorization: `Bearer ${adminToken()}` }

    const list = await request(app).get('/api/admin/users?role=Applicant').set(headers)
    expect(list.status).toBe(200)
    expect(list.body.items[0].phone).toBe('09171234567')
    expect(list.body.items[0].profile.location).toContain('Quezon City')

    const details = await request(app)
      .get(`/api/applicants/${applicant._id}/verification-documents`)
      .set(headers)
    expect(details.status).toBe(200)
    expect(details.body.basic).toMatchObject({
      firstName: 'Maria',
      lastName: 'Santos',
      dob: '1998-04-12',
      phone: '09171234567',
      addressCity: 'Quezon City',
      addressProvince: 'Metro Manila',
    })
  })

  it('creates the applicant, the generated NSRP (v1, pending), and the other documents in one request', async () => {
    const res = await signup('juan.cruz@gmail.com')
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('juan.cruz@gmail.com')
    expect(res.body.token).toBeTruthy()

    const applicant = await Applicant.findOne({ email: 'juan.cruz@gmail.com' })
    expect(applicant).toBeTruthy()
    expect(applicant.profile.name).toBe('Juan Santos Cruz')
    expect(applicant.profile.nsrp?.surname).toBe('Cruz')
    expect(applicant.profile.nsrp?.signatureDataUrl).toBeUndefined()

    const docs = applicant.verificationDocuments
    const nsrp = docs.nsrpForm.versions.at(-1)
    expect(nsrp.version).toBe(1)
    expect(nsrp.status).toBe('pending')
    expect(nsrp.mimetype).toBe('application/pdf')
    expect(docs.birthCertificate.versions).toHaveLength(1)
    expect(docs.validId1.versions).toHaveLength(1)
    expect(docs.validId1.idType).toBe('SSS')
    expect(docs.validId1.versions[0].back?.originalName).toBe('id1-back.pdf')
    expect(docs.validId2.versions).toHaveLength(1)
    expect(docs.resume.versions).toHaveLength(1)

    // The generated NSRP PDF must be retrievable and start with %PDF
    const stored = await Applicant.findById(applicant._id)
      .select('+verificationDocuments.nsrpForm.versions.data').lean()
    const embedded = stored.verificationDocuments.nsrpForm.versions[0].data
    if (!embedded) {
      const file = await mongoose.connection.db.collection('document_files')
        .findOne({ applicant: applicant._id, slot: 'nsrpForm', version: 1, side: 'front' })
      expect(file, 'generated NSRP bytes (embedded or in document_files)').toBeTruthy()
      expect(file.data.buffer.subarray(0, 4).toString()).toBe('%PDF')
    } else {
      const bytes = Buffer.isBuffer(embedded) ? embedded : Buffer.from(embedded.buffer)
      expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
    }
  }, 60000)

  it('rolls back completely when PDF generation fails', async () => {
    failure.pdf = true
    const res = await signup('pdf-fail@example.com')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('NSRP_GENERATION_FAILED')
    expect(await applicantCount()).toBe(0)
    expect(await documentFileCount()).toBe(0)
  }, 60000)

  it('rejects a file whose content fails validation and stores nothing', async () => {
    const badFile = Buffer.from('this is not a real pdf at all')
    const res = await request(app).post('/api/signup')
      .field('email', 'bad-file@example.com')
      .field('password', 'Password123!')
      .field('consent', 'true')
      .field('id1Type', 'SSS')
      .field('nsrpAnswers', JSON.stringify(validNsrpAnswers()))
      .attach('birthCertificate', badFile, { filename: 'birth.pdf', contentType: 'application/pdf' })
      .attach('validId1Front', pdfBuffer(), { filename: 'id1.pdf', contentType: 'application/pdf' })
      .attach('resume', pdfBuffer(), { filename: 'resume.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors?.verificationDocuments || res.body.fieldErrors?.birthCertificate).toBeTruthy()
    expect(await applicantCount()).toBe(0)
    expect(await documentFileCount()).toBe(0)
  }, 60000)

  it('rolls back when the database write fails midway', async () => {
    failure.createUser = true
    const res = await signup('db-fail@example.com')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Server error')
    expect(res.body.errorId).toMatch(/^[0-9a-f]{12}$/) // matches the redacted server log line
    expect(await applicantCount()).toBe(0)
    expect(await documentFileCount()).toBe(0)
  }, 60000)

  it('rejects a free-text suffix with a 422 field error instead of a 500 (profile.suffix is an enum)', async () => {
    const res = await signup('bad-suffix@example.com', { answers: validNsrpAnswers({ suffix: 'asdsa' }) })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors?.suffix).toBeTruthy()
    expect(await applicantCount()).toBe(0)
    expect(await documentFileCount()).toBe(0)
  }, 60000)

  it('the per-step validator also rejects a free-text suffix', async () => {
    const res = await request(app)
      .post('/api/nsrp/validate-signup')
      .send({ step: 0, answers: validNsrpAnswers({ suffix: 'The Third' }) })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors?.suffix).toBeTruthy()
  })

  it('accepts a listed suffix and creates the account', async () => {
    const res = await signup('good-suffix@example.com', { answers: validNsrpAnswers({ suffix: 'Jr.' }) })
    expect(res.status).toBe(200)
    const applicant = await Applicant.findOne({ email: 'good-suffix@example.com' }).lean()
    expect(applicant.profile.suffix).toBe('Jr.')
  }, 60000)

  it('rejects duplicate emails including Gmail dot and plus variants', async () => {
    const first = await signup('juan.cruz+work@gmail.com')
    expect(first.status).toBe(200)

    for (const variant of ['juancruz@gmail.com', 'j.u.a.n.c.r.u.z@gmail.com', 'juan.cruz+other@gmail.com', 'JUANCRUZ@gmail.com']) {
      const res = await signup(variant)
      expect(res.status, `variant ${variant} should be rejected`).toBe(409)
    }
    expect(await applicantCount()).toBe(1)
  }, 120000)
})

describe('PUT /api/profile/nsrp (Update NSRP)', () => {
  it('creates version 2, supersedes version 1, and resets status to pending', async () => {
    const res = await signup('update-me@example.com')
    expect(res.status).toBe(200)
    const token = res.body.token

    const update = await request(app)
      .put('/api/profile/nsrp')
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: validNsrpAnswers({ occupation1: 'Welder', email: 'update-me@example.com' }) })
    expect(update.status).toBe(200)
    expect(update.body.version).toBe(2)
    expect(update.body.status).toBe('pending')

    const applicant = await Applicant.findOne({ email: 'update-me@example.com' })
    const versions = applicant.verificationDocuments.nsrpForm.versions
    expect(versions).toHaveLength(2)
    expect(versions[0].status).toBe('superseded')
    expect(versions[1].status).toBe('pending')
    expect(versions[1].version).toBe(2)
    expect(applicant.profile.nsrp.occupation1).toBe('Welder')
  }, 60000)

  it('rejects updating an approved NSRP (409)', async () => {
    const res = await signup('locked@example.com')
    expect(res.status).toBe(200)
    await Applicant.updateOne(
      { email: 'locked@example.com' },
      { $set: { 'verificationDocuments.nsrpForm.versions.0.status': 'approved' } },
    )
    const update = await request(app)
      .put('/api/profile/nsrp')
      .set('Authorization', `Bearer ${res.body.token}`)
      .send({ answers: validNsrpAnswers({ email: 'locked@example.com' }) })
    expect(update.status).toBe(409)

    const applicant = await Applicant.findOne({ email: 'locked@example.com' })
    expect(applicant.verificationDocuments.nsrpForm.versions).toHaveLength(1)
    expect(applicant.verificationDocuments.nsrpForm.versions[0].status).toBe('approved')
  }, 60000)
})

describe('legacy applicants (uploaded NSRP file, no structured data)', () => {
  // A realistic pre-change account: old sign-up collected name/location/bio and
  // an uploaded NSRP file; birth certificate and valid ID were already reviewed.
  async function createLegacyApplicant(email = 'legacy@example.com') {
    const legacyVersion = (name, status = 'approved') => ({
      originalName: name,
      mimetype: 'application/pdf',
      size: 1024,
      uploadedAt: new Date(),
      version: 1,
      status,
    })
    await Applicant.create({
      email,
      passwordHash: 'unused',
      emailVerified: true,
      emailNormalized: email,
      verificationStatus: 'under_review',
      profile: { firstName: 'Legacy', lastName: 'User', name: 'Legacy User', location: 'Legazpi', summary: 'Old account bio' },
      verificationDocuments: {
        birthCertificate: { uploads: 1, versions: [legacyVersion('birth.pdf')] },
        validId1: { uploads: 1, versions: [legacyVersion('id.pdf')], idType: 'SSS' },
      },
      nsrpVerificationFile: {
        originalName: 'nsrp-upload.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        uploadedAt: new Date(),
        data: pdfBuffer(),
      },
      resumeFile: {
        originalName: 'resume.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        uploadedAt: new Date(),
        data: pdfBuffer(),
      },
    })
    return Applicant.findOne({ email })
  }

  it('loads My Documents via the versioned document summary', async () => {
    const legacy = await createLegacyApplicant()
    const res = await request(app)
      .get(`/api/applicants/${legacy._id}/verification-documents`)
      .set('Authorization', `Bearer ${applicantToken(legacy.email)}`)
    expect(res.status).toBe(200)
    const keys = res.body.documents.map((d) => d.docKey)
    expect(keys).toContain('nsrpForm')
    expect(keys).toContain('resume')
    const nsrp = res.body.documents.find((d) => d.docKey === 'nsrpForm')
    expect(nsrp.status).toBe('pending')
    expect(res.body.nsrpData).toBeNull()
  }, 60000)

  it('can still apply for a job with the uploaded NSRP file attached', async () => {
    const legacy = await createLegacyApplicant('legacy-apply@example.com')
    const JobPosting = mongoose.model('JobPosting')
    const JobApplication = mongoose.model('JobApplication')
    const job = await JobPosting.create({ title: 'Clerk', company: 'Acme', status: 'approved', createdBy: 'boss@example.com' })

    const res = await request(app)
      .post(`/api/jobs/${job._id}/apply`)
      .set('Authorization', `Bearer ${applicantToken(legacy.email)}`)
      .send({})
    expect(res.status).toBe(200)

    const application = await JobApplication.findOne({ jobId: job._id, applicantEmail: legacy.email })
      .select('+nsrpFile.data').lean()
    expect(application).toBeTruthy()
    const attached = application.nsrpFile.data
    const attachedBytes = Buffer.isBuffer(attached) ? attached : Buffer.from(attached.buffer ?? attached)
    expect(attachedBytes.subarray(0, 4).toString()).toBe('%PDF')
    const updatedJob = await JobPosting.findById(job._id)
    expect(updatedJob.applicants.map((a) => a.email)).toContain(legacy.email)
  }, 60000)
})

describe('document ownership', () => {
  it("prevents one applicant from reading or replacing another applicant's documents", async () => {
    const a = await signup('owner@example.com')
    const b = await signup('intruder@example.com')
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    const owner = await Applicant.findOne({ email: 'owner@example.com' })
    const tokenB = b.body.token

    const list = await request(app)
      .get(`/api/applicants/${owner._id}/verification-documents`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(list.status).toBe(403)

    const resume = await request(app)
      .get(`/api/applicants/${owner._id}/resume`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(resume.status).toBe(403)

    const nsrp = await request(app)
      .get(`/api/applicants/${owner._id}/nsrp-verification`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(nsrp.status).toBe(403)

    const review = await request(app)
      .put(`/api/applicants/${owner._id}/verification-documents/birthCertificate`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'rejected', reason: 'malicious' })
    expect(review.status).toBe(403)

    // B's own NSRP update must not touch A's record
    const update = await request(app)
      .put('/api/profile/nsrp')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ answers: validNsrpAnswers({ surname: 'Intruder', email: 'intruder@example.com' }) })
    expect(update.status).toBe(200)
    const ownerAfter = await Applicant.findOne({ email: 'owner@example.com' })
    expect(ownerAfter.profile.nsrp.surname).toBe('Cruz')
    expect(ownerAfter.verificationDocuments.nsrpForm.versions).toHaveLength(1)
  }, 120000)
})

describe('document storage size', () => {
  it('accepts a sign-up with the maximum allowed files without exceeding the 16 MB document limit', async () => {
    const res = await signup('max-files@example.com', { size: FIVE_MB })
    expect(res.status).toBe(200)

    const applicant = await Applicant.findOne({ email: 'max-files@example.com' }).lean()
    expect(applicant).toBeTruthy()

    // The applicant BSON document must stay well under MongoDB's 16 MB limit.
    const raw = await mongoose.connection.db.collection('applicants').findOne({ email: 'max-files@example.com' })
    const { BSON } = await import('bson')
    const size = BSON.calculateObjectSize(raw)
    expect(size).toBeLessThan(16 * 1024 * 1024)

    // File bytes (6 uploaded files + generated NSRP PDF ≈ 31 MB) must not be
    // embedded in the applicant document; they live in document_files.
    const withData = await mongoose.connection.db.collection('applicants').findOne({ email: 'max-files@example.com' })
    const slots = withData.verificationDocuments || {}
    for (const slot of Object.values(slots)) {
      for (const version of slot?.versions || []) {
        expect(version.data, 'embedded version data should be externalized').toBeUndefined()
        expect(version.back?.data).toBeUndefined()
      }
    }
    const files = await mongoose.connection.db.collection('document_files')
      .find({ applicant: withData._id }).toArray()
    expect(files.length).toBeGreaterThanOrEqual(7) // 6 uploads (incl. ID backs) + generated NSRP
    expect(files.reduce((total, f) => total + (f.size || 0), 0)).toBeGreaterThanOrEqual(6 * FIVE_MB)
  }, 120000)

  it('keeps the generated NSRP streamable after externalization', async () => {
    const res = await signup('stream@example.com')
    expect(res.status).toBe(200)
    const applicant = await Applicant.findOne({ email: 'stream@example.com' }).lean()
    const list = await request(app)
      .get(`/api/applicants/${applicant._id}/verification-documents`)
      .set('Authorization', `Bearer ${res.body.token}`)
    expect(list.status).toBe(200)
    const nsrpDoc = list.body.documents.find((d) => d.docKey === 'nsrpForm')
    expect(nsrpDoc.latest?.url).toBeTruthy()
    const view = await streamBinary(nsrpDoc.latest.url)
    expect(view.status).toBe(200)
    expect(view.headers['content-type']).toContain('application/pdf')
    expect(view.body.subarray(0, 4).toString()).toBe('%PDF')
  }, 60000)

  it('migrates pre-existing embedded document bytes into document_files and keeps them streamable', async () => {
    // Simulate a record written before the externalization change: bytes embedded.
    const email = 'old-embedded@example.com'
    const legacyVersion = {
      originalName: 'birth.pdf',
      storedName: 'abc123',
      mimetype: 'application/pdf',
      size: 2048,
      uploadedAt: new Date(),
      data: pdfBuffer(2048),
      version: 1,
      status: 'pending',
      back: {
        originalName: 'birth-back.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        uploadedAt: new Date(),
        data: pdfBuffer(1024),
      },
    }
    const { insertedId } = await mongoose.connection.db.collection('applicants').insertOne({
      email,
      emailNormalized: email,
      passwordHash: 'unused',
      emailVerified: true,
      verificationDocuments: {
        birthCertificate: { uploads: 1, versions: [legacyVersion] },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const token = applicantToken(email)
    const list = await request(app)
      .get(`/api/applicants/${insertedId}/verification-documents`)
      .set('Authorization', `Bearer ${token}`)
    const url = list.body.documents.find((d) => d.docKey === 'birthCertificate').latest.url
    expect(list.body.documents.find((d) => d.docKey === 'birthCertificate').latest.back).toBeUndefined()

    // Backward compatibility: embedded bytes stream before migration.
    const before = await streamBinary(url)
    expect(before.status).toBe(200)
    expect(before.body.length).toBe(2048)

    const { movedFiles, migratedApplicants } = await migrateDocumentFiles()
    expect(movedFiles).toBe(2) // front + back
    expect(migratedApplicants).toBe(1)

    const raw = await mongoose.connection.db.collection('applicants').findOne({ _id: insertedId })
    expect(raw.verificationDocuments.birthCertificate.versions[0].data).toBeUndefined()
    expect(raw.verificationDocuments.birthCertificate.versions[0].back.data).toBeUndefined()

    const files = await mongoose.connection.db.collection('document_files').find({ applicant: insertedId }).toArray()
    expect(files).toHaveLength(2)
    expect(files.every((f) => f.data?.buffer || f.data instanceof Uint8Array)).toBe(true)

    // Still streamable after migration.
    const after = await streamBinary(url)
    expect(after.status).toBe(200)
    expect(after.body.length).toBe(2048)

    // Idempotent: a second run moves nothing.
    const second = await migrateDocumentFiles()
    expect(second.movedFiles).toBe(0)
  }, 60000)
})
