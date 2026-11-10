import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs/promises'
import mongoose from 'mongoose'
import { backupKey, createBackup, restoreBackup, verifyBackup } from '../services/backups.js'

const args = process.argv.slice(2), command = args[0] || 'create'
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
const destination = path.resolve(process.env.BACKUP_DIR || '.backups')
const keyFile = path.resolve(process.env.BACKUP_KEY_FILE || '.backup-secrets/backup.key')
let client
try {
  // Verification/restoration must never silently generate a replacement key.
  const key = command === 'create' ? await backupKey(keyFile) : await fs.readFile(keyFile)
  if (command === 'verify') {
    if (!args[1]) throw new Error('Provide an archive filename to verify.')
    console.log(JSON.stringify(await verifyBackup({ filename: path.resolve(args[1]), key })))
  } else if (['create', 'restore'].includes(command)) {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI
    if (!uri) throw new Error('MONGODB_URI is required.')
    client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 10000 })
    await client.connect()
    const source = client.db()
    const result = command === 'create'
      ? await createBackup({ db: source, destination, key, uploadsRoot: path.resolve('server/uploads') })
      : await restoreBackup({ client, database: option('--database') || '', sourceDatabase: source.databaseName, filename: path.resolve(args[1] || ''), key, uploadsDestination: path.resolve(option('--files-dir') || path.join(destination, 'restored-files', option('--database') || 'invalid')) })
    console.log(JSON.stringify(result))
  } else throw new Error('Use create, verify <archive>, or restore <archive> --database peso_restore_check.')
} catch {
  console.error('Backup operation failed. Check the database connection, archive, key file, and restore destination. Restore requires an empty *_restore_* database and upload folder.')
  process.exitCode = 1
} finally { if (client) await client.close() }
