import { PH_LOCATIONS, applicantCityName, parseStoredLocation } from '../../shared/phLocations.js'
import { EMPLOYMENT_TYPES, formatSalary, formatLocation, mapEmploymentType, normalizeJobPosting } from '../../shared/jobPosting.js'
import { jobSkillMatchCount } from '../../shared/jobSkills.js'
import { rankJobApplicants } from '../../shared/applicantSuitability.js'
import ApplicantSuitability from './ApplicantSuitability'
import JobLanguageRequirements from './JobLanguageRequirements'
import JobModerationSettings from './JobModerationSettings'
import JobScreeningSummary from './JobScreeningSummary'
import { showNotice } from '../utils/portalNotice'
import ApplicantJobBrowser from './ApplicantJobBrowser'
import JobApplicationWizard from './JobApplicationWizard'
import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL } from "../config"
import Modal from "./Modal"
import Pagination from "./Pagination"
import SortControl from "./SortControl"
import ConfirmDialog from "./ConfirmDialog"
import JobFiltersBar from "./JobFiltersBar"
import { usePagination, useDebouncedValue } from "../hooks/usePagination"
import { useSort } from "../hooks/useSort"
import { useJobFilters, JOB_SORT_OPTIONS } from "../hooks/useJobFilters"
import { formatFullName } from "../../shared/nameFields.js"

const ADMIN_JOB_SORT_OPTIONS = [
  { id: 'createdAt:desc', sortBy: 'createdAt', order: 'desc', label: 'Newest submitted' },
  { id: 'createdAt:asc', sortBy: 'createdAt', order: 'asc', label: 'Oldest submitted (longest waiting)' },
  { id: 'title:asc', sortBy: 'title', order: 'asc', label: 'Job title (A to Z)' },
  { id: 'title:desc', sortBy: 'title', order: 'desc', label: 'Job title (Z to A)' },
  { id: 'company:asc', sortBy: 'company', order: 'asc', label: 'Company name (A to Z)' },
  { id: 'company:desc', sortBy: 'company', order: 'desc', label: 'Company name (Z to A)' },
  { id: 'salary:desc', sortBy: 'salary', order: 'desc', label: 'Salary (high to low)' },
  { id: 'salary:asc', sortBy: 'salary', order: 'asc', label: 'Salary (low to high)' },
  { id: 'deadline:asc', sortBy: 'deadline', order: 'asc', label: 'Application deadline (soonest first)' },
  { id: 'status:asc', sortBy: 'status', order: 'asc', label: 'Status' },
]

