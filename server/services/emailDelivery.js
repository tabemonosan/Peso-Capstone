import crypto from 'crypto'

export function createEmailDeliveryService({ Model, deliver, secret, now = () => new Date() }) {
  const key = crypto.createHash('sha256').update(`peso-email-delivery:${secret}`).digest()
  function seal(data) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
  }
  function open(value) {
    const bytes = Buffer.from(value, 'base64'), cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    cipher.setAuthTag(bytes.subarray(12, 28))
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString())
  }
  async function attempt(id, manual = false) {
    const at = now(), lease = new Date(+at + 120000)
    const filter = { _id: id, expiresAt: { $gt: at }, attempts: { $lt: 5 }, $or: [{ status: 'queued' }, { status: 'failed', retryable: true, ...(!manual ? { nextAttemptAt: { $lte: at } } : {}) }, { status: 'sending', leaseUntil: { $lte: at }, retryable: true }] }
    const entry = await Model.findOneAndUpdate(filter, { $set: { status: 'sending', leaseUntil: lease }, $inc: { attempts: 1 } }, { returnDocument: 'after' }).select('+payload').lean()
    if (!entry) return { delivered: false, skipped: true }
    let result
    try {
      const body = open(entry.payload)
      result = await deliver(body.to, body.subject, body.text)
    } catch { result = { delivered: false } }
    const delivered = result?.delivered === true
    await Model.updateOne({ _id: id, status: 'sending', leaseUntil: lease }, {
      $set: delivered ? { status: 'sent', deliveredAt: now(), lastError: '' } : { status: 'failed', lastError: 'The email provider did not accept the message.', ...(entry.retryable && entry.attempts < 5 ? { nextAttemptAt: new Date(+now() + Math.min(3600000, 60000 * 2 ** (entry.attempts - 1))) } : {}) },
      $unset: { leaseUntil: 1, ...(delivered || !entry.retryable || entry.attempts >= 5 ? { payload: 1, nextAttemptAt: 1 } : {}) },
    })
    return { delivered, deliveryId: String(id), ...(delivered ? {} : { error: 'Email delivery failed.' }) }
  }
  async function send(to, subject, text, options = {}) {
    const purpose = options.purpose || (/verification code|password recovery|verify your peso.*email/i.test(subject) ? 'verification' : 'notification')
    const entry = await Model.create({ recipientEmail: to, subject, purpose, retryable: purpose !== 'verification', payload: seal({ to, subject, text }), nextAttemptAt: now(), expiresAt: options.expiresAt || new Date(+now() + (purpose === 'verification' ? 600000 : 86400000)) })
    return attempt(entry._id)
  }
  async function processDue() {
    const at = now()
    await Model.updateMany({ status: { $in: ['queued', 'failed', 'sending'] }, expiresAt: { $lte: at } }, { $set: { status: 'expired' }, $unset: { payload: 1, nextAttemptAt: 1, leaseUntil: 1 } })
    const due = await Model.find({ expiresAt: { $gt: at }, attempts: { $lt: 5 }, $or: [{ status: 'queued' }, { status: 'failed', retryable: true, nextAttemptAt: { $lte: at } }, { status: 'sending', retryable: true, leaseUntil: { $lte: at } }] }).sort({ createdAt: 1 }).limit(20).select('_id').lean()
    for (const entry of due) await attempt(entry._id)
  }
  return { send, attempt, processDue }
}
