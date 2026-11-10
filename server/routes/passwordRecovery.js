import { Router } from 'express'
import mongoose from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import rateLimit, { MemoryStore } from 'express-rate-limit'
import { normalizeEmail } from '../utils/emailVerification.js'
import { generateEmailCode, hashEmailCode, emailCodeMatches, EMAIL_CODE_TTL_MS, EMAIL_CODE_MAX_ATTEMPTS, EMAIL_CODE_RESEND_COOLDOWN_MS, EMAIL_CODE_HOURLY_LIMIT } from '../utils/emailCode.js'
import { passwordErrorMessage } from '../utils/passwordPolicy.js'

const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  accountId: mongoose.Schema.Types.ObjectId,
  accountEmail: String,
  role: String,
  sessionVersion: Number,
  nonce: String,
  codeHash: String,
  attempts: { type: Number, default: 0 },
  sentAt: Date,
  expiresAt: Date,
  verifiedAt: Date,
  resetTokenHash: String,
  resetExpiresAt: Date,
  usedAt: Date,
  purgeAt: { type: Date, expires: 0 },
})
export const PasswordRecovery = mongoose.models.PasswordRecovery || mongoose.model('PasswordRecovery', schema)
export const recoveryRequestStore = new MemoryStore()
export const recoveryVerifyStore = new MemoryStore()
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const emailFrom = value => typeof value === 'string' && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? normalizeEmail(value) : null
const invalid = res => res.status(400).json({ error: 'The code or recovery request is invalid or expired. Request a new code.' })

export function createPasswordRecoveryRouter({ findUserByEmail, Admin, Applicant, Employer, EmailCodeSend, sendEmail }) {
  const router = Router()
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  const models = { Admin, Applicant, Employer }
  router.post('/request', rateLimit({ windowMs: 3600000, limit: 10, store: recoveryRequestStore, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many recovery requests. Please try again later.' } }), async (req, res) => {
    const email = emailFrom(req.body?.email)
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.' })
    const now = new Date(), key = `password-recovery:${email}`
    if (await EmailCodeSend.countDocuments({ key, createdAt: { $gt: new Date(+now - 3600000) } }) >= EMAIL_CODE_HOURLY_LIMIT) return res.status(429).set('Retry-After', '3600').json({ error: 'Too many codes requested. Please try again later.', retryAfter: 3600 })
    const found = await findUserByEmail(req.body.email.trim())
    const eligible = found && !found.user.deletedAt && !found.user.disabled
    const code = generateEmailCode(), nonce = crypto.randomUUID()
    try {
      await PasswordRecovery.findOneAndUpdate({ email, $or: [{ sentAt: { $lte: new Date(+now - EMAIL_CODE_RESEND_COOLDOWN_MS) } }, { sentAt: { $exists: false } }] }, {
        $set: { email, nonce, codeHash: hashEmailCode(`recovery:${email}`, code), attempts: 0, sentAt: now, expiresAt: new Date(+now + EMAIL_CODE_TTL_MS), purgeAt: new Date(+now + 3600000), ...(eligible ? { accountId: found.user._id, accountEmail: found.user.email, role: found.type, sessionVersion: found.user.sessionVersion || 0 } : {}) },
        $unset: { verifiedAt: 1, resetTokenHash: 1, resetExpiresAt: 1, usedAt: 1, ...(!eligible ? { accountId: 1, accountEmail: 1, role: 1, sessionVersion: 1 } : {}) },
      }, { upsert: true })
    } catch (error) {
      if (error.code !== 11000) throw error
      return res.status(429).set('Retry-After', '60').json({ error: 'Please wait before requesting another code.', retryAfter: 60 })
    }
    await EmailCodeSend.create({ key })
    if (eligible) {
      try {
        void Promise.resolve(sendEmail(found.user.email, 'Your PESO password recovery code', `Your PESO password recovery code is:\n\n${code}\n\nIt expires in 10 minutes. Enter it on the Forgot password page. If you did not request this, ignore this email. Your password has not changed.`)).catch(() => {})
      } catch { /* Use the same response regardless of account existence or delivery result. */ }
    }
    res.json({ ok: true, message: 'If this email belongs to an available account, a verification code has been sent.', retryAfter: 60 })
  })
  router.use(rateLimit({ windowMs: 900000, limit: 60, store: recoveryVerifyStore, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } }))
  router.post('/verify', async (req, res) => {
    const email = emailFrom(req.body?.email), code = req.body?.code
    if (!email || typeof code !== 'string') return invalid(res)
    const now = new Date()
    const record = await PasswordRecovery.findOneAndUpdate({ email, expiresAt: { $gt: now }, attempts: { $lt: EMAIL_CODE_MAX_ATTEMPTS }, verifiedAt: null, usedAt: null }, { $inc: { attempts: 1 } }, { returnDocument: 'after' }).lean()
    if (!record || !/^\d{6}$/.test(code) || !record.accountId || !emailCodeMatches(`recovery:${email}`, code, record.codeHash)) return invalid(res)
    const resetToken = crypto.randomBytes(32).toString('base64url')
    const verified = await PasswordRecovery.findOneAndUpdate({ _id: record._id, nonce: record.nonce, expiresAt: { $gt: new Date() }, verifiedAt: null, usedAt: null }, { $set: { verifiedAt: now, resetTokenHash: digest(resetToken), resetExpiresAt: new Date(+now + EMAIL_CODE_TTL_MS) } })
    if (!verified) return invalid(res)
    res.json({ ok: true, resetToken })
  })
  router.post('/reset', async (req, res) => {
    const email = emailFrom(req.body?.email), resetToken = req.body?.resetToken, newPassword = req.body?.newPassword
    if (!email || typeof resetToken !== 'string' || resetToken.length > 100) return invalid(res)
    const error = passwordErrorMessage(newPassword)
    if (error) return res.status(400).json({ error })
    const filter = { email, resetTokenHash: digest(resetToken), resetExpiresAt: { $gt: new Date() }, usedAt: null }
    const record = await PasswordRecovery.findOne(filter).lean()
    if (!record || !models[record.role]) return invalid(res)
    const passwordHash = await bcrypt.hash(newPassword, 12)
    const claimed = await PasswordRecovery.findOneAndUpdate({ ...filter, nonce: record.nonce, resetExpiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }).lean()
    if (!claimed || claimed.nonce !== record.nonce) return invalid(res)
    const version = record.sessionVersion || 0
    const account = await models[record.role].findOneAndUpdate({ _id: record.accountId, email: record.accountEmail, ...(record.role === 'Admin' ? { disabled: { $ne: true } } : {}), ...(record.role === 'Applicant' ? { deletedAt: { $exists: false } } : {}), $or: [{ sessionVersion: version }, ...(version === 0 ? [{ sessionVersion: { $exists: false } }] : [])] }, {
      $set: { passwordHash, ...(record.role === 'Admin' ? { mustChangePassword: false } : {}) }, $inc: { sessionVersion: 1 },
    }).lean()
    if (!account) return invalid(res)
    res.json({ ok: true, message: 'Password reset. Sign in with your new password.' })
  })
  return router
}
