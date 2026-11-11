import 'dotenv/config'
import mongoose from 'mongoose'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Admin } from '../models/collections.js'

// Local operator recovery: run on the computer hosting the intended database.
const [emailArg] = process.argv.slice(2)
const email = (emailArg || '').trim().toLowerCase()

try {
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: node server/scripts/reset-super-admin.js <existing-super-admin-email>')
  }
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('Configure MONGODB_URI in your project .env first.')
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: false, autoCreate: false })
  const password = `P3!a${crypto.randomBytes(12).toString('base64url')}`
  const passwordHash = await bcrypt.hash(password, 12)
  const account = await Admin.findOneAndUpdate(
    { email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), adminLevel: 'super_admin', disabled: { $ne: true } },
    { $set: { passwordHash, mustChangePassword: true }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after', runValidators: true },
  ).select('email').lean()
  if (!account) throw new Error('No enabled Super Admin with this email exists in the configured database. No account was changed.')
  console.log(JSON.stringify({ database: mongoose.connection.name, email: account.email, temporaryPassword: password, message: 'Previous sessions are invalidated. Use this password at sign-in, then choose a new password.' }, null, 2))
} catch (error) {
  const known = ['Usage:', 'Configure MONGODB_URI', 'No enabled Super Admin']
  console.error(known.some(prefix => error.message?.startsWith(prefix)) ? error.message : 'Could not reset the Super Admin password. Check the database connection and configuration.')
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
