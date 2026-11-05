// Preserve recognition of older job text and NSRP language entries.
export const LANGUAGE_OPTIONS = ['English', 'Filipino', 'Tagalog', 'Bikol', 'Bicol', 'Cebuano', 'Ilocano', 'Waray', 'Hiligaynon', 'Pangasinan', 'Kapampangan', 'Mandarin', 'Japanese', 'Korean', 'Spanish', 'Arabic', 'French', 'German']
export const JOB_LANGUAGE_OPTIONS = ['English', 'Filipino']
export const LANGUAGE_PROFICIENCIES = ['read', 'write', 'speak', 'understand']
export const languageKey = value => {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return { tagalog: 'filipino', bicol: 'bikol' }[key] || key
}
export function validateJobLanguages(input = []) {
  if (!Array.isArray(input) || input.length > JOB_LANGUAGE_OPTIONS.length) return { error: 'Choose only English and Filipino, once each.' }
  const seen = new Set(), value = []
  for (const row of input) {
    if (!row || typeof row.name !== 'string') return { error: 'Choose English or Filipino.' }
    const name = JOB_LANGUAGE_OPTIONS.find(option => option.toLowerCase() === row.name.trim().toLowerCase())
    if (!name) return { error: 'Choose English or Filipino.' }
    const key = languageKey(name)
    if (seen.has(key)) return { error: 'List each language only once.' }
    if (LANGUAGE_PROFICIENCIES.some(field => row[field] !== undefined && typeof row[field] !== 'boolean')) return { error: 'Choose valid language proficiencies.' }
    const proficiencies = Object.fromEntries(LANGUAGE_PROFICIENCIES.map(field => [field, row[field] === true]))
    if (!Object.values(proficiencies).some(Boolean)) return { error: 'Select at least one proficiency for each language.' }
    seen.add(key); value.push({ name, ...proficiencies })
  }
  return { value }
}
