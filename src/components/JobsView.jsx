import { useEffect, useRef, useState } from "react"
import { API_URL } from "../config"

const nsrpInputCls = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-black'

function NsrpField({ label, fieldKey, type = 'text', placeholder, values, onChange, error }) {
  return (
    <label className="block text-sm font-medium text-black">
      {label}
      <input
        type={type}
        value={values[fieldKey] || ''}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `nsrp-error-${fieldKey}` : undefined}
        className={`${nsrpInputCls} ${error ? 'border-rose-500' : ''}`}
      />
      {error && <span id={`nsrp-error-${fieldKey}`} role="alert" className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  )
}

function NsrpSelect({ label, fieldKey, options, values, onChange, error }) {
  return (
    <label className="block text-sm font-medium text-black">
      {label}
      <select
        value={values[fieldKey] || ''}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `nsrp-error-${fieldKey}` : undefined}
        className={`${nsrpInputCls} ${error ? 'border-rose-500' : ''}`}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {error && <span id={`nsrp-error-${fieldKey}`} role="alert" className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  )
}

const nsrpRowFields = {
  education: [
    ['level', 'Education level'],
    ['school', 'School'],
    ['course', 'Course / degree'],
    ['year', 'Year graduated'],
  ],
  technicalTraining: [
    ['name', 'Training name'],
    ['provider', 'Training provider'],
    ['course', 'Course / specialization'],
    ['year', 'Year completed'],
  ],
  workExperience: [
    ['company', 'Company'],
    ['position', 'Position'],
    ['startDate', 'From'],
    ['endDate', 'To'],
  ],
}

