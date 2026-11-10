import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../config'
import Modal from './Modal'
import PasswordInput from './PasswordInput'
import PasswordChecklist from './PasswordChecklist'
import { passwordErrorMessage } from '../utils/passwordPolicy'

const control = 'shared-form-control mt-1 block w-full rounded-lg px-3 py-2'
const primary = 'rounded-full bg-cyan-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50'
export default function ForgotPasswordModal({ initialEmail = '', onClose, onDone }) {
  const [step, setStep] = useState('email'), [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState(''), [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [cooldown, setCooldown] = useState(0)
  const inFlight = useRef(false)
  useEffect(() => {
    if (!cooldown) return undefined
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const request = async (action, payload) => {
    const response = await fetch(`${API_URL}/api/auth/password-recovery/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      if (data?.retryAfter) setCooldown(data.retryAfter)
      throw new Error(data?.error || 'Recovery is unavailable. Please try again.')
    }
    return data
  }
  const run = async operation => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (err) { setError(err.message || 'Recovery is unavailable. Please try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const send = () => run(async () => {
    const result = await request('request', { email: email.trim() })
    setCooldown(result.retryAfter || 60); setStep('code'); setCode(''); setResetToken(''); setNotice(result.message)
  })
  const submit = event => {
    event.preventDefault()
    if (step === 'email') return send()
    if (step === 'code') return run(async () => {
      const result = await request('verify', { email: email.trim(), code })
      setResetToken(result.resetToken); setCode(''); setStep('password')
    })
    const invalid = passwordErrorMessage(password)
    if (invalid) return setError(invalid)
    if (confirmation !== password) return setError('The passwords do not match.')
    return run(async () => {
      await request('reset', { email: email.trim(), resetToken, newPassword: password })
      setPassword(''); setConfirmation(''); setResetToken(''); setStep('done')
    })
  }
  return <Modal onClose={busy ? undefined : onClose} labelledBy="forgot-password-title" maxWidth="max-w-md">
    <div className="flex items-start justify-between gap-3"><h2 id="forgot-password-title" className="text-xl font-bold">{step === 'done' ? 'Password reset' : 'Forgot password'}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close password recovery" className="rounded-full border border-slate-300 px-3 py-2 text-sm">Close</button></div>
    {step === 'done' ? <><p role="status" className="mt-4 text-sm">Your password has been reset. Sign in with your new password.</p><button type="button" className={`${primary} mt-5`} onClick={() => onDone(email.trim())}>Return to sign in</button></> : <>
      <p className="mt-3 text-sm text-slate-600">{step === 'email' ? 'Enter your registered email to request a verification code.' : step === 'code' ? `Enter the six-digit code sent to ${email.trim()}. The code expires in 10 minutes.` : 'Email verified. Choose a new password for your account.'}</p>
      {notice && <p role="status" className="mt-3 text-sm text-slate-600">{notice}</p>}
      <form onSubmit={submit} className="mt-5 space-y-4">
        {step === 'email' && <label className="block text-sm font-medium">Registered email<input type="email" required maxLength={254} autoComplete="email" className={control} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>}
        {step === 'code' && <label className="block text-sm font-medium">Verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className={`${control} text-center text-xl tracking-[.3em]`} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} /></label>}
        {step === 'password' && <><label className="block text-sm font-medium">New password<PasswordInput required maxLength={64} autoComplete="new-password" className={control} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label><label className="block text-sm font-medium">Confirm new password<PasswordInput required maxLength={64} autoComplete="new-password" className={control} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label><PasswordChecklist password={password} confirmPassword={confirmation} /></>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button type="submit" className={primary} disabled={busy || (step === 'email' && cooldown > 0)}>{busy ? 'Please wait...' : step === 'email' ? 'Send verification code' : step === 'code' ? 'Verify code' : 'Reset password'}</button>
      </form>
      {step === 'code' && <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy || cooldown > 0} className="text-sm font-semibold text-cyan-800 disabled:opacity-50" onClick={send}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</button><button type="button" disabled={busy} className="text-sm underline" onClick={() => { setStep('email'); setCode(''); setResetToken(''); setError(''); setNotice(''); setCooldown(0) }}>Use another email</button></div>}
      {step === 'password' && <button type="button" disabled={busy} className="mt-4 text-sm underline" onClick={() => { setStep('code'); setPassword(''); setConfirmation(''); setResetToken(''); setError('') }}>Request a new code</button>}
    </>}
  </Modal>
}
