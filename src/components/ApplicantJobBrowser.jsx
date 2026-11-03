import { useEffect, useRef, useState } from 'react'
import { formatLocation, formatSalary, mapEmploymentType } from '../../shared/jobPosting.js'
import ApplicantApplicationHistory from './ApplicantApplicationHistory'

const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : 'Not specified'
function CompanyMark({ job }) {
  return <span className="job-browser-company-mark">{job.employerBranding?.profileImage
    ? <img src={job.employerBranding.profileImage} alt="" />
    : (job.company || 'Employer').trim().charAt(0).toUpperCase()}</span>
}

export default function ApplicantJobBrowser({ jobs, applicationByJobId, appliedPostingById, appliedJobIds, currentUser, token, onApply, onHistoryChanged, loading }) {
  const [selectedId, setSelectedId] = useState(null)
  const detailsRef = useRef(null)
  const selected = jobs.find((job) => String(job._id) === selectedId) || jobs[0]
  useEffect(() => { if (detailsRef.current) detailsRef.current.scrollTop = 0 }, [selected?._id])
  const applicationFor = (job) => {
    const application = applicationByJobId.get(String(job._id))
    const embedded = (appliedPostingById.get(String(job._id))?.applicants || job.applicants || []).find((entry) => entry.email === currentUser?.email)
    return { application, appliedAt: application?.submittedAt || embedded?.appliedAt, applied: Boolean(application || embedded) || appliedJobIds.has(String(job._id)) }
  }
  if (!selected) return null
  const { application, appliedAt, applied } = applicationFor(selected)
  const receivingSuspended = selected.employerBranding?.receivingApplicationsSuspended === true
  return <div className="applicant-job-browser" aria-busy={loading}>
    <section className="job-browser-list" aria-label="Job postings" tabIndex={0}>
      {jobs.map((job) => <button type="button" key={job._id} aria-label={`View ${job.title} details`} aria-pressed={String(job._id) === String(selected._id)} className={`job-browser-row ${String(job._id) === String(selected._id) ? 'is-selected' : ''}`} onClick={() => setSelectedId(String(job._id))}>
        <CompanyMark job={job} />
        <span className="job-browser-row-copy"><strong>{job.title}</strong><span>{job.company}</span><span className="job-browser-muted">{formatLocation(job) || job.location || 'Remote'}</span><span className="job-browser-muted">{[mapEmploymentType(job.employmentType), job.locationType].filter(Boolean).join(' · ')}</span>
          {typeof job.skillMatch === 'number' && job.skillTotal > 0 && <span className="job-browser-match">{job.skillMatch} of {job.skillTotal} skills match</span>}
          {applicationFor(job).applied && <span className="job-browser-applied">Applied</span>}
        </span>
      </button>)}
    </section>
    <article ref={detailsRef} tabIndex={0} className="job-browser-details" aria-label={`${selected.title} job details`}>
      {selected.employerBranding?.bannerImage && <img className="job-browser-banner" src={selected.employerBranding.bannerImage} alt="" />}
      <div className="job-browser-detail-content">
        <div className="job-browser-company"><CompanyMark job={selected} /><span>{selected.company}</span></div>
        <h3 className="job-browser-title">{selected.title}</h3>
        <p className="job-browser-muted">{formatLocation(selected) || selected.location || 'Remote'}</p>
        <p className="job-browser-muted">Posted {dateLabel(selected.createdAt)}</p>
        <div className="job-browser-tags">{[mapEmploymentType(selected.employmentType), selected.locationType].filter(Boolean).map((value) => <span key={value}>{value}</span>)}</div>
        <p className="job-browser-salary">{formatSalary(selected) || selected.salary || 'Salary not specified'}</p>
        {typeof selected.skillMatch === 'number' && selected.skillTotal > 0 && <p className="job-browser-match">{selected.skillMatch} of {selected.skillTotal} skills match yours</p>}
        {receivingSuspended && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This employer is not accepting applications right now.</p>}
        <button type="button" disabled={applied || receivingSuspended} onClick={() => onApply(selected, applied)} className="job-browser-apply">{applied ? 'Already applied' : receivingSuspended ? 'Applications paused' : 'Apply Now →'}</button>
        <section className="job-browser-section"><h4>About the job</h4><p className="job-browser-description">{selected.description || 'No description provided.'}</p></section>
        <section className="job-browser-section"><h4>Job details</h4><dl className="job-browser-facts">{[
          ['Education', selected.education || 'Not Required'], ['Experience', selected.experience || 'No Experience'], ['Slots', selected.slots ?? 'Not specified'], ['Apply by', dateLabel(selected.deadline)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        {selected.requirements && <section className="job-browser-section"><h4>Requirements</h4><p className="job-browser-description">{selected.requirements}</p></section>}
        {selected.skills?.length > 0 && <section className="job-browser-section"><h4>Required skills</h4><div className="job-browser-tags">{selected.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>}
        {applied && <section aria-label={`Your application for ${selected.title}`} className="job-browser-section job-browser-application"><h4>Your application</h4>{appliedAt && <p className="job-browser-muted">Applied on: {new Date(appliedAt).toLocaleString()}</p>}<ApplicantApplicationHistory application={application} token={token} onChanged={onHistoryChanged} /></section>}
      </div>
    </article>
  </div>
}
