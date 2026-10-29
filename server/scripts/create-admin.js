import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { Admin, findUserByEmail, createUserInRole } from '../models/collections.js'

// Usage:
//   node server/scripts/create-admin.js <email> <password> [name]
// or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in the environment.
const [emailArg, passwordArg, nameArg] = process.argv.slice(2)
const email = emailArg || process.env.ADMIN_EMAIL || 'admin@example.com'
const password = passwordArg || process.env.ADMIN_PASSWORD || 'Password123'
const name = nameArg || process.env.ADMIN_NAME || 'Admin'

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal'

async function run() {
  await mongoose.connect(mongoUri)
  console.log('Connected to MongoDB')

  const existing = await findUserByEmail(email)
  if (existing) {
    console.log('A user with this email already exists:', existing.user.email, `(role: ${existing.type})`)
    await mongoose.disconnect()
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const created = await createUserInRole('Admin', {
    email,
    passwordHash,
    profile: { name },
  })

  console.log('Created admin:', created.email)
  await mongoose.disconnect()
}

run().catch((err) => { console.error(err); process.exit(1) })
