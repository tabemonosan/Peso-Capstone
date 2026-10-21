// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { normalizeEmail, generateVerifyToken, hashVerifyToken } from '../../server/utils/emailVerification.js'

describe('normalizeEmail', () => {
  it('lowercases and trims any domain', () => {
    expect(normalizeEmail('  Juan.DelaCruz@Yahoo.COM ')).toBe('juan.delacruz@yahoo.com')
  })

  it('collapses gmail dots and +tags', () => {
    expect(normalizeEmail('Juan.DelaCruz+jobs@gmail.com')).toBe('juandelacruz@gmail.com')
    expect(normalizeEmail('j.u.a.n@gmail.com')).toBe('juan@gmail.com')
  })

  it('treats googlemail.com as gmail.com', () => {
    expect(normalizeEmail('juan+work@googlemail.com')).toBe('juan@gmail.com')
  })

  it('does NOT strip dots or tags on other domains', () => {
    expect(normalizeEmail('juan.delacruz+work@outlook.com')).toBe('juan.delacruz+work@outlook.com')
  })

  it('handles invalid input safely', () => {
    expect(normalizeEmail('')).toBe('')
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail('not-an-email')).toBe('not-an-email')
  })
})

describe('verification tokens', () => {
  it('stores a SHA-256 hash that differs from the raw token', () => {
    const raw = generateVerifyToken()
    const hash = hashVerifyToken(raw)
    expect(raw).toHaveLength(64) // 32 bytes hex
    expect(hash).toHaveLength(64)
    expect(hash).not.toBe(raw)
  })

  it('the same raw token reproduces the stored hash on lookup', () => {
    const raw = generateVerifyToken()
    expect(hashVerifyToken(raw)).toBe(hashVerifyToken(raw))
    expect(hashVerifyToken(raw)).not.toBe(hashVerifyToken(generateVerifyToken()))
  })
})
