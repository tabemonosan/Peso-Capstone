// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { consistencyIssues, waitlistIssueMessage } from '../../shared/consistencyWaitlist.js'
const docs = comparison => ({ birthCertificate: { versions: [{ version: 1, imageComparisons: [comparison] }] } })
describe('waitlist evidence policy', () => {
  it.each([
    ['surname', 'name'], ['firstName', 'name'], ['dob', 'birth date'], ['idNumber', 'ID number'],
  ])('accepts only significant independent %s evidence', (field, fieldGroup) => {
    const comparison = { ruleId: `cross_birth_nsrp_${field}`, fieldGroup, result: 'significant', evidence: 'independent', reliable: true }
    expect(consistencyIssues(docs(comparison))).toHaveLength(1)
    expect(consistencyIssues(docs({ ...comparison, evidence: 'self-declared' }))).toHaveLength(0)
    expect(consistencyIssues(docs({ ...comparison, reliable: false }))).toHaveLength(0)
    expect(consistencyIssues(docs({ ...comparison, result: 'minor' }))).toHaveLength(0)
    expect(consistencyIssues(docs({ ...comparison, result: 'could_not_read' }))).toHaveLength(0)
  })
  it.each(['sex', 'religion', 'disability', 'civilStatus', 'address', 'placeOfBirth', 'middleName'])('never waitlists for %s', field => {
    expect(consistencyIssues(docs({ ruleId: `cross_birth_nsrp_${field}`, fieldGroup: field, result: 'significant', evidence: 'independent', reliable: true }))).toEqual([])
  })
  it('does not copy arbitrary values from comparison payloads into issues', () => {
    const issue = consistencyIssues(docs({ ruleId: 'cross_birth_nsrp_dob', fieldGroup: 'birth date', result: 'significant', evidence: 'independent', reliable: true, text: 'SAMPLE PRIVATE TEXT', left: 'SAMPLE VALUE', right: 'SAMPLE VALUE' }))[0]
    expect(JSON.stringify(issue)).not.toMatch(/PRIVATE|VALUE|text|left|right/)
    expect(waitlistIssueMessage({ reasonCode: 'staff_review' })).toBe('Your account needs a review by PESO staff.')
  })
})
