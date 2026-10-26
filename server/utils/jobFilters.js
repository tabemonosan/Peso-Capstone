// Job-board filter logic for GET /api/jobs (approved jobs list).
// Pure functions, unit-tested; the endpoint supplies the values that exist in
// the data so every filter value is validated against a whitelist before it
// reaches a Mongo query.
import { escapeRegex } from './paginate.js'

export const DATE_POSTED_OPTIONS = ['24h', 'week', 'month']
const DATE_POSTED_WINDOWS = {
  '24h': 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
}

// Repeated (?skills=a&skills=b) or comma-separated (?skills=a,b) params both work.
export function splitParam(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => splitParam(entry))
  if (typeof value !== 'string') return []
  return value.split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 50)
}

// Case-insensitive match against the values that exist in the data; returns the
// stored casing so the Mongo query matches exactly. Unknown values are dropped.
export function canonicalize(values, allowed) {
  const byLower = new Map(allowed.map((entry) => [entry.toLowerCase(), entry]))
  return values.map((value) => byLower.get(value.toLowerCase())).filter(Boolean)
}

// Build the Mongo filter. OR within one filter group, AND across groups.
export function buildJobFilter(raw, { skills = [], locations = [], locationTypes = [], employmentTypes = [] } = {}) {
  const groups = []
  const applied = { skills: [], locations: [], locationTypes: [], employmentTypes: [], datePosted: '', search: '' }

  const selectedSkills = canonicalize(splitParam(raw.skills), skills)
  if (selectedSkills.length) {
    applied.skills = selectedSkills
    groups.push({ skills: { $in: selectedSkills.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) } })
  }

  const selectedLocations = canonicalize(splitParam(raw.locations), locations)
  if (selectedLocations.length) {
    applied.locations = selectedLocations
    groups.push({ location: { $in: selectedLocations.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) } })
  }

  const selectedLocationTypes = canonicalize(splitParam(raw.locationTypes), locationTypes)
  if (selectedLocationTypes.length) {
    applied.locationTypes = selectedLocationTypes
    groups.push({ locationType: { $in: selectedLocationTypes.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) } })
  }

  const selectedEmploymentTypes = canonicalize(splitParam(raw.employmentTypes), employmentTypes)
  if (selectedEmploymentTypes.length) {
    applied.employmentTypes = selectedEmploymentTypes
    groups.push({ employmentType: { $in: selectedEmploymentTypes.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) } })
  }

  const datePosted = DATE_POSTED_OPTIONS.includes(String(raw.datePosted)) ? String(raw.datePosted) : ''
  if (datePosted) {
    applied.datePosted = datePosted
    groups.push({ createdAt: { $gte: new Date(Date.now() - DATE_POSTED_WINDOWS[datePosted]) } })
  }

  const search = String(raw.search || '').trim().slice(0, 120)
  if (search) {
    applied.search = search
    const pattern = new RegExp(escapeRegex(search), 'i')
    groups.push({ $or: [{ title: pattern }, { company: pattern }, { description: pattern }, { location: pattern }] })
  }

  return { groups, applied }
}

// Only approved, non-expired jobs (no deadline, or a deadline in the future).
export function baseApprovedJobFilter(now = new Date()) {
  return {
    status: 'approved',
    $or: [{ deadline: null }, { deadline: { $gte: now } }],
  }
}

// Facet option lists with counts, computed from approved non-expired jobs.
// Case variants collapse onto the most common casing.
export function countJobFacets(jobs) {
  const count = (pickValues) => {
    const map = new Map()
    for (const job of Array.isArray(jobs) ? jobs : []) {
      for (const value of pickValues(job)) {
        if (typeof value !== 'string' || !value.trim()) continue
        const trimmed = value.trim()
        const entry = map.get(trimmed.toLowerCase()) || { value: trimmed, count: 0 }
        entry.count += 1
        map.set(trimmed.toLowerCase(), entry)
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }
  return {
    skills: count((job) => (Array.isArray(job.skills) ? job.skills : [])),
    locations: count((job) => [job.location]),
    locationTypes: count((job) => [job.locationType]),
    employmentTypes: count((job) => [job.employmentType]),
  }
}
