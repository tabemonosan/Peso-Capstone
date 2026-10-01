import { useEffect, useMemo, useState } from "react"
import { API_URL } from "../config"
import HireReportForm from "./HireReportForm"
import RatingForm from "./RatingForm"

function ReferralList({ token, employerId }) {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [hireReportsByReferral, setHireReportsByReferral] = useState({})
  const [ratedHireReports, setRatedHireReports] = useState({})
  const [selectedProfile, setSelectedProfile] = useState(null)

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

    fetch(`${API_URL}/api/referrals/employer/${employerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || `Request failed: ${response.status}`)
        }
        return Array.isArray(data) ? data : []
      })
      .then((data) => setReferrals(data))
      .catch((err) => {
        setReferrals([])
        setError(err?.message || "Failed to load referrals")
      })
      .finally(() => setLoading(false))
  }, [token, employerId])

  const handleRespond = async (referralId, status) => {
    if (!token) return
    const action = status === 'accepted' ? 'Accept' : 'Decline'
    if (!window.confirm(`${action} this referral?${status === 'declined' ? ' The applicant will be removed from this list.' : ''}`)) return
    const previous = referrals
    setError("")

    // Declined referrals are removed from the employer's list; accepted stay and show as accepted
    setReferrals((current) =>
      status === 'declined'
        ? current.filter((item) => String(item._id) !== String(referralId))
        : current.map((item) => (String(item._id) === String(referralId) ? { ...item, status } : item)),
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

      if (status !== 'declined') {
        setReferrals((current) =>
          current.map((item) => (String(item._id) === String(referralId) ? { ...item, ...data } : item)),
        )
      }
    } catch (err) {
      setReferrals(previous)
      setError(err?.message || "Failed to update referral status")
    }
  }

  const handleViewResume = async (applicant) => {
    const applicantId = applicant?._id || applicant?.id
    if (!token || !applicantId) return
    const preview = window.open('', '_blank')
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicantId}/resume`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        preview?.close()
        return alert('Resume could not be opened')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (preview) preview.location.href = url
      else window.open(url, '_blank')
    } catch (err) {
      preview?.close()
      alert('Resume could not be opened')
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
      const applicantId = String(referral.applicantId?._id || referral.applicantId?.id || referral.applicantId || "unknown-applicant")
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

  return (
    <section className="employer-referrals-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
      <h2 className="text-xl font-semibold text-black">Referrals</h2>
      <p className="mt-3 text-black">Review PESO referrals and respond to pending applicants.</p>

      {loading && <p className="mt-4 text-black">Loading referrals…</p>}
      {!loading && error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

      {!loading && !error && referrals.length === 0 && (
        <p className="mt-4 text-black">No referrals available yet.</p>
      )}

      {!loading && referrals.length > 0 && (
        <div className="mt-6 space-y-4">
          {referralGroups.map((group) => (
            <div
              key={group.jobId}
              className="rounded-2xl border border-slate-300 bg-white p-4"
            >
              <h3 className="text-lg font-semibold text-black">{group.jobTitle}</h3>
              {group.job && (
                <div className="mt-2 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-black">
                  <p>Company: {group.job.company || 'N/A'}</p>
                  <p>Location: {group.job.location || 'Remote'}</p>
                  <p>Salary: {group.job.salary || 'Not specified'}</p>
                  {group.job.requirements && <p>Requirements: {group.job.requirements}</p>}
                  {group.job.description && <p>Description: {group.job.description}</p>}
                </div>
              )}
              <div className="mt-4 space-y-4">
                {group.referrals.map((referral) => {
            const applicantName =
              referral.applicantId?.profile?.name ||
              referral.applicantId?.email ||
              "Unknown applicant"
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
                    {status}
                  </span>
                </div>

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
                      className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                    >
                      Decline
                    </button>
                  </div>
                )}

                {status === "accepted" && applicantId && jobId && (
                  <>
                    {!hireReport && (
                      <HireReportForm
                        token={token}
                        applicantId={String(applicantId)}
                        jobId={String(jobId)}
                        referralId={referralId}
                        onCreated={(created) => handleHireReportCreated(referralId, created)}
                      />
                    )}

                    {hireReport && !hasRating && (
                      <RatingForm
                        token={token}
                        toUserId={String(applicantId)}
                        toRole="applicant"
                        hireReportId={String(hireReport._id)}
                        onCreated={() => handleRatingCreated(hireReport._id)}
                      />
                    )}

                    {hasRating && (
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
        </div>
      )}

      {selectedProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedProfile(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-300 bg-white text-black shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="h-28 w-full bg-slate-200 bg-cover bg-center"
              style={selectedProfile.profile?.bannerImage ? { backgroundImage: `url(${selectedProfile.profile.bannerImage})` } : undefined}
            />
            <div className="flex items-end gap-4 px-6">
              <span className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-cyan-100 text-2xl font-bold text-cyan-800">
                {selectedProfile.profile?.profileImage ? (
                  <img src={selectedProfile.profile.profileImage} alt="Applicant" className="h-full w-full object-cover" />
                ) : (
                  (selectedProfile.profile?.name || selectedProfile.email || 'A').trim().charAt(0).toUpperCase()
                )}
              </span>
              <h3 className="pb-1 text-lg font-semibold text-black">{selectedProfile.profile?.name || 'Applicant Profile'}</h3>
            </div>
            <div className="flex items-start justify-end px-6 pt-3">
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 px-6 pb-6 pt-1 text-sm text-black">
              <p><span className="font-semibold">Name:</span> {selectedProfile.profile?.name || 'N/A'}</p>
              <p><span className="font-semibold">Email:</span> {selectedProfile.email || 'N/A'}</p>
              <p><span className="font-semibold">Location:</span> {selectedProfile.profile?.location || 'N/A'}</p>
              <p><span className="font-semibold">Skills:</span> {Array.isArray(selectedProfile.profile?.skills) && selectedProfile.profile.skills.length > 0 ? selectedProfile.profile.skills.join(', ') : 'N/A'}</p>
              {selectedProfile.profile?.traits && <p><span className="font-semibold">Traits:</span> {selectedProfile.profile.traits}</p>}
              {selectedProfile.profile?.summary && <p><span className="font-semibold">Summary:</span> {selectedProfile.profile.summary}</p>}
              {selectedProfile.resumeFile?.originalName && (
                <div className="pt-2">
                  <p><span className="font-semibold">Resume:</span> {selectedProfile.resumeFile.originalName}{selectedProfile.resumeFile.uploadedAt ? ` • uploaded ${new Date(selectedProfile.resumeFile.uploadedAt).toLocaleDateString()}` : ''}</p>
                  <button
                    type="button"
                    onClick={() => handleViewResume(selectedProfile)}
                    className="mt-2 rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
                  >
                    View Resume (PDF)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ReferralList
