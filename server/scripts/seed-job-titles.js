import 'dotenv/config'
import mongoose from 'mongoose'
import { JobTitle } from '../models/collections.js'
import { JOB_TITLE_SEED_DATA } from './job-title-seed-data.js'

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal'

try {
  await mongoose.connect(mongoUri)
  const operations = JOB_TITLE_SEED_DATA.map(({ name, category }) => ({
    updateOne: {
      filter: { name },
      update: { $setOnInsert: { name, category } },
      upsert: true,
    },
  }))
  await JobTitle.bulkWrite(operations)
  console.log(`Seeded ${JOB_TITLE_SEED_DATA.length} job titles.`)
} catch (error) {
  console.error('Failed to seed job titles:', error)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
