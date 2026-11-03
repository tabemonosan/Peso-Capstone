import { useEffect, useState } from 'react'
import { applicationActions, applicationWithdrawalDeadline } from '../../shared/applicationProgress.js'

export default function ApplicationWithdrawal({ application, onWithdraw }) {
  const [now, setNow] = useState(Date.now)
  const deadline = application.withdrawalDeadline || applicationWithdrawalDeadline(application.interview)
  const remaining = deadline ? Math.max(0, Math.ceil((+new Date(deadline) - now) / 1000)) : 0
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [application.id])
  const terminal = ['withdrawn', 'withdrawn_by_admin', 'declined', 'declined_by_admin', 'hired', 'deployed', 'not_hired', 'no_show_confirmed', 'no_show_dismissed'].includes(application.status)
  if (terminal) return null
  const permitted = (!application.actions || application.actions.includes('withdraw')) && applicationActions({ ...application, report: application.noShowReport, now: new Date(now) }).includes('withdraw')
  if (!permitted && (!deadline || remaining > 0)) return null
  const clock = [Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60].map(value => String(value).padStart(2, '0')).join(':')
  return <div className="mt-3 text-xs text-slate-600">
    <p>{!deadline ? 'Your 24-hour withdrawal countdown starts when you accept the interview invitation.' : remaining > 0 ? <>Withdrawal time remaining: <span role="timer" aria-label="Time remaining to withdraw" className="font-semibold tabular-nums text-blue-800">{clock}</span><span className="mt-1 block">You can withdraw within 24 hours of accepting the interview invitation, before the interview starts.</span></> : 'The 24-hour withdrawal window has ended. Contact PESO if you need assistance.'}</p>
    <button type="button" disabled={!permitted || Boolean(deadline && remaining === 0)} onClick={onWithdraw} className="mt-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Withdraw application</button>
  </div>
}
