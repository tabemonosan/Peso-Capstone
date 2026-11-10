import 'dotenv/config'
import mongoose from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { Admin, emailTakenAcrossRoles } from '../models/collections.js'

// Creates missing accounts only. Existing credentials and access are never reset.
const accounts = [
  { email: 'superadmin@peso.local', name: 'PESO Super Admin', adminLevel: 'super_admin' },
  { email: 'admin.capstone@peso.local', name: 'PESO Admin', adminLevel: 'admin' },
  { email: 'staff@peso.local', name: 'PESO Staff', adminLevel: 'staff' },
]
try {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('Configure MONGODB_URI before creating internal accounts.')
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  const created = []
  for (const account of accounts) {
    if (await emailTakenAcrossRoles(account.email)) {
      created.push({ email: account.email, skipped: true, message: 'Account already exists; credentials were preserved.' })
      continue
    }
    const password = `P3!a${crypto.randomBytes(12).toString('base64url')}`
    await Admin.create({ email: account.email, adminLevel: account.adminLevel, mustChangePassword: true, profile: { name: account.name }, passwordHash: await bcrypt.hash(password, 12) })
    created.push({ email: account.email, adminLevel: account.adminLevel, password })
  }
  // Initial passwords are shown once to the operator, never written to source files.
  console.log(JSON.stringify(created, null, 2))
} catch (error) {
  console.error(error.name === 'MongooseServerSelectionError' ? 'Cannot connect to the configured MongoDB database.' : error.message)
  process.exitCode = 1
} finally { await mongoose.disconnect() }
