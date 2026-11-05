import { registeredInterviewAddress, validateInterviewInvitation, philippineDateTimeInput, nextInterviewMinute, INTERVIEW_MAX_DAYS } from '../../shared/interviewInvitation.js'
import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import { workflowRequest, workflowDate, workflowControl } from '../utils/applicationWorkflow'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import ApplicationStages from './ApplicationStages'
import PostInterviewTask from './PostInterviewTask'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

async function loadInvitationAddress(token) {
  const response = await fetchWithTimeout(`${API_URL}/api/profile`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('Your registered address could not be loaded. Please try again.')
  const address = registeredInterviewAddress(await response.json())
  if (!address.city || !address.province || !address.barangay) throw new Error('Your registered address is incomplete. Update your NSRP registration address before sending an invitation.')
  return address
}

export default function EmployerInterviewPanel({ token, referralId, referralStatus = 'pending', outcome, renderActions }) {
  const [loaded, setLoaded] = useState(false)
  const [meeting, setMeeting] = useState(null), [open, setOpen] = useState(false), [action, setAction] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [form, setForm] = useState({ scheduledAt: '', mode: 'In person', city: '', barangay: '', province: 'Albay', landmark: '', meetingLink: '', message: '' })
  const [clock, setClock] = useState(Date.now())
  const [interviewOutcome, setInterviewOutcome] = useState('')
  const [pendingInvitation, setPendingInvitation] = useState(null)
  useEffect(() => { setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const load = useCallback(() => workflowRequest(token, `/referrals/${referralId}/interview`).then((result) => setMeeting(result?.id ? result : null)).catch((err) => setError(err.message)).finally(() => setLoaded(true)), [token, referralId])
  useEffect(() => { setLoaded(false); load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load])
  const invite = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const address = await loadInvitationAddress(token)
      const { value, errors } = validateInterviewInvitation({ ...form, ...address, scheduledAt: form.scheduledAt ? new Date(`${form.scheduledAt}+08:00`) : '' })
      if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '))
      setPendingInvitation({ ...value, useRegisteredAddress: true })
    }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const sendInvitation = async () => {
    if (busy || !pendingInvitation) return
    setBusy(true); setError('')
    try {
      setMeeting(await workflowRequest(token, `/referrals/${referralId}/interview`, pendingInvitation))
      setPendingInvitation(null); setOpen(false)
    } catch (err) { setError(err.message || 'Could not send invitation.') }
    finally { setBusy(false) }
  }
  const perform = async (reason) => {
    setBusy(true); setError('')
    try {
      if (action === 'held') setMeeting(await workflowRequest(token, `/interviews/${meeting.id}/held`, { confirmed: true, confirmEarly: !due, reason, ...(interviewOutcome ? { outcome: interviewOutcome } : {}) }))
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
  const openInvitation = async () => {
    if (busy) return
    setError(''); setClock(Date.now()); setBusy(true)
    try {
      const address = await loadInvitationAddress(token)
      setForm(current => ({ ...current, ...(meeting ? { scheduledAt: +new Date(meeting.scheduledAt) > Date.now() ? philippineDateTimeInput(meeting.scheduledAt) : '', mode: meeting.mode || 'In person', meetingLink: meeting.meetingLink || '', message: meeting.message || '' } : {}), ...address }))
      setOpen(true)
    } catch (err) { setError(err.message || 'Your registered address could not be loaded. Please try again.') }
    finally { setBusy(false) }
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
    <div className="mt-3 flex flex-wrap gap-2">{editable && !reportPending && <button type="button" disabled={busy} onClick={openInvitation} className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800">{meeting ? 'Send updated invitation' : 'Invite to interview'}</button>}</div>
    {canRecord && <div className="mt-4 rounded-xl border border-blue-200 bg-white p-3">
      <h5 className="font-semibold">Record interview result</h5>
      <label className="mt-3 block text-sm">Interview outcome<select className={workflowControl} value={interviewOutcome} onChange={event => setInterviewOutcome(event.target.value)}><option value="">Completed (outcome not specified)</option><option value="passed">Passed</option><option value="did_not_pass">Did not pass</option><option value="not_selected">Not selected after the interview</option><option value="hired">Hired after the interview</option></select></label>
      <p id={`interview-result-help-${referralId}`} className="mt-1 text-xs text-slate-600">{due ? 'Choose Interview completed if the applicant attended and the interview took place. Report no-show if the applicant did not attend.' : 'You can record a result ahead of time. You will be asked to confirm the early decision and provide a reason. Your confirmation time will be recorded. No-show reports are available only after the scheduled interview time.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} aria-describedby={`interview-result-help-${referralId}`} onClick={() => { setError(''); setAction('held') }} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Interview completed</button><button type="button" disabled={busy || !due || Boolean(meeting.noShowReport)} aria-describedby={`interview-result-help-${referralId}`} onClick={() => { setError(''); setAction('no_show') }} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50">Report no-show</button></div>
    </div>}
    {meeting?.noShowReport && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No-show report: {meeting.noShowReport.status}. {['pending', 'responded'].includes(meeting.noShowReport.status) ? 'The reputation policy was applied automatically for new reports. The applicant can respond or request a review.' : 'PESO completed its review.'}</p>}
    {resultRecordedAt && <p className="mt-3 text-xs text-slate-600">Decision confirmed: {workflowDate(resultRecordedAt)} (Philippine time).{+new Date(resultRecordedAt) < +new Date(meeting.scheduledAt) && ' Recorded ahead of the scheduled interview.'}</p>}
    {meeting && <PostInterviewTask token={token} interviewId={meeting.id} task={meeting.postInterviewTask} audience="employer" canRequest={!finalOutcome && !reportPending && ['held', 'attended'].includes(meeting.status)} readOnly={finalOutcome} onChanged={load} />}
    {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    {open && <Modal onClose={() => !busy && setOpen(false)} labelledBy={`invite-title-${referralId}`}><h2 id={`invite-title-${referralId}`} className="text-lg font-bold">Interview invitation</h2><form className="mt-4 space-y-4" onSubmit={invite}><label className="block text-sm">Interview date and time (Philippine time)<input type="datetime-local" required min={philippineDateTimeInput(nextInterviewMinute(clock))} max={philippineDateTimeInput(new Date(clock + INTERVIEW_MAX_DAYS * 86400000))} onFocus={() => setClock(Date.now())} value={form.scheduledAt} onChange={(e) => change('scheduledAt', e.target.value)} className={`${workflowControl} mt-1`} /></label><label className="block text-sm">Mode<select value={form.mode} onChange={(e) => change('mode', e.target.value)} className={`${workflowControl} mt-1`}><option>In person</option><option>Online</option></select></label>
      {form.mode === 'Online' && <label className="block text-sm">Meeting link *<input type="url" required maxLength={500} value={form.meetingLink} onChange={(e) => change('meetingLink', e.target.value)} className={`${workflowControl} mt-1`} /></label>}<label className="block text-sm">Message to applicant (max 50 characters)<textarea maxLength={50} value={form.message} onChange={(e) => change('message', e.target.value)} className={`${workflowControl} mt-1`} /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex gap-2"><button disabled={busy} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{busy ? 'Sending...' : 'Send invitation'}</button><button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full border border-slate-300 px-4 py-2 text-sm">Cancel</button></div></form></Modal>}
    {action && <ConfirmDialog title={!due ? 'Record this interview result ahead of time?' : action === 'held' ? 'Mark interview as completed?' : 'Report no-show'} confirmLabel={!due ? 'Yes, record early' : 'Confirm'} note={`${!due ? `The interview is scheduled for ${workflowDate(meeting.scheduledAt)}. Are you sure you want to record ${action === 'held' ? 'Interview completed' : 'a no-show'} now? Your confirmation time and reason will be recorded. ` : ''}${action === 'held' ? 'Confirm that the applicant attended and the interview took place. This advances the application to step 3. PESO can review disputed attendance records.' : 'This applies the no-show reputation penalty immediately, without PESO confirmation. The applicant gets 7 days to respond and can request a penalty review.'}`} requireReason={!due || action === 'no_show'} reasonMinLength={1} busy={busy} error={error} onConfirm={perform} onCancel={() => setAction('')} />}
    {pendingInvitation && <ConfirmDialog title={meeting ? 'Send updated interview invitation?' : 'Send interview invitation?'} note="The applicant will receive this invitation and can accept, decline, or request a reschedule." confirmLabel="Confirm send" busyLabel="Sending..." busy={busy} error={error} onConfirm={sendInvitation} onCancel={() => { setPendingInvitation(null); setError('') }}>
      <dl className="mt-3 space-y-2 text-sm text-slate-900">
        <div><dt className="font-semibold">Interview time</dt><dd>{workflowDate(pendingInvitation.scheduledAt)}</dd></div>
        <div><dt className="font-semibold">Mode</dt><dd>{pendingInvitation.mode}</dd></div>
        <div><dt className="font-semibold">Location</dt><dd>{pendingInvitation.location}</dd></div>
        {pendingInvitation.message && <div><dt className="font-semibold">Message</dt><dd>{pendingInvitation.message}</dd></div>}
      </dl>
    </ConfirmDialog>}
  </div>{renderActions?.(loaded && ['held', 'attended'].includes(meeting?.status) && !reportPending && !finalOutcome)}</>
}
