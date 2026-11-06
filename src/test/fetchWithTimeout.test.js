import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('action request timeouts', () => {
  it('aborts a stalled request and explains how to check an uncertain outcome', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const pending = fetchWithTimeout('/api/jobs/1/status', { method: 'PUT' }, 100)
    const rejection = expect(pending).rejects.toThrow('Refresh to check whether it completed')
    await vi.advanceTimersByTimeAsync(100)
    await rejection
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears the timer for a successful request and preserves the response', async () => {
    vi.useFakeTimers()
    const response = { ok: true }
    vi.stubGlobal('fetch', vi.fn(async () => response))
    expect(await fetchWithTimeout('/api/jobs')).toBe(response)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves network errors and clears its timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline') }))
    await expect(fetchWithTimeout('/api/jobs')).rejects.toThrow('Offline')
    expect(vi.getTimerCount()).toBe(0)
  })
})
