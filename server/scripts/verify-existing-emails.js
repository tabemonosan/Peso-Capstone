// One-time migration: mark existing test accounts as email-verified and backfill emailNormalized.
// Usage: node server/scripts/verify-existing-emails.js
import 'dotenv/config'
import mongoose from 'mongoose'
import { Applicant, Employer } from '../models/collections.js'
import { normalizeEmail } from '../utils/emailVerification.js'

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal'

await mongoose.connect(mongoUri)

for (const Model of [Applicant, Employer]) {
  const accounts = await Model.find({ $or: [{ emailVerified: { $exists: false } }, { emailVerified: false }] })
  for (const account of accounts) {
    account.emailVerified = true
    account.emailNormalized = normalizeEmail(account.email)
    account.emailVerifyTokenHash = undefined
    account.emailVerifyExpires = undefined
    await account.save()
  }
  console.log(`${Model.modelName}: verified + normalized ${accounts.length} account(s)`)
}

await mongoose.disconnect()
console.log('Done.')