// Merge server facet counts with the app's known option lists (known options
// with no matches show with a count of 0 at the bottom).
function mergeFacetOptions(facetEntries, knownValues) {
  const map = new Map((Array.isArray(facetEntries) ? facetEntries : []).map((entry) => [entry.value.toLowerCase(), entry]))
  for (const value of knownValues || []) {
    if (!map.has(value.toLowerCase())) map.set(value.toLowerCase(), { value, count: 0 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

function JobsView({
  activeRole,
  jobLoading,
  availableSkills,
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
  applicantSkills = [],
  onGoToProfile,
}) {
  const [selectedApprovedJob, setSelectedApprovedJob] = useState(null)
  const [reviewJob, setReviewJob] = useState(null)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [jobReviewConfirm, setJobReviewConfirm] = useState(null) // 'approved' | 'declined' | null
  const reviewInFlightRef = useRef(false)
  const reviewOpenerRef = useRef(null)
  const [applicationJob, setApplicationJob] = useState(null)
  const skillsHintKey = `peso-skills-hint-dismissed-${currentUser?.id || currentUser?.email || 'applicant'}`
  const [skillsHintDismissed, setSkillsHintDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(skillsHintKey) === '1' } catch { return false }
  })
  const dismissSkillsHint = () => {
    setSkillsHintDismissed(true)
    try { localStorage.setItem(skillsHintKey, '1') } catch { /* storage unavailable */ }
  }

  // Pagination for the long lists in this view (applicant jobs, applications, admin queues)
  const availableJobsPg = usePagination({ urlKey: 'jobPage' })
  const pendingJobsPg = usePagination({ resetDeps: [adminJobSearchTerm], syncUrl: false })
  const approvedJobsPg = usePagination({ resetDeps: [adminJobSearchTerm], syncUrl: false })
  const declinedJobsPg = usePagination({ resetDeps: [adminJobSearchTerm], syncUrl: false })
  const referralApplicantsPg = usePagination({ syncUrl: false })

  // Admin job postings: server-side pagination + sorting per status section
  const debouncedAdminJobSearch = useDebouncedValue(adminJobSearchTerm, 300)
  const resetJobPages = useCallback(() => {
    pendingJobsPg.setPage(1)
    approvedJobsPg.setPage(1)
    declinedJobsPg.setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const jobSort = useSort({ options: ADMIN_JOB_SORT_OPTIONS, defaultId: 'createdAt:desc', urlSync: false, onChange: resetJobPages })
  const emptyPage = { items: [], total: 0, totalPages: 1 }
  const [adminJobsData, setAdminJobsData] = useState({ pending: emptyPage, approved: emptyPage, declined: emptyPage })
  const [adminJobsServerLoading, setAdminJobsServerLoading] = useState(false)
  const [adminJobsRefreshKey, setAdminJobsRefreshKey] = useState(0)

  useEffect(() => {
    if (activeRole !== 'Admin' || !token) return undefined
    let cancelled = false
    setAdminJobsServerLoading(true)
    const fetchSection = async (status, pg) => {
      const params = new URLSearchParams({
        status,
        page: String(pg.page),
        limit: String(pg.pageSize),
        search: debouncedAdminJobSearch,
        sortBy: jobSort.sortBy,
        order: jobSort.order,
      })
      try {
        const response = await fetch(`${API_URL}/api/jobs?${params}`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await response.json().catch(() => null)
        return Array.isArray(data?.items) ? data : emptyPage
      } catch {
        return null // keep previous rows on failure
      }
    }
    Promise.all([
      fetchSection('pending', pendingJobsPg),
      fetchSection('approved', approvedJobsPg),
      fetchSection('declined', declinedJobsPg),
    ]).then(([pending, approved, declined]) => {
      if (cancelled) return
      setAdminJobsData((current) => ({
        pending: pending || current.pending,
        approved: approved || current.approved,
        declined: declined || current.declined,
      }))
      setAdminJobsServerLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole, token, debouncedAdminJobSearch, jobSort.sortBy, jobSort.order, pendingJobsPg.page, pendingJobsPg.pageSize, approvedJobsPg.page, approvedJobsPg.pageSize, declinedJobsPg.page, declinedJobsPg.pageSize, adminJobsRefreshKey])

  // Wrap admin actions so the server-paginated queues refetch after review
  const handleAdminReviewJob = async (...args) => {
    const result = await handleReviewJob?.(...args)
    setAdminJobsRefreshKey((key) => key + 1)
    return result
  }
  const handleAdminBulkReviewJobs = async (...args) => {
    const result = await handleBulkReviewJobs?.(...args)
    setAdminJobsRefreshKey((key) => key + 1)
    return result
  }

  const isAdminJobs = activeRole === 'Admin'
  const pendingList = isAdminJobs ? adminJobsData.pending.items : pendingJobsPg.paginate(filteredPendingJobs)
  const pendingTotal = isAdminJobs ? adminJobsData.pending.total : filteredPendingJobs.length
  const approvedList = isAdminJobs ? adminJobsData.approved.items : approvedJobsPg.paginate(filteredApprovedJobs)
  const approvedTotal = isAdminJobs ? adminJobsData.approved.total : filteredApprovedJobs.length
  const declinedList = isAdminJobs ? adminJobsData.declined.items : declinedJobsPg.paginate(filteredDeclinedJobs)
  const declinedTotal = isAdminJobs ? adminJobsData.declined.total : filteredDeclinedJobs.length

  // --- Applicant job board: pill filters + server-side filtering/sorting ---
  const jobFilters = useJobFilters({ onResetPage: () => availableJobsPg.setPage(1) })
  const debouncedKeyword = useDebouncedValue(jobFilters.filters.keyword, 300)
  const EMPTY_FACETS = { skills: [], locations: [], locationTypes: [], employmentTypes: [] }
  const [applicantJobsData, setApplicantJobsData] = useState({ items: [], total: 0, totalPages: 1, facets: EMPTY_FACETS })
  const [applicantJobsLoading, setApplicantJobsLoading] = useState(false)
  const [applicationHistory, setApplicationHistory] = useState([])
  const applicantSkillsKey = JSON.stringify(currentUser?.profile?.skills || [])
  const loadApplicationHistory = useCallback(async () => {
    if (activeRole !== 'Applicant' || !token) return
    try {
      const response = await fetch(`${API_URL}/api/applications/mine`, { headers: { Authorization: `Bearer ${token}` } })
      const items = await response.json()
      if (response.ok && Array.isArray(items)) setApplicationHistory(items)
    } catch { /* History can be retried without hiding the job board. */ }
  }, [activeRole, token])
  useEffect(() => { loadApplicationHistory(); const timer = setInterval(loadApplicationHistory, 10000); return () => clearInterval(timer) }, [loadApplicationHistory, appliedJobs])

  useEffect(() => {
    if (activeRole !== 'Applicant' || !token) return undefined
    let cancelled = false
    setApplicantJobsLoading(true)
    const params = new URLSearchParams({ status: 'approved', page: String(availableJobsPg.page), limit: String(availableJobsPg.pageSize) })
    const query = { ...jobFilters.queryParams, search: debouncedKeyword }
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value)
    }
    fetch(`${API_URL}/api/jobs?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (cancelled) return
        if (Array.isArray(data?.items)) {
          setApplicantJobsData({ ...data, facets: data.facets || EMPTY_FACETS })
          if (data.items.length === 0 && data.total > 0 && availableJobsPg.page > 1) availableJobsPg.setPage(availableJobsPg.page - 1)
        }
        setApplicantJobsLoading(false)
      })
      .catch(() => { if (!cancelled) setApplicantJobsLoading(false) }) // keep previous results on failure
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole, token, availableJobsPg.page, availableJobsPg.pageSize, jobFilters.queryParams, debouncedKeyword, applicantSkillsKey])

  // Facet options: data values merged with the app's known lists
  const cityCounts = new Map(Object.keys(PH_LOCATIONS).map(city => [city, 0]))
  for (const entry of applicantJobsData.facets.locations || []) {
    const city = parseStoredLocation(entry.value)?.city || applicantCityName(entry.value)
    if (city) cityCounts.set(city, (cityCounts.get(city) || 0) + (entry.count || 0))
  }
  const applicantFacets = {
    skills: mergeFacetOptions(applicantJobsData.facets.skills, availableSkills),
    locations: [...cityCounts].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
    locationTypes: mergeFacetOptions(applicantJobsData.facets.locationTypes, ['On-site', 'Remote', 'Hybrid']),
    employmentTypes: mergeFacetOptions(applicantJobsData.facets.employmentTypes, EMPLOYMENT_TYPES),
  }
  const applicantMySkills = Array.isArray(currentUser?.profile?.skills) ? currentUser.profile.skills : []
  // SortControl matches options by `${sortBy}:${order}` as the option id
  const applicantJobSortOptions = JOB_SORT_OPTIONS.map((option) => ({ id: `${option.params.sortBy}:${option.params.order}`, sortBy: option.params.sortBy, order: option.params.order, label: option.label }))
  const currentJobSortOption = JOB_SORT_OPTIONS.find((option) => option.id === jobFilters.sortId) || JOB_SORT_OPTIONS[0]
  const jobSortControlValue = { sortBy: currentJobSortOption.params.sortBy, order: currentJobSortOption.params.order }
  const handleJobSortChange = (option) => {
    const match = JOB_SORT_OPTIONS.find((item) => item.params.sortBy === option.sortBy && item.params.order === option.order)
    jobFilters.setSort(match?.id || 'relevant')
  }
  const applicantJobs = activeRole === 'Applicant' ? applicantJobsData.items.filter((job) => jobSkillMatchCount(job.skills, applicantMySkills) > 0) : []
  const applicationByJobId = new Map(applicationHistory.map((entry) => [String(entry.jobId), entry]))
  const appliedPostingById = new Map((Array.isArray(appliedJobs) ? appliedJobs : []).map((job) => [String(job._id), job]))
  const applicantJobsTotal = applicantMySkills.length ? applicantJobsData.total : 0
  const applicantHasActiveFilters = jobFilters.activeCount > 0
  const [selectedApplicantsByJob, setSelectedApplicantsByJob] = useState({})
  const openReviewJob = (job) => {
    reviewOpenerRef.current = document.activeElement
    setReviewJob(normalizeJobPosting(job))
    setReviewError('')
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

  const renderAdminJobRow = (job) => (
    <button
      key={job._id}
      type="button"
      onClick={() => openReviewJob(job)}
      className="grid w-full min-w-0 gap-1 rounded-xl border border-slate-300 bg-white p-3 text-left transition hover:border-cyan-500 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
      aria-label={`View ${job.title} details`}
    >
      <span className="truncate font-semibold text-slate-900">{job.title}</span>
      <span className="truncate text-sm text-slate-700">{job.company}</span>
      <span className="text-xs text-slate-600">{job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'Date unavailable'}</span>
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

  const openApplication = (job, alreadyApplied) => {
    if (alreadyApplied) return
    setSelectedJob(job)
    setApplicationJob(job)
  }

  const handleViewApplicantNsrp = async (jobId, applicantEmail) => {
    if (!token) return showNotice('Not authenticated')
    const response = await fetch(`${API_URL}/api/job-applications/view?jobId=${encodeURIComponent(jobId)}&email=${encodeURIComponent(applicantEmail)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      return showNotice('Application NSRP file could not be opened')
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
      {activeRole === 'Admin' && <JobModerationSettings token={token} />}
      <p className={`mt-3 ${activeRole === 'Employer' ? 'text-black' : 'text-slate-400'}`}>{activeRole === 'Applicant' ? 'Find jobs that fit you.' : 'View postings and manage approvals.'}</p>

      {jobLoading && <p className="mt-4 text-slate-300">Loading jobs…</p>}

      {activeRole === "Applicant" && (
        <div className="mt-6 space-y-6">
          {(!Array.isArray(applicantSkills) || applicantSkills.length === 0) && !skillsHintDismissed && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-sm font-medium text-slate-800" role="status">
              <span>Add your skills to see jobs that match you.</span>
              <span className="flex shrink-0 items-center gap-2">
                {onGoToProfile && (
                  <button type="button" onClick={onGoToProfile} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
                    Add skills
                  </button>
                )}
                <button type="button" onClick={dismissSkillsHint} aria-label="Dismiss skills hint" className="rounded-lg px-2 py-1 text-slate-500 hover:text-slate-900">
                  ×
                </button>
              </span>
            </div>
          )}
          <div className="applicant-job-search rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <JobFiltersBar
              filters={jobFilters.filters}
              facets={applicantFacets}
              resultCount={applicantJobsTotal}
              onToggle={jobFilters.toggleValue}
              onDatePosted={jobFilters.setDatePosted}
              onKeyword={jobFilters.setKeyword}
              onClearGroup={jobFilters.clearGroup}
              onClearAll={jobFilters.clearAll}
            />
          </div>

          <div className="applicant-available-jobs rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">
                {applicantJobsLoading && applicantJobsTotal === 0 ? 'Loading jobs…' : `${applicantJobsTotal} job${applicantJobsTotal === 1 ? '' : 's'} found`}
              </h3>
              <SortControl
                options={applicantJobSortOptions}
                value={jobSortControlValue}
                onChange={handleJobSortChange}
                onReset={() => jobFilters.setSort('relevant')}
                ariaLabel="Sort jobs"
              />
            </div>
            {applicantJobsTotal === 0 && !applicantJobsLoading ? (
              applicantHasActiveFilters ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                  <p className="text-slate-700">No jobs match your saved skills and these filters.</p>
                  <button type="button" onClick={jobFilters.clearAll} className="mt-3 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
                    Clear all filters
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-slate-600">{applicantMySkills.length ? 'No available jobs match your saved skills. Check back soon.' : 'Add skills to your profile to see matching job offers.'}</p>
              )
            ) : (
              <ApplicantJobBrowser jobs={applicantJobs} applicationByJobId={applicationByJobId} appliedPostingById={appliedPostingById} appliedJobIds={appliedJobIds} currentUser={currentUser} onApply={openApplication} loading={applicantJobsLoading} />
            )}

            {applicantJobsTotal > 0 && (
              <Pagination
                page={availableJobsPg.page}
                pageSize={availableJobsPg.pageSize}
                totalItems={applicantJobsTotal}
                onPageChange={availableJobsPg.setPage}
                onPageSizeChange={availableJobsPg.setPageSize}
                loading={applicantJobsLoading}
                itemLabel="jobs"
                ariaLabel="Available jobs pagination"
              />
            )}
          </div>

        </div>
      )}

      {applicationJob && <JobApplicationWizard key={`${currentUser?.id || currentUser?._id || currentUser?.email}:${applicationJob._id}`} job={applicationJob} token={token} currentUser={currentUser} onClose={() => setApplicationJob(null)} onSubmit={handleApplyJob} />}

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
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                />
                <select
                  id="admin-job-status-filter"
                  value={adminJobStatusFilter}
                  onChange={(event) => setAdminJobStatusFilter(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
              <div className="mt-3">
                <SortControl
                  options={ADMIN_JOB_SORT_OPTIONS}
                  value={jobSort}
                  onChange={jobSort.setSortOption}
                  onReset={jobSort.resetSort}
                  ariaLabel="Sort job postings"
                />
              </div>
            </div>
          )}

          {(activeRole !== 'Admin' || showPendingAdminSection) && (
            <>
              <h3 className={`text-lg font-semibold ${activeRole === 'Employer' ? 'text-black' : 'text-white'}`}>{activeRole === 'Employer' ? 'Pending Job Requests' : 'Pending Job Postings'}</h3>
              {pendingTotal === 0 ? (
                <p className={`mt-3 ${activeRole === 'Employer' ? 'text-black' : 'text-slate-400'}`}>{activeRole === 'Employer' ? 'You have no pending job requests.' : 'No pending job postings matched your search.'}</p>
              ) : (
                <div className={`mt-4 space-y-4${isAdminJobs && adminJobsServerLoading ? ' opacity-60 transition-opacity' : ''}`} aria-busy={isAdminJobs && adminJobsServerLoading}>
                  {pendingList.map((job) => activeRole === 'Admin' ? renderAdminJobRow(job) : (
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
              {pendingTotal > 0 && (
                <Pagination
                  page={pendingJobsPg.page}
                  pageSize={pendingJobsPg.pageSize}
                  totalItems={pendingTotal}
                  onPageChange={pendingJobsPg.setPage}
                  onPageSizeChange={pendingJobsPg.setPageSize}
                  loading={isAdminJobs && adminJobsServerLoading}
                  itemLabel="job postings"
                  ariaLabel="Pending job postings pagination"
                />
              )}
            </>
          )}

          {showPendingAdminSection && (showApprovedAdminSection || showDeclinedAdminSection) && <div className="mt-6 border-t border-slate-800" />}

          {activeRole === 'Admin' && showApprovedAdminSection && (
            <>
              <h3 className="mt-6 text-lg font-semibold text-white">Current Approved Job Offers</h3>
              {approvedTotal === 0 ? (
                <p className="mt-3 text-slate-400">No approved job offers matched your search.</p>
              ) : (
                <div className={`mt-4 space-y-4${adminJobsServerLoading ? ' opacity-60 transition-opacity' : ''}`} aria-busy={adminJobsServerLoading}>
                  {approvedList.map((job) => {
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
                          <div className="mt-3 border-t border-slate-200 pt-4" role="region" aria-labelledby="admin-approved-job-title">
                            <div>
                              <h3 id="admin-approved-job-title" className="text-lg font-semibold text-slate-900">Job Offer Details</h3>
                              <p className="mt-1 text-sm text-slate-900">{job.title} · {job.company}</p>
                            </div>

                            <div className="mt-4 grid gap-x-6 gap-y-2 text-sm text-slate-700 sm:grid-cols-2">
                              <p>Company: {job.company}</p>
                              <p>Location: {job.location || 'Remote'}</p>
                              <p>Salary: {job.salary || 'Not specified'}</p>
                              <p>Posted by: {job.createdBy || 'N/A'}</p>
                              <p className="sm:col-span-2">Requirements: {job.requirements || 'N/A'}</p>
                              <p className="whitespace-pre-wrap sm:col-span-2">Description: {job.description || 'N/A'}</p>
                            </div>

                            <div className="mt-5 border-t border-slate-200 pt-4">
                              {(() => {
                                const jobKey = String(job._id)
                                const applicantsWithId = rankJobApplicants(job, (job.applicants || []).map((applicant) => {
                                  const applicantAccount = findApplicantByEmail(applicant.email)
                                  const applicantId = applicantAccount ? String(applicantAccount.id || applicantAccount._id) : ''
                                  return { applicant, applicantAccount, applicantId }
                                }), (entry) => entry.applicantAccount)
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
                                      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">Applicants</h3>
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
                                            {referralApplicantsPg.paginate(applicantsWithId).map(({ applicant, applicantAccount, applicantId, suitability }) => {
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
                                                      aria-label={`Select ${formatFullName(applicantAccount?.profile) || applicant.email}`}
                                                      checked={isChecked}
                                                      disabled={!applicantId || isReferred}
                                                      onChange={(event) => toggleSelect(applicantId, event.target.checked)}
                                                    />
                                                  </td>
                                                  <td className={`px-3 py-3 font-medium ${isReferred ? 'text-slate-600' : 'text-slate-900'}`}>
                                                    {formatFullName(applicantAccount?.profile) || applicant.email}
                                                    <ApplicantSuitability suitability={suitability} compact />
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
                                                      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${isReferred ? 'border border-slate-400 bg-slate-300 text-slate-700' : 'bg-[var(--peso-accent)] text-white'}`}
                                                    >
                                                      {isReferred ? 'Cancel Referral' : 'Refer Applicant'}
                                                    </button>
                                                  </td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
                                        <Pagination
                                          page={referralApplicantsPg.page}
                                          pageSize={referralApplicantsPg.pageSize}
                                          totalItems={applicantsWithId.length}
                                          onPageChange={referralApplicantsPg.setPage}
                                          onPageSizeChange={referralApplicantsPg.setPageSize}
                                          itemLabel="applicants"
                                          ariaLabel="Job applicants pagination"
                                        />
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
              {approvedTotal > 0 && (
                <Pagination
                  page={approvedJobsPg.page}
                  pageSize={approvedJobsPg.pageSize}
                  totalItems={approvedTotal}
                  onPageChange={approvedJobsPg.setPage}
                  onPageSizeChange={approvedJobsPg.setPageSize}
                  loading={adminJobsServerLoading}
                  itemLabel="job offers"
                  ariaLabel="Approved job offers pagination"
                />
              )}
            </>
          )}

          {showApprovedAdminSection && showDeclinedAdminSection && <div className="mt-6 border-t border-slate-800" />}

          {showDeclinedAdminSection && (
            <>
              <h3 className="mt-6 text-lg font-semibold text-white">Declined Job Offers</h3>
              {declinedTotal === 0 ? (
                <p className="mt-3 text-slate-400">No declined job offers matched your search.</p>
              ) : (
                <div className={`mt-4 space-y-4${adminJobsServerLoading ? ' opacity-60 transition-opacity' : ''}`} aria-busy={adminJobsServerLoading}>
                  {declinedList.map((job) => activeRole === 'Admin' ? renderAdminJobRow(job) : (
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
              {declinedTotal > 0 && (
                <Pagination
                  page={declinedJobsPg.page}
                  pageSize={declinedJobsPg.pageSize}
                  totalItems={declinedTotal}
                  onPageChange={declinedJobsPg.setPage}
                  onPageSizeChange={declinedJobsPg.setPageSize}
                  loading={adminJobsServerLoading}
                  itemLabel="job offers"
                  ariaLabel="Declined job offers pagination"
                />
              )}
            </>
          )}
        </div>
      )}
      {activeRole === 'Admin' && reviewJob && (
        <Modal onClose={closeReviewJob} labelledBy="admin-job-review-title" describedBy="admin-job-review-description">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="admin-job-review-title" className="text-xl font-bold">{reviewJob.title}</h2>
                <p id="admin-job-review-description" className="mt-1 text-sm text-slate-900">{reviewJob.company} · Submitted {reviewJob.createdAt ? new Date(reviewJob.createdAt).toLocaleString() : 'date unavailable'}</p>
              </div>
              <button type="button" onClick={closeReviewJob} disabled={reviewSubmitting} aria-label="Close job details" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">Close</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ['Status', reviewJob.status || 'pending'],
                ['Location', formatLocation(reviewJob) || 'Not specified'],
                ['City/Municipality', reviewJob.city || 'Not specified'],
                ['Barangay', reviewJob.barangay || 'Not specified'],
                ['Province', reviewJob.province || 'Not specified'],
                ['Location type', reviewJob.locationType || 'Not specified'],
                ['Employment type', mapEmploymentType(reviewJob.employmentType) || 'Not specified'],
                ['Educational attainment', reviewJob.education || 'Not Required'],
                ['Experience', reviewJob.experience || 'No Experience'],
                ['Salary', formatSalary(reviewJob) || 'Not specified'],
                ['Pay frequency', reviewJob.payFrequency || 'Monthly'],
                ['Negotiable', reviewJob.negotiable ? 'Yes' : 'No'],
                ['Required skills', (reviewJob.skills || []).join(', ') || 'Not specified'],
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
              <JobLanguageRequirements value={reviewJob.languageRequirements} />
              <JobScreeningSummary moderation={reviewJob.moderation} />
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="text-sm font-semibold">Notes to PESO Admin</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{reviewJob.notesToAdmin || 'No private notes provided.'}</p></div>
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
            {reviewError && <p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{reviewError}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeReviewJob} disabled={reviewSubmitting} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Close</button>
              {reviewJob.status === 'pending' && (
                <>
                  <button
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={() => { setReviewError(''); setJobReviewConfirm('declined') }}
                    className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={() => { setReviewError(''); setJobReviewConfirm('approved') }}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
            {jobReviewConfirm && (
              <ConfirmDialog
                title={jobReviewConfirm === 'approved' ? `Approve "${reviewJob.title}"?` : `Decline "${reviewJob.title}"?`}
                note={jobReviewConfirm === 'approved'
                  ? 'The posting will become visible to applicants and the employer will be notified.'
                  : 'The employer will be notified with your reason.'}
                confirmLabel={jobReviewConfirm === 'approved' ? 'Yes, approve' : 'Confirm reject'}
                confirmTone={jobReviewConfirm === 'approved' ? 'primary' : 'danger'}
                busyLabel={jobReviewConfirm === 'approved' ? 'Approving...' : 'Declining...'}
                busy={reviewSubmitting}
                requireReason={jobReviewConfirm === 'declined'}
                quickReasons={jobReviewConfirm === 'declined' ? ['Incomplete details', 'Policy violation', 'Duplicate posting', 'Misleading information'] : []}
                error={reviewError}
                onCancel={() => setJobReviewConfirm(null)}
                onConfirm={async (reason) => {
                  if (reviewInFlightRef.current) return
                  reviewInFlightRef.current = true
                  setReviewSubmitting(true)
                  setReviewError('')
                  try {
                    const result = jobReviewConfirm === 'approved'
                      ? await handleAdminReviewJob(reviewJob._id, 'approved', { confirm: false, silent: true })
                      : await handleAdminReviewJob(reviewJob._id, 'declined', { reason, confirm: false, silent: true })
                    if (result?.error) {
                      setReviewError(result.error)
                      return
                    }
                    if (result?.ok) {
                      setJobReviewConfirm(null)
                      setReviewJob(null)
                      restoreReviewFocus()
                    }
                  } catch (error) {
                    setReviewError(error?.message || 'Job review failed. Please try again.')
                  } finally {
                    reviewInFlightRef.current = false
                    setReviewSubmitting(false)
                  }
                }}
              />
            )}
        </Modal>
      )}
    </section>
  )
}

export default JobsView
