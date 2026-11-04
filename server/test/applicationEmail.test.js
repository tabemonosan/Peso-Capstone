// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { validApplicationEmail } from '../../shared/jobApplication.js'
import { validateApplicationEmail } from '../services/applicationEmail.js'

describe('application contact email', () => {
  it.each(['person@gmail.com', 'first.last+jobs@company.com.ph', "o'brien@example.org", 'person@company.technology'])('accepts valid format %s', (email) => {
    expect(validApplicationEmail(email)).toBe(true)
  })
  it.each(['person', 'person@@gmail.com', 'person@gmail', 'person@-gmail.com', 'person@gmail_.com', '.person@gmail.com', 'person.@gmail.com', 'per..son@gmail.com', 'person@gmail..com', 'per son@gmail.com', 'person@gmail.123', 'person@gmail.com.', 'a'.repeat(65) + '@gmail.com'])('rejects malformed format %s', (email) => {
    expect(validApplicationEmail(email)).toBe(false)
  })
  it('rejects the screenshot typo using its mail domain, without probing the mailbox', async () => {
    const lookup = vi.fn(async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }) })
    const result = await validateApplicationEmail('akoyuki95@gmail.comsds', lookup)
    expect(result).toMatchObject({ valid: false, status: 403, code: 'INVALID_APPLICATION_EMAIL' })
    expect(lookup).toHaveBeenCalledWith('gmail.comsds')
  })
  it('accepts a domain with mail records and normalizes surrounding whitespace', async () => {
    const lookup = vi.fn(async () => [{ priority: 5, exchange: 'mail.example.org' }])
    expect(await validateApplicationEmail(' Person@Example.org ', lookup)).toEqual({ valid: true })
    expect(lookup).toHaveBeenCalledWith('example.org')
  })
  it.each([{ records: [] }, { records: [{ priority: 0, exchange: '.' }] }])('rejects missing or null mail records %j', async ({ records }) => {
    expect(await validateApplicationEmail('person@example.org', async () => records)).toMatchObject({ valid: false, status: 403 })
  })
  it('handles temporary DNS failures as retryable validation errors', async () => {
    const result = await validateApplicationEmail('person@example.org', async () => { throw Object.assign(new Error(), { code: 'ETIMEOUT' }) })
    expect(result).toMatchObject({ valid: false, status: 409, code: 'EMAIL_CHECK_UNAVAILABLE' })
  })
})
