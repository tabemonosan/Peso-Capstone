// @vitest-environment node
import { expect, it } from 'vitest'
import { philSysNameRegions } from '../../shared/idNameRegions.js'

const word = (text, x0, x1, y0, y1) => ({ text, bbox: { x0, x1, y0, y1 } })
const lines = [
  { text: 'noise Apelyido/Last Name', words: [word('noise', 10, 80, 100, 125), word('Apelyido/Last', 300, 450, 100, 125)] },
  { text: 'noise CRUZ background', words: [word('noise', 10, 80, 140, 170), word('CRUZ', 300, 390, 140, 170), word('background', 700, 800, 140, 170)] },
  { text: 'Mga Pangalan/Given Nemes' },
  { text: 'JUAN MIGUEL III background', words: [word('JUAN', 300, 380, 220, 250), word('MIGUEL', 390, 490, 220, 250), word('III', 500, 530, 220, 250), word('background', 700, 800, 220, 250)] },
  { text: 'Gitnang Apelyido/Middle Name' },
  { text: 'SANTOS', words: [word('SANTOS', 300, 420, 340, 370)] },
]

it('locates each bilingual name value and excludes distant security-pattern noise', () => {
  expect(philSysNameRegions(lines)).toEqual([
    { field: 'surname', label: 'Surname', bbox: { x0: 300, x1: 390, y0: 140, y1: 170 } },
    { field: 'firstName', label: 'First name', bbox: { x0: 300, x1: 530, y0: 220, y1: 250 } },
    { field: 'middleName', label: 'Middle name', bbox: { x0: 300, x1: 420, y0: 340, y1: 370 } },
  ])
})
it('requires all PhilSys headers and usable label coordinates', () => {
  expect(philSysNameRegions(lines.slice(0, 4))).toEqual([])
  expect(philSysNameRegions(lines.map(({ text }) => ({ text })))).toEqual([])
  expect(philSysNameRegions([{ text: 'Last Name, First Name, Middle Name' }])).toEqual([])
})
it('does not mistake the next header for a missing name value', () => {
  expect(philSysNameRegions(lines.filter((_, index) => index !== 1)).map(region => region.field)).toEqual(['firstName', 'middleName'])
})
it('recognizes a merged, distorted surname label after JPEG conversion', () => {
  const converted = lines.map((line, index) => index === 0 ? {
    text: 'noise Awelydotasthame', words: [word('noise', 10, 80, 100, 125), word('Awelydotasthame', 300, 450, 100, 125)],
  } : line)
  expect(philSysNameRegions(converted)).toEqual(philSysNameRegions(lines))
  expect(philSysNameRegions(converted.filter((_, index) => index !== 4))).toEqual([])
})
