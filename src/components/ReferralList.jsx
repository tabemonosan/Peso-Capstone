import { useEffect, useMemo, useRef, useState } from "react"
import ApplicantSuitability from './ApplicantSuitability'
import ApplicantProfileModal from './ApplicantProfileModal'
import EmployerInterviewPanel from './EmployerInterviewPanel'
import ApplicationStages from './ApplicationStages'
import { API_URL } from "../config"
import HireReportForm from "./HireReportForm"
import RatingForm from "./RatingForm"
import Pagination from "./Pagination"
import { usePagination } from "../hooks/usePagination"
import { formatFullName } from "../../shared/nameFields.js"
import { outcomeLabel } from "../../shared/employmentReporting.js"
import { ApplicationTimeline } from './AdminReferralsPage'
import ApplicationResumeButton from './ApplicationResumeButton'

function ReferralList({ token, employerId, profileImage = '' }) {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [hireReportsByReferral, setHireReportsByReferral] = useState({})
  const referralsPagination = usePagination({ syncUrl: false })
  const [ratedHireReports, setRatedHireReports] = useState({})
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const referralsPanelRef = useRef(null)
  useEffect(() => {
    if (!token || !employerId) return undefined
    let cancelled = false
    const refresh = async () => {
      try {
        const response = await fetch(`${API_URL}/api/referrals/employer/${employerId}`, { headers: { Authorization: `Bearer ${token}` } })
        const items = await response.json()
        if (!response.ok || cancelled || !Array.isArray(items)) return
        setReferrals(items)
        setSelectedProfile((current) => current && !items.some((entry) => String(entry.applicantId?._id || '') === String(current._id || current.id)) ? null : current)
      } catch { /* Preserve the last authorized response on a connection failure. */ }
    }
    const timer = setInterval(refresh, 10000)
    window.addEventListener('focus', refresh)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [token, employerId])

  useEffect(() => {
    if (!token) {
      setError("Not authenticated")
      return
    }

    if (!employerId) {
      setError("Employer ID is not available yet.")
      return
    }

    setLoading(true)
    setError("")

    let cancelled = false
    const load = async (path) => {
      const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`)
      return Array.isArray(data) ? data : []
    }
    Promise.all([load(`/api/referrals/employer/${employerId}`), load('/api/hire-reports')])
      .then(([items, reports]) => {
        if (cancelled) return
        setReferrals(items)
        setHireReportsByReferral(Object.fromEntries(reports.filter((report) => report.referralId).map((report) => [String(report.referralId), report])))
      })
      .catch((err) => {
        if (cancelled) return
        setReferrals([])
        setError(err?.message || "Failed to load referrals")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, employerId])

  const handleRespond = async (referralId, status) => {
    if (!token) return
    const action = status === 'accepted' ? 'Accept' : 'Decline'
    if (!window.confirm(`${action} this referral? This response does not report a hiring outcome to PESO.`)) return
    const previous = referrals
    setError("")

    // Keep declined referrals available so the employer can report the outcome.
    setReferrals((current) =>
      current.map((item) => (String(item._id) === String(referralId) ? { ...item, status } : item)),
    )

    try {
      const response = await fetch(`${API_URL}/api/referrals/${referralId}/respond`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`)
      }

      setReferrals((current) =>
        current.map((item) => (String(item._id) === String(referralId) ? { ...item, status: data.status, history: data.history || item.history } : item)),
      )
    } catch (err) {
      setReferrals(previous)
      setError(err?.message || "Failed to update referral status")
    }
  }

  const getStatusClasses = (status) => {
    if (status === "accepted") return "bg-cyan-500 text-slate-950"
    if (status === "declined") return "border border-slate-300 bg-slate-100 text-black"
    return "bg-amber-400 text-slate-950"
  }

  const handleHireReportCreated = (referralId, hireReport) => {
    setHireReportsByReferral((current) => ({
      ...current,
      [String(referralId)]: hireReport,
    }))
  }

  const handleRatingCreated = (hireReportId) => {
    setRatedHireReports((current) => ({
      ...current,
      [String(hireReportId)]: true,
    }))
  }

  const referralGroups = useMemo(() => {
    const groups = new Map()

    referrals.forEach((referral) => {
      const jobId = String(referral.jobId?._id || referral.jobId?.id || referral.jobId || "unknown-job")
      const applicantId = String(referral.applicantId?._id || referral.applicantId?.id || referral.applicantId || `withdrawn-${referral._id}`)
      const existingGroup = groups.get(jobId)
      if (existingGroup) {
        if (!existingGroup.applicantIds.has(applicantId)) {
          existingGroup.applicantIds.add(applicantId)
          existingGroup.referrals.push(referral)
        }
        return
      }

      groups.set(jobId, {
        jobId,
        jobTitle: referral.jobId?.title || "Untitled job",
        job: referral.jobId || null,
        applicantIds: new Set([applicantId]),
        referrals: [referral],
      })
    })

    return Array.from(groups.values())
  }, [referrals])

  const visibleGroups = referralsPagination.paginate(referralGroups)
  const selectedGroup = visibleGroups.find((group) => group.jobId === selectedJobId) || visibleGroups[0]
  useEffect(() => { if (referralsPanelRef.current) referralsPanelRef.current.scrollTop = 0 }, [selectedGroup?.jobId])

  return (
    <section className="employer-referrals-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
      <h2 className="text-xl font-semibold text-black">Applications and referrals</h2>
      {referrals.some((entry) => entry.employerSuspended) && <p role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Receiving new applicants is suspended. Existing applications remain available unless PESO pulls them back.</p>}
      <p className="mt-3 text-black">Applicants are ranked by job-relevant NSRP qualifications, with the highest fit first for each job. PESO facilitates referrals and retains the NSRP form. Contact applicants directly for hiring and report the outcome to PESO.</p>

      {loading && <p className="mt-4 text-black">Loading referrals…</p>}
      {!loading && error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

      {!loading && !error && referrals.length === 0 && (
        <p className="mt-4 text-black">No referrals available yet.</p>
      )}

      {!loading && referrals.length > 0 && (
        <div className="employer-job-browser employer-referral-browser">
          <section className="job-browser-list" aria-label="Jobs with referrals" tabIndex={0}>
            {visibleGroups.map((group) => {
              const selected = group.jobId === selectedGroup?.jobId
              return <div key={group.jobId}>
                <button type="button" className={`job-browser-row ${selected ? 'is-selected' : ''}`} aria-label={`View referrals for ${group.jobTitle}`} aria-pressed={selected} aria-controls="employer-referrals-panel" onClick={() => setSelectedJobId(group.jobId)}>
                  <span className="job-browser-company-mark">{profileImage ? <img src={profileImage} alt="" /> : (group.job?.company || 'Employer').trim().charAt(0).toUpperCase()}</span>
                  <span className="job-browser-row-copy"><strong>{group.jobTitle}</strong><span>{group.job?.company || 'Employer'}</span><span className="job-browser-muted">{group.job?.location || 'Location not specified'}</span><span className="job-browser-match">{group.referrals.length} {group.referrals.length === 1 ? 'applicant' : 'applicants'}</span></span>
                </button>
                {selected && group.job && <div className="referral-sidebar-job-details">
                  <p className="font-semibold">{group.job.salary || 'Salary not specified'}</p>
                  <details className="mt-2"><summary>Job details</summary><div className="mt-3 space-y-3">{group.job.requirements && <div><p className="font-semibold">Requirements</p><p className="mt-1 whitespace-pre-wrap">{group.job.requirements}</p></div>}{group.job.description && <div><p className="font-semibold">Description</p><p className="mt-1 whitespace-pre-wrap">{group.job.description}</p></div>}</div></details>
                </div>}
              </div>
            })}
          </section>
          <section ref={referralsPanelRef} id="employer-referrals-panel" className="job-browser-details" aria-label={selectedGroup ? `${selectedGroup.jobTitle} referrals` : 'Selected job referrals'} tabIndex={0}>
          {(selectedGroup ? [selectedGroup] : []).map((group) => (
            <div key={group.jobId} className="p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-black">{group.jobTitle} referrals</h3>
              <p className="mt-1 text-sm text-slate-600">{group.referrals.length} {group.referrals.length === 1 ? 'applicant' : 'applicants'} ranked for this job</p>
              <div className="mt-4 space-y-4">
                {group.referrals.map((referral) => {
            const applicantName =
              formatFullName(referral.applicantId?.profile) ||
              referral.applicantId?.email ||
              (['withdrawn', 'withdrawn_by_admin'].includes(referral.status) ? 'Application no longer shared' : 'Unknown applicant')
            const jobTitle = referral.jobId?.title || "Untitled job"
            const status = referral.status || "pending"
            const referralId = String(referral._id)
            const hireReport = hireReportsByReferral[referralId]
            const applicantId =
              referral.applicantId?._id ||
              referral.applicantId?.id ||
              referral.applicantId
            const jobId = referral.jobId?._id || referral.jobId?.id || referral.jobId
            const hasRating = hireReport && ratedHireReports[String(hireReport._id)]

            return (
              <div
                key={referral._id}
                className="overflow-hidden rounded-2xl border border-slate-300 bg-white"
              >
                {referral.applicantId?.profile?.bannerImage && (
                  <div
                    className="h-20 w-full bg-slate-200 bg-cover bg-center"
                    style={{ backgroundImage: `url(${referral.applicantId.profile.bannerImage})` }}
                  />
                )}
                <div className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-cyan-100 text-lg font-bold text-cyan-800">
                      {referral.applicantId?.profile?.profileImage ? (
                        <img src={referral.applicantId.profile.profileImage} alt={applicantName} className="h-full w-full object-cover" />
                      ) : (
                        (applicantName || 'A').trim().charAt(0).toUpperCase()
                      )}
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-black">{applicantName}</p>
                      <ApplicantSuitability suitability={referral.suitability} />
                      {referral.application?.details && <div className="mt-2 text-sm text-slate-700"><p>Completed bachelor's degree: {referral.application.details.bachelorDegree}</p><p>Work experience: {referral.application.details.hasExperience}{referral.application.details.experience ? ` - ${referral.application.details.experience}` : ''}</p><p>Mobile: {referral.application.details.mobile}</p></div>}
                      <ApplicationResumeButton token={token} application={referral.application} />
                      <p className="mt-1 text-sm text-black">Job: {jobTitle}</p>
                      {referral.applicantId?.email && (
                        <p className="mt-1 text-sm text-black">Email: {referral.applicantId.email}</p>
                      )}
                      {referral.applicantId && (
                        <button
                          type="button"
                          onClick={() => setSelectedProfile(referral.applicantId)}
                          className="mt-1 text-sm font-medium text-cyan-700 underline hover:text-cyan-900"
                        >
                          View profile
                        </button>
                      )}
                    </div>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${getStatusClasses(status)}`}
                  >
                    {status === 'withdrawn_by_admin' ? 'Returned to PESO review' : status}
                  </span>
                </div>

                <p className="mt-2 text-xs text-slate-600">Source: {referral.source === 'auto' ? 'Automatic application' : 'Admin referral'}</p>
                <details className="mt-3 text-sm"><summary>Application timeline</summary><ApplicationTimeline history={referral.history || []} /></details>
                {!['withdrawn', 'withdrawn_by_admin'].includes(status) ? <EmployerInterviewPanel token={token} referralId={referralId} referralStatus={status} outcome={hireReport?.status} /> : <ApplicationStages audience="employer" application={{ status }} />}
                {status === "pending" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespond(referral._id, "accepted")}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(referral._id, "declined")}
                      className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800"
                    >
                      Decline
                    </button>
                  </div>
                )}

                {(status === "accepted" || status === "declined") && applicantId && jobId && (
                  <>
                      <HireReportForm
                        token={token}
                        applicantId={String(applicantId)}
                        jobId={String(jobId)}
                        referralId={referralId}
                        existingReport={hireReport}
                        onCreated={(created) => handleHireReportCreated(referralId, created)}
                      />

                    {hireReport && hireReport.status !== 'not_hired' && !hasRating && (
                      <RatingForm
                        token={token}
                        toUserId={String(applicantId)}
                        toRole="applicant"
                        hireReportId={String(hireReport._id)}
                        onCreated={() => handleRatingCreated(hireReport._id)}
                      />
                    )}

                    {hireReport && <p className="mt-3 text-sm text-slate-700">Reported to PESO: {outcomeLabel(hireReport.status)}</p>}
                    {hasRating && hireReport?.status !== 'not_hired' && (
                      <p className="mt-4 text-sm text-cyan-300">Rating submitted for this hire report.</p>
                    )}
                  </>
                )}
                </div>
              </div>
            )
                })}
              </div>
            </div>
          ))}
          </section>
        </div>
      )}

      {!loading && referrals.length > 0 && (
        <Pagination
          page={referralsPagination.page}
          pageSize={referralsPagination.pageSize}
          totalItems={referralGroups.length}
          onPageChange={referralsPagination.setPage}
          onPageSizeChange={referralsPagination.setPageSize}
          itemLabel="jobs with referrals"
          ariaLabel="Referrals pagination"
        />
      )}

      {selectedProfile && <ApplicantProfileModal applicant={selectedProfile} onClose={() => setSelectedProfile(null)} />}

    </section>
  )
}

export default ReferralList
