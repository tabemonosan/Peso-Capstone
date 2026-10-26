import { Admin, Applicant, Employer, Notification } from '../models/collections.js'
import { sendEmail } from '../mailer.js'

const ROLES = ['Applicant', 'Employer', 'Admin']
const roleModels = { Applicant, Employer, Admin }

const isObjectIdLike = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))

export function createNotifier({
  NotificationModel = Notification,
  models = roleModels,
  mail = sendEmail,
  logger = console,
} = {}) {
  async function resolveRecipient(recipient) {
    const role = recipient?.role
    if (!ROLES.includes(role)) return null

    let id = recipient.id ? String(recipient.id) : ''
    let email = recipient.email ? String(recipient.email).trim().toLowerCase() : ''
    if (id && !isObjectIdLike(id)) return null
    if (id && email && role !== 'Applicant') return { id, role, email, firstName: '' }

    const Model = models[role]
    const selectFields = role === 'Applicant' ? 'email profile.firstName' : 'email'
    const user = id
      ? await Model.findById(id).select(selectFields).lean()
      : email
        ? await Model.findOne({ email }).select(selectFields).lean()
        : null
    if (!user) return null
    id = String(user._id)
    email = String(user.email || email || '').trim().toLowerCase()
    const firstName = role === 'Applicant' ? String(user.profile?.firstName || '').trim() : ''
    return { id, role, email, firstName }
  }

  // Saves the notification and optionally emails it. Never throws, so callers' request flows are not broken.
  async function notify({ recipient, type, title, message, link = '', email = false, metadata = {} } = {}) {
    try {
      if (!title || !message) return null
      const resolved = await resolveRecipient(recipient)
      if (!resolved) {
        logger.warn?.('notify: recipient not found', recipient?.role)
        return null
      }

      const doc = await NotificationModel.create({
        recipient: { id: resolved.id, role: resolved.role },
        recipientEmail: resolved.email,
        type: type || 'general',
        title,
        message,
        link,
        metadata,
        // Mirrors for legacy consumers
        kind: type || 'general',
        linkPath: link,
      })

      if (email === true && resolved.email) {
        try {
          // Greet applicants by first name when we have it
          const greeting = resolved.firstName ? `Hi ${resolved.firstName},\n\n` : ''
          const body = `${greeting}${message}`
          await mail(resolved.email, title, link ? `${body}\n\nOpen: ${link}` : body)
        } catch (err) {
          logger.error?.('notify: email failed', err?.message || err)
        }
      }
      return doc
    } catch (err) {
      logger.error?.('notify: failed to save notification', err?.message || err)
      return null
    }
  }

  async function notifyAdmins(payload) {
    try {
      const admins = await models.Admin.find({}).select('_id email').lean()
      const results = await Promise.all(
        admins.map((admin) =>
          notify({ ...payload, recipient: { id: admin._id, role: 'Admin', email: admin.email } }),
        ),
      )
      return results.filter(Boolean)
    } catch (err) {
      logger.error?.('notify: failed to notify admins', err?.message || err)
      return []
    }
  }

  return { notify, notifyAdmins, resolveRecipient }
}

const defaultNotifier = createNotifier()
export const notify = defaultNotifier.notify
export const notifyAdmins = defaultNotifier.notifyAdmins
