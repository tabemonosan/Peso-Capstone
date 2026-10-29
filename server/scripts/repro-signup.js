// Live reproduction script for the signup 500: posts a realistic payload to a
// RUNNING server (default http://localhost:4000) using its real database.
// Usage: node server/scripts/repro-signup.js [email] [suffix]
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const API = process.env.API_URL || 'http://localhost:4000'
const email = process.argv[2] || `signup-repro-${Date.now()}@example.com`
const suffix = process.argv[3] ?? 'Jr.'
const jwtSecret = process.env.JWT_SECRET || 'dev-secret'

const proof = jwt.sign(
  { email, purpose: 'signup-email-proof', jti: crypto.randomBytes(16).toString('hex') },
  jwtSecret,
  { expiresIn: '30m' },
)

const answers = {
  surname: 'Repro', firstName: 'Signup', middleName: 'Test', suffix,
  dob: '1990-01-01', placeOfBirth: 'Legazpi City', sex: 'Male', civilStatus: 'Single',
  addressStreet: '1 Main Street', addressBarangay: 'Centro', addressCity: 'Legazpi',
  addressProvince: 'Albay', cellphone: '09171234567', employmentStatus: 'Unemployed',
  activelyLooking: 'Yes', willingImmediately: 'Yes', fourPs: 'No', occupation1: 'Clerk',
  certified: true, skills: [], education: [], technicalTraining: [], eligibility: [],
  workExperience: [], languages: [],
}

const pdf = new Blob([Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1000, 0x20)])], { type: 'application/pdf' })
const form = new FormData()
form.append('email', email)
form.append('emailProof', proof)
form.append('password', 'Password123!')
form.append('consent', 'true')
form.append('id1Type', 'SSS')
form.append('id2Type', 'Passport')
form.append('nsrpAnswers', JSON.stringify(answers))
form.append('birthCertificate', pdf, 'birth.pdf')
form.append('validId1Front', pdf, 'id1-front.pdf')
form.append('validId1Back', pdf, 'id1-back.pdf')
form.append('validId2Front', pdf, 'id2-front.pdf')
form.append('validId2Back', pdf, 'id2-back.pdf')
form.append('resume', pdf, 'resume.pdf')

const res = await fetch(`${API}/api/signup`, { method: 'POST', body: form })
const body = await res.json().catch(() => null)
console.log(`POST /api/signup -> ${res.status}`)
console.log(JSON.stringify(body?.error ? { error: body.error, code: body.code, errorId: body.errorId, fieldErrors: body.fieldErrors } : { ok: true, emailVerified: body?.user?.emailVerified }, null, 2))
process.exit(res.status === 200 ? 0 : 1)
