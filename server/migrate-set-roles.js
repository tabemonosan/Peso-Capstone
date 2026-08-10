import 'dotenv/config'
import mongoose from 'mongoose'
import './models/User.js'

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/peso-portal'

async function run() {
  await mongoose.connect(mongoUri)
  console.log('Connected to', mongoUri)

  const User = mongoose.model('User')

  // Set role to 'Applicant' for any user document missing the role field
  const result = await User.updateMany({ role: { $exists: false } }, { $set: { role: 'Applicant' } })
  console.log('Matched:', result.matchedCount, 'Modified:', result.modifiedCount)

  // Optionally: list a sample of users to verify
  const sample = await User.find({}).limit(5).lean()
  console.log('Sample users:', sample)

  await mongoose.disconnect()
  console.log('Done')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
