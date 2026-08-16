import { useState } from "react"

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
  locationFilterOptions,
  filteredApplicantJobs,
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
  adminUsers,
  referredApplicantIdsByJob,
  handleReferApplicantFromJob,
}) {
  const [selectedApprovedJob, setSelectedApprovedJob] = useState(null)

  const findApplicantByEmail = (email) =>
    (Array.isArray(adminUsers) ? adminUsers : []).find(
      (user) => user.role === 'Applicant' && String(user.email || '').toLowerCase() === String(email || '').toLowerCase(),
    )

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
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                    <div key={job._id} className="applicant-job-item rounded-2xl border border-slate-700 bg-slate-900 p-5">
                      <button
                        type="button"
                        onClick={() => setSelectedJob(job)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-lg font-semibold text-white">{job.title}</p>
                            <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                          </div>
                          <span className="rounded-full bg-cyan-500 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-950">
                            Approved
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">{job.description}</p>
                      </button>
                      <p className="mt-3 text-sm text-slate-400">{job.requirements}</p>
                      <p className="mt-2 text-sm text-slate-400">Required skills: {Array.isArray(job.skills) ? job.skills.join(', ') : job.skills || 'None specified'}</p>
                      <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                      {isSelected && selectedJob && (
                        <div className="mt-4 rounded-2xl border border-cyan-500/40 bg-slate-950/80 p-4">
                          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Job details</h4>
                          <p className="mt-3 text-sm text-slate-300">{selectedJob.description}</p>
                          <p className="mt-3 text-sm text-slate-400">Company: {selectedJob.company}</p>
                          <p className="mt-1 text-sm text-slate-400">Location: {selectedJob.location || 'Remote'}</p>
                          <p className="mt-1 text-sm text-slate-400">Requirements: {selectedJob.requirements}</p>
                          <p className="mt-1 text-sm text-slate-400">Skills: {Array.isArray(selectedJob.skills) ? selectedJob.skills.join(', ') : selectedJob.skills || 'None specified'}</p>
                          <p className="mt-1 text-sm text-slate-400">Salary: {selectedJob.salary || 'Not specified'}</p>
                          <button
                            type="button"
                            onClick={() => handleApplyJob(selectedJob._id)}
                            disabled={alreadyApplied}
                            className={`mt-4 rounded-2xl px-4 py-2 text-sm font-semibold ${alreadyApplied ? 'bg-slate-700 text-slate-400' : 'bg-cyan-500 text-slate-950'}`}
                          >
                            {alreadyApplied ? 'Already applied' : 'Apply for this job'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
              {filteredPendingJobs.length === 0 ? (
                <p className={`mt-3 ${activeRole === 'Employer' ? 'text-black' : 'text-slate-400'}`}>{activeRole === 'Employer' ? 'You have no pending job requests.' : 'No pending job postings matched your search.'}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {filteredPendingJobs.map((job) => (
                    <div key={job._id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{job.title}</p>
                          <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                          <p className="mt-2 text-sm text-slate-300">{job.description}</p>
                          <p className="mt-2 text-sm text-slate-400">{job.requirements}</p>
                          <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                          <p className="mt-2 text-sm text-slate-400">Requested by: {job.createdBy}</p>
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
                  {filteredApprovedJobs.map((job) => (
                    <button
                      key={job._id}
                      type="button"
                      onClick={() => setSelectedApprovedJob(job)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{job.title}</p>
                          <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                          <p className="mt-2 text-sm text-slate-300 line-clamp-2">{job.description}</p>
                          <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                          <p className="mt-2 text-sm text-slate-400">Posted by: {job.createdBy || 'N/A'}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Click to open details</p>
                        </div>
                        <span className="rounded-full bg-cyan-500 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-950">
                          {(job.applicants || []).length} applicant{(job.applicants || []).length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>
                  ))}
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
                    <div key={job._id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{job.title}</p>
                          <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                          <p className="mt-2 text-sm text-slate-300">{job.description}</p>
                          <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                          <p className="mt-2 text-sm text-slate-400">Requested by: {job.createdBy || 'N/A'}</p>
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

      {activeRole === 'Admin' && selectedApprovedJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedApprovedJob(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-slate-300 bg-[#f5f7fb] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Job Offer Details</h3>
                <p className="mt-2 text-sm font-semibold text-slate-800">{selectedApprovedJob.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApprovedJob(null)}
                className="rounded-full border border-slate-300 bg-[#1f2d3d] px-3 py-1 text-sm text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p>Company: {selectedApprovedJob.company}</p>
              <p>Location: {selectedApprovedJob.location || 'Remote'}</p>
              <p>Salary: {selectedApprovedJob.salary || 'Not specified'}</p>
              <p>Posted by: {selectedApprovedJob.createdBy || 'N/A'}</p>
              <p>Requirements: {selectedApprovedJob.requirements || 'N/A'}</p>
              <p className="pt-2">Description: {selectedApprovedJob.description || 'N/A'}</p>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">Applicants</p>
              {(selectedApprovedJob.applicants || []).length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No applicants yet for this job offer.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {selectedApprovedJob.applicants.map((applicant) => {
                    const applicantAccount = findApplicantByEmail(applicant.email)
                    const applicantId = applicantAccount ? String(applicantAccount.id || applicantAccount._id) : ''
                    const isReferred = (referredApplicantIdsByJob?.[String(selectedApprovedJob._id)] || []).includes(applicantId)
                    return (
                      <li
                        key={`${selectedApprovedJob._id}-${applicant.email}-${applicant.appliedAt || ''}`}
                        className={`flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${isReferred ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-white'}`}
                      >
                        <div className={`text-sm ${isReferred ? 'text-slate-500' : 'text-slate-700'}`}>
                          <p className={`font-medium ${isReferred ? 'text-slate-600' : 'text-slate-900'}`}>{applicantAccount?.profile?.name || applicant.email}</p>
                          <p>{applicant.email}</p>
                          <p className="text-xs text-slate-500">Applied: {applicant.appliedAt ? new Date(applicant.appliedAt).toLocaleString() : 'N/A'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleReferApplicantFromJob(selectedApprovedJob._id, applicant.email, isReferred)}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${isReferred ? 'border border-slate-400 bg-slate-300 text-slate-700' : 'bg-[#56d5ff] text-slate-950'}`}
                        >
                          {isReferred ? 'Cancel Referral' : 'Refer Applicant'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default JobsView
