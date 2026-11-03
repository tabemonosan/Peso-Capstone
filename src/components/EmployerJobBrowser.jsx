import { useEffect, useRef, useState } from 'react'
import { formatLocation } from '../../shared/jobPosting.js'
import JobPostingDetails from './JobPostingDetails'

export default function EmployerJobBrowser({ jobs, onEdit, profileImage = '' }) {
  const [selectedId, setSelectedId] = useState(null)
  const detailsRef = useRef(null)
  const selected = jobs.find((job) => String(job._id) === selectedId) || jobs[0]
  useEffect(() => { if (detailsRef.current) detailsRef.current.scrollTop = 0 }, [selected?._id])
  if (!selected) return null
  return <div className="employer-job-browser">
    <section className="job-browser-list" aria-label="My job postings" tabIndex={0}>
      {jobs.map((job) => <button type="button" key={job._id} aria-label={`View details for ${job.title}`} aria-pressed={String(job._id) === String(selected._id)} className={`job-browser-row ${String(job._id) === String(selected._id) ? 'is-selected' : ''}`} onClick={() => setSelectedId(String(job._id))}>
        <span className="job-browser-company-mark">{profileImage || job.employerBranding?.profileImage
          ? <img src={profileImage || job.employerBranding.profileImage} alt="" />
          : (job.company || 'Employer').trim().charAt(0).toUpperCase()}</span>
        <span className="job-browser-row-copy"><strong>{job.title}</strong><span>{job.company}</span><span className="job-browser-muted">{formatLocation(job) || 'Not specified'}</span><span className={`job-browser-status status-${job.status || 'pending'}`}>{job.status || 'pending'}</span>{job.createdAt && <span className="job-browser-muted">Submitted {new Date(job.createdAt).toLocaleDateString()}</span>}</span>
      </button>)}
    </section>
    <article ref={detailsRef} tabIndex={0} className="job-browser-details" aria-label={`${selected.title} job details`}>
      <div className="job-browser-detail-content"><JobPostingDetails job={selected} onEdit={onEdit ? () => onEdit(selected) : undefined} /></div>
    </article>
  </div>
}
