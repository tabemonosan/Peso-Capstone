import { useState } from "react"
import { API_URL } from "../config"

// Banner shown on My Documents / employer dashboard while emailVerified is false.
// Resend button enforces the 60-second server cooldown with a countdown.
export default function EmailVerificationBanner({ email, token, onVerified }) {
  const [cooldown, setCooldown] = useState(0)
  const [status, setStatus] = useState("")
  const [sending, setSending] = useState(false)

  const startCountdown = (seconds) => {
    setCooldown(seconds)
    const timer = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          clearInterval(timer)
          return 0
        }
        return current - 1
      })
    }, 1000)
  }

  const resend = async () => {
    setSending(true)
    setStatus("")
    try {
      const response = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (response.status === 429) {
        startCountdown(data?.retryAfter || 60)
        setStatus("Please wait before requesting another email.")
        return
      }
      if (data?.alreadyVerified) {
        onVerified?.()
        return
      }
      if (!response.ok || data?.error) {
        setStatus(data?.error || "Failed to send the email")
        return
      }
      startCountdown(60)
      setStatus(data.delivered ? "Verification email sent." : "Email service is not configured — the link was logged on the server console.")
    } catch {
      setStatus("Failed to send the email")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c4d4e5] bg-[#eef5fb] p-4" role="status">
      <div>
        <p className="text-sm font-semibold text-[#071c35]">Verify your email to continue.</p>
        <p className="text-xs text-[#5c7490]">We sent a link to {email}</p>
        {status && <p className="mt-1 text-xs font-medium text-[#1b4265]">{status}</p>}
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={sending || cooldown > 0}
        className="rounded-2xl bg-[#1b4265] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {cooldown > 0 ? `Resend (${cooldown}s)` : sending ? "Sending…" : "Resend"}
      </button>
    </div>
  )
}
