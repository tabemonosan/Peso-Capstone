import 'dotenv/config'
import mongoose from 'mongoose'

const { Schema } = mongoose

const jobSchema = new Schema({
  title: String,
  company: String,
  location: String,
  description: String,
  requirements: String,
  salary: String,
  skills: [String],
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  approvedBy: String,
  approvedAt: Date,
  createdBy: String,
  applicants: [{ email: String, appliedAt: Date }],
  createdAt: { type: Date, default: Date.now },
})

const JobPosting = mongoose.models.JobPosting || mongoose.model('JobPosting', jobSchema)

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal'

async function run() {
  await mongoose.connect(mongoUri)

  const now = Date.now()
  const jobs = [
    { title: 'Warehouse Staff', location: 'Legazpi City', skills: ['Construction', 'Driving'] },
    { title: 'Kitchen Assistant', location: 'Daraga', skills: ['Cooking', 'Cleaning'] },
    { title: 'Home Care Aide', location: 'Tabaco City', skills: ['Caregiving', 'Customer Service'] },
    { title: 'Office Encoder', location: 'Ligao City', skills: ['Data Entry', 'Customer Service'] },
    { title: 'Delivery Rider', location: 'Polangui', skills: ['Driving', 'Customer Service'] },
    { title: 'Janitorial Personnel', location: 'Legazpi City', skills: ['Cleaning'] },
    { title: 'Landscaping Worker', location: 'Camalig', skills: ['Landscaping', 'Construction'] },
    { title: 'Front Desk Assistant', location: 'Sto. Domingo', skills: ['Customer Service', 'Data Entry'] },
    { title: 'Production Helper', location: 'Guinobatan', skills: ['Construction', 'Cleaning'] },
    { title: 'Cook', location: 'Legazpi City', skills: ['Cooking', 'Customer Service'] },
  ].map((job, i) => ({
    title: job.title,
    company: 'Employer Company',
    location: job.location,
    description: `Auto-seeded approved posting #${i + 1}`,
    requirements: 'Relevant experience preferred.',
    salary: 'Php 12,000 - 18,000',
    skills: job.skills,
    status: 'approved',
    approvedBy: 'admin@peso.gov',
    approvedAt: new Date(),
    createdBy: 'employer@gmail.com',
    applicants: [],
    createdAt: new Date(now + i),
  }))

  const inserted = await JobPosting.insertMany(jobs)
  const totalApprovedByEmployer = await JobPosting.countDocuments({
    createdBy: 'employer@gmail.com',
    status: 'approved',
  })

  console.log('Inserted approved jobs:', inserted.length)
  console.log('Total approved jobs by employer@gmail.com:', totalApprovedByEmployer)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
