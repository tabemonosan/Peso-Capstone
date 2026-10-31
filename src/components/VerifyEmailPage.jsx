import { useEffect, useRef, useState } from "react"
import { API_URL } from "../config"

// Landing page for email verification links: /verify-email?token=...&role=...
// POSTs the token (never GET, so email scanners can't consume it).
export default function VerifyEmailPage({ onDone }) {
  const [state, setState] = useState("loading") // loading | success | error
  const [message, setMessage] = useState("")
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")
    const role = params.get("role")
    if (!token || !role) {
      setState("error")
      setMessage("This verification link is missing its token.")
      return
    }
    fetch(`${API_URL}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, role }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok || data?.error) {
          setState("error")
          setMessage(data?.error || "This verification link is invalid or has expired.")
          return
        }
        setState("success")
        // Clean the token out of the address bar
        window.history.replaceState({}, "", "/")
      })
      .catch(() => {
        setState("error")
        setMessage("Could not reach the server. Please try again.")
      })
  }, [])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo" aria-label="Public Employment Service Office">
          <img src={new URL('../assets/peso-logo.png', import.meta.url).href} alt="Public Employment Service Office logo" />
        </div>
        <div className="auth-heading">
          <h1>Email verification</h1>
        </div>
        {state === "loading" && <p className="text-center text-sm text-[#5c7490]">Verifying your email…</p>}
        {state === "success" && (
          <div className="text-center">
            <p className="text-sm font-medium text-[#07833f]">Your email has been verified. You can now sign in.</p>
            <button type="button" onClick={onDone} className="auth-primary-button auth-signin-button mt-4">
              Go to sign in
            </button>
          </div>
        )}
        {state === "error" && (
          <div className="text-center">
            <p className="text-sm font-medium text-rose-600">{message}</p>
            <p className="mt-2 text-xs text-[#5c7490]">Sign in and use the Resend button to get a new link.</p>
            <button type="button" onClick={onDone} className="auth-secondary-button mt-4">
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
