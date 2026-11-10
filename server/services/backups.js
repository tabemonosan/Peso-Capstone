import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import mongoose from 'mongoose'

const { EJSON } = mongoose.mongo.BSON
const magic = Buffer.from('PESOBKP1')
const serialize = value => `${EJSON.stringify(value, { relaxed: false })}\n`
const inside = (root, file) => {
  const resolved = path.resolve(root, file), relative = path.relative(path.resolve(root), resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid backup file path.')
  return resolved
}
async function* files(root, directory = root) {
  let entries
  try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Backup upload folders cannot contain symbolic links.')
    if (entry.isDirectory()) yield* files(root, full)
    else if (entry.isFile()) yield { name: path.relative(root, full).split(path.sep).join('/'), data: (await fs.readFile(full)).toString('base64') }
  }
}
export async function backupKey(keyFile) {
  await fs.mkdir(path.dirname(keyFile), { recursive: true, mode: 0o700 })
  try { await fs.writeFile(keyFile, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  const key = await fs.readFile(keyFile)
  if (key.length !== 32) throw new Error('The backup encryption key must contain 32 bytes.')
  return key
}
export async function createBackup({ db, destination, key, uploadsRoot }) {
  await fs.mkdir(destination, { recursive: true, mode: 0o700 })
  const name = `peso-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.enc`
  const filename = path.join(destination, name), temporary = `${filename}.partial`
  const collections = (await db.listCollections().toArray()).filter(entry => !entry.name.startsWith('system.'))
  const metadata = []
  for (const collection of collections) metadata.push({ name: collection.name, type: collection.type, options: collection.options || {}, indexes: collection.type === 'view' ? [] : await db.collection(collection.name).indexes() })
  const manifest = { kind: 'manifest', version: 1, createdAt: new Date(), sourceDatabase: db.databaseName, uploadsRoot: path.resolve(uploadsRoot), collections: metadata }
  const counts = Object.fromEntries(metadata.map(entry => [entry.name, 0])); let fileCount = 0
  async function* records() {
    yield serialize(manifest)
    for (const collection of metadata.filter(entry => entry.type !== 'view')) {
      const cursor = db.collection(collection.name).find({})
      try { for await (const document of cursor) { counts[collection.name]++; yield serialize({ kind: 'document', collection: collection.name, document }) } }
      finally { await cursor.close() }
    }
    for await (const file of files(uploadsRoot)) { fileCount++; yield serialize({ kind: 'file', ...file }) }
    yield serialize({ kind: 'complete', counts, fileCount })
  }
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  try {
    const output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 })
    output.write(Buffer.concat([magic, iv]))
    await pipeline(Readable.from(records()), createGzip(), cipher, output)
    await fs.appendFile(temporary, cipher.getAuthTag())
    await fs.rename(temporary, filename)
    return { filename, collections: metadata.length, documents: Object.values(counts).reduce((sum, count) => sum + count, 0), files: fileCount }
  } catch (error) { await fs.rm(temporary, { force: true }); throw error }
}
async function unpack({ filename, key }, operation) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'peso-backup-'))
  const unpacked = path.join(directory, 'archive.jsonl')
  try {
    const stat = await fs.stat(filename)
    if (stat.size < 37) throw new Error('Invalid backup archive.')
    const handle = await fs.open(filename, 'r')
    let header, tag
    try {
      header = Buffer.alloc(20); tag = Buffer.alloc(16)
      await handle.read(header, 0, 20, 0); await handle.read(tag, 0, 16, stat.size - 16)
    } finally { await handle.close() }
    if (!header.subarray(0, 8).equals(magic)) throw new Error('Unsupported backup format.')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(8)); decipher.setAuthTag(tag)
    // Authenticate and validate the entire archive before touching a target database.
    await pipeline(createReadStream(filename, { start: 20, end: stat.size - 17 }), decipher, createGunzip(), createWriteStream(unpacked, { mode: 0o600 }))
    let manifest, complete, fileCount = 0
    const counts = new Map()
    for await (const record of readRecords(unpacked)) {
      if (!manifest) {
        if (record.kind !== 'manifest' || Number(record.version) !== 1 || !Array.isArray(record.collections)) throw new Error('Invalid backup manifest.')
        manifest = record
        for (const collection of manifest.collections) {
          if (typeof collection.name !== 'string' || counts.has(collection.name)) throw new Error('Invalid collection metadata.')
          counts.set(collection.name, 0)
        }
      } else if (complete) throw new Error('Unexpected records after backup footer.')
      else if (record.kind === 'document' && counts.has(record.collection)) counts.set(record.collection, counts.get(record.collection) + 1)
      else if (record.kind === 'file') { inside(directory, record.name); fileCount++ }
      else if (record.kind === 'complete') complete = record
      else throw new Error('Invalid backup record.')
    }
    if (!manifest || !complete || Number(complete.fileCount) !== fileCount || [...counts].some(([name, count]) => Number(complete.counts[name]) !== count)) throw new Error('Incomplete backup archive.')
    return await operation({ unpacked, manifest, counts, fileCount })
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
}
async function* readRecords(filename) {
  const input = createReadStream(filename)
  const reader = createInterface({ input, crlfDelay: Infinity })
  try { for await (const line of reader) if (line) yield EJSON.parse(line, { relaxed: false }) }
  finally { reader.close(); input.destroy() }
}
export const verifyBackup = options => unpack(options, async ({ manifest, counts, fileCount }) => ({ sourceDatabase: manifest.sourceDatabase, createdAt: manifest.createdAt, collections: counts.size, documents: [...counts.values()].reduce((sum, count) => sum + count, 0), files: fileCount }))
export async function restoreBackup({ client, database, sourceDatabase, uploadsDestination, ...options }) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*_restore_[a-zA-Z0-9_-]+$/.test(database) || database === sourceDatabase || ['admin', 'local', 'config'].includes(database)) throw new Error('Restore requires a separate database named with _restore_ (for example peso_restore_check).')
  return unpack(options, async ({ unpacked, manifest, counts, fileCount }) => {
    if (database === manifest.sourceDatabase) throw new Error('Cannot restore over the source database.')
    const db = client.db(database)
    if ((await db.listCollections().toArray()).length) throw new Error('The restore database must be empty.')
    const existingFiles = await fs.readdir(uploadsDestination).catch(error => { if (error.code === 'ENOENT') return []; throw error })
    if (existingFiles.length) throw new Error('The restore upload folder must be empty.')
    const remap = value => {
      if (typeof value === 'string') {
        const normalized = value.replaceAll('\\', '/'), prefix = manifest.uploadsRoot.replaceAll('\\', '/').replace(/\/$/, '') + '/'
        return normalized.startsWith(prefix) ? inside(uploadsDestination, normalized.slice(prefix.length)) : value
      }
      if (!value || typeof value !== 'object' || value instanceof Date || value._bsontype || Buffer.isBuffer(value)) return value
      if (Array.isArray(value)) return value.map(remap)
      return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, remap(entry)]))
    }
    for (const collection of manifest.collections.filter(entry => entry.type !== 'view')) await db.createCollection(collection.name, collection.options)
    for await (const record of readRecords(unpacked)) {
      if (record.kind === 'document') await db.collection(record.collection).insertOne(remap(record.document))
      if (record.kind === 'file') {
        const target = inside(uploadsDestination, record.name)
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
        await fs.writeFile(target, Buffer.from(record.data, 'base64'), { flag: 'wx', mode: 0o600 })
      }
    }
    for (const collection of manifest.collections.filter(entry => entry.type !== 'view')) {
      for (const index of collection.indexes.filter(entry => entry.name !== '_id_')) {
        const { key: indexKey, v: _version, ns: _namespace, ...indexOptions } = index
        await db.collection(collection.name).createIndex(indexKey, indexOptions)
      }
    }
    for (const view of manifest.collections.filter(entry => entry.type === 'view')) await db.createCollection(view.name, view.options)
    return { database, collections: counts.size, documents: [...counts.values()].reduce((sum, count) => sum + count, 0), files: fileCount, uploadsDestination }
  })
}
