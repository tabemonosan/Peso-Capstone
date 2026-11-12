// @vitest-environment node
import { it, expect } from 'vitest'
import { crossChecks, compareName, compareDate, dateParts, extractDocumentFields } from '../../shared/crossChecks.js'
it.each([['Ma.', 'Maria'], ['Dela Cruz', 'de la Cruz'], ['Sto. Tomas', 'Santo Tomas'], ['Muñoz', 'Munoz'], ["O'Neil", 'ONeil']])('normalizes %s and %s', (a, b) => expect(compareName(a, b)).toBe('match'))
it('handles initials, absent middle names, tolerances, and meaningful differences', () => {
 expect(compareName('S', 'Santos', { middle: true })).toBe('match')
 expect(compareName('NMN', 'Santos', { middle: true })).toBe('info')
 expect(compareName('Maria', 'Maira')).toBe('significant')
 expect(compareName('Eliseo', 'Elisea')).toBe('minor')
 expect(compareName('Santos', 'Rivera')).toBe('significant')
})
it('normalizes dates and recognizes swapped day/month', () => {
 expect(compareDate('1990-04-12', '12/04/1990')).toBe('match')
 expect(compareDate('1990-04-12', '04/12/1990')).toBe('minor')
 expect(compareDate('1990-04-12', '1991-04-12')).toBe('significant')
})
it.each(['Asia/Manila', 'UTC', 'America/Los_Angeles'])('compares calendar birth dates without timezone shifts in %s', timezone => {
 const previous = process.env.TZ
 try {
  process.env.TZ = timezone
  for (const value of ['November 1, 2005', 'November 1, 2005 (2005-11-01)', 'Nov. 1, 2005', '1 November 2005', '2005-11-01']) {
   expect(dateParts(value)).toEqual([2005, 11, 1])
   expect(compareDate(value, '2005-11-01')).toBe('match')
  }
 } finally {
  if (previous === undefined) delete process.env.TZ
  else process.env.TZ = previous
 }
})
it.each(['2005-02-29', '31/11/2005', 'February 30, 2005', 'November 1, 2005 (2005-11-02)', 'not a date'])('treats invalid or conflicting dates as unreadable: %s', value => {
 expect(dateParts(value)).toBeNull()
 expect(compareDate(value, '2005-11-01')).toBe('could_not_read')
})
it('never gives self-declared data independent evidence or an attention level', () => {
 const report = crossChecks({ nsrp: { surname: 'Cruz', firstName: 'Juan', dob: '1990-01-01' }, ids: [{ values: { surname: 'Rivera', firstName: 'Pedro', dob: '2000-01-01' }, evidence: 'self-declared' }] })
 expect(report.level).not.toBe('needs attention'); expect(report.independentComparisons).toBe(0)
 const independent = crossChecks({ nsrp: { firstName: 'Juan', surname: 'Cruz' }, ids: [{ values: { firstName: 'Pedro', surname: 'Rivera' }, evidence: 'independent' }] })
 expect(independent.level).toBe('needs attention')
 expect(JSON.stringify(independent)).not.toMatch(/1990|2000/)
})
it('flags an ID surname difference using NSRP alone', () => {
 const nsrp = { firstName: 'Maria', surname: 'Cruz', middleName: 'Santos', sex: 'Female', civilStatus: 'Married' }
 const report = crossChecks({ nsrp, ids: [{ values: { surname: 'Santos', firstName: 'Maria' }, evidence: 'independent' }] })
 expect(report.comparisons.some(f => f.fieldGroup === 'name' && f.result === 'significant')).toBe(true)
 expect(report.level).toBe('needs attention')
})
it('handles comma name order and mononyms, and ignores addresses', () => {
 expect(crossChecks({ nsrp: { surname: 'Cruz', firstName: 'Juan', middleName: 'Santos' }, ids: [{ values: { fullName: 'CRUZ, JUAN SANTOS', address: 'Different' }, evidence: 'independent' }] }).level).toBe('consistent')
 expect(crossChecks({ nsrp: { firstName: 'Prince', mononym: true }, ids: [{ values: { fullName: 'Prince' }, evidence: 'independent' }] }).comparisons[0].result).toBe('match')
 expect(extractDocumentFields('Surname: Cruz\nFirst Name: Juan\nDate of Birth: 1990-01-01\nAddress: Do not extract')).toEqual({ surname: 'Cruz', firstName: 'Juan', dob: '1990-01-01' })
})
it('keeps birthplace and ID-number differences advisory for automatic approval', () => {
 const nsrp = { firstName: 'Eliseo', surname: 'Dioneda', dob: '2003-06-11', placeOfBirth: 'NAGOTGOT, MANITO, ALBAY', idNumber: '4982761053' }
 const report = crossChecks({ nsrp, ids: [{ values: { ...nsrp, placeOfBirth: 'NAGOTGOT, MANTIO, ALBAY', idNumber: '1234567890' }, evidence: 'independent' }] })
 const otherFields = report.findings.filter(f => ['placeOfBirth', 'ID number'].includes(f.fieldGroup))
 expect(otherFields).toEqual([])
 expect(otherFields.every(f => f.approvalBlocking === false)).toBe(true)
})

it('compares only IDs with NSRP even when a mismatching birth certificate is supplied', () => {
 const nsrp = { firstName: 'Maria', surname: 'Cruz', dob: '1990-04-12' }
 const report = crossChecks({ nsrp, birth: { values: { firstName: 'Different', surname: 'Person', dob: '1980-02-03' }, evidence: 'independent' }, ids: [{ values: nsrp, evidence: 'independent' }] })
 expect(report.comparisons.length).toBeGreaterThan(0)
 expect(report.comparisons.every(item => item.ruleId.startsWith('cross_id_'))).toBe(true)
 expect(report.level).toBe('consistent')
 expect(crossChecks({ nsrp, birth: { values: {}, evidence: 'independent' } }).comparisons).toEqual([])
})

it('extracts comparison fields from common ID labels with varied separators', () => {
 expect(extractDocumentFields('LAST NAME SANTOS\nGiven Name: MARIA\nDOB 1990-04-12\nDriver?s License No. D12-34-567890\nGender: Female')).toMatchObject({ surname: 'SANTOS', firstName: 'MARIA', dob: '1990-04-12', idNumber: 'D12-34-567890', sex: 'Female' })
})

it('extracts comma-formatted Driver license name under a shared name header', () => { expect(extractDocumentFields('Last Name, First Name, Middle Name\nSAMONTE, ICY DMITRI NAGRAMPA')).toMatchObject({ fullName: 'SAMONTE, ICY DMITRI NAGRAMPA' }) })

it('extracts the driver-license layout from the applicant OCR preview', () => { expect(extractDocumentFields('a Last Name, First Name. Middle Name\nlw SAMONTE, ICY DMITRI NAGRAMPA\nho by Sax oni Weight tke) Height(m)')).toMatchObject({ fullName: 'SAMONTE, ICY DMITRI NAGRAMPA' }) })
