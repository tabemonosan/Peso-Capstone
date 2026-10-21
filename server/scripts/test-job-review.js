import 'dotenv/config'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { Admin, Employer, Notification } from '../models/collections.js'

const base = 'http://localhost:4000'
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const adminEmail = `job-review-admin-${suffix}@example.com`
const employerEmail = `job-review-employer-${suffix}@example.com`
const jobId = new mongoose.Types.ObjectId()
const adminToken = jwt.sign({ email: adminEmail, role: 'Admin' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '5m' })

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal')

try {
  const passwordHash = await bcrypt.hash('TestPassword1!', 10)
  await Admin.create({ email: adminEmail, passwordHash, profile: { name: 'Review Test Admin' } })
  await Employer.create({
    email: employerEmail,
    passwordHash,
    companyName: 'Review Test Company',
    contactName: 'Test Contact',
    phone: '09171234567',
    verificationStatus: 'under_review',
    profile: { location: 'Legazpi City' },
  })
  await mongoose.connection.collection('jobpostings').insertOne({
    _id: jobId,
    title: 'Review Test Posting',
    company: 'Review Test Company',
    location: 'Legazpi City',
    description: 'A detailed role description.',
    requirements: 'At least two years of experience.',
    salary: '₱25,000',
    slots: 3,
    deadline: new Date('2026-12-31T00:00:00.000Z'),
    employmentType: 'Full-time',
    status: 'pending',
    createdBy: employerEmail,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    applicants: [],
    reviewHistory: [],
  })

  let response = await fetch(`${base}/api/jobs?status=pending`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert.equal(response.status, 200)
  let jobs = await response.json()
  const listedJob = jobs.find((job) => job._id === String(jobId))
  assert.ok(listedJob, 'pending list should include the test posting')
  assert.equal(listedJob.employerDetails.companyName, 'Review Test Company')
  assert.equal(listedJob.employerDetails.contactName, 'Test Contact')
  assert.equal(listedJob.employerDetails.verificationStatus, 'under_review')
  assert.equal(listedJob.slots, 3)

  response = await fetch(`${base}/api/jobs/${jobId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'declined' }),
  })
  assert.equal(response.status, 400, 'decline without a reason should fail')

  const reason = 'Please include the work schedule.'
  response = await fetch(`${base}/api/jobs/${jobId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'declined', reason }),
  })
  assert.equal(response.status, 200)
  const declinedJob = await response.json()
  assert.equal(declinedJob.reviewHistory.length, 1)
  assert.equal(declinedJob.reviewHistory[0].status, 'declined')
  assert.equal(declinedJob.reviewHistory[0].reason, reason)
  assert.equal(declinedJob.reviewReason, reason)

  const employerNotification = await Notification.findOne({ recipientEmail: employerEmail, title: 'Posting declined' }).lean()
  assert.ok(employerNotification?.message.includes(reason), 'decline reason should be included in the employer notification')

  response = await fetch(`${base}/api/jobs?status=declined`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert.equal(response.status, 200)
  jobs = await response.json()
  assert.ok(jobs.find((job) => job._id === String(jobId))?.reviewHistory?.length, 'declined list should preserve decision history')

  console.log('Job review checks passed.')
} finally {
  await Notification.deleteMany({ recipientEmail: employerEmail })
  await Employer.deleteOne({ email: employerEmail })
  await Admin.deleteOne({ email: adminEmail })
  await mongoose.connection.collection('jobpostings').deleteOne({ _id: jobId })
  await mongoose.disconnect()
}
