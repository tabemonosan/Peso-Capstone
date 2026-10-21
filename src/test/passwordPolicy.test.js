// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { validatePassword, isPasswordValid, passwordErrorMessage } from '../utils/passwordPolicy'

describe('password policy', () => {
  it('accepts a valid password', () => {
    expect(isPasswordValid('Password1!')).toBe(true)
  })

  it('accepts all special characters and spaces', () => {
    expect(isPasswordValid('P@ss w0rd!#$%^&*()_+')).toBe(true)
    expect(isPasswordValid('My P@ssw0rd 123')).toBe(true)
    expect(isPasswordValid('~`|;:,.<>?/\\"\'[]{}Aa1')).toBe(true)
  })

  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Aa1!')).toContain('minLength')
    expect(isPasswordValid('Aa1!wxyz')).toBe(true) // exactly 8 passes
  })

  it('rejects passwords longer than 64 characters (bcrypt 72-byte safety)', () => {
    const tooLong = 'Aa1!' + 'x'.repeat(61)
    expect(validatePassword(tooLong)).toContain('maxLength')
    expect(validatePassword('Aa1!' + 'x'.repeat(60))).toHaveLength(0) // exactly 64 passes
  })

  it('requires an uppercase letter', () => {
    expect(validatePassword('password1!')).toContain('uppercase')
  })

  it('requires a lowercase letter', () => {
    expect(validatePassword('PASSWORD1!')).toContain('lowercase')
  })

  it('requires a number', () => {
    expect(validatePassword('Password!')).toContain('number')
  })

  it('requires a symbol or space', () => {
    expect(validatePassword('Password1')).toContain('symbol')
    expect(validatePassword('Password 1')).toHaveLength(0) // space counts as symbol
  })

  it('lists every failed rule at once', () => {
    const failed = validatePassword('abc')
    expect(failed).toEqual(expect.arrayContaining(['minLength', 'uppercase', 'number', 'symbol']))
  })

  it('returns a server error message naming the failed rules', () => {
    const message = passwordErrorMessage('abc')
    expect(message).toMatch(/At least 8 characters/)
    expect(message).toMatch(/One uppercase letter/)
    expect(passwordErrorMessage('ValidPass1!')).toBeNull()
  })
})
