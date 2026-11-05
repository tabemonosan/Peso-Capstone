import { useState } from 'react'
import { API_URL } from '../config'
import { POST_INTERVIEW_REQUIREMENTS, POST_INTERVIEW_FILE_MAX_BYTES } from '../../shared/postInterviewTask.js'
import { workflowDate, workflowRequest, workflowControl } from '../utils/applicationWorkflow'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import ConfirmDialog from './ConfirmDialog'

const button = 'rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
export default function PostInterviewTask({ token, interviewId, task, audience = 'applicant', canRequest = false, readOnly = false, onChanged }) {
  const employer = audience === 'employer'
  const [editing, setEditing] = useState(false), [requirements, setRequirements] = useState([]), [instructions, setInstructions] = useState('')
  const [files, setFiles] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState('')
  const [uploadKey, setUploadKey] = useState('')
  if (!task && (!employer || !canRequest)) return null
  const toggle = key => setRequirements(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key])
  const perform = async () => {
    setBusy(true); setError('')
    try {
      await workflowRequest(token, `/interviews/${interviewId}/task${confirm === 'complete' ? '/complete' : ''}`, confirm === 'complete' ? { files: Object.fromEntries(task.requirements.map(requirement => [requirement.key, requirement.file?.id])) } : { requirements, instructions })
      setConfirm(''); setEditing(false); await onChanged?.()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const upload = async key => {
    const file = files[key]
    if (!file) return
    if (file.size > POST_INTERVIEW_FILE_MAX_BYTES) { setError('Choose a file up to 5 MB.'); return }
    setBusy(true); setError('')
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetchWithTimeout(`${API_URL}/api/workflow/interviews/${interviewId}/task/${key}/file`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Upload failed.')
      setFiles(previous => ({ ...previous, [key]: null })); setUploadKey(''); await onChanged?.()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const download = async file => {
    setBusy(true); setError('')
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/workflow/interviews/${interviewId}/task/files/${file.id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'File unavailable.') }
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section aria-label="Post-interview documents" className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-sm text-slate-900">
    <h4 className="font-semibold">Background checks &amp; pre-employment documents{!task && ' (optional)'}</h4>
    {!task ? <>
      <p className="mt-2 text-xs text-slate-600">Request background-check authorization, qualification proof, or identity documents after the interview. You can continue to the hiring outcome without assigning this task.</p>
      {!editing ? <button type="button" className={`${button} mt-3`} onClick={() => setEditing(true)}>Add optional document task</button> : <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); setError(''); setConfirm('request') }}>
        <fieldset><legend className="font-medium">Documents to request</legend>{Object.entries(POST_INTERVIEW_REQUIREMENTS).map(([key, label]) => <label key={key} className="mt-2 flex items-start gap-2"><input type="checkbox" checked={requirements.includes(key)} onChange={() => toggle(key)} disabled={busy} className="mt-1" />{label}</label>)}</fieldset>
        <label className="block">Instructions for the applicant<textarea className={`${workflowControl} mt-1`} rows={3} maxLength={1000} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="Explain which authorization form to complete and which documents are needed." disabled={busy} /></label>
        <div className="flex gap-2"><button className={button} disabled={busy || !requirements.length}>Request documents</button><button type="button" className={button} onClick={() => setEditing(false)} disabled={busy}>Cancel</button></div>
      </form>}
    </> : <>
      <p className="mt-2 font-medium">Status: {{ requested: 'Awaiting documents', submitted: 'Ready for employer review', completed: 'Completed' }[task.status]}</p>
      <p className="mt-1 text-xs text-slate-600">Requested {workflowDate(task.requestedAt)}</p>
      {task.instructions && <p className="mt-3 whitespace-pre-wrap">{task.instructions}</p>}
      <p className="mt-2 text-xs text-slate-600">PDF, JPG, or PNG; up to 5 MB per requirement. Combine multiple certificates into one PDF (up to 10 pages). Files expire 90 days after upload.</p>
      <ul className="mt-3 space-y-3">{task.requirements.map(({ key, label, file }) => <li key={key} className="rounded-lg border border-blue-100 bg-white p-3">
        <p className="font-medium">{label}</p>
        {file ? <><button type="button" disabled={busy} className="mt-2 text-left text-xs text-blue-800 underline" onClick={() => download(file)}>Download {file.name}</button><p className="mt-1 text-xs text-slate-500">Uploaded {workflowDate(file.uploadedAt)} · Expires {workflowDate(file.expiresAt)}</p></> : <p className="mt-1 text-xs text-slate-600">Not uploaded yet</p>}
        {!employer && !readOnly && task.status !== 'completed' && (!file || file.version < 3) && <div className="mt-2"><label className="block text-xs">{file ? 'Replace' : 'Upload'} {label}<input key={file?.id || key} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} className="mt-1 block w-full text-xs" onChange={event => setFiles(previous => ({ ...previous, [key]: event.target.files?.[0] }))} /></label><button type="button" className={`${button} mt-2`} disabled={busy || !files[key]} onClick={() => { setError(''); setUploadKey(key) }}>{busy ? 'Please wait...' : 'Upload document'}</button></div>}
      </li>)}</ul>
      {employer && !readOnly && task.status !== 'completed' && <button type="button" className={`${button} mt-3`} disabled={busy || task.status !== 'submitted'} onClick={() => { setError(''); setConfirm('complete') }}>Mark document task complete</button>}
      {task.completedAt && <p className="mt-3 text-xs text-emerald-800">Employer marked complete {workflowDate(task.completedAt)}. The hiring outcome is recorded separately.</p>}
    </>}
    {error && !confirm && !uploadKey && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    {uploadKey && <ConfirmDialog title="Upload this document?" note={`Send ${files[uploadKey]?.name || 'the selected file'} to the employer for this post-interview requirement. It will replace any previous file for this requirement.`} confirmLabel="Confirm upload" busyLabel="Uploading..." busy={busy} error={error} onConfirm={() => upload(uploadKey)} onCancel={() => { setUploadKey(''); setError('') }} />}
    {confirm && <ConfirmDialog title={confirm === 'complete' ? 'Mark document task complete?' : 'Request pre-employment documents?'} note={confirm === 'complete' ? 'Confirm that you reviewed all requested documents. This does not record a hiring outcome.' : 'The applicant will see these requirements and instructions and can upload the requested files privately in My applications.'} busy={busy} error={error} onConfirm={perform} onCancel={() => setConfirm('')} />}
  </section>
}
