import { describe, it, expect } from 'vitest'
import {
  sanitizeName,
  capitalizeName,
  validateNameField,
  validateNameFields,
  splitFullName,
  formatFullName,
  formatDisplayName,
} from '../../shared/nameFields.js'

describe('sanitizeName', () => {
  it('trims and collapses repeated spaces', () => {
    expect(sanitizeName('  Juan   Dela   Cruz  ')).toBe('Juan Dela Cruz')
    expect(sanitizeName('')).toBe('')
    expect(sanitizeName(null)).toBe('')
  })
})

describe('validateNameField', () => {
  it('accepts valid names', () => {
    expect(validateNameField('Ma. Cristina', { label: 'First name' })).toBe('')
    expect(validateNameField('de la Cruz', { label: 'Last name' })).toBe('')
    expect(validateNameField("O'Brien", { label: 'Last name' })).toBe('')
    expect(validateNameField('Ñoño', { label: 'First name' })).toBe('')
    expect(validateNameField('Mary-Ann', { label: 'First name' })).toBe('')
    expect(validateNameField('José', { label: 'First name' })).toBe('')
  })

  it('rejects digits and other symbols', () => {
    expect(validateNameField('Juan3', { label: 'First name' })).toMatch(/only contain/)
    expect(validateNameField('Juan_Cruz', { label: 'Last name' })).toMatch(/only contain/)
    expect(validateNameField('Juan@Cruz', { label: 'Last name' })).toMatch(/only contain/)
  })

  it('rejects empty required fields but allows empty optional fields', () => {
    expect(validateNameField('', { label: 'First name', required: true })).toMatch(/required/)
    expect(validateNameField('   ', { label: 'First name', required: true })).toMatch(/required/)
    expect(validateNameField('', { label: 'Middle name', required: false })).toBe('')
  })

  it('enforces the 50 character limit', () => {
    expect(validateNameField('A'.repeat(51), { label: 'First name' })).toMatch(/50/)
    expect(validateNameField('A'.repeat(50), { label: 'First name' })).toBe('')
  })
})

describe('capitalizeName', () => {
  it('capitalizes each word', () => {
    expect(capitalizeName('juan cruz')).toBe('Juan Cruz')
    expect(capitalizeName('MA. CRISTINA')).toBe('Ma. Cristina')
  })

  it('keeps particles lowercase in "de la Cruz"', () => {
    expect(capitalizeName('DE LA CRUZ')).toBe('de la Cruz')
  })

  it("capitalizes after apostrophes and hyphens", () => {
    expect(capitalizeName("o'brien")).toBe("O'Brien")
    expect(capitalizeName('mary-ann')).toBe('Mary-Ann')
  })
})

describe('validateNameFields', () => {
  it('returns normalized values and no errors for valid input', () => {
    const { values, fieldErrors } = validateNameFields({ firstName: ' juan ', middleName: 'santos', lastName: 'dela cruz', suffix: 'Jr.' })
    expect(fieldErrors).toEqual({})
    expect(values).toEqual({ firstName: 'Juan', middleName: 'Santos', lastName: 'Dela Cruz', suffix: 'Jr.' })
  })

  it('requires first and last name', () => {
    const { fieldErrors } = validateNameFields({ firstName: '', lastName: '' })
    expect(fieldErrors.firstName).toMatch(/required/)
    expect(fieldErrors.lastName).toMatch(/required/)
  })

  it('skips middle name checks when "no middle name" is set', () => {
    const { values, fieldErrors } = validateNameFields({ firstName: 'Juan', middleName: '123', lastName: 'Cruz' }, { noMiddleName: true })
    expect(fieldErrors.middleName).toBeUndefined()
    expect(values.middleName).toBe('')
  })

  it('rejects unknown suffixes', () => {
    const { fieldErrors } = validateNameFields({ firstName: 'Juan', lastName: 'Cruz', suffix: 'Esq.' })
    expect(fieldErrors.suffix).toBeTruthy()
  })
})

describe('formatFullName', () => {
  it('formats with and without middle name and suffix', () => {
    expect(formatFullName({ firstName: 'Juan', middleName: 'Santos', lastName: 'Cruz', suffix: 'Jr.' })).toBe('Juan Santos Cruz Jr.')
    expect(formatFullName({ firstName: 'Juan', middleName: '', lastName: 'Cruz', suffix: '' })).toBe('Juan Cruz')
    expect(formatFullName({ firstName: 'Juan', lastName: 'Cruz', suffix: 'III' })).toBe('Juan Cruz III')
  })

  it('falls back to the legacy name field', () => {
    expect(formatFullName({ name: 'Juan Cruz' })).toBe('Juan Cruz')
    expect(formatFullName(null)).toBe('')
  })
})

describe('formatDisplayName', () => {
  it('formats "Last, First M." with and without middle name and suffix', () => {
    expect(formatDisplayName({ firstName: 'Juan', middleName: 'Santos', lastName: 'Cruz', suffix: 'Jr.' })).toBe('Cruz, Juan S. Jr.')
    expect(formatDisplayName({ firstName: 'Juan', middleName: '', lastName: 'Cruz', suffix: '' })).toBe('Cruz, Juan')
    expect(formatDisplayName({ firstName: 'Juan', lastName: 'Cruz', suffix: 'II' })).toBe('Cruz, Juan II')
  })

  it('falls back to the legacy name field', () => {
    expect(formatDisplayName({ name: 'Juan Cruz' })).toBe('Juan Cruz')
  })
})

describe('splitFullName (migration)', () => {
  it('splits a 1-word name into first name only', () => {
    expect(splitFullName('Madonna')).toEqual({ firstName: 'Madonna', middleName: '', lastName: '', suffix: '' })
  })

  it('splits a 2-word name into first and last name', () => {
    expect(splitFullName('Juan Cruz')).toEqual({ firstName: 'Juan', middleName: '', lastName: 'Cruz', suffix: '' })
  })

  it('splits a 4-word name into first, middle, and last name', () => {
    expect(splitFullName('Juan Santos Dela Cruz')).toEqual({ firstName: 'Juan', middleName: 'Santos Dela', lastName: 'Cruz', suffix: '' })
  })

  it('moves a trailing suffix token into the suffix field', () => {
    expect(splitFullName('Juan Santos Cruz Jr.')).toEqual({ firstName: 'Juan', middleName: 'Santos', lastName: 'Cruz', suffix: 'Jr.' })
  })

  it('handles empty input', () => {
    expect(splitFullName('')).toEqual({ firstName: '', middleName: '', lastName: '', suffix: '' })
  })
})
