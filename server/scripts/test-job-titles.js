import 'dotenv/config'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { Applicant } from '../models/collections.js'

const base = 'http://localhost:4000'
const secret = process.env.JWT_SECRET || 'dev-secret'
const adminToken = jwt.sign({ email: 'test-admin@peso.gov', role: 'Admin' }, secret, { expiresIn: '5m' })
const applicantEmail = `job-title-test-${Date.now()}@example.com`
const applicantToken = jwt.sign({ email: applicantEmail, role: 'Applicant' }, secret, { expiresIn: '5m' })
const titleName = `Test Job Title ${Date.now()}`
await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peso-portal')

try {
  const version = { originalName: 'test.pdf', version: 1 }
  await Applicant.create({
    email: applicantEmail,
    passwordHash: 'test-hash',
    profile: { name: 'Test Applicant', location: 'Legazpi', skills: ['Testing'], summary: 'Test profile' },
    verificationDocuments: {
      nsrpForm: { versions: [version] },
      birthCertificate: { versions: [version] },
      validId1: { versions: [version] },
    },
    resumeFile: { originalName: 'resume.pdf' },
  })

  let response = await fetch(`${base}/api/job-titles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  let body = await response.json()
  assert.equal(response.status, 200)
  assert.ok(Array.isArray(body.categories))
  assert.ok(body.categories.some((group) => group.category === 'IT' && group.titles.some((title) => title.name === 'Software Developer')))

  response = await fetch(`${base}/api/admin/job-titles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: titleName, category: 'Test' }),
  })
  body = await response.json()
  assert.equal(response.status, 201)
  const id = body.id

  response = await fetch(`${base}/api/job-titles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  body = await response.json()
  assert.ok(body.categories.some((group) => group.category === 'Test' && group.titles.some((title) => title.name === titleName)))

  response = await fetch(`${base}/api/admin/job-titles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${applicantToken}` },
    body: JSON.stringify({ name: 'Unauthorized title', category: 'Test' }),
  })
  assert.equal(response.status, 403)

  response = await fetch(`${base}/api/admin/job-titles/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert.equal(response.status, 200)

  console.log('Job title API checks passed.')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await Applicant.deleteOne({ email: applicantEmail })
  const cleanup = await fetch(`${base}/api/job-titles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }).catch(() => null)
  if (cleanup?.ok) {
    const data = await cleanup.json()
    const orphan = data.categories.flatMap((group) => group.titles).find((title) => title.name === titleName)
    if (orphan) await fetch(`${base}/api/admin/job-titles/${orphan.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
  }
  await mongoose.disconnect()
}
