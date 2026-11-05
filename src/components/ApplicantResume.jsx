import { useState } from 'react'
import { API_URL } from '../config'

export default function ApplicantResume({ applicant }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!applicant.resumeFile?.originalName) return null
  const download = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicant._id || applicant.id}/resume`, { headers: { Authorization: `Bearer ${localStorage.getItem('peso-token')}` } })
      if (!response.ok) throw new Error('Resume unavailable. Please refresh and try again.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = applicant.resumeFile.originalName
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setError(err.message || 'Could not download resume.') }
    finally { setBusy(false) }
  }
  return <section className="candidate-profile-section" aria-label="Applicant resume">
    <h3>Resume</h3>
    <button type="button" onClick={download} disabled={busy} className="mt-2 break-all text-blue-700 underline">{busy ? 'Downloading…' : `Download resume: ${applicant.resumeFile.originalName}`}</button>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
  </section>
}
