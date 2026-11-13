import { useEffect, useRef, useState } from 'react'
import { formatLocation, formatSalary, mapEmploymentType } from '../../shared/jobPosting.js'
import JobLanguageRequirements from './JobLanguageRequirements'
import CompanyRating from './CompanyRating'

const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : 'Not specified'
function CompanyMark({ job }) {
  return <span className="job-browser-company-mark">{job.employerBranding?.profileImage
    ? <img src={job.employerBranding.profileImage} alt="" />
    : (job.company || 'Employer').trim().charAt(0).toUpperCase()}</span>
}

export default function ApplicantJobBrowser({ jobs, applicationByJobId, appliedPostingById, appliedJobIds, currentUser, onApply, loading }) {
  const [selectedId, setSelectedId] = useState(null)
  const detailsRef = useRef(null)
  const selected = jobs.find((job) => String(job._id) === selectedId) || jobs[0]
  useEffect(() => { if (detailsRef.current) detailsRef.current.scrollTop = 0 }, [selected?._id])
  const applicationFor = (job) => {
    const application = applicationByJobId.get(String(job._id))
    const embedded = (appliedPostingById.get(String(job._id))?.applicants || job.applicants || []).find((entry) => entry.email === currentUser?.email)
    return { applied: Boolean(application || embedded) || appliedJobIds.has(String(job._id)) }
  }
  if (!selected) return null
  const { applied } = applicationFor(selected)
  const receivingSuspended = selected.employerBranding?.receivingApplicationsSuspended === true
  return <div className="applicant-job-browser" aria-busy={loading}>
    <section className="job-browser-list" aria-label="Job postings" tabIndex={0}>
      {jobs.map((job) => <button type="button" key={job._id} aria-label={`View ${job.title} details`} aria-pressed={String(job._id) === String(selected._id)} className={`job-browser-row ${String(job._id) === String(selected._id) ? 'is-selected' : ''}`} onClick={() => setSelectedId(String(job._id))}>
        <CompanyMark job={job} />
        <span className="job-browser-row-copy"><strong>{job.title}</strong><span>{job.company}<CompanyRating rating={job.employerBranding?.rating} /></span><span className="job-browser-muted">{formatLocation(job) || job.location || 'Remote'}</span><span className="job-browser-tags job-browser-row-tags">{mapEmploymentType(job.employmentType) && <span aria-label={`Employment type: ${mapEmploymentType(job.employmentType)}`}>{mapEmploymentType(job.employmentType)}</span>}{job.locationType && <span>{job.locationType}</span>}</span>
          {typeof job.skillMatch === 'number' && job.skillTotal > 0 && <span className="job-browser-match">{job.skillMatch} of {job.skillTotal} skills match</span>}
          {applicationFor(job).applied && <span className="job-browser-applied">Applied</span>}
        </span>
      </button>)}
    </section>
    <article ref={detailsRef} tabIndex={0} className="job-browser-details" aria-label={`${selected.title} job details`}>
      {selected.employerBranding?.bannerImage && <img className="job-browser-banner" src={selected.employerBranding.bannerImage} alt="" />}
      <div className="job-browser-detail-content">
        <div className="job-browser-company">
          <CompanyMark job={selected} /><span>{selected.company}<CompanyRating rating={selected.employerBranding?.rating} /></span>
          <button type="button" aria-label="View company profile" title="View company profile" onClick={() => window.open(`${window.location.pathname}#company-profile/${encodeURIComponent(selected._id)}`, '_blank', 'noopener,noreferrer')} className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pink-300 text-pink-800 hover:bg-pink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-700">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21V5h10v16M14 10h6v11M2 21h20M8 9h2M8 13h2M8 17h2M17 14h1M17 18h1" /></svg>
          </button>
        </div>
        <h3 className="job-browser-title">{selected.title}</h3>
        <p className="job-browser-muted">{formatLocation(selected) || selected.location || 'Remote'}</p>
        <p className="job-browser-muted">Posted {dateLabel(selected.createdAt)}</p>
        <div className="job-browser-tags" aria-label="Job classification">{mapEmploymentType(selected.employmentType) && <span aria-label={`Employment type: ${mapEmploymentType(selected.employmentType)}`}>{mapEmploymentType(selected.employmentType)}</span>}{selected.locationType && <span>{selected.locationType}</span>}</div>
        <p className="job-browser-salary">{formatSalary(selected) || selected.salary || 'Salary not specified'}</p>
        {typeof selected.skillMatch === 'number' && selected.skillTotal > 0 && <p className="job-browser-match">{selected.skillMatch} of {selected.skillTotal} skills match yours</p>}
        {receivingSuspended && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This employer is not accepting applications right now.</p>}
        <button type="button" disabled={applied || receivingSuspended} onClick={() => onApply(selected, applied)} className="job-browser-apply">{applied ? 'Already applied' : receivingSuspended ? 'Applications paused' : 'Apply Now →'}</button>
        <section className="job-browser-section"><h4>About the job</h4><p className="job-browser-description">{selected.description || 'No description provided.'}</p></section>
        <section className="job-browser-section"><h4>Job details</h4><dl className="job-browser-facts">{[
          ['Status', selected.status || 'Not specified'],
          ['Location', formatLocation(selected) || selected.location || 'Not specified'],
          ['Barangay', selected.barangay || 'Not specified'], ['City / municipality', selected.city || 'Not specified'], ['Province', selected.province || 'Not specified'],
          ['Location type', selected.locationType || 'Not specified'], ['Employment type', mapEmploymentType(selected.employmentType) || 'Not specified'],
          ['Salary', formatSalary(selected) || 'Not specified'], ['Pay frequency', selected.payFrequency || 'Monthly'], ['Negotiable', selected.negotiable || /^negotiable$/i.test(selected.salary || '') ? 'Yes' : 'No'],
          ['Education', selected.education || 'Not Required'], ['Experience', selected.experience || 'No Experience'], ['Slots', selected.slots ?? 'Not specified'], ['Apply by', dateLabel(selected.deadline)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="job-browser-section"><h4>Requirements</h4><p className="job-browser-description">{selected.requirements || 'Not specified'}</p></section>
        <section className="job-browser-section"><h4>Required skills</h4>{selected.skills?.length > 0 ? <div className="job-browser-tags">{selected.skills.map((skill) => <span key={skill}>{skill}</span>)}</div> : <p className="job-browser-description">Not specified</p>}</section>
        <JobLanguageRequirements value={selected.languageRequirements} />

      </div>
    </article>
  </div>
}
