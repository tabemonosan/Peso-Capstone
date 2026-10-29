// @vitest-environment node
// Validation-hardening tests: every rule must produce a per-field 422 at the
// step validator and at signup — never a 500.
// Wizard steps: 0 personal, 1 address/contact, 2 education/training,
// 3 work/skills/languages, 4 employment/preferences, 5 certification.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../mailer.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    sendEmail: vi.fn(async () => ({ delivered: true })),
    sendVerificationEmail: vi.fn(async () => ({ delivered: true })),
  }
})

const { app, validateNsrpAnswers } = await import('../../index.js')
const { startTestDb, stopTestDb, clearDb, validNsrpAnswers, signupRequest } = await import('./helpers.js')

beforeAll(async () => {
  await startTestDb()
}, 180000)
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  await clearDb()
})

// The wizard always includes the account email; add one by default.
const validate = (step, overrides) => request(app).post('/api/nsrp/validate-signup').send({ step, answers: validNsrpAnswers({ email: 'validator@example.com', ...overrides }) })
const signup = (email, answers) => signupRequest(request(app).post('/api/signup'), { email, answers })

describe('NSRP validator: numeric ID fields (step 1)', () => {
  it.each([
    ['tin', '12345678', '9 or 12 digits'],
    ['tin', '1234567890', '9 or 12 digits'],
    ['gsisSss', '12345', '10 digits'],
    ['pagibig', '12345678901', '12 digits'],
    ['philhealth', '1234567890123', '12 digits'],
  ])('%s with wrong digit length (%s) is a 422 field error', async (field, value, helper) => {
    const res = await validate(1, { [field]: value })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors[field]).toContain(helper)
  })

  it.each([['tin'], ['gsisSss'], ['pagibig'], ['philhealth']])('%s with only letters is rejected, not emptied', async (field) => {
    const res = await validate(1, { [field]: 'abcdef' })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors[field]).toBeTruthy()
  })

  it('accepts IDs with dashes/spaces (stripped to digits)', async () => {
    const res = await validate(1, { gsisSss: '12-3456789-0' })
    expect(res.status).toBe(200)
  })

  it('accepts valid IDs', async () => {
    const res = await validate(1, { tin: '123456789', pagibig: '123456789012', philhealth: '123456789012', gsisSss: '1234567890' })
    expect(res.status).toBe(200)
  })
})

describe('NSRP validator: phones (step 1)', () => {
  it.each(['0917123456', '091712345678', '9171234567', '08westos'])('rejects cellphone %s', async (value) => {
    const res = await validate(1, { cellphone: value })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.cellphone).toBe('Enter an 11-digit mobile number starting with 09.')
  })

  it.each(['09171234567', '+639171234567', '639171234567', '0917 123 4567'])('accepts and normalizes %s', async (value) => {
    const res = await validate(1, { cellphone: value })
    expect(res.status).toBe(200)
    expect(validateNsrpAnswers({ cellphone: value }).answers.cellphone).toBe('09171234567')
  })

  it('landline allows 7-11 digits and rejects letters', async () => {
    expect((await validate(1, { landline: '81234567' })).status).toBe(200)
    const bad = await validate(1, { landline: 'call-me' })
    expect(bad.status).toBe(422)
    expect(bad.body.fieldErrors.landline).toBeTruthy()
    expect((await validate(1, { landline: '123456789012' })).status).toBe(422)
  })
})

