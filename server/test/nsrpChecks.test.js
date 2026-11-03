// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { checkNsrp, NSRP_RULES_VERSION } from '../../shared/nsrpChecks.js'
import { checkNsrp2 } from '../../shared/nsrp2Checks.js'
import { manualReason } from '../services/nsrpAutomation.js'

const input = { firstName: 'Juan', surname: 'Cruz', cellphone: '09171234567', occupation1: 'Clerk', employmentStatus: 'Unemployed' }
describe('NSRP data checks and eligibility', () => {
  it('does not use protected demographic or address values', () => {
    const report = checkNsrp(input)
    for (const field of ['dob', 'sex', 'religion', 'disability', 'civilStatus', 'addressCity', 'addressBarangay', 'addressProvince']) {
      expect(checkNsrp({ ...input, [field]: 'any different value' })).toEqual(report)
    }
  })
  it('marks reversed work/training dates and implausible repeated identifiers for manual review', () => {
    expect(checkNsrp({ ...input, tin: '111111111', workExperience: [{ fromDate: '2025-01-01', toDate: '2024-01-01' }] })).toMatchObject({ level: 'review', summary: { warning: 2, critical: 0 } })
  })
  it('keeps findings free of submitted values', () => {
    const report = checkNsrp2({ companyName: 'Secret Company', phone: '09171234567', registrationDetails: {} })
    expect(JSON.stringify(report)).not.toMatch(/Secret Company|09171234567/)
  })
  it('accepts informational findings and rejects stale rules or unresolved duplicates', () => {
    const eligibility = { sourceType: 'generated', version: 1, emailVerified: true, enabledAtCreation: true, enabled: true,
      report: { rulesVersion: NSRP_RULES_VERSION, level: 'clear', summary: { warning: 0, critical: 0, info: 1 }, findings: [{ code: 'informational', severity: 'info' }] } }
    expect(manualReason(eligibility)).toBe('')
    expect(manualReason({ ...eligibility, report: { ...eligibility.report, rulesVersion: 'old' } })).toBe('Needs attention')
    expect(manualReason({ ...eligibility, report: { ...eligibility.report, findings: [{ code: 'cross_account_duplicate', severity: 'info' }] } })).toBe('Needs attention')
  })
})
