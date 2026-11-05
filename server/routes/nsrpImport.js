import express from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { extractNsrp, importProof, reviewedImport } from '../services/nsrpImport.js'
import { mergeNsrpIntoProfile } from '../../shared/nsrpImport.js'

export function createNsrpImportRouter({ secret, authenticate, verifyEmailProof, UsedEmailProof, Applicant, loadApplicant, loadDocumentFile }) {
  const router = express.Router()
  const limiter = () => rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false })
  router.use('/signup/nsrp-import', limiter())
  router.use('/profile/nsrp-import', limiter())
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single('nsrpFile')
  const fail = (res, error) => res.status(error.status || 422).json({ error: error.status ? error.message : 'The NSRP could not be read. Try a clearer PDF or enter your information manually.' })
  async function applicant(req) {
    const auth = authenticate(req)
    if (!auth) throw Object.assign(new Error('Please sign in again.'), { status: 401 })
    if (auth.role !== 'Applicant') throw Object.assign(new Error('Only applicants can import an NSRP.'), { status: 403 })
    const user = await loadApplicant(auth.email)
    if (!user) throw Object.assign(new Error('Applicant not found.'), { status: 404 })
    if (user.verificationStatus === 'restricted') throw Object.assign(new Error('This account is restricted. Contact PESO.'), { status: 403 })
    return user
  }
  async function source(user) {
    const slot = user.verificationDocuments?.nsrpForm, version = slot?.versions?.at(-1)
    if (!version || version.sourceType !== 'uploaded') throw Object.assign(new Error('No uploaded NSRP is available.'), { status: 404 })
    const file = await loadDocumentFile(user._id, 'nsrpForm', version.version)
    if (!file?.data && !version.data) {
      const legacy = await Applicant.findById(user._id).select('+verificationDocuments.nsrpForm.versions.data')
      const latest = legacy?.verificationDocuments?.nsrpForm?.versions?.at(-1)
      if (latest?.version === version.version && latest.data) return Buffer.from(latest.data)
    }
    const buffer = file?.data || version.data
    if (!buffer) throw Object.assign(new Error('NSRP file unavailable. Please contact PESO.'), { status: 404 })
    return Buffer.from(buffer)
  }
  router.post('/signup/nsrp-import', async (req, res, next) => {
    try {
      const proof = verifyEmailProof(req.headers['x-email-proof'])
      if (!proof || await UsedEmailProof.exists({ jti: proof.jti })) return res.status(401).json({ error: 'Verify your email before reading your NSRP.' })
      req.nsrpOwner = `signup:${proof.email}`
      next()
    } catch (err) { fail(res, err) }
  }, (req, res) => upload(req, res, async err => {
    if (err) return res.status(422).json({ error: 'Upload one NSRP PDF up to 5 MB.' })
    try {
      const buffer = req.file?.buffer
      if (!buffer || req.file.mimetype !== 'application/pdf' || buffer.subarray(0, 5).toString() !== '%PDF-') return res.status(422).json({ error: 'Upload a genuine NSRP PDF up to 5 MB.' })
      const result = await extractNsrp(buffer)
      res.set('Cache-Control', 'no-store').json({ ...result, importToken: importProof(secret, req.nsrpOwner, buffer, result.answers) })
    } catch (error) { fail(res, error) }
  }))
  router.post('/profile/nsrp-import/preview', async (req, res) => {
    try {
      const user = await applicant(req), buffer = await source(user), result = await extractNsrp(buffer)
      res.set('Cache-Control', 'no-store').json({ ...result, importToken: importProof(secret, `profile:${user._id}`, buffer, result.answers) })
    } catch (err) { fail(res, err) }
  })
  router.post('/profile/nsrp-import/apply', async (req, res) => {
    try {
      if (req.body?.confirmed !== true) return res.status(422).json({ error: 'Review and confirm the extracted details first.' })
      const user = await applicant(req), buffer = await source(user)
      const answers = reviewedImport(secret, req.body.importToken, `profile:${user._id}`, buffer)
      const current = user.profile?.toObject?.() || user.profile || {}
      // Enrichment must not modify an established verification reference.
      const merged = mergeNsrpIntoProfile(current, answers)
      if (current.nsrp) merged.nsrp = current.nsrp
      const updated = await Applicant.findOneAndUpdate({ _id: user._id, updatedAt: user.updatedAt }, { $set: { profile: merged } }, { returnDocument: 'after', runValidators: true })
      if (!updated) return res.status(409).json({ error: 'Your profile changed. Refresh and read the NSRP again.' })
      res.set('Cache-Control', 'no-store').json({ profile: updated.profile })
    } catch (err) { fail(res, err) }
  })
  return router
}