describe('NSRP validator: numbers, years, dates', () => {
  it.each([
    [{ height: 'abc' }, 'height', 0],
    [{ height: '10' }, 'height', 0],
    [{ height: '300' }, 'height', 0],
    [{ expectedSalary: '10000000' }, 'expectedSalary', 4],
  ])('rejects %o with a 422', async (overrides, field, step) => {
    const res = await validate(step, overrides)
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors[field]).toBeTruthy()
  })

  it('accepts a valid height and salary; salary symbols are stripped', async () => {
    expect((await validate(0, { height: '165' })).status).toBe(200)
    expect((await validate(4, { expectedSalary: '25,000' })).status).toBe(200)
    // "-5" cannot survive digit-only sanitization; it becomes 5
    expect(validateNsrpAnswers({ expectedSalary: '-5' }).answers.expectedSalary).toBe('5')
  })

  it.each([
    ['1899-01-01'], // nonsense year
    ['2999-01-01'], // future
  ])('rejects date of birth %s', async (dob) => {
    const res = await validate(0, { dob })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.dob).toBeTruthy()
  })

  it('rejects a date of birth younger than 15', async () => {
    const young = new Date()
    young.setFullYear(young.getFullYear() - 14)
    const res = await validate(0, { dob: young.toISOString().slice(0, 10) })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.dob).toContain('15 to 100')
  })

  it('passport expiry is required with a passport number and cannot be past (step 4)', async () => {
    const missing = await validate(4, { passportNo: 'P1234567A' })
    expect(missing.status).toBe(422)
    expect(missing.body.fieldErrors.passportExpiry).toBeTruthy()

    const past = await validate(4, { passportNo: 'P1234567A', passportExpiry: '2020-01-01' })
    expect(past.status).toBe(422)

    const ok = await validate(4, { passportNo: 'p1234567a', passportExpiry: '2099-01-01' })
    expect(ok.status).toBe(200)
  })

  it('rejects work experience with From after To, future dates, or nonsense years (step 3)', async () => {
    const base = { company: 'Acme', position: 'Clerk', fromDate: '2023-01-01', toDate: '2022-01-01', status: 'Permanent', address: '' }
    const res = await validate(3, { workExperience: [base] })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors['workExperience[0].toDate']).toBeTruthy()

    const old = await validate(3, { workExperience: [{ ...base, fromDate: '1899-01-01', toDate: '1900-01-01' }] })
    expect(old.status).toBe(422)

    const future = await validate(3, { workExperience: [{ ...base, fromDate: '2099-01-01', toDate: 'Present' }] })
    expect(future.status).toBe(422)
  })

  it('accepts a current job marked Present', async () => {
    const res = await validate(3, {
      workExperience: [{ company: 'Acme', position: 'Clerk', fromDate: '2020-01-01', toDate: 'Present', status: 'Permanent', address: '' }],
    })
    expect(res.status).toBe(200)
  })

  it('a work row starting and ending TODAY (Asia/Manila) passes — no UTC false-future', async () => {
    const todayPh = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const res = await validate(3, {
      workExperience: [{ company: 'Acme', position: 'Clerk', fromDate: todayPh, toDate: todayPh, status: 'Contractual', address: '' }],
    })
    expect(res.status).toBe(200)
  })

  it('a Present row does not require a To date', async () => {
    const { fieldErrors } = validateNsrpAnswers(validNsrpAnswers({
      email: 'unit@example.com',
      workExperience: [{ company: 'Acme', position: 'Clerk', fromDate: '2024-01-01', toDate: 'Present', status: 'Permanent', address: '' }],
    }))
    expect(Object.keys(fieldErrors).filter((key) => key.startsWith('workExperience'))).toEqual([])
  })

  it('rejects technical training with From after To (step 2)', async () => {
    const res = await validate(2, {
      technicalTraining: [{ course: 'Welding', institution: 'TESDA', certificate: '', fromDate: '2024-05-01', toDate: '2024-01-01' }],
    })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors['technicalTraining[0].toDate']).toBeTruthy()
  })

  it('rejects invalid education years (step 2)', async () => {
    const res = await validate(2, {
      education: [{ level: 'Secondary', school: 'A', course: '', year: '98', undergradLevel: '', yearLastAttended: '', awards: '' }],
    })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors['education[Secondary].year']).toBeTruthy()
  })
})

