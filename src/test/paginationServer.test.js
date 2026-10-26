import { describe, it, expect, vi } from 'vitest'
import { parsePagination, paginateQuery, escapeRegex, MAX_PAGE_LIMIT } from '../../server/utils/paginate.js'

describe('parsePagination', () => {
  it('defaults to page 1 and the default limit', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 10 })
  })

  it('parses page and limit from the query string', () => {
    expect(parsePagination({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20 })
  })

  it('caps the limit at 100 and floors the page at 1', () => {
    expect(parsePagination({ page: '-4', limit: '500' })).toEqual({ page: 1, limit: MAX_PAGE_LIMIT })
    expect(parsePagination({ limit: '0' })).toEqual({ page: 1, limit: 10 })
  })

  it('ignores non-numeric input', () => {
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 10 })
  })
})

// Minimal chainable Mongoose model stub
function mockModel(rows) {
  const captured = {}
  const chain = {
    sort(sort) { captured.sort = sort; return chain },
    skip(skip) { captured.skip = skip; return chain },
    limit(limit) { captured.limit = limit; return chain },
    select(select) { captured.select = select; return chain },
    lean() { return chain },
    then(resolve) { resolve(rows.slice(captured.skip ?? 0, (captured.skip ?? 0) + (captured.limit ?? rows.length))) },
  }
  return {
    find: vi.fn(() => chain),
    countDocuments: vi.fn(async () => rows.length),
    captured,
  }
}

const rows = Array.from({ length: 25 }, (_, i) => ({ _id: String(i + 1), createdAt: i }))

describe('paginateQuery', () => {
  it('returns the right slice and total for a middle page', async () => {
    const model = mockModel(rows)
    const result = await paginateQuery(model, {}, { page: 2, limit: 10 })
    expect(result.items).toHaveLength(10)
    expect(result.items[0]._id).toBe('11')
    expect(result.total).toBe(25)
    expect(result.totalPages).toBe(3)
    expect(result.page).toBe(2)
    expect(result.limit).toBe(10)
    expect(model.countDocuments).toHaveBeenCalledWith({})
  })

  it('returns a partial last page', async () => {
    const model = mockModel(rows)
    const result = await paginateQuery(model, {}, { page: 3, limit: 10 })
    expect(result.items).toHaveLength(5)
    expect(result.total).toBe(25)
  })

  it('appends _id to the sort so paging is stable', async () => {
    const model = mockModel(rows)
    await paginateQuery(model, {}, { page: 1, limit: 10, sort: { createdAt: -1 } })
    expect(model.captured.sort).toEqual({ createdAt: -1, _id: 1 })
  })

  it('keeps an existing _id sort untouched', async () => {
    const model = mockModel(rows)
    await paginateQuery(model, {}, { page: 1, limit: 10, sort: { _id: -1 } })
    expect(model.captured.sort).toEqual({ _id: -1 })
  })

  it('passes the filter through to find and countDocuments', async () => {
    const model = mockModel(rows)
    await paginateQuery(model, { status: 'approved' }, { page: 1, limit: 10 })
    expect(model.find).toHaveBeenCalledWith({ status: 'approved' })
    expect(model.countDocuments).toHaveBeenCalledWith({ status: 'approved' })
  })
})

describe('escapeRegex', () => {
  it('escapes regex metacharacters in search input', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c')
  })
})
