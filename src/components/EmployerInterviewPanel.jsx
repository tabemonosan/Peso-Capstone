import { PH_LOCATIONS } from '../../shared/phLocations.js'
import { validateInterviewInvitation, philippineDateTimeInput, nextInterviewMinute, INTERVIEW_MAX_DAYS } from '../../shared/interviewInvitation.js'
import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import { workflowRequest, workflowDate, workflowControl } from '../utils/applicationWorkflow'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import ApplicationStages from './ApplicationStages'
import PostInterviewTask from './PostInterviewTask'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

export default function EmployerInterviewPanel({ token, referralId, referralStatus = 'pending', outcome }) {
  const [loaded, setLoaded] = useState(false)
  const [meeting, setMeeting] = useState(null), [open, setOpen] = useState(false), [action, setAction] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [form, setForm] = useState({ scheduledAt: '', mode: 'In person', city: '', barangay: '', province: 'Albay', landmark: '', meetingLink: '', message: '' })
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const load = useCallback(() => workflowRequest(token, `/referrals/${referralId}/interview`).then((result) => setMeeting(result?.id ? result : null)).catch((err) => setError(err.message)).finally(() => setLoaded(true)), [token, referralId])
  useEffect(() => { setLoaded(false); load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
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
      if (action === 'held') setMeeting(await workflowRequest(token, `/interviews/${meeting.id}/held`, { confirmed: true, confirmEarly: !due, reason }))
      else {
        // A previous timed-out POST may have saved successfully. Check before retrying.
        const current = await workflowRequest(token, `/referrals/${referralId}/interview`)
        if (current?.noShowReport) { setMeeting(current); setAction(''); return }
        const response = await fetchWithTimeout(`${API_URL}/api/applications/reports`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ referralId, type: 'no_show', reason, confirmEarly: !due }) })
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
  const finalOutcome = ['hired', 'deployed', 'not_hired'].includes(outcome)
  const editable = !finalOutcome && (!meeting || ['invited', 'confirmed', 'reschedule_requested', 'declined', 'cancelled'].includes(meeting.status))
  const reportPending = ['pending', 'responded', 'confirmed'].includes(meeting?.noShowReport?.status)
  const canRecord = !finalOutcome && !reportPending && meeting?.status === 'confirmed'
  const due = canRecord && +new Date(meeting.scheduledAt) <= clock
  const resultRecordedAt = meeting?.noShowReport?.reportedAt || [...(meeting?.history || [])].reverse().find(entry => ['employer_recorded_interview_held', 'employer_reported_no_show'].includes(entry.action))?.at
  const progressStatus = outcome || (meeting?.noShowReport && meeting.noShowReport.status !== 'dismissed' ? `no_show_${meeting.noShowReport.status}` : ['declined', 'cancelled'].includes(meeting?.status) ? `interview_${meeting.status}` : referralStatus)
  return <>{loaded ? <ApplicationStages audience="employer" application={{ status: progressStatus, interview: meeting }} /> : <p role="status" className="text-sm text-slate-600">Loading interview progress…</p>}<div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-900">
    <h4 className="font-semibold">Interview</h4>
    {meeting ? <><p className="mt-2">{workflowDate(meeting.scheduledAt)} · {meeting.mode}</p><p className="mt-1 text-slate-600">{meeting.location}</p><p className="mt-2 font-medium">Status: {['held', 'attended'].includes(meeting.status) ? 'Interview completed' : meeting.status.replaceAll('_', ' ')}</p>{meeting.responseMessage && <p className="mt-2">Applicant response: {meeting.responseMessage}</p>}</> : <p className="mt-2 text-slate-600">No interview invitation sent yet.</p>}
    <div className="mt-3 flex flex-wrap gap-2">{editable && !reportPending && <button type="button" onClick={openInvitation} className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800">{meeting ? 'Send updated invitation' : 'Invite to interview'}</button>}</div>
    {canRecord && <div className="mt-4 rounded-xl border border-blue-200 bg-white p-3">
      <h5 className="font-semibold">Record interview result</h5>
      <p id={`interview-result-help-${referralId}`} className="mt-1 text-xs text-slate-600">{due ? 'Choose Interview completed if the applicant attended and the interview took place. Report no-show if the applicant did not attend.' : 'You can record a result ahead of time. You will be asked to confirm the early decision and provide a reason. Your confirmation time will be recorded.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} aria-describedby={`interview-result-help-${referralId}`} onClick={() => { setError(''); setAction('held') }} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Interview completed</button><button type="button" disabled={busy || Boolean(meeting.noShowReport)} aria-describedby={`interview-result-help-${referralId}`} onClick={() => { setError(''); setAction('no_show') }} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50">Report no-show</button></div>
    </div>}
    {meeting?.noShowReport && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No-show report: {meeting.noShowReport.status}. {['pending', 'responded'].includes(meeting.noShowReport.status) ? 'PESO is reviewing the report and applicant response.' : 'PESO completed its review.'}</p>}
    {resultRecordedAt && <p className="mt-3 text-xs text-slate-600">Decision confirmed: {workflowDate(resultRecordedAt)} (Philippine time).{+new Date(resultRecordedAt) < +new Date(meeting.scheduledAt) && ' Recorded ahead of the scheduled interview.'}</p>}
    {meeting && <PostInterviewTask token={token} interviewId={meeting.id} task={meeting.postInterviewTask} audience="employer" canRequest={!finalOutcome && !reportPending && ['held', 'attended'].includes(meeting.status)} readOnly={finalOutcome} onChanged={load} />}
    {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    {open && <Modal onClose={() => !busy && setOpen(false)} labelledBy={`invite-title-${referralId}`}><h2 id={`invite-title-${referralId}`} className="text-lg font-bold">Interview invitation</h2><form className="mt-4 space-y-4" onSubmit={invite}><label className="block text-sm">Interview date and time (Philippine time)<input type="datetime-local" required min={philippineDateTimeInput(nextInterviewMinute(clock))} max={philippineDateTimeInput(new Date(clock + INTERVIEW_MAX_DAYS * 86400000))} onFocus={() => setClock(Date.now())} value={form.scheduledAt} onChange={(e) => change('scheduledAt', e.target.value)} className={`${workflowControl} mt-1`} /></label><label className="block text-sm">Mode<select value={form.mode} onChange={(e) => change('mode', e.target.value)} className={`${workflowControl} mt-1`}><option>In person</option><option>Online</option></select></label><div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">Municipality / city *<select required value={form.city} onChange={(e) => setForm(old => ({ ...old, city: e.target.value, barangay: '', province: 'Albay' }))} className={`${workflowControl} mt-1`}><option value="">Select municipality / city</option>{Object.keys(PH_LOCATIONS).map(city => <option key={city}>{city}</option>)}</select></label>
      <label className="block text-sm">Province *<select required value={form.province} onChange={(e) => change('province', e.target.value)} className={`${workflowControl} mt-1`}><option value="Albay">Albay</option></select></label>
      <label className="block text-sm">Barangay *<select required disabled={!form.city} value={form.barangay} onChange={(e) => change('barangay', e.target.value)} className={`${workflowControl} mt-1 disabled:bg-slate-100`}><option value="">Select barangay</option>{(PH_LOCATIONS[form.city] || []).map(barangay => <option key={barangay}>{barangay}</option>)}</select></label>
      <label className="block text-sm">Landmark (optional)<input maxLength={200} value={form.landmark} onChange={(e) => change('landmark', e.target.value)} className={`${workflowControl} mt-1`} /></label>
      </div>{form.mode === 'Online' && <label className="block text-sm">Meeting link *<input type="url" required maxLength={500} value={form.meetingLink} onChange={(e) => change('meetingLink', e.target.value)} className={`${workflowControl} mt-1`} /></label>}<label className="block text-sm">Message to applicant (max 50 characters)<textarea maxLength={50} value={form.message} onChange={(e) => change('message', e.target.value)} className={`${workflowControl} mt-1`} /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex gap-2"><button disabled={busy} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{busy ? 'Sending...' : 'Send invitation'}</button><button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full border border-slate-300 px-4 py-2 text-sm">Cancel</button></div></form></Modal>}
    {action && <ConfirmDialog title={!due ? 'Record this interview result ahead of time?' : action === 'held' ? 'Mark interview as completed?' : 'Report no-show'} confirmLabel={!due ? 'Yes, record early' : 'Confirm'} note={`${!due ? `The interview is scheduled for ${workflowDate(meeting.scheduledAt)}. Are you sure you want to record ${action === 'held' ? 'Interview completed' : 'a no-show'} now? Your confirmation time and reason will be recorded. ` : ''}${action === 'held' ? 'Confirm that the applicant attended and the interview took place. This advances the application to step 3. PESO confirms attendance separately.' : 'This records a missed interview for step 3 review. The applicant gets 7 days to respond. PESO reviews the report; it does not automatically penalize the applicant.'}`} requireReason={!due || action === 'no_show'} reasonMinLength={1} busy={busy} error={error} onConfirm={perform} onCancel={() => setAction('')} />}
  </div></>
}
