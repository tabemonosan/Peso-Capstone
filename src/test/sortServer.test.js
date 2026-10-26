import { describe, it, expect, vi } from 'vitest'
import { resolveSort, buildSortPipeline } from '../../server/utils/sort.js'
import { paginateQuery } from '../../server/utils/paginate.js'

const TEST_SORTS = {
  name: { fields: (d) => ({ 'profile.lastName': d, 'profile.firstName': d }), collation: true, defaultOrder: 1 },
  createdAt: { fields: (d) => ({ createdAt: d }), defaultOrder: -1 },
  status: { fields: () => ({}), statusRank: { field: 'verificationStatus', values: ['under_review', 'approved', 'restricted', 'declined'] }, defaultOrder: 1 },
  location: { fields: (d) => ({ 'profile.location': d }), collation: true, nullsLast: ['profile.location'], defaultOrder: 1 },
  salary: { fields: (d) => ({ salary: d }), numeric: ['salary'], defaultOrder: -1 },
}

describe('resolveSort (whitelist)', () => {
  it('returns the requested whitelisted sort with its order', () => {
    const { key, order, spec } = resolveSort({ sortBy: 'name', order: 'desc' }, TEST_SORTS, 'createdAt')
    expect(key).toBe('name')
    expect(order).toBe(-1)
    expect(spec.fields(-1)).toEqual({ 'profile.lastName': -1, 'profile.firstName': -1 })
  })

  it('falls back to the default when sortBy is invalid', () => {
    const { key } = resolveSort({ sortBy: 'email; DROP TABLE', order: 'asc' }, TEST_SORTS, 'createdAt')
    expect(key).toBe('createdAt')
  })

  it('falls back to the default when sortBy is missing', () => {
    expect(resolveSort({}, TEST_SORTS, 'name').key).toBe('name')
  })

  it('uses the spec default order when order is invalid', () => {
    expect(resolveSort({ sortBy: 'createdAt', order: 'sideways' }, TEST_SORTS, 'name').order).toBe(-1)
    expect(resolveSort({ sortBy: 'name', order: 'sideways' }, TEST_SORTS, 'name').order).toBe(1)
  })
})

describe('buildSortPipeline', () => {
  it('sorts status by priority rank, not alphabetically, with _id tie-breaker', () => {
    const pipeline = buildSortPipeline({}, TEST_SORTS.status, 1, { skip: 0, limit: 10 })
    const addFields = pipeline.find((stage) => stage.$addFields).$addFields
    const sort = pipeline.find((stage) => stage.$sort).$sort
    expect(addFields.__sortRank.$indexOfArray[0]).toEqual(['under_review', 'approved', 'restricted', 'declined'])
    expect(sort.__sortRank).toBe(1)
    expect(sort._id).toBe(1)
  })

  it('puts nulls last for optional fields in both directions', () => {
    for (const dir of [1, -1]) {
      const pipeline = buildSortPipeline({}, TEST_SORTS.location, dir, { skip: 0, limit: 10 })
      const sort = pipeline.find((stage) => stage.$sort).$sort
      expect(sort.__sortNull_profile_location).toBe(1) // nulls always last
      expect(sort['profile.location']).toBe(dir)
      expect(sort._id).toBe(1)
    }
  })

  it('extracts digits for numeric text fields like salary', () => {
    const pipeline = buildSortPipeline({}, TEST_SORTS.salary, -1, { skip: 0, limit: 10 })
    const addFields = pipeline.find((stage) => stage.$addFields).$addFields
    const sort = pipeline.find((stage) => stage.$sort).$sort
    expect(addFields.__sortNum_salary.$convert.to).toBe('double')
    expect(sort.__sortNum_salary).toBe(-1)
  })

  it('paginates with skip/limit inside a $facet and counts the total', () => {
    const pipeline = buildSortPipeline({ status: 'approved' }, TEST_SORTS.createdAt, -1, { skip: 20, limit: 10 })
    expect(pipeline[0]).toEqual({ $match: { status: 'approved' } })
    const facet = pipeline.find((stage) => stage.$facet).$facet
    expect(facet.items).toEqual([{ $skip: 20 }, { $limit: 10 }])
    expect(facet.meta).toEqual([{ $count: 'total' }])
  })
})

describe('paginateQuery with sort specs', () => {
  function mockAggregateModel(resultRows, total) {
    const captured = {}
    return {
      captured,
      aggregate: vi.fn((pipeline) => {
        captured.pipeline = pipeline
        const agg = Promise.resolve([{ items: resultRows, meta: [{ total }] }])
        agg.collation = vi.fn(() => agg)
        return agg
      }),
      find: vi.fn(),
      countDocuments: vi.fn(),
    }
  }

  it('uses aggregation with collation for status-priority sorts', async () => {
    const model = mockAggregateModel([{ _id: 'a' }, { _id: 'b' }], 12)
    const result = await paginateQuery(model, {}, { page: 1, limit: 10, sortSpec: TEST_SORTS.status, sortDir: 1 })
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(12)
    expect(result.totalPages).toBe(2)
    expect(model.aggregate).toHaveBeenCalled()
    expect(model.find).not.toHaveBeenCalled()
  })

  it('strips excluded Buffer fields in the aggregation path', async () => {
    const model = mockAggregateModel([], 0)
    await paginateQuery(model, {}, { page: 1, limit: 10, sortSpec: TEST_SORTS.location, sortDir: 1, select: '-resumeFile.data -profile.secret' })
    const project = model.captured.pipeline.find((stage) => stage.$project)
    expect(project.$project).toEqual({ 'resumeFile.data': 0, 'profile.secret': 0 })
  })

  it('uses find().sort() with collation for simple text sorts', async () => {
    const captured = {}
    const chain = {
      sort(s) { captured.sort = s; return chain },
      skip() { return chain },
      limit() { return chain },
      select() { return chain },
      collation(c) { captured.collation = c; return chain },
      lean() { return chain },
      then(resolve) { resolve([{ _id: '1' }]) },
    }
    const model = { find: vi.fn(() => chain), countDocuments: vi.fn(async () => 1) }
    await paginateQuery(model, {}, { page: 1, limit: 10, sort: TEST_SORTS.name.fields(1), sortSpec: TEST_SORTS.name, sortDir: 1 })
    expect(captured.sort).toEqual({ 'profile.lastName': 1, 'profile.firstName': 1, _id: 1 })
    expect(captured.collation).toEqual({ locale: 'en', strength: 2 })
  })
})
