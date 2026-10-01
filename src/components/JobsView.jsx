import { useState } from "react"

const nsrpInputCls = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-black'

function NsrpField({ label, fieldKey, type = 'text', placeholder, values, onChange }) {
  return (
    <label className="block text-sm font-medium text-black">
      {label}
      <input
        type={type}
        value={values[fieldKey] || ''}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        placeholder={placeholder}
        className={nsrpInputCls}
      />
    </label>
  )
}

function NsrpSelect({ label, fieldKey, options, values, onChange }) {
  return (
    <label className="block text-sm font-medium text-black">
      {label}
      <select
        value={values[fieldKey] || ''}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        className={nsrpInputCls}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  )
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
  handleBulkReviewJobs,
  showPendingAdminSection,
  showApprovedAdminSection,
  filteredApprovedJobs,
  showDeclinedAdminSection,
  filteredDeclinedJobs,
  adminUsers,
  referredApplicantIdsByJob,
  handleReferApplicantFromJob,
  handleBulkReferApplicants,
  token,
  handleEditPendingJob,
}) {
  const [selectedApprovedJob, setSelectedApprovedJob] = useState(null)
  const [applicationJob, setApplicationJob] = useState(null)
  const [applicationFile, setApplicationFile] = useState(null)
  const [applicationSubmitting, setApplicationSubmitting] = useState(false)
  const [applicationTab, setApplicationTab] = useState('form')
  const [nsrpAnswers, setNsrpAnswers] = useState({})
  const setNsrp = (key, value) => setNsrpAnswers((current) => ({ ...current, [key]: value }))
  const [selectedApplicantsByJob, setSelectedApplicantsByJob] = useState({})
  const [selectedPendingJobIds, setSelectedPendingJobIds] = useState([])

  const togglePendingJobSelection = (jobId) => {
    const id = String(jobId)
    setSelectedPendingJobIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const toggleSelectAllPending = () => {
    const allIds = (filteredPendingJobs || []).map((job) => String(job._id))
    setSelectedPendingJobIds((current) => current.length === allIds.length ? [] : allIds)
  }

  const runBulkReview = (status) => {
    if (typeof handleBulkReviewJobs !== 'function') return
    handleBulkReviewJobs(selectedPendingJobIds, status)
    setSelectedPendingJobIds([])
  }

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
    const response = await fetch(`http://localhost:4000/api/job-applications/view?jobId=${encodeURIComponent(jobId)}&email=${encodeURIComponent(applicantEmail)}`, {
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
                              setApplicationJob(job)
                              setApplicationFile(null)
                              setApplicationTab('form')
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
          <form
            className="w-full max-w-3xl rounded-2xl border border-slate-300 bg-white p-6 text-black shadow-2xl"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!applicationFile) return
              setApplicationSubmitting(true)
              const submitted = await handleApplyJob(applicationJob._id, applicationFile)
              setApplicationSubmitting(false)
              if (submitted) {
                setApplicationJob(null)
                setApplicationFile(null)
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="job-application-title" className="text-lg font-semibold text-black">Apply for {applicationJob.title}</h2>
                <p className="mt-2 text-sm text-black">Download the NSRP form, complete it, then upload the PDF to apply.</p>
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

            <div className="mt-5 flex gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
              {[
                { id: 'form', label: '1. NSRP Form' },
                { id: 'online', label: 'Fill Out Online' },
                { id: 'upload', label: '2. Upload Completed Form' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setApplicationTab(tab.id)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    applicationTab === tab.id ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-black'
                  }`}
                >
                  {tab.label}
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
                  Answer the fields below, then click <strong>Generate & Download</strong> — your filled NSRP Form 1 (.docx) will be downloaded. Review it, then upload it in the Upload tab to submit your application.
                </p>
                {(() => {
                  const fieldProps = { values: nsrpAnswers, onChange: setNsrp }
                  return (
                    <>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">I. Personal Information</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpField {...fieldProps} label="Surname" fieldKey="surname" />
                        <NsrpField {...fieldProps} label="First Name" fieldKey="firstName" />
                        <NsrpField {...fieldProps} label="Middle Name" fieldKey="middleName" />
                        <NsrpField {...fieldProps} label="Suffix (Sr., Jr., III)" fieldKey="suffix" />
                        <NsrpField {...fieldProps} label="Date of Birth" fieldKey="dob" type="date" />
                        <NsrpField {...fieldProps} label="Place of Birth" fieldKey="placeOfBirth" />
                        <NsrpSelect {...fieldProps} label="Sex" fieldKey="sex" options={['Male', 'Female']} />
                        <NsrpField {...fieldProps} label="Religion" fieldKey="religion" />
                        <NsrpSelect {...fieldProps} label="Civil Status" fieldKey="civilStatus" options={['Single', 'Married', 'Widowed', 'Separated', 'Live-in']} />
                        <NsrpField {...fieldProps} label="Height" fieldKey="height" placeholder="e.g. 165 cm" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpField {...fieldProps} label="House No. / Street / Village" fieldKey="addressStreet" />
                        <NsrpField {...fieldProps} label="Barangay" fieldKey="addressBarangay" />
                        <NsrpField {...fieldProps} label="Municipality / City" fieldKey="addressCity" />
                        <NsrpField {...fieldProps} label="Province" fieldKey="addressProvince" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpField {...fieldProps} label="TIN" fieldKey="tin" />
                        <NsrpField {...fieldProps} label="GSIS/SSS ID No." fieldKey="gsisSss" />
                        <NsrpField {...fieldProps} label="Pag-IBIG No." fieldKey="pagibig" />
                        <NsrpField {...fieldProps} label="PhilHealth No." fieldKey="philhealth" />
                        <NsrpField {...fieldProps} label="Email Address" fieldKey="email" type="email" />
                        <NsrpField {...fieldProps} label="Cellphone Number" fieldKey="cellphone" />
                        <NsrpField {...fieldProps} label="Landline Number" fieldKey="landline" />
                        <NsrpField {...fieldProps} label="Disability (if any)" fieldKey="disability" placeholder="e.g. Visual, Hearing, Physical" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Employment</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpSelect {...fieldProps} label="Employment Status" fieldKey="employmentStatus" options={['Employed', 'Unemployed']} />
                        <NsrpField {...fieldProps} label="Type / Details" fieldKey="employmentTypeDetail" placeholder="e.g. Fresh Graduate, Finished Contract" />
                        <NsrpSelect {...fieldProps} label="Actively looking for work?" fieldKey="activelyLooking" options={['Yes', 'No']} />
                        <NsrpField {...fieldProps} label="How long looking for work?" fieldKey="lookingDuration" placeholder="e.g. 3 months" />
                        <NsrpSelect {...fieldProps} label="Willing to work immediately?" fieldKey="willingImmediately" options={['Yes', 'No']} />
                        <NsrpField {...fieldProps} label="If no, when?" fieldKey="willingWhen" />
                        <NsrpSelect {...fieldProps} label="4Ps beneficiary?" fieldKey="fourPs" options={['Yes', 'No']} />
                        <NsrpField {...fieldProps} label="4Ps Household ID No." fieldKey="fourPsId" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">II. Job Preference</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NsrpField {...fieldProps} label="Preferred Occupation 1" fieldKey="occupation1" />
                        <NsrpField {...fieldProps} label="Preferred Occupation 2" fieldKey="occupation2" />
                        <NsrpField {...fieldProps} label="Preferred Occupation 3" fieldKey="occupation3" />
                        <NsrpField {...fieldProps} label="Preferred Occupation 4" fieldKey="occupation4" />
                        <NsrpField {...fieldProps} label="Local work location 1" fieldKey="localPref1" placeholder="City/Municipality" />
                        <NsrpField {...fieldProps} label="Local work location 2" fieldKey="localPref2" />
                        <NsrpField {...fieldProps} label="Overseas country 1" fieldKey="overseasPref1" />
                        <NsrpField {...fieldProps} label="Overseas country 2" fieldKey="overseasPref2" />
                        <NsrpField {...fieldProps} label="Expected Salary (range)" fieldKey="expectedSalary" />
                        <NsrpField {...fieldProps} label="Passport No." fieldKey="passportNo" />
                        <NsrpField {...fieldProps} label="Passport Expiry" fieldKey="passportExpiry" type="date" />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!nsrpAnswers.surname || !nsrpAnswers.firstName) {
                              return alert('Please fill in at least your surname and first name')
                            }
                            if (!token) return alert('Not authenticated')
                            setApplicationSubmitting(true)
                            try {
                              const response = await fetch('http://localhost:4000/api/nsrp/generate', {
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
          </form>
        </div>
      )}

      {(activeRole === "Admin" || activeRole === "Employer") && (
        <div className={`mt-6 admin-jobs-panel rounded-2xl border p-5 ${activeRole === 'Employer' ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950/80'}`}>
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
              {activeRole === 'Admin' && filteredPendingJobs.length > 0 && (
                <div className="admin-bulk-review-bar mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 bg-slate-100 p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedPendingJobIds.length > 0 && selectedPendingJobIds.length === filteredPendingJobs.length}
                      onChange={toggleSelectAllPending}
                      className="h-4 w-4 rounded border-slate-400 bg-white"
                    />
                    Select all ({selectedPendingJobIds.length} selected)
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      disabled={selectedPendingJobIds.length === 0}
                      onClick={() => runBulkReview('approved')}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                        selectedPendingJobIds.length === 0
                          ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      Approve selected
                    </button>
                    <button
                      type="button"
                      disabled={selectedPendingJobIds.length === 0}
                      onClick={() => runBulkReview('declined')}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                        selectedPendingJobIds.length === 0
                          ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                          : 'bg-red-600 text-white hover:bg-red-500'
                      }`}
                    >
                      Decline selected
                    </button>
                  </div>
                </div>
              )}
              {filteredPendingJobs.length === 0 ? (
                <p className={`mt-3 ${activeRole === 'Employer' ? 'text-black' : 'text-slate-400'}`}>{activeRole === 'Employer' ? 'You have no pending job requests.' : 'No pending job postings matched your search.'}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {filteredPendingJobs.map((job) => (
                    <div
                      key={job._id}
                      className={`overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 ${activeRole === 'Employer' ? 'cursor-pointer' : ''}`}
                      role={activeRole === 'Employer' ? 'button' : undefined}
                      tabIndex={activeRole === 'Employer' ? 0 : undefined}
                      onClick={activeRole === 'Employer' ? () => handleEditPendingJob(job) : undefined}
                      onKeyDown={activeRole === 'Employer' ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleEditPendingJob(job)
                        }
                      } : undefined}
                    >
                      {activeRole === 'Admin' && job.employerBranding?.bannerImage && (
                        <div
                          className="h-24 w-full bg-slate-800 bg-cover bg-center"
                          style={{ backgroundImage: `url(${job.employerBranding.bannerImage})` }}
                        />
                      )}
                      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          {activeRole === 'Admin' && employerAvatar(job)}
                          <div>
                            <p className="text-lg font-semibold text-white">{job.title}</p>
                            <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                            <p className="mt-2 text-sm text-slate-300">{job.description}</p>
                            <p className="mt-2 text-sm text-slate-400">{job.requirements}</p>
                            <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                            <p className="mt-2 text-sm text-slate-400">Requested by: {job.createdBy}</p>
                          </div>
                        </div>
                        {activeRole === 'Admin' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleReviewJob(job._id, 'approved')}
                              className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewJob(job._id, 'declined')}
                              className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                            >
                              Decline
                            </button>
                            <input
                              type="checkbox"
                              checked={selectedPendingJobIds.includes(String(job._id))}
                              onChange={() => togglePendingJobSelection(job._id)}
                              onClick={(event) => event.stopPropagation()}
                              className="ml-1 h-4 w-4 shrink-0 self-center rounded border-slate-600 bg-slate-800"
                              aria-label={`Select ${job.title}`}
                            />
                          </div>
                        ) : (
                          <span className="rounded-full bg-amber-400 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-950">Pending</span>
                        )}
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
                      <div key={job._id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                        {job.employerBranding?.bannerImage && (
                          <div
                            className="h-24 w-full bg-slate-800 bg-cover bg-center"
                            style={{ backgroundImage: `url(${job.employerBranding.bannerImage})` }}
                          />
                        )}
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setSelectedApprovedJob(isExpanded ? null : job)}
                          className="w-full p-4 text-left"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                              {employerAvatar(job)}
                              <div>
                                <p className="text-lg font-semibold text-white">{job.title}</p>
                                <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                                <p className="mt-2 text-sm text-slate-300 line-clamp-2">{job.description}</p>
                                <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                                <p className="mt-2 text-sm text-slate-400">Posted by: {job.createdBy || 'N/A'}</p>
                                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">{isExpanded ? 'Click to hide details' : 'Click to open details'}</p>
                              </div>
                            </div>
                            <span className="rounded-full bg-cyan-500 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-950">
                              {(job.applicants || []).length} applicant{(job.applicants || []).length === 1 ? '' : 's'}
                            </span>
                          </div>
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
                  {filteredDeclinedJobs.map((job) => (
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
    </section>
  )
}

export default JobsView
