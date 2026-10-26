// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createNotifier } from '../../server/services/notify.js'

const ADMIN_ID = 'a'.repeat(24)
const USER_ID = 'b'.repeat(24)

function makeNotifier({ mail = vi.fn().mockResolvedValue({ delivered: true }), admins = [] } = {}) {
  const created = []
  const NotificationModel = { create: vi.fn(async (doc) => { created.push(doc); return { _id: 'n1', ...doc } }) }
  const lean = (value) => ({ select: () => ({ lean: async () => value }), lean: async () => value })
  const models = {
    Applicant: { findById: vi.fn(() => lean({ _id: USER_ID, email: 'user@example.com' })), findOne: vi.fn(() => lean(null)) },
    Employer: { findById: vi.fn(() => lean(null)), findOne: vi.fn(() => lean(null)) },
    Admin: { find: vi.fn(() => lean(admins)), findById: vi.fn(() => lean(null)), findOne: vi.fn(() => lean(null)) },
  }
  const logger = { warn: vi.fn(), error: vi.fn() }
  return { ...createNotifier({ NotificationModel, models, mail, logger }), created, mail, logger, NotificationModel }
}

const base = {
  recipient: { id: USER_ID, role: 'Applicant', email: 'User@Example.com' },
  type: 'application_submitted',
  title: 'Application submitted',
  message: 'Done',
  link: '/jobs',
}

describe('notify()', () => {
  it('saves a notification with recipient id and role', async () => {
    const { notify, created } = makeNotifier()
    await notify(base)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      recipient: { id: USER_ID, role: 'Applicant' },
      recipientEmail: 'user@example.com',
      type: 'application_submitted',
      link: '/jobs',
    })
  })

  it('sends email only when email is true', async () => {
    const { notify, mail } = makeNotifier()
    await notify({ ...base, email: false })
    await notify(base)
    expect(mail).not.toHaveBeenCalled()
    await notify({ ...base, email: true })
    expect(mail).toHaveBeenCalledTimes(1)
    expect(mail.mock.calls[0][0]).toBe('user@example.com')
    expect(mail.mock.calls[0][1]).toBe('Application submitted')
  })

  it('still saves and does not throw when the mailer fails', async () => {
    const { notify, created, logger } = makeNotifier({ mail: vi.fn().mockRejectedValue(new Error('smtp down')) })
    await expect(notify({ ...base, email: true })).resolves.toBeTruthy()
    expect(created).toHaveLength(1)
    expect(logger.error).toHaveBeenCalled()
  })

  it('does not throw when saving fails', async () => {
    const { notify, NotificationModel } = makeNotifier()
    NotificationModel.create.mockRejectedValueOnce(new Error('db down'))
    await expect(notify(base)).resolves.toBeNull()
  })

  it('resolves the recipient email from the role collection when only id is given', async () => {
    const { notify, created } = makeNotifier()
    await notify({ ...base, recipient: { id: USER_ID, role: 'Applicant' } })
    expect(created[0].recipientEmail).toBe('user@example.com')
  })

  it('rejects unknown roles, unknown users and missing content without saving', async () => {
    const { notify, created } = makeNotifier()
    expect(await notify({ ...base, recipient: { id: USER_ID, role: 'Hacker' } })).toBeNull()
    expect(await notify({ ...base, recipient: { id: 'not-an-id', role: 'Applicant' } })).toBeNull()
    expect(await notify({ ...base, recipient: { role: 'Employer', email: 'none@example.com' } })).toBeNull()
    expect(await notify({ ...base, title: '' })).toBeNull()
    expect(created).toHaveLength(0)
  })

  it('notifyAdmins fans out one notification per admin', async () => {
    const { notifyAdmins, created } = makeNotifier({
      admins: [{ _id: ADMIN_ID, email: 'one@peso.gov' }, { _id: 'c'.repeat(24), email: 'two@peso.gov' }],
    })
    const result = await notifyAdmins({ type: 'x', title: 'T', message: 'M' })
    expect(result).toHaveLength(2)
    expect(created.map((doc) => doc.recipient.role)).toEqual(['Admin', 'Admin'])
  })
})
