import { useEffect, useRef, useState } from "react"
import { API_URL } from "../config"
import { EMPLOYER_OUTCOMES, APPLICANT_OUTCOMES, outcomeLabel } from "../../shared/employmentReporting.js"
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import ConfirmDialog from './ConfirmDialog'

function HireReportForm({ token, applicantId, jobId, referralId, onCreated, reporterRole = 'Employer', existingReport, initialStatus, onCancel }) {
  const isNewOutcome = initialStatus && initialStatus !== existingReport?.status
  const [status, setStatus] = useState(initialStatus || existingReport?.status || 'hired')
  const [employmentDate, setEmploymentDate] = useState(isNewOutcome ? '' : existingReport?.employmentDate || '')
  const [notes, setNotes] = useState(isNewOutcome ? '' : existingReport?.notes || '')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState(false)
  const outcomes = reporterRole === 'Applicant' ? APPLICANT_OUTCOMES : EMPLOYER_OUTCOMES
  const fieldId = `${reporterRole}-${referralId || jobId}`
  const [submitted, setSubmitted] = useState(null)
  const inFlight = useRef(false)
  const previousInput = useRef({ existingReport, initialStatus })

  useEffect(() => {
    if (previousInput.current.existingReport === existingReport && previousInput.current.initialStatus === initialStatus) return
    previousInput.current = { existingReport, initialStatus }
    const changingOutcome = initialStatus && initialStatus !== existingReport?.status
    setStatus(initialStatus || existingReport?.status || 'hired')
    setEmploymentDate(changingOutcome ? '' : existingReport?.employmentDate || '')
    setNotes(changingOutcome ? '' : existingReport?.notes || '')
  }, [existingReport, initialStatus])

  const handleSubmit = async () => {
    if (inFlight.current || reporterRole === 'Employer' && (existingReport || submitted?.key === fieldId)) return
    if (!token) {
      setError("Not authenticated")
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setError("")
    setSuccess('')

    try {
      const response = await fetchWithTimeout(`${API_URL}/api/hire-reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ applicantId, jobId, referralId, status, employmentDate: status === 'not_hired' ? '' : employmentDate, notes }),
      })

      const data = await response.json().catch(() => null)
      if (response.status === 409 && data?.code === 'EMPLOYER_REPORT_LOCKED' && data.report) {
        setConfirm(false)
        setSubmitted({ key: fieldId, report: data.report })
        onCreated?.(data.report)
        return
      }
      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`)
      }

      if (reporterRole === 'Employer') setSubmitted({ key: fieldId, report: data })
      setConfirm(false)
      if (onCreated) onCreated(data)
      setSuccess('Your update was sent to PESO.')
    } catch (err) {
      setError(err?.message || "Failed to submit hire report")
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (reporterRole === 'Employer' && (existingReport || submitted?.key === fieldId)) return null

  return (
    <form
      onSubmit={event => { event.preventDefault(); setError(''); setConfirm(true) }}
      className="mt-4 rounded-2xl border border-slate-300 bg-white p-4 text-slate-900"
    >
      <h4 className="text-sm font-semibold text-slate-900">
        {existingReport ? 'Update employment report' : 'Report employment outcome to PESO'}
      </h4>
      <p className="mt-2 text-sm text-slate-600">Coordinate hiring directly with the {reporterRole === 'Applicant' ? 'employer' : 'applicant'}. The employer decides deployment timing. Report hiring or deployment once it is official.</p>
      {existingReport && <p className="mt-2 text-sm text-slate-700">Last reported: {outcomeLabel(existingReport.status)}{existingReport.employmentDate ? ` (${existingReport.employmentDate})` : ''}</p>}

      <div className="mt-3">
        <label className="block text-sm font-medium text-slate-700" htmlFor={`hire-status-${fieldId}`}>
          Status
        </label>
        <select
          id={`hire-status-${fieldId}`}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
          disabled={submitting}
        >
          {outcomes.map((outcome) => <option key={outcome} value={outcome}>{outcomeLabel(outcome)}</option>)}
        </select>
      </div>
      {status !== 'not_hired' && (
        <label className="mt-3 block text-sm font-medium text-slate-700">
          {status === 'deployed' ? 'Actual deployment date (optional)' : 'Date hired (optional)'}
          <input type="date" value={employmentDate} onChange={(event) => setEmploymentDate(event.target.value)} disabled={submitting} className="shared-form-control mt-2 w-full rounded-xl px-3 py-2" />
        </label>
      )}
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Notes to PESO (optional)
        <textarea value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} disabled={submitting} className="shared-form-control mt-2 w-full rounded-xl px-3 py-2" />
      </label>

      {error && !confirm && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm text-emerald-700">{success}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
            submitting ? "bg-slate-700 text-slate-400" : "bg-cyan-500 text-slate-950"
          }`}
        >
          {submitting ? "Submitting..." : "Send update to PESO"}
        </button>
        {onCancel && <button type="button" onClick={onCancel} disabled={submitting} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Cancel</button>}
      </div>
      {confirm && <ConfirmDialog title="Send employment update to PESO?" note={`Report this applicant as ${outcomeLabel(status).toLowerCase()}${employmentDate && status !== 'not_hired' ? ` on ${employmentDate}` : ''}. ${reporterRole === 'Employer' ? 'Your employer report is final once submitted.' : 'PESO and the employer will see this update.'}`} confirmLabel="Confirm update" busyLabel="Submitting..." busy={submitting} error={error} onConfirm={handleSubmit} onCancel={() => { setConfirm(false); setError('') }} />}
    </form>
  )
}

export default HireReportForm
