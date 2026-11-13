import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import CompanyRating from './CompanyRating'
import JobPostingDetails from './JobPostingDetails'

function websiteLink(value) {
  if (!value) return null
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return null
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

export default function CompanyProfilePage({ token, jobId, onBack, backLabel = 'Back to jobs' }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showJob, setShowJob] = useState(false)
  const [reviewPage, setReviewPage] = useState(1)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    fetchWithTimeout(`${API_URL}/api/jobs/${jobId}/company-profile?reviewPage=${reviewPage}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load company profile.')
        if (active) setProfile(result)
      }).catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, jobId, retry, reviewPage])
  const website = websiteLink(profile?.website)
  return <section aria-label="Company profile" className="rounded-2xl border border-pink-200 p-5 sm:p-6">
    <button type="button" onClick={onBack} className="mb-5 rounded-full border border-pink-300 px-4 py-2 text-sm font-semibold">{backLabel}</button>
    {loading ? <p role="status">Loading company profile...</p> : error ? <div><p role="alert">{error}</p><button type="button" className="mt-3 rounded-full border px-4 py-2" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : profile && <>
      {profile.bannerImage && <img src={profile.bannerImage} alt="Company cover" className="h-48 w-full rounded-xl object-cover" />}
      <div className="mt-5 flex items-center gap-4">
        {profile.profileImage && <img src={profile.profileImage} alt="Company logo" className="h-20 w-20 rounded-xl object-cover" />}
        <div><h2 className="text-2xl font-bold">{profile.companyName}</h2><CompanyRating rating={profile.rating} />{!profile.rating?.totalRatings && <p className="mt-1 text-sm text-slate-500">No employee ratings yet.</p>}</div>
      </div>
      <h3 className="mt-6 text-lg font-semibold">About the company</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{profile.summary || 'No company description provided.'}</p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {[['Location', profile.location], ['Contact person', profile.contactName], ['Phone', profile.phone]].map(([label, value]) => <div key={label} className="rounded-xl border border-pink-200 p-4"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words">{value || 'Not provided'}</dd></div>)}
        <div className="rounded-xl border border-pink-200 p-4"><dt className="text-sm text-slate-500">Website</dt><dd className="mt-1 break-words">{website ? <a href={website} target="_blank" rel="noopener noreferrer" className="text-pink-800 underline">{profile.website}</a> : 'Not provided'}</dd></div>
      </dl>
      {profile.job && <section className="mt-6 rounded-xl border border-pink-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">Job you viewed</h3><p className="mt-1 text-sm">{profile.job.title}</p></div>
          <button type="button" aria-expanded={showJob} aria-controls="company-profile-job-details" onClick={() => setShowJob(value => !value)} className="rounded-full border border-pink-300 px-4 py-2 text-sm font-semibold text-pink-800">{showJob ? 'Hide job details' : 'View job details'}</button>
        </div>
        {showJob && <article id="company-profile-job-details" aria-label={`${profile.job.title} job details`} className="mt-5 border-t border-pink-200 pt-5"><JobPostingDetails job={profile.job} /></article>}
      </section>}
      <section aria-label="Employee reviews" className="mt-8 border-t border-pink-200 pt-6">
        <h3 className="text-lg font-semibold">Employee reviews</h3>
        <p className="mt-1 text-sm text-slate-500">Anonymous ratings and feedback from employees.</p>
        {profile.reviews?.length ? <div className="mt-4 space-y-4">
          {profile.reviews.map((review, index) => <article key={`${reviewPage}-${index}`} className="rounded-xl border border-pink-200 p-4">
            <h4 className="font-semibold">Anonymous employee</h4>
            <p className="mt-2 text-amber-600" aria-label={`${review.score} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(review.score)}{'☆'.repeat(5 - review.score)}</span></p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm">{review.comment?.trim() || 'No written feedback.'}</p>
          </article>)}
        </div> : <p className="mt-4 text-sm text-slate-500">No employee reviews yet.</p>}
        {profile.rating?.totalRatings > profile.reviewPageSize && <nav aria-label="Employee reviews pagination" className="mt-5 flex items-center justify-center gap-4">
          <button type="button" disabled={reviewPage <= 1} onClick={() => setReviewPage(value => value - 1)} className="rounded-full border px-4 py-2 disabled:opacity-40">Previous reviews</button>
          <span>Page {reviewPage} of {Math.ceil(profile.rating.totalRatings / profile.reviewPageSize)}</span>
          <button type="button" disabled={reviewPage * profile.reviewPageSize >= profile.rating.totalRatings} onClick={() => setReviewPage(value => value + 1)} className="rounded-full border px-4 py-2 disabled:opacity-40">Next reviews</button>
        </nav>}
      </section>
    </>}
  </section>
}
