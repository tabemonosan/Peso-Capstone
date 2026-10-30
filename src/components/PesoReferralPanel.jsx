import { useEffect, useMemo, useRef, useState } from "react"
import { API_URL } from "../config"
import Pagination from "./Pagination"
import { usePagination } from "../hooks/usePagination"
import { formatFullName } from "../../shared/nameFields.js"
import { outcomeLabel } from "../../shared/employmentReporting.js"

function PesoReferralPanel({ token, adminUsers, onLoadApplicants, initialJobId, initialApplicantIds = [], onViewUpdates }) {
  const [jobs, setJobs] = useState([])
  const [referredApplicantIdsByJob, setReferredApplicantIdsByJob] = useState({})
  const [referralStatusByJob, setReferralStatusByJob] = useState({})
  const [hireReports, setHireReports] = useState([])
  const referralJobsPagination = usePagination({ syncUrl: false })
  const hireReportsPagination = usePagination({ syncUrl: false })
  const panelApplicantsPg = usePagination({ syncUrl: false })
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const jobGroupRefs = useRef({})

  const applicants = useMemo(
    () => (Array.isArray(adminUsers) ? adminUsers.filter((user) => user.role === "Applicant") : []),
    [adminUsers],
  )

  const initialApplicantIdSet = useMemo(
    () => new Set(Array.isArray(initialApplicantIds) ? initialApplicantIds.map((id) => String(id)) : []),
    [initialApplicantIds],
  )

  const orderedJobs = useMemo(
    () => [...jobs].sort((jobA, jobB) => {
      const jobAId = String(jobA._id || jobA.id)
      const jobBId = String(jobB._id || jobB.id)
      const jobAComplete = applicants.every((applicant) =>
        (referredApplicantIdsByJob[jobAId] || []).includes(String(applicant.id || applicant._id)),
      )
      const jobBComplete = applicants.every((applicant) =>
        (referredApplicantIdsByJob[jobBId] || []).includes(String(applicant.id || applicant._id)),
      )
      return Number(jobAComplete) - Number(jobBComplete)
    }),
    [jobs, applicants, referredApplicantIdsByJob],
  )

  useEffect(() => {
    if (!token) return

    setLoading(true)
    setError("")

    const headers = { Authorization: `Bearer ${token}` }

    const jobsRequest = fetch(`${API_URL}/api/jobs?status=approved`, { headers })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || `Failed to load jobs (${response.status})`)
        return Array.isArray(data) ? data : []
      })
      .then((data) => setJobs(data))

    const referralsRequest = fetch(`${API_URL}/api/referrals/admin`, { headers })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || `Failed to load referrals (${response.status})`)
        return Array.isArray(data) ? data : []
      })
      .then((data) => {
        const referredByJob = {}
        const statusByJob = {}
        data.forEach((referral) => {
          const jobId = String(referral.jobId || "")
          const applicantId = String(referral.applicantId || "")
          if (!jobId || !applicantId) return
          referredByJob[jobId] = [...new Set([...(referredByJob[jobId] || []), applicantId])]
          statusByJob[jobId] = { ...(statusByJob[jobId] || {}), [applicantId]: referral.status || 'pending' }
        })
        setReferredApplicantIdsByJob(referredByJob)
        setReferralStatusByJob(statusByJob)
      })

    const hireReportsRequest = fetch(`${API_URL}/api/hire-reports`, { headers })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || `Failed to load hire reports (${response.status})`)
        return Array.isArray(data) ? data : []
      })
      .then((data) => setHireReports(data))

    Promise.all([jobsRequest, hireReportsRequest, referralsRequest])
      .catch((err) => {
        setError(err?.message || "Failed to load referral panel data")
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (token && applicants.length === 0 && onLoadApplicants) {
      onLoadApplicants()
    }
  }, [token, applicants.length, onLoadApplicants])

  useEffect(() => {
    if (!initialJobId) return

    const jobGroup = jobGroupRefs.current[String(initialJobId)]
    if (jobGroup) {
      jobGroup.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [initialJobId, jobs])

  const handleCreateReferrals = async (jobId, applicantIds) => {
    if (!token) {
      setError("Not authenticated")
      return
    }
    if (applicantIds.length === 0) {
      return
    }

    setSubmitting(true)
    setError("")
    setSuccess("")
    setReferredApplicantIdsByJob((current) => ({
      ...current,
      [jobId]: [...new Set([...(current[jobId] || []), ...applicantIds])],
    }))

    try {
      const response = await fetch(`${API_URL}/api/referrals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId,
          applicantIds,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`)
      }

      setSuccess(`Created ${data?.createdCount || 0} referral(s).`)
      setReferredApplicantIdsByJob((current) => ({
        ...current,
        [jobId]: [...new Set([...(current[jobId] || []), ...applicantIds])],
      }))
    } catch (err) {
      setReferredApplicantIdsByJob((current) => ({
        ...current,
        [jobId]: (current[jobId] || []).filter((id) => !applicantIds.includes(id)),
      }))
      setError(err?.message || "Failed to create referrals")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="admin-referrals-card portal-card rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-xl font-semibold text-white">PESO Referral Panel</h2>
      <p className="mt-3 text-slate-400">Create referrals for applicants who applied to approved postings and monitor hire reports.</p>

      {loading && <p className="mt-4 text-slate-300">Loading referral panel data...</p>}
      {!loading && error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      {!loading && success && <p className="mt-4 text-sm text-cyan-300">{success}</p>}

      <div className="admin-referrals-panel mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
        <h3 className="text-lg font-semibold text-white">Create Referrals</h3>

        <div className="mt-4 space-y-4">
          {jobs.length === 0 ? (
            <p className="text-sm text-slate-400">No approved job postings available.</p>
          ) : (
            referralJobsPagination.paginate(orderedJobs).map((job) => {
              const jobId = String(job._id || job.id)
              const referredApplicantIds = referredApplicantIdsByJob[jobId] || []
              const appliedApplicantEmails = new Set(
                (Array.isArray(job.applicants) ? job.applicants : [])
                  .map((application) => String(application.email || '').toLowerCase())
                  .filter(Boolean),
              )
              const appliedApplicants = applicants.filter((applicant) =>
                appliedApplicantEmails.has(String(applicant.email || '').toLowerCase()),
              )
              const statusByApplicant = referralStatusByJob[jobId] || {}
              // Keep declined applicants visible so admins see the employer declined them;
              // hide applicants who are actively referred (pending/accepted).
              const visibleApplicants = appliedApplicants.filter((applicant) => {
                const applicantId = String(applicant.id || applicant._id)
                const status = statusByApplicant[applicantId]
                if (status === 'declined') return true
                return !referredApplicantIds.includes(applicantId)
              })

              return (
                <div
                  key={jobId}
                  ref={(element) => {
                    jobGroupRefs.current[jobId] = element
                  }}
                  className="admin-referral-job rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="font-semibold text-white">{job.title}</h4>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Refer all ${visibleApplicants.length} applicants to this job?`)) return
                        handleCreateReferrals(
                          jobId,
                          visibleApplicants.map((applicant) => String(applicant.id || applicant._id)),
                        )
                      }}
                      disabled={submitting || visibleApplicants.length === 0}
                      className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
                        submitting || visibleApplicants.length === 0
                          ? "bg-slate-700 text-slate-400"
                          : "bg-cyan-500 text-slate-950"
                      }`}
                    >
                      Approve All
                    </button>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-slate-400">
                    <p>Company: {job.company || 'N/A'}</p>
                    <p>Location: {job.location || 'Remote'}</p>
                    <p>Description: {job.description || 'N/A'}</p>
                    <p>Requirements: {job.requirements || 'N/A'}</p>
                    <p>Skills: {Array.isArray(job.skills) ? job.skills.join(', ') : job.skills || 'None specified'}</p>
                    <p>Salary: {job.salary || 'Not specified'}</p>
                  </div>

                  {visibleApplicants.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">
                      {appliedApplicants.length === 0
                        ? "No applicants have applied to this job yet."
                        : "All applicants who applied have been referred for this job."}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {panelApplicantsPg.paginate(visibleApplicants).map((applicant) => {
                        const applicantId = String(applicant.id || applicant._id)
                        const highlighted =
                          jobId === String(initialJobId) && initialApplicantIdSet.has(applicantId)

                        return (
                          <div
                            key={applicantId}
                            className={`admin-referral-applicant flex items-center justify-between gap-4 rounded-2xl border bg-slate-900 px-3 py-3 text-sm ${
                              highlighted ? "border-amber-400" : "border-slate-700"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-white">
                                  {formatFullName(applicant.profile) || applicant.email}
                                </p>
                                {highlighted && (
                                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-slate-950">
                                    New
                                  </span>
                                )}
                                {referralStatusByJob[jobId]?.[applicantId] === 'declined' && (
                                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                                    Declined by employer
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">{applicant.email}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const applicantName = formatFullName(applicant.profile) || applicant.email
                                if (!window.confirm(`Refer ${applicantName} to ${job.title}?`)) return
                                handleCreateReferrals(jobId, [applicantId])
                              }}
                              disabled={submitting}
                              className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
                                submitting ? "bg-slate-700 text-slate-400" : "bg-cyan-500 text-slate-950"
                              }`}
                            >
                              Approve
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {visibleApplicants.length > panelApplicantsPg.pageSize && (
                    <Pagination
                      page={panelApplicantsPg.page}
                      pageSize={panelApplicantsPg.pageSize}
                      totalItems={visibleApplicants.length}
                      onPageChange={panelApplicantsPg.setPage}
                      onPageSizeChange={panelApplicantsPg.setPageSize}
                      itemLabel="applicants"
                      ariaLabel="Applicants to refer pagination"
                    />
                  )}
                </div>
              )
            })
          )}
        </div>
        {orderedJobs.length > 0 && (
          <Pagination
            page={referralJobsPagination.page}
            pageSize={referralJobsPagination.pageSize}
            totalItems={orderedJobs.length}
            onPageChange={referralJobsPagination.setPage}
            onPageSizeChange={referralJobsPagination.setPageSize}
            itemLabel="job postings"
            ariaLabel="Referral job postings pagination"
          />
        )}
      </div>

      <div className="admin-hire-reports mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
        <h3 className="text-lg font-semibold text-white">Hire Reports Tracking</h3>
        {onViewUpdates && <button type="button" onClick={onViewUpdates} className="mt-3 rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-cyan-900">Compare applicant and employer updates</button>}
        {hireReports.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No hire reports yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-slate-700 text-xs uppercase tracking-[0.2em] text-slate-400">
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Reported by</th>
                  <th className="px-2 py-2">Hire / deployment date</th>
                  <th className="px-2 py-2">Notes to PESO</th>
                  <th className="px-2 py-2">Applicant</th>
                  <th className="px-2 py-2">Employer</th>
                  <th className="px-2 py-2">Job</th>
                  <th className="px-2 py-2">Reported</th>
                  <th className="px-2 py-2">Previous updates</th>
                </tr>
              </thead>
              <tbody>
                {hireReportsPagination.paginate(hireReports).map((report) => (
                  <tr key={report._id} className="border-b border-slate-800">
                    <td className="px-2 py-2">{outcomeLabel(report.status)}</td>
                    <td className="px-2 py-2">{report.reportedByRole || 'Employer'}</td>
                    <td className="px-2 py-2">{report.employmentDate || 'Not provided'}</td>
                    <td className="px-2 py-2">{report.notes || '—'}</td>
                    <td className="px-2 py-2">{(() => { const account = (adminUsers || []).find((user) => String(user.id || user._id) === String(report.applicantId)); return formatFullName(account?.profile) || account?.email || String(report.applicantId || '') })()}</td>
                    <td className="px-2 py-2">{(() => { const account = (adminUsers || []).find((user) => String(user.id || user._id) === String(report.employerId)); return account?.companyName || account?.email || String(report.employerId || '') })()}</td>
                    <td className="px-2 py-2">{jobs.find((job) => String(job._id) === String(report.jobId))?.title || String(report.jobId || '')}</td>
                    <td className="px-2 py-2">{report.reportedAt ? new Date(report.reportedAt).toLocaleString() : "N/A"}</td>
                    <td className="px-2 py-2">{report.history?.length > 0 ? <details><summary>{report.history.length} previous update(s)</summary><ul>{report.history.map((entry, index) => <li key={index} className="mt-2">{outcomeLabel(entry.status)}{entry.employmentDate ? ` · ${entry.employmentDate}` : ''}{entry.notes ? ` · ${entry.notes}` : ''}{entry.reportedAt ? ` · reported ${new Date(entry.reportedAt).toLocaleString()}` : ''}</li>)}</ul></details> : 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hireReports.length > 0 && (
          <Pagination
            page={hireReportsPagination.page}
            pageSize={hireReportsPagination.pageSize}
            totalItems={hireReports.length}
            onPageChange={hireReportsPagination.setPage}
            onPageSizeChange={hireReportsPagination.setPageSize}
            itemLabel="hire reports"
            ariaLabel="Hire reports pagination"
          />
        )}
      </div>
    </section>
  )
}

export default PesoReferralPanel
