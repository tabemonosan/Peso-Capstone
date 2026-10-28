// @vitest-environment node
// The preview generation timeout: a slow generator must not hold the request.
// NSRP_PREVIEW_TIMEOUT_MS is read when the server module loads, so it is set
// before importing index.js and generateNsrpPdf is mocked to hang forever.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { startTestDb, stopTestDb, validNsrpAnswers } from './helpers.js'

process.env.NSRP_PREVIEW_TIMEOUT_MS = '100'

vi.mock('../../nsrpPdf.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generateNsrpPdf: () => new Promise(() => {}), // never resolves
}))

const { app } = await import('../../index.js')

beforeAll(async () => {
  await startTestDb()
}, 180000)

afterAll(async () => {
  await stopTestDb()
})

describe('POST /api/nsrp/preview-signup generation timeout', () => {
  it('returns 504 with a clear message instead of hanging', async () => {
    const res = await request(app)
      .post('/api/nsrp/preview-signup')
      .send({ answers: validNsrpAnswers({ email: 'slow@example.com' }) })
    expect(res.status).toBe(504)
    expect(res.body.code).toBe('NSRP_PREVIEW_TIMEOUT')
    expect(res.body.error).toMatch(/took too long/i)
  }, 60000)
})
