import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import HireReportForm from './HireReportForm'
import Pagination from './Pagination'
import { usePagination } from '../hooks/usePagination'
import { outcomeLabel } from '../../shared/employmentReporting.js'

const formatReportDate = (value, includeTime = false) => {
  if (!value) return 'Not provided'
  const date = new Date(includeTime ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return 'Not provided'
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' }
  if (includeTime) return date.toLocaleString('en-PH', { ...options, hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString('en-PH', options)
}

export default function ApplicantEmploymentReports({ token, applicantId }) {
  const [referrals, setReferrals] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState({})
  const pagination = usePagination({ syncUrl: false })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const load = async (path) => {
      const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load employment reports')
      return data
    }
    Promise.all([load('/api/employment-opportunities/mine'), load('/api/hire-reports')])
      .then(([items, updates]) => { if (!cancelled) { setReferrals(items.filter((item) => item.status === 'accepted' && item.referralId)); setReports(updates) } })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  return (
    <section className="portal-card rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
      <h2 className="text-xl font-semibold">Employment updates to PESO</h2>
      <p className="mt-3 text-sm text-slate-600">Accepted employer referrals appear here. Inform PESO once you are officially hired or deployed, even if your employer has already reported it. Arrange interviews, hiring, and deployment directly with the employer. Your NSRP form stays with PESO.</p>
      {loading && <p className="mt-4">Loading referrals...</p>}
      {error && <p role="alert" className="mt-4 text-rose-700">{error}</p>}
      {!loading && !error && !referrals.length && <p className="mt-4">No accepted referrals yet. Your employment report will become available after the employer accepts your PESO referral.</p>}
      {!loading && !error && pagination.paginate(referrals).map((referral) => {
        const jobId = referral.jobId?._id
        const existing = reports.find((report) => String(report.jobId) === String(jobId))
        const editMode = editing[String(jobId)]
        return (
          <article key={referral._id} className="mt-5 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">{referral.jobId?.title || 'Job no longer available'}</h3>
            <p className="mt-1 text-sm">{referral.employerId?.companyName || referral.jobId?.company}</p>
            <p className="mt-1 text-sm">Employer contact: {referral.employerId?.email || 'Contact PESO'}{referral.employerId?.phone ? ` / ${referral.employerId.phone}` : ''}</p>
            <p className="mt-1 text-sm">Referral accepted by the employer. Submit an update once your hiring or deployment is official.</p>
            {existing && !editMode && (
              <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-slate-900">
                <h4 role="status" className="font-semibold text-emerald-900">Update sent to PESO</h4>
                <dl className="mt-2 space-y-1">
                  <div><dt className="inline font-semibold">Status: </dt><dd className="inline">{outcomeLabel(existing.status)}</dd></div>
                  <div><dt className="inline font-semibold">{existing.status === 'deployed' ? 'Date deployed: ' : 'Date hired: '}</dt><dd className="inline">{formatReportDate(existing.employmentDate)}</dd></div>
                  <div><dt className="inline font-semibold">Submitted: </dt><dd className="inline">{formatReportDate(existing.reportedAt, true)}</dd></div>
                  {existing.notes && <div><dt className="inline font-semibold">Notes to PESO: </dt><dd className="inline whitespace-pre-wrap break-words">{existing.notes}</dd></div>}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditing((current) => ({ ...current, [String(jobId)]: 'edit' }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold">Edit update</button>
                  {existing.status === 'hired' && <button type="button" onClick={() => setEditing((current) => ({ ...current, [String(jobId)]: 'deploy' }))} className="rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white">Report deployment</button>}
                </div>
              </div>
            )}
            {jobId && (!existing || editMode) && <HireReportForm
              key={`${jobId}-${editMode || 'new'}`}
              token={token} applicantId={String(applicantId)} jobId={String(jobId)}
              referralId={String(referral.referralId)} reporterRole="Applicant" existingReport={existing}
              initialStatus={editMode === 'deploy' ? 'deployed' : undefined}
              onCancel={existing ? () => setEditing((current) => ({ ...current, [String(jobId)]: undefined })) : undefined}
              onCreated={(report) => {
                setReports((current) => [...current.filter((item) => String(item.jobId) !== String(report.jobId)), report])
                setEditing((current) => ({ ...current, [String(jobId)]: undefined }))
              }}
            />}
          </article>
        )
      })}
      {!loading && !error && referrals.length > 0 && <Pagination page={pagination.page} pageSize={pagination.pageSize} totalItems={referrals.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="referrals" ariaLabel="Employment reports pagination" />}
    </section>
  )
}
