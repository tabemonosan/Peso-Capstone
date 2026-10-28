// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  NSRP_WARNING_SECTIONS, NSRP_WARNING_COLLAPSE_THRESHOLD,
  getNsrpFieldLabel, getNsrpWarningSection, groupNsrpWarnings,
} from '../../shared/nsrpFieldLabels.js'
import { NSRP_ROW_LIMITS } from '../../shared/nsrpTableLimits.js'
import {
  NSRP_TEXT_FIELDS, NSRP_EDUCATION, NSRP_TRAINING, NSRP_ELIGIBILITY, NSRP_WORK_EXPERIENCE,
} from '../../server/nsrpLayout.js'

// Every field path the generator can emit a warning for.
// drawTableCell emits: education[<level>].<col>, <section>[<index>].<col>
// (workExperience dates are reported as fromDate/toDate).
const warnablePaths = () => {
  const paths = []
  for (const level of Object.keys(NSRP_EDUCATION.rows)) {
    for (const col of Object.keys(NSRP_EDUCATION.cols)) paths.push(`education[${level}].${col}`)
  }
  for (const col of Object.keys(NSRP_TRAINING.cols)) paths.push(`technicalTraining[0].${col}`)
  for (const col of [...Object.keys(NSRP_ELIGIBILITY.left), ...Object.keys(NSRP_ELIGIBILITY.right)]) {
    paths.push(`eligibility[0].${col}`)
  }
  for (const col of Object.keys(NSRP_WORK_EXPERIENCE.cols)) {
    paths.push(col === 'dates' ? 'workExperience[0].fromDate/toDate' : `workExperience[0].${col}`)
  }
  return paths
}

describe('NSRP field labels', () => {
  it('has a friendly label for every warnable field path in the layout config', () => {
    for (const path of warnablePaths()) {
      const label = getNsrpFieldLabel(path)
      expect(label, path).toBeTruthy()
      // Must not leak raw paths: no brackets, no camelCase
      expect(label, path).not.toMatch(/[[\]]/)
      expect(label, path).not.toMatch(/[a-z][A-Z]/) // no camelCase
    }
  })

  it('has a friendly label for every flat text field in the layout config', () => {
    for (const key of Object.keys(NSRP_TEXT_FIELDS)) {
      const label = getNsrpFieldLabel(key)
      expect(label, key).toBeTruthy()
      expect(label, key).not.toMatch(/[[\]]/)
    }
  })

  it('has a friendly label for every field in the shared row limits', () => {
    for (const [section, limits] of Object.entries(NSRP_ROW_LIMITS)) {
      for (const field of Object.keys(limits)) {
        const label = getNsrpFieldLabel(`${section}[0].${field}`)
        expect(label, `${section}[0].${field}`).toBeTruthy()
        expect(label, `${section}[0].${field}`).not.toMatch(/[[\]]/)
      }
    }
  })

  it('converts 0-based indexes to 1-based row numbers', () => {
    expect(getNsrpFieldLabel('technicalTraining[0].duration')).toBe('Training #1: Duration')
    expect(getNsrpFieldLabel('technicalTraining[0].institution')).toBe('Training #1: Institution')
    expect(getNsrpFieldLabel('technicalTraining[0].certificate')).toBe('Training #1: Certificate received')
    expect(getNsrpFieldLabel('eligibility[1].license')).toBe('Professional license #2: License')
    expect(getNsrpFieldLabel('eligibility[0].eligibility')).toBe('Eligibility #1: Civil service eligibility')
    expect(getNsrpFieldLabel('workExperience[0].company')).toBe('Work experience #1: Company name')
    expect(getNsrpFieldLabel('workExperience[0].address')).toBe('Work experience #1: Address')
    expect(getNsrpFieldLabel('workExperience[0].position')).toBe('Work experience #1: Position')
  })

  it('labels education rows by level', () => {
    expect(getNsrpFieldLabel('education[Tertiary].school')).toBe('Tertiary education: School')
  })

  it('falls back to spaced, capitalized words for unknown paths', () => {
    const label = getNsrpFieldLabel('customSection[2].someField')
    expect(label).not.toMatch(/[[\]]/)
    expect(label).not.toMatch(/[a-z][A-Z]/)
    expect(label).toBe('Custom Section #3: Some Field')
  })
})

describe('NSRP warning grouping', () => {
  const sample = [
    { field: 'workExperience[0].company', reason: 'minimum-font-size' },
    { field: 'technicalTraining[0].duration', reason: 'minimum-font-size' },
    { field: 'technicalTraining[0].institution', reason: 'truncated' },
    { field: 'education[Tertiary].school', reason: 'truncated' },
    { field: 'eligibility[0].license', reason: 'truncated' },
  ]

  it('groups warnings in printed-form order', () => {
    const groups = groupNsrpWarnings(sample)
    expect(groups.map((group) => group.key)).toEqual(['education', 'technicalTraining', 'eligibility', 'workExperience'])
  })

  it('lists "cut off" entries before "printed small" ones within a group', () => {
    const groups = groupNsrpWarnings(sample)
    const training = groups.find((group) => group.key === 'technicalTraining')
    expect(training.items.map((item) => item.reason)).toEqual(['truncated', 'minimum-font-size'])
  })

  it('counts entries per section', () => {
    const groups = groupNsrpWarnings(sample)
    expect(groups.find((group) => group.key === 'technicalTraining').count).toBe(2)
    expect(groups.find((group) => group.key === 'workExperience').count).toBe(1)
  })

  it('collapse threshold is 3 warnings', () => {
    expect(NSRP_WARNING_COLLAPSE_THRESHOLD).toBe(3)
    const few = Array.from({ length: 3 }, (_, index) => ({ field: `technicalTraining[${index}].course`, reason: 'truncated' }))
    expect(few.length > NSRP_WARNING_COLLAPSE_THRESHOLD).toBe(false)
    const many = Array.from({ length: 4 }, (_, index) => ({ field: `technicalTraining[${index}].course`, reason: 'truncated' }))
    expect(many.length > NSRP_WARNING_COLLAPSE_THRESHOLD).toBe(true)
  })

  it('assigns every warnable path to a known section', () => {
    const known = new Set(NSRP_WARNING_SECTIONS.map((section) => section.key))
    for (const path of warnablePaths()) {
      expect(known.has(getNsrpWarningSection(path)), path).toBe(true)
    }
  })
})
