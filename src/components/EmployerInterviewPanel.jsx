import { PH_LOCATIONS } from '../../shared/phLocations.js'
import { validateInterviewInvitation, philippineDateTimeInput, nextInterviewMinute, INTERVIEW_MAX_DAYS } from '../../shared/interviewInvitation.js'
import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import { workflowRequest, workflowDate, workflowControl } from '../utils/applicationWorkflow'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import ApplicationStages from './ApplicationStages'

export default function EmployerInterviewPanel({ token, referralId, referralStatus = 'pending', outcome }) {
  const [meeting, setMeeting] = useState(null), [open, setOpen] = useState(false), [action, setAction] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [form, setForm] = useState({ scheduledAt: '', mode: 'In person', city: '', barangay: '', province: 'Albay', landmark: '', meetingLink: '', message: '' })
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { if (!open) return; setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer) }, [open])
  const load = useCallback(() => workflowRequest(token, `/referrals/${referralId}/interview`).then((result) => setMeeting(result?.id ? result : null)).catch((err) => setError(err.message)), [token, referralId])
  useEffect(() => { load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  const invite = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const { value, errors } = validateInterviewInvitation({ ...form, scheduledAt: form.scheduledAt ? new Date(`${form.scheduledAt}+08:00`) : '' })
      if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '))
      setMeeting(await workflowRequest(token, `/referrals/${referralId}/interview`, value)); setOpen(false)
    }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const perform = async (reason) => {
    setBusy(true); setError('')
    try {
      if (action === 'held') setMeeting(await workflowRequest(token, `/interviews/${meeting.id}/held`, { confirmed: true }))
      else {
        const response = await fetch(`${API_URL}/api/applications/reports`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ referralId, type: 'no_show', reason }) })
        const result = await response.json(); if (!response.ok) throw new Error(result.error)
      }
      setAction(''); await load()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  const openInvitation = () => {
    setError(''); setClock(Date.now())
    if (meeting) setForm({ scheduledAt: +new Date(meeting.scheduledAt) > Date.now() ? philippineDateTimeInput(meeting.scheduledAt) : '', mode: meeting.mode || 'In person', city: meeting.city || '', barangay: meeting.barangay || '', province: meeting.province || 'Albay', landmark: meeting.landmark || '', meetingLink: meeting.meetingLink || '', message: meeting.message || '' })
    setOpen(true)
  }
  const editable = !meeting || ['invited', 'confirmed', 'reschedule_requested', 'declined', 'cancelled'].includes(meeting.status)
  const reportPending = ['pending', 'responded', 'confirmed'].includes(meeting?.noShowReport?.status)
  const due = !reportPending && meeting?.status === 'confirmed' && +new Date(meeting.scheduledAt) <= Date.now()
  const progressStatus = outcome || (meeting?.noShowReport ? `no_show_${meeting.noShowReport.status}` : ['declined', 'cancelled'].includes(meeting?.status) ? `interview_${meeting.status}` : referralStatus)
  return <><ApplicationStages audience="employer" application={{ status: progressStatus, interview: meeting }} /><div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-900">
    <h4 className="font-semibold">Interview</h4>
    {meeting ? <><p className="mt-2">{workflowDate(meeting.scheduledAt)} · {meeting.mode}</p><p className="mt-1 text-slate-600">{meeting.location}</p><p className="mt-2 font-medium">Status: {meeting.status.replaceAll('_', ' ')}</p>{meeting.responseMessage && <p className="mt-2">Applicant response: {meeting.responseMessage}</p>}</> : <p className="mt-2 text-slate-600">No interview invitation sent yet.</p>}
    <div className="mt-3 flex flex-wrap gap-2">{editable && !meeting?.noShowReport && <button type="button" onClick={openInvitation} className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800">{meeting ? 'Send updated invitation' : 'Invite to interview'}</button>}{due && <><button type="button" onClick={() => { setError(''); setAction('held') }} className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800">Record interview held</button><button type="button" disabled={Boolean(meeting.noShowReport)} onClick={() => { setError(''); setAction('no_show') }} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Report interview no-show</button></>}</div>
    {meeting?.noShowReport && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No-show report: {meeting.noShowReport.status}. {['pending', 'responded'].includes(meeting.noShowReport.status) ? 'PESO is reviewing the report and applicant response.' : 'PESO completed its review.'}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    {open && <Modal onClose={() => !busy && setOpen(false)} labelledBy={`invite-title-${referralId}`}><h2 id={`invite-title-${referralId}`} className="text-lg font-bold">Interview invitation</h2><form className="mt-4 space-y-4" onSubmit={invite}><label className="block text-sm">Interview date and time (Philippine time)<input type="datetime-local" required min={philippineDateTimeInput(nextInterviewMinute(clock))} max={philippineDateTimeInput(new Date(clock + INTERVIEW_MAX_DAYS * 86400000))} onFocus={() => setClock(Date.now())} value={form.scheduledAt} onChange={(e) => change('scheduledAt', e.target.value)} className={`${workflowControl} mt-1`} /></label><label className="block text-sm">Mode<select value={form.mode} onChange={(e) => change('mode', e.target.value)} className={`${workflowControl} mt-1`}><option>In person</option><option>Online</option></select></label><div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">Municipality / city *<select required value={form.city} onChange={(e) => setForm(old => ({ ...old, city: e.target.value, barangay: '', province: 'Albay' }))} className={`${workflowControl} mt-1`}><option value="">Select municipality / city</option>{Object.keys(PH_LOCATIONS).map(city => <option key={city}>{city}</option>)}</select></label>
      <label className="block text-sm">Province *<select required value={form.province} onChange={(e) => change('province', e.target.value)} className={`${workflowControl} mt-1`}><option value="Albay">Albay</option></select></label>
      <label className="block text-sm">Barangay *<select required disabled={!form.city} value={form.barangay} onChange={(e) => change('barangay', e.target.value)} className={`${workflowControl} mt-1 disabled:bg-slate-100`}><option value="">Select barangay</option>{(PH_LOCATIONS[form.city] || []).map(barangay => <option key={barangay}>{barangay}</option>)}</select></label>
      <label className="block text-sm">Landmark (optional)<input maxLength={200} value={form.landmark} onChange={(e) => change('landmark', e.target.value)} className={`${workflowControl} mt-1`} /></label>
      </div>{form.mode === 'Online' && <label className="block text-sm">Meeting link *<input type="url" required maxLength={500} value={form.meetingLink} onChange={(e) => change('meetingLink', e.target.value)} className={`${workflowControl} mt-1`} /></label>}<label className="block text-sm">Message to applicant (max 50 characters)<textarea maxLength={50} value={form.message} onChange={(e) => change('message', e.target.value)} className={`${workflowControl} mt-1`} /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex gap-2"><button disabled={busy} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{busy ? 'Sending...' : 'Send invitation'}</button><button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full border border-slate-300 px-4 py-2 text-sm">Cancel</button></div></form></Modal>}
    {action && <ConfirmDialog title={action === 'held' ? 'Record interview held?' : 'Report interview no-show'} note={action === 'held' ? 'PESO will confirm attendance separately. This records your report that the interview was held.' : 'The applicant gets 7 days to respond. PESO reviews the report; it does not automatically penalize the applicant.'} requireReason={action === 'no_show'} reasonMinLength={1} busy={busy} error={error} onConfirm={perform} onCancel={() => setAction('')} />}
  </div></>
}
