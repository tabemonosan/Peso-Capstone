import { useEffect, useState } from 'react'
import Modal from './Modal'
import { API_URL } from '../config'
import { RESUME_ACCEPT, resumeError } from '../../shared/resume.js'

export default function ResumeUploader({ token, onClose }) {
  const [info, setInfo] = useState(null), [file, setFile] = useState(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    fetch(`${API_URL}/api/profile/resume`, { headers: { Authorization: `Bearer ${token}` } }).then(async response => {
      const body = await response.json()
      if (active) { if (!response.ok) setError(body.error || 'Could not load your resume.'); else setInfo(body.resumeFile) }
    }).catch(() => { if (active) setError('Could not load your resume.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])
  const save = async remove => {
    if (busy) return
    if (!remove && resumeError(file)) { setError(resumeError(file)); return }
    setBusy(true); setError('')
    try {
      const body = new FormData()
      if (!remove) body.append('resume', file)
      const response = await fetch(`${API_URL}/api/profile/resume`, { method: remove ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${token}` }, ...(remove ? {} : { body }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save your resume.')
      onClose()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <Modal onClose={busy ? () => {} : onClose} labelledBy="resume-upload-title">
    <h2 id="resume-upload-title" className="text-xl font-semibold">Resume</h2>
    <p className="mt-2 text-sm text-slate-600">Optional. Upload a PDF or DOCX, up to 5 MB. Employers reviewing your applicant profile can view your resume.</p>
    {loading ? <p role="status">Loading…</p> : <p className="mt-3 text-sm">{info ? `Current resume: ${info.originalName}` : 'No resume uploaded yet.'}</p>}
    <label className="mt-4 block text-sm">Choose resume<input type="file" accept={RESUME_ACCEPT} disabled={busy || loading} onChange={event => { const next = event.target.files?.[0] || null; setFile(next); setError(next ? resumeError(next) : '') }} className="mt-2 block w-full" /></label>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    <div className="mt-5 flex justify-end gap-2">
      {info && <button type="button" disabled={busy || loading} onClick={() => save(true)} className="px-3 py-2 text-rose-700">Remove resume</button>}
      <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-3 py-2">Close</button>
      <button type="button" disabled={busy || loading || !file || Boolean(resumeError(file))} onClick={() => save(false)} className="rounded-lg bg-blue-600 px-3 py-2 text-white">{busy ? 'Saving…' : info ? 'Replace resume' : 'Upload resume'}</button>
    </div>
  </Modal>
}
