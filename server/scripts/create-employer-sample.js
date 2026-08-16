import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { Employer, findUserByEmail, createUserInRole } from '../models/collections.js'

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal'

async function run() {
  await mongoose.connect(mongoUri)
  console.log('Connected to MongoDB')

  const email = 'sample-employer@example.com'
  const existing = await findUserByEmail(email)
  if (existing) {
    console.log('Employer already exists:', existing.user.email)
    console.log('Document:', JSON.stringify(existing.user, null, 2))
    await mongoose.disconnect()
    return
  }

  const passwordHash = await bcrypt.hash('Password123', 10)
  const created = await createUserInRole('Employer', {
    email,
    passwordHash,
    companyName: 'Sample Co',
    contactName: 'Jane Employer',
    phone: '09171234567',
    website: 'https://sampleco.example',
    profile: { name: 'Jane Employer', location: 'Metro', summary: 'We hire.' },
  })

  console.log('Created employer:', created.email)

  const found = await findUserByEmail(email)
  console.log('Found:', JSON.stringify(found, null, 2))

  await mongoose.disconnect()
}

run().catch((err) => { console.error(err); process.exit(1) })