describe('NSRP validator: row limits and education rules', () => {
  const trainingRow = { course: 'Course', institution: 'School', certificate: '', fromDate: '', toDate: '' }
  const eligibilityRow = { eligibility: 'CSE', rating: '80', examDate: '', license: '', validUntil: '' }
  const workRow = { company: 'Acme', position: 'Clerk', fromDate: '', toDate: '', status: 'Permanent', address: '' }
  const eduRow = (level, i) => ({ level, school: `School${i}`, course: ['Tertiary', 'Graduate Studies'].includes(level) ? 'BS' : '', year: '2010', undergradLevel: '', yearLastAttended: '', awards: '' })

  it.each([
    ['technicalTraining', 4, trainingRow, 3, 2],
    ['eligibility', 3, eligibilityRow, 2, 2],
    ['workExperience', 6, workRow, 5, 3],
  ])('%s with %i rows is a 422 (max %i)', async (section, count, row, max, step) => {
    const rows = Array.from({ length: count }, (_, i) => ({ ...row, course: `${row.course || ''}${i}`, eligibility: `${row.eligibility || ''}${i}`, company: `${row.company || ''}${i}` }))
    const res = await validate(step, { [section]: rows })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors[section]).toBe(`Maximum of ${max} entries.`)
  })

  it('education with 5 rows is a 422 (one per level)', async () => {
    const rows = ['Elementary', 'Secondary', 'Tertiary', 'Graduate Studies', 'Elementary'].map((level, i) => eduRow(level, i))
    const res = await validate(2, { education: rows })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors.education).toBe('Maximum of 4 entries.')
  })

  it('rejects duplicate education levels and requires course for Tertiary', async () => {
    const dup = await validate(2, { education: [eduRow('Tertiary', 1), eduRow('Tertiary', 2)] })
    expect(dup.status).toBe(422)
    expect(dup.body.fieldErrors['education[Tertiary].level']).toBe('Only one entry per level.')

    const noCourse = await validate(2, {
      education: [{ level: 'Tertiary', school: 'A', course: '', year: '2010', undergradLevel: '', yearLastAttended: '', awards: '' }],
    })
    expect(noCourse.status).toBe(422)
    expect(noCourse.body.fieldErrors['education[Tertiary].course']).toBeTruthy()

    // Elementary does not require a course
    const ok = await validate(2, {
      education: [{ level: 'Elementary', school: 'A', course: '', year: '2010', undergradLevel: '', yearLastAttended: '', awards: '' }],
    })
    expect(ok.status).toBe(200)
  })

  it('course is rejected (422) and never saved for Elementary/Secondary', async () => {
    const res = await validate(2, {
      education: [{ level: 'Elementary', school: 'A', course: 'BS Math', year: '2010', undergradLevel: '', yearLastAttended: '', awards: '' }],
    })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors['education[Elementary].course']).toBe('Course applies only to Tertiary and Graduate Studies.')

    // The sanitized answers never carry a course for those levels
    const { answers } = validateNsrpAnswers(validNsrpAnswers({
      email: 'unit@example.com',
      education: [{ level: 'Secondary', school: 'A', course: 'BS Math', year: '2010', undergradLevel: '', yearLastAttended: '', awards: '' }],
    }))
    expect(answers.education[0].course).toBe('')
  })

  it('course is required for Tertiary only when a school is entered', async () => {
    // No school -> course not required even for Tertiary
    const noSchool = await validate(2, {
      education: [{ level: 'Tertiary', school: '', course: '', year: '2010', undergradLevel: '', yearLastAttended: '', awards: '' }],
    })
    expect(noSchool.status).toBe(200)
  })
})

