import { useEffect, useMemo, useState } from "react"
import HireReportForm from "./HireReportForm"
import RatingForm from "./RatingForm"

function ReferralList({ token, employerId }) {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [hireReportsByReferral, setHireReportsByReferral] = useState({})
  const [ratedHireReports, setRatedHireReports] = useState({})

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

    fetch(`http://localhost:4000/api/referrals/employer/${employerId}`, {
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
    if (status === "declined" && !window.confirm("Decline this referral?")) return

    const previous = referrals
    setError("")

    setReferrals((current) =>
      current.map((item) => (String(item._id) === String(referralId) ? { ...item, status } : item)),
    )

    try {
      const response = await fetch(`http://localhost:4000/api/referrals/${referralId}/respond`, {
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
        current.map((item) => (String(item._id) === String(referralId) ? { ...item, ...data } : item)),
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
                className="rounded-2xl border border-slate-300 bg-white p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-black">{applicantName}</p>
                    <p className="mt-1 text-sm text-black">Job: {jobTitle}</p>
                    {referral.applicantId?.email && (
                      <p className="mt-1 text-sm text-black">Email: {referral.applicantId.email}</p>
                    )}
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
            )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default ReferralList
