// Compares the albayLocations data in src/App.jsx against the official PSGC API.
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8')

// Extract the albayLocations object literal from App.jsx
const match = appSource.match(/const albayLocations = (\{[\s\S]*?\n\})\n\nconst albayMunicipalities/)
if (!match) {
  console.error('Could not find albayLocations in App.jsx')
  process.exit(1)
}
const albayLocations = eval(`(${match[1]})`)

const normalizeCityName = (name) => (name.startsWith('City of ') ? `${name.slice(8)} City` : name)

const [municipalities, barangays] = await Promise.all([
  fetch('https://psgc.gitlab.io/api/provinces/050500000/cities-municipalities/').then((r) => r.json()),
  fetch('https://psgc.gitlab.io/api/provinces/050500000/barangays/').then((r) => r.json()),
])

const official = {}
for (const municipality of municipalities) {
  official[normalizeCityName(municipality.name)] = barangays
    .filter((b) => (b.cityMunicipalityCode || b.cityCode || b.municipalityCode) === municipality.code)
    .map((b) => b.name)
    .sort((a, b) => a.localeCompare(b))
}

let hasDifferences = false

for (const [name, officialList] of Object.entries(official)) {
  const localList = albayLocations[name]
  if (!localList) {
    hasDifferences = true
    console.log(`\nMISSING MUNICIPALITY: ${name} (${officialList.length} barangays)`)
    continue
  }
  const localSet = new Set(localList)
  const officialSet = new Set(officialList)
  const missing = officialList.filter((b) => !localSet.has(b))
  const extra = localList.filter((b) => !officialSet.has(b))
  const countMismatch = officialList.length !== localList.length

  if (missing.length || extra.length) {
    hasDifferences = true
    console.log(`\n${name}: local=${localList.length} official=${officialList.length}`)
    if (missing.length) console.log(`  MISSING in local: ${JSON.stringify(missing)}`)
    if (extra.length) console.log(`  EXTRA in local:   ${JSON.stringify(extra)}`)
  } else if (countMismatch) {
    hasDifferences = true
    console.log(`\n${name}: count mismatch local=${localList.length} official=${officialList.length}`)
  } else {
    console.log(`${name}: OK (${officialList.length} barangays)`)
  }
}

for (const name of Object.keys(albayLocations)) {
  if (!official[name]) {
    hasDifferences = true
    console.log(`\nEXTRA MUNICIPALITY in local data: ${name}`)
  }
}

console.log(hasDifferences ? '\nDifferences found.' : '\nAll data matches PSGC.')

// With --apply, rewrite the albayLocations block in App.jsx using the official PSGC data.
if (process.argv.includes('--apply')) {
  const appPath = new URL('../../src/App.jsx', import.meta.url)
  const entries = Object.entries(official)
    .map(([name, list]) => {
      const items = list.map((b) => `    ${JSON.stringify(b)},`).join('\n')
      return `  ${JSON.stringify(name)}: [\n${items}\n  ],`
    })
    .join('\n')
  const newBlock = `const albayLocations = {\n${entries}\n}`
  const updated = appSource.replace(/const albayLocations = \{[\s\S]*?\n\}\n\nconst albayMunicipalities/, `${newBlock}\n\nconst albayMunicipalities`)
  if (updated === appSource) {
    console.error('Failed to rewrite albayLocations block')
    process.exit(1)
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(appPath, updated)
  console.log('App.jsx updated with official PSGC barangay data.')
}
