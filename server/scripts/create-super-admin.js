import 'dotenv/config'
import mongoose from 'mongoose'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Admin, emailTakenAcrossRoles } from '../models/collections.js'

// Run from the project root on the device hosting the intended database.
// node server/scripts/create-super-admin.js <email> [name]
const [emailArg, nameArg] = process.argv.slice(2)
const email = (emailArg || '').trim().toLowerCase()
const name = (nameArg || 'PESO Super Admin').trim()

try {
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 120) {
    throw new Error('Usage: node server/scripts/create-super-admin.js <email> [name] (name: 1–120 characters).')
  }
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('Configure MONGODB_URI in your project .env first.')
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  if (await emailTakenAcrossRoles(email)) {
    throw new Error('An account already uses this email. Choose a different email; the existing account was preserved.')
  }
  const password = `P3!a${crypto.randomBytes(12).toString('base64url')}`
  await Admin.create({
    email,
    adminLevel: 'super_admin',
    disabled: false,
    mustChangePassword: true,
    profile: { name },
    passwordHash: await bcrypt.hash(password, 12),
  })
  console.log(JSON.stringify({ database: mongoose.connection.name, email, role: 'Super Admin', temporaryPassword: password, message: 'Save this password now. You must change it at first sign-in.' }, null, 2))
} catch (error) {
  console.error(error.code === 11000 ? 'An account already uses this email. Existing accounts were preserved.' : error.name === 'MongooseServerSelectionError' ? 'Cannot connect to the configured MongoDB database.' : error.name === 'MongoParseError' ? 'The configured MongoDB connection string is invalid.' : error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
