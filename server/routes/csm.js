import express from 'express'
import crypto from 'crypto'
import { CSM_VERSION, validateCsmResponse } from '../../shared/csmQuestionnaire.js'
import { parsePagination, paginateQuery } from '../utils/paginate.js'

export function createCsmRouter({ CsmResponse, Applicant, Employer, authenticate, notifyAdmins }) {
  const router = express.Router()
  router.post('/responses', async (req, res) => {
    try {
      const user = authenticate(req)
      if (!user) return res.status(401).json({ error: 'Sign in to submit feedback.' })
      if (!['Applicant', 'Employer'].includes(user.role)) return res.status(403).json({ error: 'Only applicants and employers can submit this questionnaire.' })
      const Model = user.role === 'Applicant' ? Applicant : Employer
      const account = await Model.findOne({ email: user.email }).select('_id deletedAt verificationStatus').lean()
      if (!account || account.deletedAt) return res.status(401).json({ error: 'This account is unavailable.' })
      if (user.role === 'Applicant' && account.verificationStatus !== 'approved') return res.status(403).json({ error: 'PESO must approve your account before you submit feedback.' })
      const { values, fieldErrors } = validateCsmResponse(req.body)
      if (Object.keys(fieldErrors).length) return res.status(422).json({ error: values.language === 'tl' ? 'Suriin ang mga sagot na may marka.' : 'Check the highlighted answers.', fieldErrors })
      const submissionKey = String(req.get('Idempotency-Key') || '').toLowerCase()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(submissionKey)) return res.status(400).json({ error: 'Refresh the questionnaire and try again.' })
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex')
      const receipt = (record) => ({ id: String(record._id), reference: `CSM-${String(record._id).slice(-8).toUpperCase()}`, language: record.language, submittedAt: record.createdAt })
      const existingReceipt = async () => {
        const prior = await CsmResponse.findOne({ submissionKey, submitterId: account._id, submitterRole: user.role }).select('+payloadHash')
        return prior?.payloadHash === payloadHash ? receipt(prior) : null
      }
      let record
      try {
        record = await CsmResponse.create({ submitterId: account._id, submitterRole: user.role, language: values.language, questionnaireVersion: CSM_VERSION, answers: values, submissionKey, payloadHash })
      } catch (err) {
        if (err.code !== 11000) throw err
        const prior = await existingReceipt()
        return prior ? res.json(prior) : res.status(409).json({ error: 'This questionnaire was already submitted. Open a new questionnaire for another response.' })
      }
      await notifyAdmins({ type: 'csm_response_submitted', title: 'Client feedback received', message: `${user.role === 'Applicant' ? 'An applicant' : 'An employer'} submitted a ${values.language === 'tl' ? 'Tagalog' : 'English'} CSM questionnaire.`, link: '/peso-referrals', metadata: { responseId: String(record._id), language: values.language } })
      res.status(201).json(receipt(record))
    } catch { res.status(500).json({ error: 'Unable to submit feedback. Your answers are still on this page; please try again.' }) }
  })
  router.get('/responses', async (req, res) => {
    try {
      const user = authenticate(req)
      if (!user) return res.status(401).json({ error: 'Sign in to continue.' })
      if (user.role !== 'Admin') return res.status(403).json({ error: 'Administrators only.' })
      const filter = {}
      if (req.query.role && req.query.role !== 'all') {
        if (!['Applicant', 'Employer'].includes(req.query.role)) return res.status(400).json({ error: 'Invalid respondent filter.' })
        filter.submitterRole = req.query.role
      }
      if (req.query.language && req.query.language !== 'all') {
        if (!['en', 'tl'].includes(req.query.language)) return res.status(400).json({ error: 'Invalid language filter.' })
        filter.language = req.query.language
      }
      res.json(await paginateQuery(CsmResponse, filter, { ...parsePagination(req.query), sort: { createdAt: -1 } }))
    } catch { res.status(500).json({ error: 'Unable to load client feedback.' }) }
  })
  return router
}
