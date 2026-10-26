// Server-side sort whitelists. Each endpoint declares the ONLY sortBy values it
// accepts; anything else falls back to the default. The raw query value is never
// passed into the Mongo sort — the whitelist maps it to a fixed field spec.
//
// A sort spec:
//   fields:      (dir) => ({ path: dir, ... })          — base sort fields
//   collation:   true                                    — case-insensitive, ñ-aware (locale en, strength 2)
//   nullsLast:   ['path', ...]                           — optional fields; null/empty sort last
//   statusRank:  { field, values: [...] }                — custom priority order instead of alphabetical
//   numeric:     ['path', ...]                           — extract digits and sort numerically (e.g. salary text)
//   defaultOrder: 1 | -1                                 — used when ?order is missing/invalid

export function resolveSort(query = {}, whitelist = {}, fallbackKey) {
  const key = typeof query.sortBy === 'string' && whitelist[query.sortBy] ? query.sortBy : fallbackKey
  const spec = whitelist[key]
  const order = query.order === 'asc' ? 1 : query.order === 'desc' ? -1 : (spec.defaultOrder ?? -1)
  return { key, order, spec }
}

// Build the aggregation pipeline for specs that plain find().sort() cannot express
// (custom status priority, nulls-last, numeric extraction from text).
export function buildSortPipeline(filter, spec, dir, { skip, limit } = {}) {
  const addFields = { ...(spec.computed || {}) }
  const sort = {}

  if (spec.statusRank) {
    addFields.__sortRank = { $indexOfArray: [spec.statusRank.values, `$${spec.statusRank.field}`] }
    sort.__sortRank = dir
  }
  for (const path of spec.numeric || []) {
    const safe = `__sortNum_${path.replace(/[^a-z0-9]/gi, '_')}`
    // $convert only (works on older MongoDB): numeric strings ("18000") sort
    // numerically; free text ("₱18,000", "negotiable") becomes null → sorts last.
    addFields[safe] = {
      $convert: { input: `$${path}`, to: 'double', onError: null, onNull: null },
    }
  }

  const baseFields = spec.fields(dir)
  const finalFields = {}
  for (const [path, direction] of Object.entries(baseFields)) {
    const nullSafe = `__sortNull_${path.replace(/[^a-z0-9]/gi, '_')}`
    const numSafe = `__sortNum_${path.replace(/[^a-z0-9]/gi, '_')}`
    const targetPath = (spec.numeric || []).includes(path) ? numSafe : path

    if ((spec.nullsLast || []).includes(path) || (spec.numeric || []).includes(path)) {
      addFields[nullSafe] = { $or: [{ $eq: [`$${targetPath}`, null] }, { $eq: [`$${targetPath}`, ''] }] }
      sort[nullSafe] = 1 // false (has value) before true (null/empty)
    }
    sort[targetPath] = direction
  }
  sort._id = 1 // stable tie-breaker across pages

  const pipeline = [{ $match: filter }]
  if (Object.keys(addFields).length) pipeline.push({ $addFields: addFields })
  pipeline.push({ $sort: sort })
  pipeline.push({ $facet: { items: [{ $skip: skip }, { $limit: limit }], meta: [{ $count: 'total' }] } })
  return pipeline
}
