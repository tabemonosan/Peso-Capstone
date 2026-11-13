// @vitest-environment node
import { expect, it } from 'vitest'
import { checkIdName } from '../../shared/idNameChecks.js'
const nsrp = { firstName: 'Juan Miguel', surname: 'Dela Cruz', middleName: 'Santos', dob: '1990-01-01' }
const text = 'Last Name, First Name, Middle Name\nDELA CRUZ, JUAN MIGUEL SANTOS\nDate of Birth: 2001-02-03'
it('matches the complete name without requiring ID type, date or number', () => {
 const report = checkIdName(text, 95, nsrp)
 expect(report.comparisons).toEqual([{ ruleId: 'cross_id_nsrp_name', fieldGroup: 'name', result: 'match', evidence: 'independent', reliable: true }])
 expect(report.findings).toEqual([])
})
it('uses name-line confidence when unrelated page text has low confidence', () => {
 expect(checkIdName(text, 40, nsrp, { lines: [{ text: 'DELA CRUZ, JUAN MIGUEL SANTOS', confidence: 92 }] }).comparisons[0].result).toBe('match')
 expect(checkIdName(text, 95, nsrp, { lines: [{ text: 'DELA CRUZ, JUAN MIGUEL SANTOS', confidence: 30 }] }).comparisons[0]).toMatchObject({ result: 'could_not_read', reliable: false })
})
it('requires both given and family names and flags readable differences', () => {
 expect(checkIdName('First name: Juan Miguel', 95, nsrp).comparisons[0].result).toBe('could_not_read')
 expect(checkIdName('First name: Pedro\nSurname: Rivera', 95, nsrp).findings[0]).toMatchObject({ severity: 'critical', fieldGroup: 'name' })
})
it('never persists extracted identity text in its report', () => {
 expect(JSON.stringify(checkIdName(text, 95, nsrp))).not.toMatch(/Juan|Miguel|Cruz|1990|2001/i)
})

it('preserves lowercase surname particles in a combined name row', () => {
 const report = checkIdName('Last Name, First Name, Middle Name\nde la Cruz, JUAN MIGUEL SANTOS', 95, { ...nsrp, surname: 'de la Cruz' })
 expect(report.comparisons[0].result).toBe('match')
})

it.each(['Last Name', 'Lest Name', 'Family Name'])('reads a compressed-upload name row under %s with edge noise', label => {
 const nameRow = 'a DELA CRUZ, JUAN MIGUEL SANTOS :'
 const text = `${label}, First Name. Middle Name\n${nameRow}`
 const report = checkIdName(text, 51, nsrp, { lines: [{ text: nameRow, confidence: 73 }] })
 expect(report.comparisons[0]).toMatchObject({ result: 'match', reliable: true })
 expect(report.findings).toEqual([])
})
it('keeps a readable different name flagged despite header and edge noise', () => {
 const nameRow = 'a RIVERA, PEDRO SANTOS :'
 const report = checkIdName(`Lest Name, First Name. Middle Name\n${nameRow}`, 51, nsrp, { lines: [{ text: nameRow, confidence: 73 }] })
 expect(report.findings[0]).toMatchObject({ severity: 'critical', fieldGroup: 'name' })
})

it.each(['III', 'ill'])('matches a license suffix %s before the middle name', suffix => {
 const nameRow = `DELA CRUZ, JUAN MIGUEL ${suffix} SANTOS`
 const report = checkIdName(`Last Name, First Name, Middle Name\n${nameRow}`, 51,
   { ...nsrp, suffix: 'III' }, { lines: [{ text: nameRow, confidence: 81 }] })
 expect(report.comparisons[0]).toMatchObject({ result: 'match', reliable: true })
 expect(report.findings).toEqual([])
})

it('keeps a changed family name flagged when a suffix is relocated', () => {
 const report = checkIdName('Last Name, First Name, Middle Name\nRIVERA, JUAN MIGUEL ill SANTOS', 81, { ...nsrp, suffix: 'III' })
 expect(report.findings[0]).toMatchObject({ severity: 'critical', fieldGroup: 'name' })
})

it.each(['III', 'ill'])('reads PhilSys bilingual fields with suffix %s in Given Names', suffix => {
 const name = `JUAN MIGUEL ${suffix}`
 const text = `Apelyido/Last Name\nDELA CRUZ\nMga Pangalan/Given Names\n${name}\nGitnang Apelyido/Middle Name\nSANTOS`
 const metadata = { lines: [{ text: 'DELA CRUZ', confidence: 91 }, { text: name, confidence: 72 }, { text: 'SANTOS', confidence: 89 }] }
 const report = checkIdName(text, 52, { ...nsrp, suffix: 'III' }, metadata)
 expect(report.comparisons[0]).toMatchObject({ result: 'match', reliable: true })
 expect(report.findings).toEqual([])
 expect(JSON.stringify(report)).not.toMatch(/Juan|Miguel|Cruz|Santos/i)
})
it('keeps different PhilSys names flagged and low-confidence middle names unreadable', () => {
 const reference = { ...nsrp, suffix: 'III' }
 const text = 'Surname: RIVERA\nFirst name: JUAN MIGUEL III\nMiddle name: SANTOS'
 expect(checkIdName(text, 90, reference).findings[0]).toMatchObject({ severity: 'critical' })
 const metadata = { lines: [{ text: 'RIVERA', confidence: 91 }, { text: 'JUAN MIGUEL III', confidence: 72 }, { text: 'SANTOS', confidence: 30 }] }
 expect(checkIdName(text, 90, reference, metadata).comparisons[0]).toMatchObject({ result: 'could_not_read', reliable: false })
})
