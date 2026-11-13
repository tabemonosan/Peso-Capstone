// @vitest-environment node
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
import { Notification } from '../../models/collections.js'
import { createNotificationsRouter } from '../../routes/notifications.js'
import { ADMIN_NOTIFICATION_FEATURES } from '../../../shared/adminNotificationFeatures.js'

const users = Object.fromEntries(['super_admin', 'admin', 'staff', 'Applicant'].map(level => [level, { id: String(new mongoose.Types.ObjectId()), role: level === 'Applicant' ? 'Applicant' : 'Admin', adminLevel: level, email: `${level}@example.test` }]))
const app = express()
app.use(express.json())
app.use('/notifications', createNotificationsRouter({ NotificationModel: Notification, authenticate: req => users[req.headers.authorization], resolveUser: async user => user }))
const api = (level, path, method = 'get') => request(app)[method](`/notifications${path}`).set('Authorization', level)
const add = (level, values = {}) => Notification.create({ recipient: { id: users[level].id, role: users[level].role }, recipientEmail: users[level].email, title: 'New item', message: 'Sample notification', link: '/account-deletions', createdAt: new Date(Date.now() - 1000), ...values })
beforeAll(startTestDb, 180000)
beforeEach(clearDb)
afterAll(stopTestDb)
it.each(['super_admin', 'admin'])('counts deletion notifications independently of bell pagination for %s', async level => {
 await Promise.all(Array.from({ length: 55 }, () => add(level)))
 await add('staff')
 await add(level, { read: true })
 const counts = (await api(level, '/features').expect(200)).body
 expect(counts.counts['account-deletions']).toBe(55)
 expect((await api(level, '?limit=1').expect(200)).body.items).toHaveLength(1)
 await api(level, '/features/account-deletions/read', 'patch').send({ before: counts.asOf }).expect(200)
 expect((await api(level, '/features').expect(200)).body.counts).toEqual({})
 expect(await Notification.countDocuments({ 'recipient.id': users.staff.id, readAt: null })).toBe(1)
})
it('supports every feature and legacy links without counting read or foreign notifications', async () => {
 for (const feature of ADMIN_NOTIFICATION_FEATURES) await add('super_admin', { link: `/${feature}?sample=1` })
 await Notification.collection.insertOne({ recipientEmail: users.super_admin.email, title: 'Legacy', message: 'Sample', linkPath: '/jobs', kind: 'legacy', createdAt: new Date(Date.now() - 1000) })
 await add('super_admin', { link: '', linkPath: '/jobs' })
 await add('super_admin', { link: '/jobs', readAt: new Date() })
 const counts = (await api('super_admin', '/features').expect(200)).body.counts
 for (const feature of ADMIN_NOTIFICATION_FEATURES) expect(counts[feature]).toBe(feature === 'jobs' ? 3 : 1)
})
it('keeps arrivals after the displayed snapshot unread and clears only the selected feature', async () => {
 await add('super_admin')
 await add('super_admin', { link: '/jobs' })
 const snapshot = (await api('super_admin', '/features').expect(200)).body
 await add('super_admin', { createdAt: new Date(+new Date(snapshot.asOf) + 1) })
 await api('super_admin', '/features/account-deletions/read', 'patch').send({ before: snapshot.asOf }).expect(200)
 expect(await Notification.countDocuments({ 'recipient.id': users.super_admin.id, readAt: null })).toBe(2)
 expect(await Notification.countDocuments({ link: '/jobs', readAt: null })).toBe(1)
})
it.each(['admin', 'staff'])('respects visible feature permissions for %s', async level => {
 await add(level, { link: '/internal-accounts' })
 await add(level, { link: '/jobs' })
 await add(level)
 const counts = (await api(level, '/features').expect(200)).body.counts
 expect(counts.jobs).toBe(1)
 expect(counts['internal-accounts']).toBeUndefined()
 expect(counts['account-deletions']).toBe(level === 'admin' ? 1 : undefined)
 await api(level, '/features/internal-accounts/read', 'patch').send({ before: new Date().toISOString() }).expect(403)
})
it('honors notification type destinations and rejects external accounts and invalid snapshots', async () => {
 await add('super_admin', { link: '/jobs', type: 'new_application' })
 const counts = (await api('super_admin', '/features').expect(200)).body.counts
 expect(counts).toEqual({ 'peso-referrals': 1 })
 await api('Applicant', '/features').expect(403)
 await api('super_admin', '/features/jobs/read', 'patch').send({ before: 'invalid' }).expect(400)
 await api('super_admin', '/features/jobs/read', 'patch').send({ before: new Date(Date.now() + 60000).toISOString() }).expect(400)
})

it('mark-all and individual reads also update feature counters', async () => {
 const job = await add('super_admin', { link: '/jobs' })
 await add('super_admin')
 await api('super_admin', `/${job._id}/read`, 'patch').expect(200)
 expect((await api('super_admin', '/features').expect(200)).body.counts).toEqual({ 'account-deletions': 1 })
 await api('super_admin', '/read-all', 'patch').expect(200)
 expect((await api('super_admin', '/features').expect(200)).body.counts).toEqual({})
})
