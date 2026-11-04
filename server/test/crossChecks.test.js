// @vitest-environment node
import { it, expect } from 'vitest'
import { crossChecks, compareName, compareDate, extractDocumentFields } from '../../shared/crossChecks.js'
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
it('never gives self-declared data independent evidence or an attention level', () => {
 const report = crossChecks({ nsrp: { surname: 'Cruz', firstName: 'Juan', dob: '1990-01-01' }, birth: { values: { surname: 'Rivera', firstName: 'Pedro', dob: '2000-01-01' }, evidence: 'self-declared' } })
 expect(report.level).not.toBe('needs attention'); expect(report.independentComparisons).toBe(0)
 const independent = crossChecks({ nsrp: { dob: '1990-01-01' }, birth: { values: { dob: '2000-01-01' }, evidence: 'independent' } })
 expect(independent.level).toBe('needs attention')
 expect(JSON.stringify(independent)).not.toMatch(/1990|2000/)
})
it('handles the married-name pattern without using sex or civil status to add flags', () => {
 const nsrp = { firstName: 'Maria', surname: 'Cruz', middleName: 'Santos', sex: 'Female', civilStatus: 'Married' }
 const report = crossChecks({ nsrp, birth: { values: { surname: 'Santos', firstName: 'Maria' }, evidence: 'independent' }, ids: [{ values: { surname: 'Reyes', firstName: 'Maria' }, evidence: 'independent' }] })
 expect(report.findings.some(f => f.ruleId === 'cross_married_name' && f.severity === 'info')).toBe(true)
 expect(report.level).not.toBe('needs attention')
})
it('handles comma name order and mononyms, and ignores addresses', () => {
 expect(crossChecks({ nsrp: { surname: 'Cruz', firstName: 'Juan', middleName: 'Santos' }, birth: { values: { fullName: 'CRUZ, JUAN SANTOS', address: 'Different' }, evidence: 'independent' } }).level).toBe('consistent')
 expect(crossChecks({ nsrp: { firstName: 'Prince' }, birth: { values: { fullName: 'Prince' }, evidence: 'independent' } }).findings.some(f => f.ruleId === 'cross_mononym')).toBe(true)
 expect(extractDocumentFields('Surname: Cruz\nFirst Name: Juan\nDate of Birth: 1990-01-01\nAddress: Do not extract')).toEqual({ surname: 'Cruz', firstName: 'Juan', dob: '1990-01-01' })
})
