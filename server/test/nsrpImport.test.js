// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import jwt from 'jsonwebtoken'
import { generateNsrpPdf } from '../nsrpPdf.js'
import { readNsrpPdf } from '../services/nsrpImportReader.js'
import { extractNsrp, importProof, reviewedImport } from '../services/nsrpImport.js'
import { mergeNsrpIntoProfile, sanitizeNsrpImport, nsrpImportDate } from '../../shared/nsrpImport.js'

describe('completed NSRP import', () => {
  it('retrieves standard PDF text, education and actual marked skills through the isolated reader', async () => {
    const input = { surname: 'Cruz', firstName: 'Juan', middleName: 'Santos', dob: '1990-06-11', addressCity: 'Manito', addressProvince: 'Albay', cellphone: '09171234567', sex: 'Male', skills: ['Embroidery', 'Gardening'], education: [{ level: 'Tertiary', school: 'Example College', course: 'BSIT', year: '2012' }], technicalTraining: [{ course: 'Cooking', institution: 'Example Institute', fromDate: '2020-01-01', toDate: '2020-06-01' }], workExperience: [{ company: 'Example Company', position: 'Cook', fromDate: '2021-01-01', toDate: '2022-02-01', status: 'Contractual' }] }
    const result = await extractNsrp(await generateNsrpPdf(input))
    expect(result.method).toBe('standard-form')
    expect(result.answers).toMatchObject({ firstName: 'Juan', surname: 'Cruz', dob: '1990-06-11', sex: 'Male', skills: ['Embroidery', 'Gardening'], education: [{ level: 'Tertiary', school: 'EXAMPLE COLLEGE', course: 'BSIT', year: '2012' }], technicalTraining: [{ course: 'COOKING', institution: 'EXAMPLE INSTITUTE', fromDate: '01/01/20', toDate: '06/01/20' }], workExperience: [{ company: 'EXAMPLE COMPANY', position: 'COOK', fromDate: '01/01/21', toDate: '02/01/22', status: 'CONTRACTUAL' }] })
    expect(result.answers).not.toHaveProperty('certified')
    expect(result.answers).not.toHaveProperty('signatureDataUrl')
  }, 60000)
  it('rejects a blank template rather than importing printed labels or unchecked skills', async () => {
    await expect(readNsrpPdf(await readFile('public/NSRP-Form-1-Jobseeker-Reg-Form.pdf'))).rejects.toThrow('No completed NSRP')
  }, 30000)
  it('reads labelled values conservatively from another layout', async () => {
    const doc = await PDFDocument.create(), page = doc.addPage(), font = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('First name: Maria\nSurname: Cruz\nDate of birth: 06/11/1990', { x: 30, y: 700, font, size: 12 })
    const result = await readNsrpPdf(Buffer.from(await doc.save()))
    expect(result.answers).toMatchObject({ firstName: 'Maria', surname: 'Cruz', dob: '1990-06-11', skills: [] })
    expect(result.method).toBe('partial')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
  it('rejects malformed and oversized input', async () => {
    await expect(readNsrpPdf(Buffer.from('not a PDF'))).rejects.toThrow()
    await expect(readNsrpPdf(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow()
  })
  it('binds reviewed details to the owner, exact PDF, purpose and expiry', () => {
    const file = Buffer.from('pdf'), answers = { firstName: 'Maria' }, secret = 'test-secret'
    const token = importProof(secret, 'owner', file, answers)
    expect(reviewedImport(secret, token, 'owner', file)).toEqual(answers)
    expect(() => reviewedImport(secret, token, 'other', file)).toThrow()
    expect(() => reviewedImport(secret, token, 'owner', Buffer.from('changed'))).toThrow()
    expect(() => reviewedImport(secret, jwt.sign({ purpose: 'nsrp-import', owner: 'owner' }, secret, { expiresIn: -1 }), 'owner', file)).toThrow()
    expect(() => reviewedImport(secret, token + 'x', 'owner', file)).toThrow()
  })
  it('preserves edits and identity, fills blanks and deduplicates qualifications', () => {
    const existing = { firstName: 'Edited', lastName: 'Cruz', dob: '1990-01-01', summary: 'My personal bio', traits: 'Patient', profileImage: 'image', skills: ['Gardening'], education: [{ level: 'Tertiary', school: 'Example', course: 'Edited' }] }
    const imported = { firstName: 'Juan', surname: 'Cruz', dob: '1990-06-11', cellphone: '09171234567', skills: ['Gardening', 'Embroidery'], education: [{ level: 'Tertiary', school: 'Example', course: 'Original' }] }
    const result = mergeNsrpIntoProfile(existing, imported)
    expect(result).toMatchObject({ ...existing, phone: imported.cellphone, skills: ['Gardening', 'Embroidery'], nsrp: { firstName: 'Edited', surname: 'Cruz', dob: '1990-01-01' } })
    expect(mergeNsrpIntoProfile(result, imported)).toEqual(result)
  })
  it('drops invalid enums, unknown keys, signatures and malformed arrays', () => {
    expect(sanitizeNsrpImport({ firstName: 'Maria', sex: 'Unknown', skills: 'Gardening', education: 'bad', certified: true, signatureDataUrl: 'image', password: 'secret' }).answers).toEqual({ firstName: 'Maria', education: [], technicalTraining: [], workExperience: [], eligibility: [], skills: [] })
    expect(nsrpImportDate('02/30/2000')).toBe('')
  })
})