function JobsView({
  activeRole,
  jobLoading,
  jobSearchTerm,
  setJobSearchTerm,
  jobSkillFilter,
  setJobSkillFilter,
  availableSkills,
  jobLocationFilter,
  setJobLocationFilter,
  jobLocationTypeFilter,
  setJobLocationTypeFilter,
  jobEmploymentTypeFilter,
  setJobEmploymentTypeFilter,
  locationFilterOptions,
  filteredApplicantJobs,
  appliedJobs,
  appliedJobIds,
  currentUser,
  selectedJob,
  setSelectedJob,
  handleApplyJob,
  adminJobSearchTerm,
  setAdminJobSearchTerm,
  adminJobStatusFilter,
  setAdminJobStatusFilter,
  filteredPendingJobs,
  handleReviewJob,
  showPendingAdminSection,
  showApprovedAdminSection,
  filteredApprovedJobs,
  showDeclinedAdminSection,
  filteredDeclinedJobs,
  jobLoadError,
  adminUsers,
  referredApplicantIdsByJob,
  handleReferApplicantFromJob,
  handleBulkReferApplicants,
  token,
  handleEditPendingJob,
}) {
  const [selectedApprovedJob, setSelectedApprovedJob] = useState(null)
  const [reviewJob, setReviewJob] = useState(null)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [declineReasonDraft, setDeclineReasonDraft] = useState('')
  const reviewDialogRef = useRef(null)
  const reviewOpenerRef = useRef(null)
  const [applicationJob, setApplicationJob] = useState(null)
  const [applicationFile, setApplicationFile] = useState(null)
  const [applicationSubmitting, setApplicationSubmitting] = useState(false)
  const [applicationTab, setApplicationTab] = useState('online')
  const [nsrpStep, setNsrpStep] = useState(0)
  const [nsrpAnswers, setNsrpAnswers] = useState({})
  const [nsrpFieldErrors, setNsrpFieldErrors] = useState({})
  const [nsrpSkillInput, setNsrpSkillInput] = useState('')
  const [nsrpError, setNsrpError] = useState('')
  const [nsrpPreviewUrl, setNsrpPreviewUrl] = useState('')
  const [nsrpPreviewLoading, setNsrpPreviewLoading] = useState(false)
  const setNsrp = (key, value) => {
    setNsrpAnswers((current) => ({ ...current, [key]: value }))
    setNsrpFieldErrors((current) => ({ ...current, [key]: undefined }))
    setNsrpError('')
    setNsrpPreviewUrl('')
  }
  const updateNsrpRow = (section, index, field, value) => {
    setNsrpAnswers((current) => ({
      ...current,
      [section]: (current[section] || []).map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
    }))
    setNsrpFieldErrors((current) => ({ ...current, [`${section}[${index}].${field}`]: undefined }))
    setNsrpError('')
    setNsrpPreviewUrl('')
  }
  const addNsrpRow = (section) => {
    const fields = nsrpRowFields[section]
    setNsrpAnswers((current) => ({
      ...current,
      [section]: [...(current[section] || []), Object.fromEntries(fields.map(([field]) => [field, '']))],
    }))
    setNsrpPreviewUrl('')
  }
  const removeNsrpRow = (section, index) => {
    setNsrpAnswers((current) => ({
      ...current,
      [section]: (current[section] || []).filter((_, rowIndex) => rowIndex !== index),
    }))
    setNsrpPreviewUrl('')
  }
  const nsrpStorageKey = `peso-nsrp-${currentUser?.id || currentUser?.email || 'applicant'}`
  const nsrpSteps = ['Personal information', 'Address & contact', 'Education & training', 'Work & skills', 'Employment & preferences', 'Preview']
  const nsrpStepFields = [
    ['surname', 'firstName', 'middleName', 'suffix', 'dob', 'placeOfBirth', 'sex', 'religion', 'civilStatus', 'height'],
    ['addressStreet', 'addressBarangay', 'addressCity', 'addressProvince', 'tin', 'gsisSss', 'pagibig', 'philhealth', 'email', 'cellphone', 'landline', 'disability'],
    ['education', 'technicalTraining'],
    ['workExperience', 'skills'],
    ['employmentStatus', 'employmentTypeDetail', 'activelyLooking', 'lookingDuration', 'willingImmediately', 'willingWhen', 'fourPs', 'fourPsId', 'occupation1', 'occupation2', 'occupation3', 'occupation4', 'localPref1', 'localPref2', 'localPref3', 'overseasPref1', 'overseasPref2', 'overseasPref3', 'expectedSalary', 'passportNo', 'passportExpiry'],
  ]
  useEffect(() => {
    if (!applicationJob) return undefined
    return () => {
      if (nsrpPreviewUrl) URL.revokeObjectURL(nsrpPreviewUrl)
    }
  }, [applicationJob, nsrpPreviewUrl])
  useEffect(() => {
    if (!applicationJob || Object.keys(nsrpAnswers).length === 0) return
    try {
      localStorage.setItem(nsrpStorageKey, JSON.stringify(nsrpAnswers))
    } catch (error) {
      console.error('Could not save NSRP draft:', error)
    }
  }, [applicationJob, nsrpAnswers, nsrpStorageKey])

  const showNsrpFieldErrors = (errors) => {
    setNsrpFieldErrors(errors || {})
    const firstInvalidStep = nsrpStepFields.findIndex((fields) => Object.keys(errors || {}).some((errorKey) => fields.some((field) => errorKey === field || errorKey.startsWith(`${field}[`))))
    if (firstInvalidStep >= 0) setNsrpStep(firstInvalidStep)
  }

  const generateNsrpPreview = async () => {
    if (!token) {
      setNsrpError('Your session has expired. Sign in again to continue.')
      return false
    }
    setNsrpPreviewLoading(true)
    setNsrpError('')
    setNsrpFieldErrors({})
    try {
      const response = await fetch(`${API_URL}/api/nsrp/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(nsrpAnswers),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        if (data?.fieldErrors) showNsrpFieldErrors(data.fieldErrors)
        setNsrpError(data?.error || 'Could not create the NSRP preview.')
        return false
      }
      const blob = await response.blob()
      if (blob.type !== 'application/pdf') {
        setNsrpError('The preview service returned an invalid document. Please try again.')
        return false
      }
      setNsrpPreviewUrl(URL.createObjectURL(blob))
      setNsrpStep(5)
      return true
    } catch (error) {
      console.error(error)
      setNsrpError('The NSRP PDF could not be generated. Check your connection and try again.')
      return false
    } finally {
      setNsrpPreviewLoading(false)
    }
  }
  const [selectedApplicantsByJob, setSelectedApplicantsByJob] = useState({})
  const openReviewJob = (job) => {
    reviewOpenerRef.current = document.activeElement
    setReviewJob(job)
    setReviewError('')
    setDeclineReasonDraft('')
  }

  const closeReviewJob = () => {
    if (reviewSubmitting) return
    setReviewJob(null)
    setReviewError('')
    restoreReviewFocus()
  }

  const restoreReviewFocus = () => {
    requestAnimationFrame(() => {
      if (reviewOpenerRef.current?.isConnected) reviewOpenerRef.current.focus()
      else document.getElementById('admin-job-status-filter')?.focus()
    })
  }

  useEffect(() => {
    if (reviewJob) reviewDialogRef.current?.focus()
  }, [reviewJob])

  const renderAdminJobRow = (job) => (
    <button
      key={job._id}
      type="button"
      onClick={() => openReviewJob(job)}
      className="grid w-full min-w-0 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-cyan-500 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
      aria-label={`View ${job.title} details`}
    >
      <span className="truncate font-semibold text-white">{job.title}</span>
      <span className="truncate text-sm text-slate-300">{job.company}</span>
      <span className="text-xs text-slate-400">{job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'Date unavailable'}</span>
      <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${job.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : job.status === 'declined' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>{job.status || 'pending'}</span>
    </button>
  )

  const findApplicantByEmail = (email) =>
    (Array.isArray(adminUsers) ? adminUsers : []).find(
      (user) => user.role === 'Applicant' && String(user.email || '').toLowerCase() === String(email || '').toLowerCase(),
    )

  const employerAvatar = (job, sizeClass = 'h-12 w-12') => {
    const image = job.employerBranding?.profileImage
    const initial = (job.company || job.createdBy || 'J').trim().charAt(0).toUpperCase()
    return image ? (
      <img src={image} alt={job.company || 'Employer'} className={`${sizeClass} shrink-0 rounded-xl border border-slate-600 object-cover`} />
    ) : (
      <span className={`${sizeClass} flex shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-lg font-bold text-cyan-300`}>
        {initial}
      </span>
    )
  }

  const handleViewApplicantNsrp = async (jobId, applicantEmail) => {
    if (!token) return alert('Not authenticated')
    const response = await fetch(`${API_URL}/api/job-applications/view?jobId=${encodeURIComponent(jobId)}&email=${encodeURIComponent(applicantEmail)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      return alert('Application NSRP file could not be opened')
    }
    const contentType = response.headers.get('Content-Type') || ''
    const disposition = response.headers.get('Content-Disposition') || ''
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/)
    const filename = filenameMatch ? filenameMatch[1] : `NSRP-${applicantEmail}`
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    if (contentType.includes('pdf')) {
      // Open PDFs in a new tab for viewing
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } else {
      // Word documents can't render in-browser — download them
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
  }

  return (
    <section className={`${activeRole === 'Admin' ? 'admin-jobs-card portal-card' : activeRole === 'Applicant' ? 'applicant-jobs-card portal-card' : 'employer-jobs-card'} rounded-2xl border ${activeRole === 'Employer' ? 'border-slate-300 bg-white text-black' : 'border-slate-800 bg-slate-900/70'} p-6`}>
      <h2 className={`text-xl font-semibold ${activeRole === 'Employer' ? 'text-black' : 'text-white'}`}>Job Offers</h2>
      <p className={`mt-3 ${activeRole === 'Employer' ? 'text-black' : 'text-slate-400'}`}>View postings and manage approvals.</p>

      {jobLoading && <p className="mt-4 text-slate-300">Loading jobs…</p>}

      {activeRole === "Applicant" && (
        <div className="mt-6 space-y-6">
          <div className="applicant-job-search rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <h3 className="text-lg font-semibold text-white">Search Job Offers</h3>
            <p className="mt-1 text-sm text-slate-400">Filter approved jobs by keyword, skill, and location.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <input
                type="text"
                value={jobSearchTerm}
                onChange={(event) => setJobSearchTerm(event.target.value)}
                placeholder="Search title, company, description"
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
              <select
                value={jobSkillFilter}
                onChange={(event) => setJobSkillFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="all">All skills</option>
                {availableSkills.map((skill) => (
                  <option key={skill} value={skill}>{skill}</option>
                ))}
              </select>
              <select
                value={jobLocationFilter}
                onChange={(event) => setJobLocationFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="all">All locations</option>
                {locationFilterOptions.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
              <select
                value={jobLocationTypeFilter}
                onChange={(event) => setJobLocationTypeFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="all">All location types</option>
                <option value="On-site">On-site</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Remote">Remote</option>
              </select>
              <select
                value={jobEmploymentTypeFilter}
                onChange={(event) => setJobEmploymentTypeFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="all">All employment types</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
          </div>

          <div className="applicant-available-jobs rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <h3 className="text-lg font-semibold text-white">Available Job Offers</h3>
            {filteredApplicantJobs.length === 0 ? (
              <p className="mt-4 text-slate-400">No approved jobs are available yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {filteredApplicantJobs.map((job) => {
                  const alreadyApplied = appliedJobIds.has(String(job._id)) || job.applicants?.some((applicant) => applicant.email === currentUser?.email)
                  const isSelected = selectedJob && String(selectedJob._id) === String(job._id)
                  return (
                    <div key={job._id} className="applicant-job-item overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                      {job.employerBranding?.bannerImage && (
                        <div
                          className="employer-banner h-24 w-full bg-slate-800 bg-cover bg-center"
                          style={{ backgroundImage: `url(${job.employerBranding.bannerImage})` }}
                        />
                      )}
                      <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {employerAvatar(job, 'h-10 w-10')}
                          <div>
                            <p className="text-lg font-semibold text-white">{job.title}</p>
                            <p className="text-sm text-slate-400">{job.company}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-green-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                          Active
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-300">
                        <span>📍 {job.location || 'Remote'}</span>
                        <span>💰 {job.salary || 'Not specified'}</span>
                        {job.locationType && <span>🏢 {job.locationType}</span>}
                        {job.employmentType && <span>🕒 {job.employmentType}</span>}
                      </div>

                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">About this job</p>
                      <p className="mt-1 text-sm text-slate-300 line-clamp-2">{job.description}</p>

                      {Array.isArray(job.skills) && job.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {job.skills.map((skill) => (
                            <span key={skill} className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-4">
                        <p className="text-xs text-slate-500">Posted {job.createdAt ? new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedJob(job)
                            if (!alreadyApplied) {
                              const storageKey = `peso-nsrp-${currentUser?.id || currentUser?.email || 'applicant'}`
                              let savedAnswers = {}
                              try {
                                savedAnswers = JSON.parse(localStorage.getItem(storageKey) || '{}')
                              } catch (error) {
                                console.error('Could not load saved NSRP draft:', error)
                              }
                              const profileName = currentUser?.profile?.name?.trim().split(/\s+/) || []
                              setNsrpAnswers({
                                surname: profileName.length > 1 ? profileName.pop() : '',
                                firstName: profileName[0] || '',
                                email: currentUser?.email || '',
                                education: currentUser?.profile?.education || [],
                                technicalTraining: currentUser?.profile?.technicalTraining || [],
                                workExperience: currentUser?.profile?.workExperience || [],
                                skills: currentUser?.profile?.skills || [],
                                ...savedAnswers,
                              })
                              setNsrpFieldErrors({})
                              setNsrpError('')
                              setNsrpPreviewUrl('')
                              setNsrpStep(0)
                              setApplicationJob(job)
                              setApplicationTab('online')
                            }
                          }}
                          disabled={alreadyApplied}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${alreadyApplied ? 'bg-slate-700 text-slate-400' : 'bg-cyan-500 text-slate-950'}`}
                        >
                          {alreadyApplied ? 'Already applied' : 'Apply Now →'}
                        </button>
                      </div>

                      {isSelected && selectedJob && alreadyApplied && (
                        <div className="mt-4 rounded-2xl border border-cyan-500/40 bg-slate-950/80 p-4">
                          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Job details</h4>
                          <p className="mt-3 text-sm text-slate-300">{selectedJob.description}</p>
                          <p className="mt-3 text-sm text-slate-400">Company: {selectedJob.company}</p>
                          <p className="mt-1 text-sm text-slate-400">Location: {selectedJob.location || 'Remote'}</p>
                          <p className="mt-1 text-sm text-slate-400">Requirements: {selectedJob.requirements}</p>
                          <p className="mt-1 text-sm text-slate-400">Skills: {Array.isArray(selectedJob.skills) ? selectedJob.skills.join(', ') : selectedJob.skills || 'None specified'}</p>
                          <p className="mt-1 text-sm text-slate-400">Salary: {selectedJob.salary || 'Not specified'}</p>
                        </div>
                      )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="applicant-applied-jobs rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <h3 className="text-lg font-semibold text-white">Applied</h3>
            {(Array.isArray(appliedJobs) ? appliedJobs : []).length === 0 ? (
              <p className="mt-4 text-slate-400">You have not applied to any job offers yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {appliedJobs.map((job) => {
                  const myApplication = (job.applicants || []).find((applicant) => applicant.email === currentUser?.email)
                  return (
                    <div key={`applied-${job._id}`} className="applicant-application-item rounded-2xl border border-slate-700 bg-slate-900 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-white">{job.title}</p>
                          <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                        </div>
                        <span className="rounded-full bg-slate-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">
                          {job.status || 'unknown'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        Applied on: {myApplication?.appliedAt ? new Date(myApplication.appliedAt).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {applicationJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-application-title"
          onClick={() => !applicationSubmitting && setApplicationJob(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-slate-300 bg-white p-6 text-black shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="job-application-title" className="text-lg font-semibold text-black">Apply for {applicationJob.title}</h2>
                <p className="mt-2 text-sm text-slate-600">Fill in the NSRP details, preview the generated PDF, then confirm your application.</p>
              </div>
              <button
                type="button"
                onClick={() => setApplicationJob(null)}
                disabled={applicationSubmitting}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {nsrpSteps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => index < 5 && setNsrpStep(index)}
                  disabled={index === 5 && !nsrpPreviewUrl}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    nsrpStep === index ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 text-slate-600 hover:text-black'
                  }`}
                >
                  {index + 1}. {step}
                </button>
              ))}
            </div>

            {applicationTab === 'form' && (
              <div className="mt-4">
                <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-black">NSRP Form 1 — Jobseeker Registration Form (PDF)</p>
                  <p className="mt-1 text-sm text-slate-600">
                    View or download the official form for reference. You can fill it out by hand, or use the <strong>Fill Out Online</strong> tab to generate a completed copy automatically.
                  </p>
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-300">
                  <iframe
                    src="/NSRP-Form-1-Jobseeker-Reg-Form.pdf"
                    title="NSRP registration form"
                    className="h-72 w-full bg-white"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="/NSRP-Form-1-Jobseeker-Reg-Form.pdf"
                    download="NSRP-Form-1-Jobseeker-Reg-Form.pdf"
                    className="inline-flex rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Download NSRP form (PDF)
                  </a>
                  <a
                    href="/NSRP-Form-1-Jobseeker-Reg-Form.docx"
                    download="NSRP-Form-1-Jobseeker-Reg-Form.docx"
                    className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                  >
                    Download Word version
                  </a>
                  <button
                    type="button"
                    onClick={() => setApplicationTab('upload')}
                    className="inline-flex rounded-2xl border border-cyan-500 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800"
                  >
                    Next: Upload completed form →
                  </button>
                </div>
              </div>
            )}

            {applicationTab === 'online' && (
              <div className="mt-4 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
                <p className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
                  Your answers are saved on this device as you move between steps. The server validates every field before generating the preview.
                </p>
                {(() => {
                  const fieldProps = { values: nsrpAnswers, onChange: setNsrp }
                  return (
                    <>
                      {nsrpStep === 0 && (
                        <div className="space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">I. Personal Information</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.surname} label="Surname" fieldKey="surname" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.firstName} label="First Name" fieldKey="firstName" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.middleName} label="Middle Name" fieldKey="middleName" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.suffix} label="Suffix (Sr., Jr., III)" fieldKey="suffix" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.dob} label="Date of Birth" fieldKey="dob" type="date" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.placeOfBirth} label="Place of Birth" fieldKey="placeOfBirth" />
                        <NsrpSelect {...fieldProps} error={nsrpFieldErrors.sex} label="Sex" fieldKey="sex" options={['Male', 'Female']} />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.religion} label="Religion" fieldKey="religion" />
                        <NsrpSelect {...fieldProps} error={nsrpFieldErrors.civilStatus} label="Civil Status" fieldKey="civilStatus" options={['Single', 'Married', 'Widowed', 'Separated', 'Live-in']} />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.height} label="Height" fieldKey="height" placeholder="e.g. 165 cm" />
                      </div>
                        </div>
                      )}
                      {nsrpStep === 1 && (
                        <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.addressStreet} label="House No. / Street / Village" fieldKey="addressStreet" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.addressBarangay} label="Barangay" fieldKey="addressBarangay" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.addressCity} label="Municipality / City" fieldKey="addressCity" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.addressProvince} label="Province" fieldKey="addressProvince" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.tin} label="TIN" fieldKey="tin" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.gsisSss} label="GSIS/SSS ID No." fieldKey="gsisSss" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.pagibig} label="Pag-IBIG No." fieldKey="pagibig" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.philhealth} label="PhilHealth No." fieldKey="philhealth" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.email} label="Email Address" fieldKey="email" type="email" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.cellphone} label="Cellphone Number" fieldKey="cellphone" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.landline} label="Landline Number" fieldKey="landline" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.disability} label="Disability (if any)" fieldKey="disability" placeholder="e.g. Visual, Hearing, Physical" />
                      </div>
                        </div>
                      )}
                      {nsrpStep === 2 && (
                        <div className="space-y-6">
                          {[
                            ['education', 'Educational Background'],
                            ['technicalTraining', 'Technical / Vocational Training'],
                          ].map(([section, title]) => (
                            <section key={section} className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">{title}</h3>
                                <button
                                  type="button"
                                  onClick={() => addNsrpRow(section)}
                                  disabled={(nsrpAnswers[section] || []).length >= 10}
                                  className="rounded-lg border border-cyan-600 px-3 py-1 text-xs font-semibold text-cyan-800 disabled:opacity-40"
                                >
                                  Add row
                                </button>
                              </div>
                              {nsrpFieldErrors[section] && <p role="alert" className="text-xs text-rose-600">{nsrpFieldErrors[section]}</p>}
                              {(nsrpAnswers[section] || []).map((row, rowIndex) => (
                                <div key={`${section}-${rowIndex}`} className="rounded-xl border border-slate-200 p-3">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {nsrpRowFields[section].map(([field, label]) => {
                                      const fieldKey = `${section}[${rowIndex}].${field}`
                                      return (
                                        <label key={fieldKey} className="block text-xs font-medium text-slate-700">
                                          {label}
                                          <input
                                            type={['startDate', 'endDate'].includes(field) ? 'date' : 'text'}
                                            value={row[field] || ''}
                                            onChange={(event) => updateNsrpRow(section, rowIndex, field, event.target.value)}
                                            aria-invalid={Boolean(nsrpFieldErrors[fieldKey])}
                                            className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-black ${nsrpFieldErrors[fieldKey] ? 'border-rose-500' : 'border-slate-300'}`}
                                          />
                                          {nsrpFieldErrors[fieldKey] && <span role="alert" className="mt-1 block text-rose-600">{nsrpFieldErrors[fieldKey]}</span>}
                                        </label>
                                      )
                                    })}
                                  </div>
                                  <button type="button" onClick={() => removeNsrpRow(section, rowIndex)} className="mt-2 text-xs font-semibold text-rose-700">
                                    Remove row
                                  </button>
                                </div>
                              ))}
                              {(nsrpAnswers[section] || []).length === 0 && <p className="text-xs text-slate-500">No entries added.</p>}
                            </section>
                          ))}
                        </div>
                      )}
                      {nsrpStep === 3 && (
                        <div className="space-y-6">
                          <section className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">Work Experience</h3>
                              <button
                                type="button"
                                onClick={() => addNsrpRow('workExperience')}
                                disabled={(nsrpAnswers.workExperience || []).length >= 10}
                                className="rounded-lg border border-cyan-600 px-3 py-1 text-xs font-semibold text-cyan-800 disabled:opacity-40"
                              >
                                Add row
                              </button>
                            </div>
                            {nsrpFieldErrors.workExperience && <p role="alert" className="text-xs text-rose-600">{nsrpFieldErrors.workExperience}</p>}
                            {(nsrpAnswers.workExperience || []).map((row, rowIndex) => (
                              <div key={`workExperience-${rowIndex}`} className="rounded-xl border border-slate-200 p-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {nsrpRowFields.workExperience.map(([field, label]) => {
                                    const fieldKey = `workExperience[${rowIndex}].${field}`
                                    return (
                                      <label key={fieldKey} className="block text-xs font-medium text-slate-700">
                                        {label}
                                        <input
                                          type={['startDate', 'endDate'].includes(field) ? 'date' : 'text'}
                                          value={row[field] || ''}
                                          onChange={(event) => updateNsrpRow('workExperience', rowIndex, field, event.target.value)}
                                          aria-invalid={Boolean(nsrpFieldErrors[fieldKey])}
                                          className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-black ${nsrpFieldErrors[fieldKey] ? 'border-rose-500' : 'border-slate-300'}`}
                                        />
                                        {nsrpFieldErrors[fieldKey] && <span role="alert" className="mt-1 block text-rose-600">{nsrpFieldErrors[fieldKey]}</span>}
                                      </label>
                                    )
                                  })}
                                </div>
                                <button type="button" onClick={() => removeNsrpRow('workExperience', rowIndex)} className="mt-2 text-xs font-semibold text-rose-700">
                                  Remove row
                                </button>
                              </div>
                            ))}
                            {(nsrpAnswers.workExperience || []).length === 0 && <p className="text-xs text-slate-500">No entries added.</p>}
                          </section>
                          <section className="space-y-3">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">Skills</h3>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={nsrpSkillInput}
                                maxLength={50}
                                onChange={(event) => setNsrpSkillInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    const skill = nsrpSkillInput.trim()
                                    if (!skill) return
                                    if ((nsrpAnswers.skills || []).length < 30 && !(nsrpAnswers.skills || []).some((existing) => existing.toLowerCase() === skill.toLowerCase())) {
                                      setNsrp('skills', [...(nsrpAnswers.skills || []), skill])
                                    }
                                    setNsrpSkillInput('')
                                  }
                                }}
                                placeholder="Type a skill and press Enter"
                                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const skill = nsrpSkillInput.trim()
                                  if (!skill) return
                                  if ((nsrpAnswers.skills || []).length < 30 && !(nsrpAnswers.skills || []).some((existing) => existing.toLowerCase() === skill.toLowerCase())) {
                                    setNsrp('skills', [...(nsrpAnswers.skills || []), skill])
                                  }
                                  setNsrpSkillInput('')
                                }}
                                disabled={!nsrpSkillInput.trim() || (nsrpAnswers.skills || []).length >= 30}
                                className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                              >
                                Add
                              </button>
                            </div>
                            {nsrpFieldErrors.skills && <p role="alert" className="text-xs text-rose-600">{nsrpFieldErrors.skills}</p>}
                            <div className="flex flex-wrap gap-2">
                              {(nsrpAnswers.skills || []).map((skill) => (
                                <button key={skill} type="button" onClick={() => setNsrp('skills', nsrpAnswers.skills.filter((item) => item !== skill))} className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-900">
                                  {skill} <span aria-hidden="true">×</span>
                                </button>
                              ))}
                            </div>
                          </section>
                        </div>
                      )}
                      {nsrpStep === 4 && (
                        <div className="space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Employment</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpSelect {...fieldProps} error={nsrpFieldErrors.employmentStatus} label="Employment Status" fieldKey="employmentStatus" options={['Employed', 'Unemployed']} />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.employmentTypeDetail} label="Type / Details" fieldKey="employmentTypeDetail" placeholder="e.g. Fresh Graduate, Finished Contract" />
                        <NsrpSelect {...fieldProps} error={nsrpFieldErrors.activelyLooking} label="Actively looking for work?" fieldKey="activelyLooking" options={['Yes', 'No']} />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.lookingDuration} label="How long looking for work?" fieldKey="lookingDuration" placeholder="e.g. 3 months" />
                        <NsrpSelect {...fieldProps} error={nsrpFieldErrors.willingImmediately} label="Willing to work immediately?" fieldKey="willingImmediately" options={['Yes', 'No']} />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.willingWhen} label="If no, when?" fieldKey="willingWhen" />
                        <NsrpSelect {...fieldProps} error={nsrpFieldErrors.fourPs} label="4Ps beneficiary?" fieldKey="fourPs" options={['Yes', 'No']} />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.fourPsId} label="4Ps Household ID No." fieldKey="fourPsId" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">II. Job Preference</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[1, 2, 3, 4].map((number) => <NsrpField key={`occupation${number}`} {...fieldProps} error={nsrpFieldErrors[`occupation${number}`]} label={`Preferred Occupation ${number}`} fieldKey={`occupation${number}`} />)}
                        {[1, 2, 3].map((number) => <NsrpField key={`localPref${number}`} {...fieldProps} error={nsrpFieldErrors[`localPref${number}`]} label={`Local work location ${number}`} fieldKey={`localPref${number}`} placeholder="City/Municipality" />)}
                        {[1, 2, 3].map((number) => <NsrpField key={`overseasPref${number}`} {...fieldProps} error={nsrpFieldErrors[`overseasPref${number}`]} label={`Overseas country ${number}`} fieldKey={`overseasPref${number}`} />)}
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.expectedSalary} label="Expected Salary (range)" fieldKey="expectedSalary" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.passportNo} label="Passport No." fieldKey="passportNo" />
                        <NsrpField {...fieldProps} error={nsrpFieldErrors.passportExpiry} label="Passport Expiry" fieldKey="passportExpiry" type="date" />
                      </div>
                        </div>
                      )}
                      <div className="hidden">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!nsrpAnswers.surname || !nsrpAnswers.firstName) {
                              return alert('Please fill in at least your surname and first name')
                            }
                            if (!token) return alert('Not authenticated')
                            setApplicationSubmitting(true)
                            try {
                              const response = await fetch(`${API_URL}/api/nsrp/generate`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify(nsrpAnswers),
                              })
                              if (!response.ok) {
                                const data = await response.json().catch(() => null)
                                throw new Error(data?.error || 'Failed to generate document')
                              }
                              const blob = await response.blob()
                              const url = URL.createObjectURL(blob)
                              const link = document.createElement('a')
                              link.href = url
                              link.download = `NSRP-${(nsrpAnswers.surname || 'form').replace(/\s+/g, '_')}.pdf`
                              link.click()
                              setTimeout(() => URL.revokeObjectURL(url), 60_000)
                              setApplicationTab('upload')
                              alert('Your filled NSRP form (PDF) was downloaded. Review it, then upload it in this tab to submit your application.')
                            } catch (err) {
                              console.error(err)
                              alert(err?.message || 'Failed to generate document')
                            } finally {
                              setApplicationSubmitting(false)
                            }
                          }}
                          disabled={applicationSubmitting}
                          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          {applicationSubmitting ? 'Generating...' : 'Generate & Download form'}
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            {applicationTab === 'online' && nsrpStep === 5 && (
              <div className="mt-4">
                <p className="mb-3 text-sm text-slate-600">Review the generated PDF below. Use Edit to return to a step. Any change clears this preview and requires a new one before submission.</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {nsrpSteps.slice(0, 5).map((step, index) => (
                    <button key={step} type="button" onClick={() => setNsrpStep(index)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-cyan-800">
                      Edit {step.toLowerCase()}
                    </button>
                  ))}
                </div>
                {nsrpPreviewUrl ? (
                  <iframe src={nsrpPreviewUrl} title="Generated NSRP PDF preview" className="h-[55vh] w-full rounded-xl border border-slate-300 bg-white" />
                ) : (
                  <p className="rounded-xl border border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Preview not generated. Return to the form and generate the PDF again.</p>
                )}
              </div>
            )}

            {nsrpError && <p role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{nsrpError}</p>}

            {applicationTab === 'online' && (
              <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => nsrpStep > 0 ? setNsrpStep(nsrpStep - 1) : setApplicationJob(null)}
                  disabled={applicationSubmitting || nsrpPreviewLoading}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {nsrpStep === 0 ? 'Cancel' : 'Back'}
                </button>
                {nsrpStep < 4 && (
                  <button type="button" onClick={() => setNsrpStep(nsrpStep + 1)} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
                    Next
                  </button>
                )}
                {nsrpStep === 4 && (
                  <button type="button" onClick={generateNsrpPreview} disabled={nsrpPreviewLoading} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
                    {nsrpPreviewLoading ? 'Generating preview…' : 'Preview NSRP PDF'}
                  </button>
                )}
                {nsrpStep === 5 && (
                  <div className="flex gap-2">
                    <button type="button" onClick={generateNsrpPreview} disabled={nsrpPreviewLoading || applicationSubmitting} className="rounded-xl border border-cyan-600 px-4 py-2 text-sm font-semibold text-cyan-800 disabled:opacity-50">
                      {nsrpPreviewLoading ? 'Updating…' : 'Regenerate preview'}
                    </button>
                    <button
                      type="button"
                      disabled={!nsrpPreviewUrl || applicationSubmitting || nsrpPreviewLoading}
                      onClick={async () => {
                        setApplicationSubmitting(true)
                        const result = await handleApplyJob(applicationJob._id, nsrpAnswers)
                        setApplicationSubmitting(false)
                        if (result?.fieldErrors) {
                          showNsrpFieldErrors(result.fieldErrors)
                          setNsrpError(result.error || 'Check the highlighted NSRP fields.')
                        } else if (result === true || result?.ok) {
                          try { localStorage.removeItem(nsrpStorageKey) } catch (error) { console.error('Could not clear NSRP draft:', error) }
                          setApplicationJob(null)
                          setNsrpAnswers({})
                          setNsrpPreviewUrl('')
                        } else if (result?.error) {
                          setNsrpError(result.error)
                        }
                      }}
                      className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {applicationSubmitting ? 'Submitting…' : 'Confirm and submit'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {applicationTab === 'upload' && (
              <div className="mt-4">
                <label htmlFor="job-application-file" className="block text-sm font-medium text-black">
                  Upload completed NSRP form (PDF)
                </label>
                <input
                  id="job-application-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  onChange={(event) => setApplicationFile(event.target.files?.[0] || null)}
                  className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
                />
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setApplicationJob(null)}
                    disabled={applicationSubmitting}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!applicationFile || applicationSubmitting}
                    className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {applicationSubmitting ? 'Submitting...' : 'Submit application'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(activeRole === "Admin" || activeRole === "Employer") && (
        <div className={`mt-6 admin-jobs-panel rounded-2xl border p-5 ${activeRole === 'Employer' ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950/80'}`}>
          {activeRole === 'Admin' && jobLoading && <p role="status" className="mb-4 text-sm text-slate-300">Loading job postings…</p>}
          {activeRole === 'Admin' && jobLoadError && <p role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">{jobLoadError}</p>}
          {activeRole === "Admin" && (
            <div className="admin-jobs-search mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-lg font-semibold text-white">Search Job Offers</h3>
              <p className="mt-1 text-sm text-slate-400">Find pending, approved, or declined postings by title, company, location, requester, or keywords.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  value={adminJobSearchTerm}
                  onChange={(event) => setAdminJobSearchTerm(event.target.value)}
                  placeholder="Search title, company, location, requester"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white sm:col-span-2"
                />
                <select
                  id="admin-job-status-filter"
                  value={adminJobStatusFilter}
                  onChange={(event) => setAdminJobStatusFilter(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
            </div>
          )}

          {(activeRole !== 'Admin' || showPendingAdminSection) && (
            <>
              <h3 className={`text-lg font-semibold ${activeRole === 'Employer' ? 'text-black' : 'text-white'}`}>{activeRole === 'Employer' ? 'Pending Job Requests' : 'Pending Job Postings'}</h3>
              {filteredPendingJobs.length === 0 ? (
                <p className={`mt-3 ${activeRole === 'Employer' ? 'text-black' : 'text-slate-400'}`}>{activeRole === 'Employer' ? 'You have no pending job requests.' : 'No pending job postings matched your search.'}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {filteredPendingJobs.map((job) => activeRole === 'Admin' ? renderAdminJobRow(job) : (
                    <div
                      key={job._id}
                      className="cursor-pointer overflow-hidden rounded-2xl border border-slate-700 bg-slate-900"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleEditPendingJob(job)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleEditPendingJob(job)
                        }
                      }}
                    >
                      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{job.title}</p>
                          <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                        </div>
                        <span className="rounded-full bg-amber-400 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-950">Pending</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {showPendingAdminSection && (showApprovedAdminSection || showDeclinedAdminSection) && <div className="mt-6 border-t border-slate-800" />}

          {activeRole === 'Admin' && showApprovedAdminSection && (
            <>
              <h3 className="mt-6 text-lg font-semibold text-white">Current Approved Job Offers</h3>
              {filteredApprovedJobs.length === 0 ? (
                <p className="mt-3 text-slate-400">No approved job offers matched your search.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {filteredApprovedJobs.map((job) => {
                    const isExpanded = selectedApprovedJob && String(selectedApprovedJob._id) === String(job._id)
                    return (
                      <div key={job._id} className="space-y-2">
                        {renderAdminJobRow(job)}
                        <button
                          type="button"
                          aria-expanded={Boolean(isExpanded)}
                          onClick={() => setSelectedApprovedJob(isExpanded ? null : job)}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                        >
                          {isExpanded ? 'Hide applicants' : `View ${(job.applicants || []).length} applicants`}
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-700 bg-[#f5f7fb] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <h4 className="text-base font-semibold text-slate-900">Job Offer Details</h4>
                              <button
                                type="button"
                                onClick={() => setSelectedApprovedJob(null)}
                                className="rounded-full border border-slate-300 bg-[#1f2d3d] px-3 py-1 text-sm text-white"
                              >
                                Close
                              </button>
                            </div>

                            <div className="mt-3 space-y-1 text-sm text-slate-700">
                              <p>Company: {job.company}</p>
                              <p>Location: {job.location || 'Remote'}</p>
                              <p>Salary: {job.salary || 'Not specified'}</p>
                              <p>Posted by: {job.createdBy || 'N/A'}</p>
                              <p>Requirements: {job.requirements || 'N/A'}</p>
                              <p className="pt-2">Description: {job.description || 'N/A'}</p>
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                              {(() => {
                                const jobKey = String(job._id)
                                const applicantsWithId = (job.applicants || []).map((applicant) => {
                                  const applicantAccount = findApplicantByEmail(applicant.email)
                                  const applicantId = applicantAccount ? String(applicantAccount.id || applicantAccount._id) : ''
                                  return { applicant, applicantAccount, applicantId }
                                })
                                const referredIds = referredApplicantIdsByJob?.[jobKey] || []
                                const selectable = applicantsWithId.filter(({ applicantId }) => applicantId && !referredIds.includes(applicantId))
                                const selectedIds = selectedApplicantsByJob[jobKey] || []
                                const allSelected = selectable.length > 0 && selectable.every(({ applicantId }) => selectedIds.includes(applicantId))

                                const toggleSelect = (applicantId, checked) => {
                                  setSelectedApplicantsByJob((previous) => {
                                    const current = new Set(previous[jobKey] || [])
                                    if (checked) current.add(applicantId)
                                    else current.delete(applicantId)
                                    return { ...previous, [jobKey]: Array.from(current) }
                                  })
                                }
                                const toggleSelectAll = (checked) => {
                                  setSelectedApplicantsByJob((previous) => ({
                                    ...previous,
                                    [jobKey]: checked ? selectable.map(({ applicantId }) => applicantId) : [],
                                  }))
                                }

                                return (
                                  <>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">Applicants</p>
                                      {selectable.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleBulkReferApplicants(job._id, selectedIds).then(() => setSelectedApplicantsByJob((previous) => ({ ...previous, [jobKey]: [] })))}
                                          disabled={selectedIds.length === 0}
                                          className="rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                          Refer Selected ({selectedIds.length})
                                        </button>
                                      )}
                                    </div>
                                    {(job.applicants || []).length === 0 ? (
                                      <p className="mt-3 text-sm text-slate-500">No applicants yet for this job offer.</p>
                                    ) : (
                                      <div className="mt-3 overflow-x-auto">
                                        <table className="w-full border-collapse text-sm">
                                          <thead>
                                            <tr className="border-b border-slate-200 text-left">
                                              <th className="px-3 py-2 font-semibold text-slate-700">
                                                <input
                                                  type="checkbox"
                                                  aria-label="Select all applicants"
                                                  checked={allSelected}
                                                  disabled={selectable.length === 0}
                                                  onChange={(event) => toggleSelectAll(event.target.checked)}
                                                />
                                              </th>
                                              <th className="px-3 py-2 font-semibold text-slate-700">Name</th>
                                              <th className="px-3 py-2 font-semibold text-slate-700">Email</th>
                                              <th className="px-3 py-2 font-semibold text-slate-700">Applied</th>
                                              <th className="px-3 py-2 font-semibold text-slate-700">Status</th>
                                              <th className="px-3 py-2 font-semibold text-slate-700">NSRP</th>
                                              <th className="px-3 py-2 font-semibold text-slate-700">Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {applicantsWithId.map(({ applicant, applicantAccount, applicantId }) => {
                                              const isReferred = referredIds.includes(applicantId)
                                              const isChecked = selectedIds.includes(applicantId)
                                              return (
                                                <tr
                                                  key={`${job._id}-${applicant.email}-${applicant.appliedAt || ''}`}
                                                  className={`border-b border-slate-100 ${isReferred ? 'bg-slate-100 text-slate-500' : 'text-slate-700'}`}
                                                >
                                                  <td className="px-3 py-3">
                                                    <input
                                                      type="checkbox"
                                                      aria-label={`Select ${applicantAccount?.profile?.name || applicant.email}`}
                                                      checked={isChecked}
                                                      disabled={!applicantId || isReferred}
                                                      onChange={(event) => toggleSelect(applicantId, event.target.checked)}
                                                    />
                                                  </td>
                                                  <td className={`px-3 py-3 font-medium ${isReferred ? 'text-slate-600' : 'text-slate-900'}`}>
                                                    {applicantAccount?.profile?.name || applicant.email}
                                                  </td>
                                                  <td className="px-3 py-3">{applicant.email}</td>
                                                  <td className="px-3 py-3 text-xs text-slate-500">
                                                    {applicant.appliedAt ? new Date(applicant.appliedAt).toLocaleString() : 'N/A'}
                                                  </td>
                                                  <td className="px-3 py-3">
                                                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isReferred ? 'bg-slate-300 text-slate-700' : 'bg-cyan-100 text-cyan-800'}`}>
                                                      {isReferred ? 'Referred' : 'Applied'}
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-3">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleViewApplicantNsrp(job._id, applicant.email)}
                                                      className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                    >
                                                      View NSRP
                                                    </button>
                                                  </td>
                                                  <td className="px-3 py-3">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleReferApplicantFromJob(job._id, applicant.email, isReferred)}
                                                      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${isReferred ? 'border border-slate-400 bg-slate-300 text-slate-700' : 'bg-[#56d5ff] text-slate-950'}`}
                                                    >
                                                      {isReferred ? 'Cancel Referral' : 'Refer Applicant'}
                                                    </button>
                                                  </td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {showApprovedAdminSection && showDeclinedAdminSection && <div className="mt-6 border-t border-slate-800" />}

          {showDeclinedAdminSection && (
            <>
              <h3 className="mt-6 text-lg font-semibold text-white">Declined Job Offers</h3>
              {filteredDeclinedJobs.length === 0 ? (
                <p className="mt-3 text-slate-400">No declined job offers matched your search.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {filteredDeclinedJobs.map((job) => activeRole === 'Admin' ? renderAdminJobRow(job) : (
                    <div key={job._id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                      {job.employerBranding?.bannerImage && (
                        <div
                          className="h-24 w-full bg-slate-800 bg-cover bg-center"
                          style={{ backgroundImage: `url(${job.employerBranding.bannerImage})` }}
                        />
                      )}
                      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          {employerAvatar(job)}
                          <div>
                            <p className="text-lg font-semibold text-white">{job.title}</p>
                            <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                            <p className="mt-2 text-sm text-slate-300">{job.description}</p>
                            <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                            <p className="mt-2 text-sm text-slate-400">Requested by: {job.createdBy || 'N/A'}</p>
                            {job.reviewReason && <p className="mt-2 text-sm text-rose-300">Reason: {job.reviewReason}</p>}
                          </div>
                        </div>
                        <span className="rounded-full bg-slate-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">
                          Declined
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {activeRole === 'Admin' && reviewJob && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/75 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReviewJob()
          }}
        >
          <div
            ref={reviewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-job-review-title"
            aria-describedby="admin-job-review-description"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeReviewJob()
                return
              }
              if (event.key !== 'Tab') return
              const focusable = reviewDialogRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []
              if (!focusable.length) {
                event.preventDefault()
                reviewDialogRef.current?.focus()
                return
              }
              const first = focusable[0]
              const last = focusable[focusable.length - 1]
              if (event.shiftKey && (document.activeElement === first || !reviewDialogRef.current.contains(document.activeElement))) {
                event.preventDefault()
                last.focus()
              } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === reviewDialogRef.current)) {
                event.preventDefault()
                first.focus()
              }
            }}
            className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-slate-600 bg-white p-5 text-slate-900 shadow-2xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="admin-job-review-title" className="text-xl font-bold">{reviewJob.title}</h2>
                <p id="admin-job-review-description" className="mt-1 text-sm text-slate-600">{reviewJob.company} · Submitted {reviewJob.createdAt ? new Date(reviewJob.createdAt).toLocaleString() : 'date unavailable'}</p>
              </div>
              <button type="button" onClick={closeReviewJob} disabled={reviewSubmitting} aria-label="Close job details" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">Close</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ['Status', reviewJob.status || 'pending'],
                ['Location', reviewJob.location || 'Not specified'],
                ['Location type', reviewJob.locationType || 'Not specified'],
                ['Employment type', reviewJob.employmentType || 'Not specified'],
                ['Salary', reviewJob.salary || 'Not specified'],
                ['Slots', reviewJob.slots ?? 'Not specified'],
                ['Application deadline', reviewJob.deadline ? new Date(reviewJob.deadline).toLocaleDateString() : 'Not specified'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-medium">{value}</p>
                </div>
              ))}
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <h3 className="text-sm font-semibold">Full description</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{reviewJob.description || 'No description provided.'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <h3 className="text-sm font-semibold">Requirements</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{reviewJob.requirements || 'No additional requirements provided.'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <h3 className="text-sm font-semibold">Employer details</h3>
                <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-slate-500">Company</dt><dd className="font-medium">{reviewJob.employerDetails?.companyName || reviewJob.company || 'Not provided'}</dd></div>
                  <div><dt className="text-slate-500">Contact</dt><dd className="font-medium">{reviewJob.employerDetails?.contactName || 'Not provided'}</dd></div>
                  <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{reviewJob.employerDetails?.email || reviewJob.createdBy || 'Not provided'}</dd></div>
                  <div><dt className="text-slate-500">Phone</dt><dd className="font-medium">{reviewJob.employerDetails?.phone || 'Not provided'}</dd></div>
                  <div><dt className="text-slate-500">Verification status</dt><dd className="font-medium capitalize">{(reviewJob.employerDetails?.verificationStatus || 'unknown').replaceAll('_', ' ')}</dd></div>
                </dl>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <h3 className="text-sm font-semibold">Posting history</h3>
                <ol className="mt-2 space-y-2 text-sm">
                  <li className="rounded-lg border border-slate-200 bg-white p-3">
                    <span className="font-semibold">Submitted</span>
                    <span className="ml-2 text-slate-500">{reviewJob.createdAt ? new Date(reviewJob.createdAt).toLocaleString() : 'Date unavailable'}</span>
                    <span className="block text-slate-600">By {reviewJob.createdBy || 'Employer account unavailable'}</span>
                  </li>
                  {(reviewJob.reviewHistory?.length ? reviewJob.reviewHistory : (reviewJob.approvedAt || reviewJob.status === 'declined' ? [{
                    status: reviewJob.status,
                    reason: reviewJob.reviewReason,
                    reviewedBy: reviewJob.approvedBy,
                    reviewedAt: reviewJob.approvedAt,
                  }] : [])).map((decision, index) => (
                    <li key={`${decision.status}-${decision.reviewedAt || index}`} className="rounded-lg border border-slate-200 bg-white p-3">
                      <span className="font-semibold capitalize">{decision.status}</span>
                      <span className="ml-2 text-slate-500">{decision.reviewedAt ? new Date(decision.reviewedAt).toLocaleString() : 'Date unavailable'}</span>
                      {decision.reviewedBy && <span className="block text-slate-600">By {decision.reviewedBy}</span>}
                      {decision.reason && <span className="mt-1 block text-rose-700">Reason: {decision.reason}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            {reviewJob.status === 'pending' && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <label htmlFor="admin-job-decline-reason" className="block text-sm font-semibold">Decline reason (required to decline)</label>
                <textarea
                  id="admin-job-decline-reason"
                  rows="3"
                  maxLength={500}
                  value={declineReasonDraft}
                  onChange={(event) => setDeclineReasonDraft(event.target.value)}
                  disabled={reviewSubmitting}
                  aria-invalid={Boolean(reviewError)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Explain what the employer needs to correct. This will be sent to them."
                />
                <p className="mt-1 text-right text-xs text-slate-500">{declineReasonDraft.length}/500</p>
              </div>
            )}
            {reviewError && <p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{reviewError}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeReviewJob} disabled={reviewSubmitting} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Close</button>
              {reviewJob.status === 'pending' && (
                <>
                  <button
                    type="button"
                    disabled={reviewSubmitting || !declineReasonDraft.trim()}
                    onClick={async () => {
                      setReviewSubmitting(true)
                      setReviewError('')
                      const result = await handleReviewJob(reviewJob._id, 'declined', { reason: declineReasonDraft, confirm: false, silent: true })
                      setReviewSubmitting(false)
                      if (result?.error) setReviewError(result.error)
                      else if (result?.ok) {
                        setReviewJob(null)
                        restoreReviewFocus()
                      }
                    }}
                    className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reviewSubmitting ? 'Saving…' : 'Decline'}
                  </button>
                  <button
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={async () => {
                      setReviewSubmitting(true)
                      setReviewError('')
                      const result = await handleReviewJob(reviewJob._id, 'approved', { confirm: false, silent: true })
                      setReviewSubmitting(false)
                      if (result?.error) setReviewError(result.error)
                      else if (result?.ok) {
                        setReviewJob(null)
                        restoreReviewFocus()
                      }
                    }}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reviewSubmitting ? 'Saving…' : 'Approve'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default JobsView
