// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import { createNotificationsRouter } from '../../server/routes/notifications.js'

const ids = { alice: '1'.repeat(24), bob: '2'.repeat(24), admin: '3'.repeat(24) }
const n = (suffix) => suffix.repeat(24)

// Minimal in-memory model supporting only the query operators the router uses
function get(doc, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), doc)
}
function matches(doc, query) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((q) => matches(doc, q))
    if (key === '$and') return cond.every((q) => matches(doc, q))
    const value = get(doc, key)
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$exists' in cond) return (value !== undefined) === cond.$exists
      if ('$ne' in cond) return value !== cond.$ne
    }
    if (cond === null) return value == null
    return String(value) === String(cond)
  })
}
function makeModel(rows) {
  const chain = (list) => ({
    sort: () => chain(list),
    skip: (count) => chain(list.slice(count)),
    limit: (count) => chain(list.slice(0, count)),
    lean: async () => list,
  })
  return {
    rows,
    find: (query) => chain(rows.filter((row) => matches(row, query))),
    countDocuments: async (query) => rows.filter((row) => matches(row, query)).length,
    updateMany: async (query, update) => {
      const hit = rows.filter((row) => matches(row, query))
      hit.forEach((row) => Object.assign(row, update.$set))
      return { modifiedCount: hit.length }
    },
    findOneAndUpdate: (query, update) => ({
      lean: async () => {
        const row = rows.find((r) => matches(r, query))
        if (row) Object.assign(row, update.$set)
        return row || null
      },
    }),
  }
}

const users = {
  'alice-token': { id: ids.alice, role: 'Applicant', email: 'alice@example.com' },
  'bob-token': { id: ids.bob, role: 'Employer', email: 'bob@example.com' },
  'admin-token': { id: ids.admin, role: 'Admin', email: 'admin@peso.gov' },
}

let server
let base
let model

beforeAll(async () => {
  model = makeModel([])
  const app = express()
  app.use('/api/notifications', createNotificationsRouter({
    NotificationModel: { find: (q) => model.find(q), countDocuments: (q) => model.countDocuments(q), updateMany: (q, u) => model.updateMany(q, u), findOneAndUpdate: (q, u) => model.findOneAndUpdate(q, u) },
    authenticate: (req) => {
      const token = req.headers.authorization?.replace('Bearer ', '')
      return users[token] ? { email: users[token].email, role: users[token].role } : null
    },
    resolveUser: async (decoded) => Object.values(users).find((u) => u.email === decoded.email) || null,
  }))
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}/api/notifications`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => {
  model.rows.length = 0
  model.rows.push(
    { _id: n('a'), recipient: { id: ids.alice, role: 'Applicant' }, recipientEmail: 'alice@example.com', title: 'A1', readAt: null, read: false, createdAt: new Date(3) },
    { _id: n('b'), recipient: { id: ids.alice, role: 'Applicant' }, recipientEmail: 'alice@example.com', title: 'A2', readAt: null, read: false, createdAt: new Date(2) },
    { _id: n('c'), recipient: { id: ids.bob, role: 'Employer' }, recipientEmail: 'bob@example.com', title: 'B1', readAt: null, read: false, createdAt: new Date(1) },
    { _id: n('d'), recipientEmail: 'alice@example.com', title: 'Legacy', read: false, createdAt: new Date(0) },
  )
})

const call = (path, token, method = 'GET') =>
  fetch(`${base}${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })

describe('notifications ownership', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await call('', null)).status).toBe(401)
    expect((await call('/read-all', null, 'PATCH')).status).toBe(401)
    expect((await call(`/${n('a')}/read`, 'bad-token', 'PATCH')).status).toBe(401)
  })

  it('lists only the caller notifications with unread count and pagination', async () => {
    const res = await call('?limit=2', 'alice-token')
    const body = await res.json()
    expect(body.items.map((i) => i.title)).toEqual(['A1', 'A2'])
    expect(body.total).toBe(3) // includes the legacy email-matched document
    expect(body.unreadCount).toBe(3)
    expect(body.limit).toBe(2)

    const bob = await (await call('', 'bob-token')).json()
    expect(bob.items.map((i) => i.title)).toEqual(['B1'])
  })

  it('does not let a user mark another user\'s notification as read', async () => {
    const res = await call(`/${n('c')}/read`, 'alice-token', 'PATCH')
    expect(res.status).toBe(404)
    expect(model.rows.find((r) => r._id === n('c')).readAt).toBeNull()
  })

  it('does not let a different role with the same id match', async () => {
    const res = await call(`/${n('a')}/read`, 'admin-token', 'PATCH')
    expect(res.status).toBe(404)
  })

  it('marks an owned notification as read and lowers the unread count', async () => {
    const res = await call(`/${n('a')}/read`, 'alice-token', 'PATCH')
    expect(res.status).toBe(200)
    const body = await (await call('', 'alice-token')).json()
    expect(body.unreadCount).toBe(2)
  })

  it('returns 400 for an invalid id', async () => {
    expect((await call('/not-an-id/read', 'alice-token', 'PATCH')).status).toBe(400)
  })

  it('read-all only affects the caller notifications', async () => {
    const res = await call('/read-all', 'alice-token', 'PATCH')
    expect((await res.json()).updated).toBe(3)
    expect(model.rows.find((r) => r._id === n('c')).readAt).toBeNull()
    expect((await (await call('', 'bob-token')).json()).unreadCount).toBe(1)
  })
})
