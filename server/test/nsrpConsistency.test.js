// @vitest-environment node
import { it, expect } from 'vitest'
import { checkNsrp } from '../../shared/nsrpChecks.js'
import { checkNsrp2 } from '../../shared/nsrp2Checks.js'
import { manualReason } from '../services/nsrpAutomation.js'
const base = { firstName: 'Juan', surname: 'Ng', cellphone: '09171234567', occupation1: 'Clerk', employmentStatus: 'Unemployed', dob: '1950-01-01' }
const codes = value => checkNsrp({ ...base, ...value }, { today: '2026-11-03' }).findings.map(f => f.code)
it.each(['Ng', 'Wu', "O’Neill", 'de la Cruz', 'Muñoz', '李'])('accepts legitimate name %s', surname => expect(codes({ surname })).not.toContain('junk_surname'))
it.each(['test', 'xxxx', 'asdf', 'Ab12'])('finds junk name %s without storing it', firstName => {
 const report = checkNsrp({ ...base, firstName }); expect(report.findings.some(f => f.code === 'junk_firstName')).toBe(true)
 expect(JSON.stringify(report.findings)).not.toContain(firstName)
})
it('accepts an older applicant and a late graduate', () => expect(codes({ education: [{ level: 'Tertiary', year: '2025' }] })).toEqual([]))
it('checks education chronology and treats age as advisory', () => {
 expect(codes({ dob: '2005-01-01', education: [{ level: 'Elementary', year: '2010' }, { level: 'Secondary', year: '2009' }, { level: 'Tertiary', year: '2030' }] })).toEqual(expect.arrayContaining(['education_age', 'education_order', 'education_future']))
 const report = checkNsrp({ ...base, dob: '2010-01-01', education: [{ level: 'Elementary', year: '2011' }] })
 expect(report.findings.find(f => f.code === 'education_age').approvalBlocking).toBe(false)
 expect(manualReason({ sourceType: 'generated', version: 1, emailVerified: true, enabledAtCreation: true, enabled: true, report })).toBe('')
})
it('checks dates and full time overlap, tolerating part time overlap', () => {
 const rows = [{ fromDate: '2020-01-01', toDate: 'Present', status: 'Permanent' }, { fromDate: '2021-01-01', toDate: '2022-01-01', status: 'Part-time' }]
 expect(codes({ workExperience: rows })).not.toContain('overlapping_full_time')
 expect(codes({ workExperience: rows.map(r => ({ ...r, status: 'Permanent' })) })).toContain('overlapping_full_time')
 expect(codes({ workExperience: rows })).toContain('unemployed_present_job')
 expect(codes({ workExperience: [{ fromDate: '1960-01-01', toDate: '2027-01-01' }] })).toEqual(expect.arrayContaining(['work_start_age', 'workExperience_future_end', 'experience_age']))
})
it('checks salary, height, identifiers, location and disposable mail', () => expect(codes({ height: '12', expectedSalary: '-1', tin: '123456789', cellphone: '11111111111', addressCity: 'Legazpi', addressProvince: 'Cebu', email: 'a@mailinator.com' })).toEqual(expect.arrayContaining(['height_range', 'salary_range', 'tin_repeated_digits', 'cellphone_repeated_digits', 'location_pair', 'disposable_email'])))
it('checks Form 2 junk, title, mobile, government mail and agency information', () => {
 const input = { companyName: 'asdf', contactName: 'test', phone: '123', email: 'demo@gmail.com', registrationDetails: { employerType: 'Government', workforceSize: 'Micro', lineOfBusiness: 'xxx', contactTitle: 'Others', taxIdentificationNumber: '999999999', cityMunicipality: 'Legazpi City', province: 'Cebu' } }
 expect(checkNsrp2(input).findings.map(f => f.code)).toEqual(expect.arrayContaining(['junk_companyName', 'junk_contactName', 'junk_lineOfBusiness', 'tin_repeated_digits', 'employer_mobile', 'contact_title_other', 'government_free_email', 'employer_location_pair']))
 expect(checkNsrp2({ ...input, registrationDetails: { ...input.registrationDetails, employerType: 'Recruitment & Placement Agency (Local)' } }).findings).toContainEqual(expect.objectContaining({ code: 'agency_manual_license', severity: 'info' }))
})
