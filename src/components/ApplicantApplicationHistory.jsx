import { publicApplicationHistory } from '../../shared/employmentReporting.js'
import { APPLICATION_STATUS_LABELS } from '../../shared/applicationProgress.js'
import { useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'
import { ApplicationTimeline } from './AdminReferralsPage'

export default function ApplicantApplicationHistory({ application, token, onChanged }) {
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!application) return null
  const withdrawn = ['withdrawn', 'withdrawn_by_admin'].includes(application.status)
  const status = APPLICATION_STATUS_LABELS[application.status] || { delivered: 'With employer', pending: 'With employer', pending_admin: 'Awaiting PESO referral', withdrawn_by_admin: 'Returned to PESO review', withdrawn: 'Withdrawn' }[application.status] || application.status
  const withdraw = async () => {
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/applications/${application.id}/withdraw`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setConfirm(false); onChanged?.()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900">
    <p className="font-semibold">{status}</p>
    {application.message && <p className="mt-2 text-xs">{application.message}</p>}
    <details className="mt-2"><summary>Application timeline</summary><ApplicationTimeline history={publicApplicationHistory(application.history)} /></details>
    {!withdrawn && (application.actions ? application.actions.includes('withdraw') : !['hired', 'deployed', 'not_hired'].includes(application.status)) && <button type="button" onClick={() => setConfirm(true)} className="mt-3 text-xs underline">Withdraw application</button>}
    {confirm && <ConfirmDialog title="Withdraw this application?" note="Your application stays in your history, and the employer will no longer see its profile summary." busy={busy} error={error} onConfirm={withdraw} onCancel={() => setConfirm(false)} />}
  </div>
}
