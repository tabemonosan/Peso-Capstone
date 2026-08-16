import 'dotenv/config'
import mongoose from 'mongoose'
import { Applicant, Employer, Admin } from '../models/collections.js'

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal'

async function run() {
  await mongoose.connect(mongoUri)
  console.log('Connected to MongoDB for verification')

  const applicantCount = await Applicant.countDocuments()
  const employerCount = await Employer.countDocuments()
  const adminCount = await Admin.countDocuments()

  console.log(`applicants: ${applicantCount}, employers: ${employerCount}, admins: ${adminCount}`)

  const applicants = await Applicant.find().limit(5).lean()
  const employers = await Employer.find().limit(5).lean()
  const admins = await Admin.find().limit(5).lean()

  console.log('\nSample applicants:')
  console.log(JSON.stringify(applicants, null, 2))
  console.log('\nSample employers:')
  console.log(JSON.stringify(employers, null, 2))
  console.log('\nSample admins:')
  console.log(JSON.stringify(admins, null, 2))

  await mongoose.disconnect()
}

run().catch(err => {
  console.error('Verification failed:', err)
  process.exit(1)
})
