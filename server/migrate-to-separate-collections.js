import 'dotenv/config'
import mongoose from 'mongoose'
import fs from 'fs'
import './models/User.js'
import { Applicant, Employer, Admin, findUserByEmail, createUserInRole } from './models/collections.js'

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal'

async function run() {
  await mongoose.connect(mongoUri)
  console.log('Connected to MongoDB for migration')

  // Access the legacy `users` collection via the existing model if present
  let User
  try {
    User = mongoose.model('User')
  } catch (e) {
    console.error('Legacy User model not registered. Ensure server/models/User.js has been loaded by the app.')
    process.exit(1)
  }

  const users = await User.find().lean()
  console.log(`Found ${users.length} documents in users collection`)

  let migrated = 0
  for (const doc of users) {
    const email = doc.email
    if (!email) continue

    const exists = await findUserByEmail(email)
    if (exists) {
      console.log(`Skipping ${email}: already exists in target collections`) 
      continue
    }

    const role = doc.role || 'Applicant'

    try {
      if (role === 'Admin') {
        await createUserInRole('Admin', { email, passwordHash: doc.passwordHash || '', profile: doc.profile || {} })
      } else if (role === 'Employer') {
        const companyName = doc.companyName || (doc.profile && doc.profile.summary) || ''
        const contactName = doc.contactName || (doc.profile && doc.profile.name) || ''
        await createUserInRole('Employer', { email, passwordHash: doc.passwordHash || '', companyName, contactName, profile: doc.profile || {} })
      } else {
        await createUserInRole('Applicant', { email, passwordHash: doc.passwordHash || '', profile: doc.profile || {} })
      }
      migrated += 1
      console.log(`Migrated ${email} as ${role}`)
    } catch (err) {
      console.error(`Failed migrating ${email}:`, err.message)
    }
  }

  console.log(`Migration complete. Migrated ${migrated} users.`)
  // Write a small migration report
  const report = { migrated, total: users.length, timestamp: new Date().toISOString() }
  fs.writeFileSync('migration-report.json', JSON.stringify(report, null, 2))

  console.log('Wrote migration-report.json. Review target collections before dropping legacy `users` collection.')
  await mongoose.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
