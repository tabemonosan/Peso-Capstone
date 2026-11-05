// @vitest-environment node
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { startTestDb, stopTestDb, clearDb, validNsrpAnswers, signupUploadRequest, emailProofFor } from './helpers.js'
import { generateNsrpPdf } from '../../nsrpPdf.js'
import { importProof } from '../../services/nsrpImport.js'
vi.mock('../../mailer.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }), sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }), initMailer: vi.fn() }))
vi.mock('node:dns/promises', () => ({ Resolver: class { async resolveMx() { return [{ exchange: 'mail.example.test', priority: 10 }] } } }))
const { app } = await import('../../index.js')
const { Applicant, UsedEmailProof } = await import('../../models/collections.js')
const { storeDocumentFile } = await import('../../utils/documentFiles.js')
const secret = process.env.JWT_SECRET || 'dev-secret'
let file, answers
const auth = email => `Bearer ${jwt.sign({ email, role: 'Applicant' }, secret)}`
beforeAll(async () => { await startTestDb(); answers = validNsrpAnswers({ skills: ['Gardening', 'Embroidery'], education: [{ level: 'Tertiary', school: 'Example College', course: 'BSIT', year: '2012' }] }); file = await generateNsrpPdf(answers) }, 180000)
afterAll(stopTestDb)
beforeEach(async () => {
  await clearDb()
  await mongoose.connection.db.collection('nsrp_auto_settings').insertOne({ _id: 'settings', applicant: false, employer: false, imageChecks: false, history: [] })
})
it('reads an email-verified upload then stores reviewed qualifications at signup', async () => {
  const email = 'nsrp-import@example.com', proof = emailProofFor(email)
  const preview = await request(app).post('/api/signup/nsrp-import').set('X-Email-Proof', proof).attach('nsrpFile', file, { filename: 'nsrp.pdf', contentType: 'application/pdf' })
  expect(preview.status).toBe(200)
  expect(preview.body.answers.skills).toEqual(['Embroidery', 'Gardening'])
  expect(preview.headers['cache-control']).toBe('no-store')
  const response = await signupUploadRequest(request(app).post('/api/signup').field('nsrpImportToken', preview.body.importToken), { email, emailProof: proof, nsrpFile: file })
  expect(response.status).toBe(200)
  const user = await Applicant.findOne({ email }).lean()
  expect(user.profile.skills).toEqual(['Embroidery', 'Gardening'])
  expect(user.profile.education[0]).toMatchObject({ school: 'EXAMPLE COLLEGE', course: 'BSIT' })
  expect(user.verificationDocuments.nsrpForm.versions[0].sourceType).toBe('uploaded')
  expect(user.profile.nsrp.certified).toBeUndefined()
  expect(user.profile.summary).toBe('')
}, 60000)
it('rejects missing or consumed email proof before reading', async () => {
  expect((await request(app).post('/api/signup/nsrp-import')).status).toBe(401)
  const proof = emailProofFor('used@example.com'), decoded = jwt.decode(proof)
  await UsedEmailProof.create({ jti: decoded.jti, expiresAt: new Date(decoded.exp * 1000) })
  expect((await request(app).post('/api/signup/nsrp-import').set('X-Email-Proof', proof)).status).toBe(401)
})
it('rejects a reviewed token for a different signup PDF', async () => {
  const email = 'changed-pdf@example.com'
  const response = await signupUploadRequest(request(app).post('/api/signup').field('nsrpImportToken', importProof(secret, `signup:${email}`, Buffer.from('other file'), answers)), { email, nsrpFile: file })
  expect(response.status).toBe(409)
  expect(await Applicant.countDocuments()).toBe(0)
})
it('enriches the owner profile while preserving edits, NSRP reference and document decisions', async () => {
  const user = await Applicant.create({ email: 'owner@example.com', passwordHash: 'test', verificationStatus: 'waitlisted', profile: { firstName: 'Edited', lastName: 'Cruz', summary: 'Personal bio', traits: 'Patient', skills: ['Gardening'], nsrp: { firstName: 'Existing reference' } }, verificationDocuments: { nsrpForm: { uploads: 1, versions: [{ version: 1, originalName: 'nsrp.pdf', sourceType: 'uploaded', status: 'approved' }] } } })
  await storeDocumentFile(user._id, 'nsrpForm', 1, 'front', { mimetype: 'application/pdf', size: file.length, buffer: file })
  const preview = await request(app).post('/api/profile/nsrp-import/preview').set('Authorization', auth(user.email))
  expect(preview.status).toBe(200)
  const endpoint = () => request(app).post('/api/profile/nsrp-import/apply').set('Authorization', auth(user.email))
  expect((await endpoint().send({ importToken: preview.body.importToken })).status).toBe(422)
  const result = await endpoint().send({ importToken: preview.body.importToken, confirmed: true })
  expect(result.status).toBe(200)
  expect(result.body.profile).toMatchObject({ firstName: 'Edited', summary: 'Personal bio', traits: 'Patient', skills: ['Gardening', 'Embroidery'], nsrp: { firstName: 'Existing reference' } })
  const saved = await Applicant.findById(user._id).lean()
  expect(saved.verificationDocuments.nsrpForm.versions[0].status).toBe('approved')
  await storeDocumentFile(user._id, 'nsrpForm', 1, 'front', { mimetype: 'application/pdf', size: file.length + 1, buffer: Buffer.concat([file, Buffer.from('\n')]) })
  expect((await endpoint().send({ importToken: preview.body.importToken, confirmed: true })).status).toBe(409)
  expect((await request(app).post('/api/profile/nsrp-import/preview')).status).toBe(401)
  expect((await request(app).post('/api/profile/nsrp-import/preview').set('Authorization', `Bearer ${jwt.sign({ role: 'Employer' }, secret)}`)).status).toBe(403)
}, 60000)
