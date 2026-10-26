// Shared server-side pagination helpers.
// Endpoints accept ?page=1&limit=10 (plus their own search/filter params) and
// return { items, total, page, limit, totalPages }.
import { buildSortPipeline } from './sort.js'

export const MAX_PAGE_LIMIT = 100

// Parse and clamp page/limit from the query string. Limit is capped at 100.
export function parsePagination(query = {}, { defaultLimit = 10, maxLimit = MAX_PAGE_LIMIT } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const rawLimit = Number.parseInt(query.limit, 10) || defaultLimit
  const limit = Math.min(maxLimit, Math.max(1, rawLimit))
  return { page, limit }
}

// Run a paginated find + count. Sort is made stable by appending _id when absent.
export async function paginateQuery(model, filter = {}, { page, limit, sort = { createdAt: -1 }, select, lean = true, sortSpec, sortDir = -1, collation = false } = {}) {
  const stableSort = sort && Object.keys(sort).length && !('_id' in sort) ? { ...sort, _id: 1 } : sort

  // Complex sort specs (status priority, nulls-last, numeric text) need aggregation
  if (sortSpec && (sortSpec.statusRank || sortSpec.nullsLast?.length || sortSpec.numeric?.length || sortSpec.computed)) {
    const pipeline = buildSortPipeline(filter, sortSpec, sortDir, { skip: (page - 1) * limit, limit })
    // Aggregation bypasses Mongoose field selection, so strip excluded fields (e.g. file Buffers) explicitly
    const exclusions = (select || '').split(' ').filter((field) => field.startsWith('-')).map((field) => field.slice(1))
    if (exclusions.length) {
      pipeline.splice(pipeline.length - 1, 0, { $project: Object.fromEntries(exclusions.map((field) => [field, 0])) })
    }
    let agg = model.aggregate(pipeline)
    if (sortSpec.collation) agg = agg.collation({ locale: 'en', strength: 2 })
    const [result] = await agg
    const items = result?.items || []
    const total = result?.meta?.[0]?.total || 0
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
  }

  let query = model.find(filter).sort(stableSort).skip((page - 1) * limit).limit(limit)
  if (collation || sortSpec?.collation) query = query.collation({ locale: 'en', strength: 2 })
  if (select) query = query.select(select)
  if (lean) query = query.lean()
  const [items, total] = await Promise.all([query, model.countDocuments(filter)])
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

// Escape user input before using it in a regex search filter.
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export { buildSortPipeline }
