import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.clear()
  sessionStorage.clear()
  mockFetch.mockImplementation((url, options) => {
    if (url === 'http://localhost:4000/api/signup/email-code') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
    }
    if (url === 'http://localhost:4000/api/signup/email-code/verify') {
      const code = JSON.parse(options.body).code
      if (code === '123456') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, proofToken: 'proof-token-abc' }) })
      }
      return Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({ code: 'EMAIL_CODE_INVALID', error: 'Incorrect code. 4 attempts left.', attemptsLeft: 4 }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function openSignup() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Create an account \(Applicant\)/i }))
}

const typeCode = (code) => {
  code.split('').forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(new RegExp(`^Code digit ${index + 1}$`, 'i')), { target: { value: digit } })
  })
}

describe('signup step 1 email-code verification', () => {
  it('keeps Next disabled until the code is verified, and shows the sent message', async () => {
    openSignup()
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
    await screen.findByText(/we sent a 6-digit code to user@example\.com\. It expires in 10 minutes\. Check your spam folder\./i)
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeDisabled()

    typeCode('123456')
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
    await screen.findByText(/Email verified/i)
    expect(screen.getByLabelText(/^Email$/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeEnabled()
  })

  it('validates the email format before sending', () => {
    openSignup()
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(mockFetch.mock.calls.some(([url]) => url.includes('email-code'))).toBe(false)
  })

  it('shows a clear wrong-code error with attempts left', async () => {
    openSignup()
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
    await screen.findByLabelText(/^Code digit 1$/i)
    typeCode('000000')
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
    await screen.findByText('Incorrect code. 4 attempts left.')
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeDisabled()
  })

  it('editing the email after verifying discards the verification', async () => {
    openSignup()
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
    await screen.findByLabelText(/^Code digit 1$/i)
    typeCode('123456')
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
    await screen.findByText(/Email verified/i)

    fireEvent.click(screen.getByRole('button', { name: /Change email/i }))
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'other@example.com' } })
    expect(screen.queryByText(/Email verified/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Send code$/i })).toBeInTheDocument()
  })

  it('runs the 60-second resend countdown', async () => {
    vi.useFakeTimers()
    openSignup()
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: /Resend code \(60s\)/i })).toBeDisabled()
    const tick = (seconds) => {
      for (let i = 0; i < seconds; i += 1) act(() => { vi.advanceTimersByTime(1000) })
    }
    tick(5)
    expect(screen.getByRole('button', { name: /Resend code \(55s\)/i })).toBeDisabled()
    tick(55)
    expect(screen.getByRole('button', { name: /^Resend code$/i })).toBeEnabled()
  })

  it('supports pasting the full 6-digit code', async () => {
    openSignup()
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
    await screen.findByLabelText(/^Code digit 1$/i)
    fireEvent.paste(screen.getByLabelText(/^Code digit 1$/i), { clipboardData: { getData: () => '123456' } })
    for (let i = 1; i <= 6; i += 1) {
      expect(screen.getByLabelText(new RegExp(`^Code digit ${i}$`, 'i'))).toHaveValue(String(i))
    }
  })

  it('never writes the code or proof token to browser storage', async () => {
    openSignup()
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^Send code$/i }))
    await screen.findByLabelText(/^Code digit 1$/i)
    typeCode('123456')
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }))
    await screen.findByText(/Email verified/i)

    const stored = [localStorage, sessionStorage]
      .flatMap((storage) => Array.from({ length: storage.length }, (_, i) => storage.key(i)).map((key) => storage.getItem(key)))
      .join('\n')
    expect(stored).not.toContain('123456')
    expect(stored).not.toContain('proof-token-abc')
    expect(stored).not.toContain('emailProof')
  })
})
