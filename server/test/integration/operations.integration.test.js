// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { startTestDb, stopTestDb, clearDb } from './helpers.js'
import { createBackup, verifyBackup, restoreBackup, backupKey } from '../../services/backups.js'
import { createEmailDeliveryService } from '../../services/emailDelivery.js'
import { EmailDelivery } from '../../models/emailDelivery.js'
import { createEmailDeliveryRouter } from '../../routes/emailDelivery.js'
let directory
beforeAll(async () => { await startTestDb(); directory = await fs.mkdtemp(path.join(os.tmpdir(), 'peso-operations-')) }, 60000)
beforeEach(clearDb)
afterAll(async () => { await stopTestDb(); await fs.rm(directory, { recursive: true, force: true }) })

describe('encrypted backup and isolated restore', () => {
  it('restores records, relationships, binary documents, indexes, and local files', async () => {
    const db = mongoose.connection.db, root = path.join(directory, 'uploads')
    await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, 'form.pdf'), '%PDF-backup-file')
    const id = new mongoose.Types.ObjectId(), bytes = Buffer.from('%PDF-private-document')
    await db.collection('backup_applicants').insertOne({ _id: id, email: 'backup@example.test', createdAt: new Date('2026-01-01'), filePath: path.join(root, 'form.pdf') })
    await db.collection('backup_applicants').createIndex({ email: 1 }, { unique: true })
    await db.collection('backup_documents').insertOne({ applicantId: id, data: bytes, precise: mongoose.mongo.Long.fromString('9007199254740993'), expiresAt: new Date(Date.now() + 86400000) })
    await db.collection('backup_documents').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
    const keyFile = path.join(directory, 'secrets', 'key'), key = await backupKey(keyFile)
    expect((await backupKey(keyFile)).equals(key)).toBe(true)
    const archive = await createBackup({ db, key, uploadsRoot: root, destination: path.join(directory, 'archives') })
    const encrypted = await fs.readFile(archive.filename)
    expect(encrypted.toString()).not.toContain('backup@example.test')
    const verified = await verifyBackup({ filename: archive.filename, key })
    expect(verified.documents).toBeGreaterThanOrEqual(2); expect(verified.files).toBe(1)
    const database = 'peso_restore_operations', restoredFiles = path.join(directory, 'restored')
    const result = await restoreBackup({ client: mongoose.connection.getClient(), sourceDatabase: db.databaseName, database, uploadsDestination: restoredFiles, filename: archive.filename, key })
    expect(result.files).toBe(1)
    const target = mongoose.connection.getClient().db(database)
    const applicant = await target.collection('backup_applicants').findOne({ _id: id })
    expect(applicant.createdAt).toBeInstanceOf(Date)
    expect(applicant.filePath).toBe(path.join(restoredFiles, 'form.pdf'))
    const document = await target.collection('backup_documents').findOne({ applicantId: id })
    expect(Buffer.from(document.data.buffer).equals(bytes)).toBe(true)
    expect(document.precise.toString()).toBe('9007199254740993')
    expect((await target.collection('backup_documents').indexes()).find(index => index.key.expiresAt === 1).expireAfterSeconds).toBe(3600)
    expect(await fs.readFile(path.join(restoredFiles, 'form.pdf'), 'utf8')).toBe('%PDF-backup-file')
    expect((await target.collection('backup_applicants').indexes()).some(index => index.unique && index.key.email === 1)).toBe(true)
    await expect(restoreBackup({ client: mongoose.connection.getClient(), sourceDatabase: db.databaseName, database, uploadsDestination: restoredFiles, filename: archive.filename, key })).rejects.toThrow('must be empty')
    await expect(restoreBackup({ client: mongoose.connection.getClient(), sourceDatabase: db.databaseName, database: db.databaseName, uploadsDestination: restoredFiles, filename: archive.filename, key })).rejects.toThrow('separate database')
    const corrupt = path.join(directory, 'corrupt.enc'); encrypted[25] ^= 1; await fs.writeFile(corrupt, encrypted)
    await expect(verifyBackup({ filename: corrupt, key })).rejects.toThrow()
    await expect(restoreBackup({ client: mongoose.connection.getClient(), sourceDatabase: db.databaseName, database: 'peso_restore_corrupt', uploadsDestination: path.join(directory, 'corrupt-files'), filename: corrupt, key })).rejects.toThrow()
    expect((await mongoose.connection.getClient().db('peso_restore_corrupt').listCollections().toArray())).toHaveLength(0)
    await expect(verifyBackup({ filename: archive.filename, key: Buffer.alloc(32) })).rejects.toThrow()
  })
})

describe('durable email delivery', () => {
  it('encrypts pending messages, retries after failure, and avoids duplicate concurrent retries', async () => {
    let now = new Date('2026-11-11T00:00:00Z')
    const deliver = vi.fn().mockResolvedValueOnce({ delivered: false }).mockResolvedValue({ delivered: true })
    const service = createEmailDeliveryService({ Model: EmailDelivery, deliver, secret: 'test-only-key', now: () => now })
    const sent = await service.send('user@example.test', 'Interview invitation', 'Private interview details')
    expect(sent.delivered).toBe(false)
    let stored = await EmailDelivery.findById(sent.deliveryId).select('+payload').lean()
    expect(stored.status).toBe('failed'); expect(stored.attempts).toBe(1)
    expect(stored.payload).not.toContain('Private interview details')
    now = new Date(+now + 61000)
    await Promise.all([service.processDue(), service.processDue()])
    stored = await EmailDelivery.findById(sent.deliveryId).select('+payload').lean()
    expect(stored.status).toBe('sent'); expect(stored.attempts).toBe(2); expect(stored.payload).toBeUndefined()
    expect(deliver).toHaveBeenCalledTimes(2)
    expect(deliver.mock.calls[1]).toEqual(['user@example.test', 'Interview invitation', 'Private interview details'])
  })
  it('does not retry verification codes or expired notifications', async () => {
    let now = new Date('2026-11-11T00:00:00Z')
    const deliver = vi.fn().mockResolvedValue({ delivered: false })
    const service = createEmailDeliveryService({ Model: EmailDelivery, deliver, secret: 'test-only-key', now: () => now })
    const code = await service.send('user@example.test', 'Your PESO Portal verification code', '123456')
    const notification = await service.send('user@example.test', 'Application update', 'Review update', { expiresAt: new Date(+now + 1000) })
    now = new Date(+now + 120000)
    await service.processDue()
    expect(deliver).toHaveBeenCalledTimes(2)
    expect((await EmailDelivery.findById(code.deliveryId)).retryable).toBe(false)
    expect((await EmailDelivery.findById(notification.deliveryId)).status).toBe('expired')
  })
  it('restricts tracking to Admin accounts and never exposes the encrypted payload', async () => {
    const service = createEmailDeliveryService({ Model: EmailDelivery, deliver: vi.fn().mockResolvedValue({ delivered: false }), secret: 'test-only-key' })
    await service.send('user@example.test', 'Application update', 'Private details')
    const app = express(); app.use(express.json())
    app.use((req, _res, next) => { if (req.headers['x-level']) req.internalAccount = { adminLevel: req.headers['x-level'] }; next() })
    app.use('/delivery', createEmailDeliveryRouter({ Model: EmailDelivery, service }))
    expect((await request(app).get('/delivery')).status).toBe(403)
    expect((await request(app).get('/delivery').set('x-level', 'staff')).status).toBe(403)
    const response = await request(app).get('/delivery').set('x-level', 'admin')
    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(JSON.stringify(response.body)).not.toContain('payload')
    expect(JSON.stringify(response.body)).not.toContain('Private details')
  })
})
