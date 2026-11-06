import { expect, it } from 'vitest'
import { validateJobLanguages } from '../../shared/jobLanguages.js'
import { validateJobPosting } from '../../shared/jobPosting.js'

it('allows optional languages and normalizes selected proficiencies', () => {
  expect(validateJobLanguages()).toEqual({ value: [] })
  expect(validateJobLanguages([{ name: ' English ', speak: true }]).value).toEqual([{ name: 'English', read: false, write: false, speak: true, understand: false }])
})

it.each([
  [{ name: 'English' }],
  [{ name: '', speak: true }],
  [{ name: 'English', speak: 'yes' }],
  [{ name: 'Englishsdasd', speak: true }],
  [{ name: 'Korean', speak: true }],
  [{ name: 'Tagalog', speak: true }],
  [{ name: 'English', speak: true }, { name: 'english', read: true }],
  [{ name: 'Filipino', speak: true }, { name: 'Tagalog', read: true }],
].map(requirements => [requirements]))('rejects invalid or duplicate language requirements %j', requirements => {
  expect(validateJobLanguages(requirements).error).toBeTruthy()
  expect(validateJobPosting({ languageRequirements: requirements }).errors.languageRequirements).toBeTruthy()
})

it('accepts both supported languages and stores canonical names', () => {
  expect(validateJobLanguages([{ name: ' english ', speak: true }, { name: 'filipino', understand: true }]).value?.map(row => row.name)).toEqual(['English', 'Filipino'])
})