describe('NSRP validator: enums and text patterns (loop, never a 500)', () => {
  it.each([
    ['sex', 'Alien', 0],
    ['civilStatus', 'Complicated', 0],
    ['suffix', 'asdsa', 0],
    ['disability', 'Other', 1],
    ['employmentStatus', 'Freelance', 4],
    ['activelyLooking', 'Maybe', 4],
    ['willingImmediately', 'Later', 4],
    ['fourPs', 'yes', 4],
  ])('%s = %o is rejected at validate-signup and at signup, both 422', async (field, value, step) => {
    const stepRes = await validate(step, { [field]: value })
    expect(stepRes.status).toBe(422)
    expect(stepRes.body.fieldErrors[field]).toBeTruthy()

    const res = await signup(`enum-${field}@example.com`, validNsrpAnswers({ [field]: value }))
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors[field]).toBeTruthy()
  }, 120000)

  it('work experience status is enum-checked', async () => {
    const res = await validate(3, {
      workExperience: [{ company: 'Acme', position: 'Clerk', fromDate: '', toDate: '', status: 'Boss', address: '' }],
    })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors['workExperience[0].status']).toBeTruthy()
  })

  it.each([
    ['firstName', 'Juan123', 0],
    ['surname', '!!!', 0],
    ['placeOfBirth', '<script>', 0],
    ['addressCity', '@#$%^', 1],
  ])('%s with bad characters is a 422', async (field, value, step) => {
    const res = await validate(step, { [field]: value })
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors[field]).toBeTruthy()
  })

  it('names accept ñ, accents, hyphens, apostrophes, and periods', async () => {
    const res = await validate(0, { firstName: 'María', surname: "Peña-Cruz D'Souza", middleName: 'Delos Reyes' })
    expect(res.status).toBe(200)
  })

  it('email is lowercased and spaces removed', async () => {
    const res = await validate(1, { email: '  Juan.Cruz @Gmail.com ' })
    expect(res.status).toBe(200)
    expect(validateNsrpAnswers({ email: '  Juan.Cruz @Gmail.com ' }).answers.email).toBe('juan.cruz@gmail.com')
  })
})

describe('validateNsrpAnswers: conditional clears (unit)', () => {
  it('clears dependent fields when the parent answer does not apply', () => {
    const { answers, fieldErrors } = validateNsrpAnswers(validNsrpAnswers({
      email: 'unit@example.com',
      activelyLooking: 'No', lookingDuration: '2 years',
      willingImmediately: 'Yes', willingWhen: 'next month',
      fourPs: 'No', fourPsId: '1234',
      disability: 'Visual', disabilityOthers: 'something',
    }))
    expect(fieldErrors).toEqual({})
    expect(answers.lookingDuration).toBe('')
    expect(answers.willingWhen).toBe('')
    expect(answers.fourPsId).toBe('')
    expect(answers.disabilityOthers).toBe('')
  })

  it('clears undergrad fields when a graduation year is present', () => {
    const { answers } = validateNsrpAnswers(validNsrpAnswers({
      education: [{ level: 'Secondary', school: 'A', course: '', year: '2010', undergradLevel: '3rd year', yearLastAttended: '2009', awards: '' }],
    }))
    expect(answers.education[0].undergradLevel).toBe('')
    expect(answers.education[0].yearLastAttended).toBe('')
  })
})

describe('signup never 500s on bad values', () => {
  it.each([
    ['letters in TIN', { tin: 'abc' }],
    ['bad phone', { cellphone: '123' }],
    ['future dob', { dob: '2999-01-01' }],
    ['bad enum', { sex: 'Alien' }],
    ['extra training rows', { technicalTraining: Array.from({ length: 4 }, (_, i) => ({ course: `C${i}`, institution: 'X', certificate: '', fromDate: '', toDate: '' })) }],
    ['work From after To', { workExperience: [{ company: 'A', position: 'B', fromDate: '2024-01-01', toDate: '2023-01-01', status: 'Permanent', address: '' }] }],
  ])('%s returns 422 with field errors', async (label, overrides) => {
    const res = await signup(`loop-${label.replace(/\W+/g, '')}@example.com`, validNsrpAnswers(overrides))
    expect(res.status).toBe(422)
    expect(res.body.fieldErrors).toBeTruthy()
  }, 180000)
})
