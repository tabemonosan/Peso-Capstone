import mongoose from 'mongoose'

await mongoose.connect('mongodb://localhost:27017/peso-portal')
const db = mongoose.connection.db
const app = await db.collection('applicants').findOne({ 'resumeFile.originalName': { $exists: true } })
if (!app) {
  console.log('No applicant with resume found')
} else {
  console.log('Applicant:', app.email)
  console.log('resumeFile keys:', Object.keys(app.resumeFile || {}))
  console.log('originalName:', app.resumeFile.originalName)
  console.log('mimetype:', app.resumeFile.mimetype)
  console.log('size:', app.resumeFile.size)
  console.log('has data buffer:', Boolean(app.resumeFile.data))
  console.log('data length:', app.resumeFile.data ? app.resumeFile.data.length : 0)
  if (app.resumeFile.data) {
    const head = app.resumeFile.data.slice(0, 8).toString('latin1')
    console.log('data head:', JSON.stringify(head))
  }
}
await mongoose.disconnect()
