// @vitest-environment node
// Abuse-protection tests for the unauthenticated NSRP sign-up preview endpoint.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { startTestDb, stopTestDb, validNsrpAnswers } from './helpers.js'

const { app, nsrpPreviewStore } = await import('../../index.js')

const preview = (payload = { answers: validNsrpAnswers({ email: 'preview@example.com' }) }) =>
  request(app).post('/api/nsrp/preview-signup').send(payload)

beforeAll(async () => {
  await startTestDb()
}, 180000)

afterAll(async () => {
  await stopTestDb()
})

beforeEach(() => {
  // Each test starts with a fresh rate-limit bucket
  nsrpPreviewStore.resetAll()
})

describe('POST /api/nsrp/preview-signup abuse protection', () => {
  it('generates a PDF for a normal request and stores nothing', async () => {
    const res = await preview()
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-nsrp-layout-warnings']).toBeDefined()
    expect(res.body.length).toBeGreaterThan(100)
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF')
  }, 60000)

  it('returns 429 with a clear message and Retry-After on the 11th request in the window', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await preview()
      expect(res.status, `request ${i + 1} should succeed`).toBe(200)
    }
    const blocked = await preview()
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toBe('Too many previews. Please wait a few minutes.')
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect(blocked.headers['content-type']).toContain('application/json')
  }, 120000)

  it('rejects invalid NSRP payloads with 422 and no PDF', async () => {
    const res = await preview({ answers: { surname: 'Only' } })
    expect(res.status).toBe(422)
    expect(res.headers['content-type']).toContain('application/json')
    expect(Object.keys(res.body.fieldErrors).length).toBeGreaterThan(0)
    expect(res.body.fieldErrors.firstName).toBeTruthy()
  }, 60000)

  it('rejects malformed JSON with 400 and no PDF', async () => {
    const res = await request(app)
      .post('/api/nsrp/preview-signup')
      .set('Content-Type', 'application/json')
      .send('{"answers": {not json')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid JSON payload')
  }, 60000)

  it('rejects oversized payloads with 413 before any generation', async () => {
    // The route caps the body at 2 MB (the global parser allows 8 MB).
    const oversized = 'x'.repeat(3 * 1024 * 1024)
    const res = await preview({ answers: validNsrpAnswers({ email: 'big@example.com', religion: oversized }) })
    expect(res.status).toBe(413)
    expect(res.body.error).toBe('The request is too large.')
  }, 60000)
})
