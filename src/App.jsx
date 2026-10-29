import { PH_LOCATIONS as albayLocations, getEmployerAddress } from '../shared/phLocations.js'
import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL } from "./config"
import JobsView from "./components/JobsView"
import VerificationDocumentsForm, { emptyVerificationDocs, validateVerificationDocs } from "./components/VerificationDocumentsForm"
import VerificationDocsReviewModal from "./components/VerificationDocsReviewModal"
import MyDocumentsPage from "./components/MyDocumentsPage"
import VerifyEmailPage from "./components/VerifyEmailPage"
import EmailVerificationBanner from "./components/EmailVerificationBanner"
import CompleteRegistrationPage from "./components/CompleteRegistrationPage"
import JobPostingFields from "./components/JobPostingFields"
import { emptyJobPosting, normalizeJobPosting, validateJobPosting } from "../shared/jobPosting.js"
import AdminJobTitlesPage from "./components/AdminJobTitlesPage"
import PasswordChecklist from "./components/PasswordChecklist"
import ApplicantSignupWizard from "./components/ApplicantSignupWizard"
import EmployerSignupWizard from "./components/EmployerSignupWizard"
import EmployerVerificationPage from "./components/EmployerVerificationPage"
import { validatePassword } from "./utils/passwordPolicy"
import { SUFFIX_OPTIONS, capitalizeName, validateNameField, formatFullName, formatDisplayName } from "../shared/nameFields.js"
import { EMPLOYER_VERIFICATION_STATUS as EMPLOYER_STATUS } from "../shared/employerVerification.js"
import ReferralList from "./components/ReferralList"
import Pagination from "./components/Pagination"
import SortControl, { SortableTh } from "./components/SortControl"
import ConfirmDialog from "./components/ConfirmDialog"
import { usePagination, useDebouncedValue } from "./hooks/usePagination"
import { useSort } from "./hooks/useSort"
import { sortItems } from "./utils/sortItems"
import RoleDashboard from "./components/AllDashboard"
import PesoReferralPanel from "./components/PesoReferralPanel"

const focusJobError = (form) => requestAnimationFrame(() => {
  const input = form?.querySelector('[aria-invalid="true"]')
  input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  input?.focus()
})

const initialAccounts = [
  { email: "admin@peso.gov", password: "password123", role: "Admin" },
  { email: "employer@peso.gov", password: "password123", role: "Employer" },
  { email: "applicant@peso.gov", password: "password123", role: "Applicant" },
]

function formatApplicantPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  const localDigits = digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits
  return /^09\d{9}$/.test(localDigits)
    ? `${localDigits.slice(0, 4)} ${localDigits.slice(4, 7)} ${localDigits.slice(7)}`
    : phone || 'Not provided'
}

const navigationByRole = {
  Admin: [
    { id: "dashboard", label: "Dashboard" },
    { id: "employers", label: "Employers" },
    { id: "applicants", label: "Applicants" },
    { id: "requests", label: "Employer Requests" },
    { id: "jobs", label: "Job Postings" },
    { id: "job-titles", label: "Job Titles" },
    { id: "peso-referrals", label: "Reports" },
  ],
  Employer: [
    { id: "complete", label: "Complete Registration" },
    { id: "verification", label: "Account verification" },
    { id: "dashboard", label: "Dashboard" },
    { id: "home", label: "Home" },
    { id: "employer", label: "Job Postings" },
    { id: "referrals", label: "Reports" },
    { id: "reviews", label: "Reviews" },
    { id: "notify", label: "Notifications" },
  ],
  Applicant: [
    { id: "complete", label: "Complete Registration" },
    { id: "dashboard", label: "Dashboard" },
    { id: "home", label: "Home" },
    { id: "documents", label: "My Documents" },
    { id: "jobs", label: "Jobs" },
    { id: "reputation", label: "Reviews" },
    { id: "notify", label: "Notifications" },
  ],
}

const availableSkills = [
  "Software Engineer",
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Web Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Analyst",
  "Data Scientist",
  "Machine Learning Engineer",
  "Cybersecurity Analyst",
  "IT Support Specialist",
  "Network Engineer",
  "Database Administrator",
  "QA Engineer",
  "UI/UX Designer",
  "Product Manager",
  "Project Manager",
  "Business Analyst",
  "Accountant",
  "Financial Analyst",
  "Bookkeeper",
  "Human Resources Specialist",
  "Recruiter",
  "Sales Representative",
  "Account Manager",
  "Marketing Specialist",
  "Digital Marketing Specialist",
  "Social Media Manager",
  "Content Writer",
  "Copywriter",
  "Graphic Designer",
  "Video Editor",
  "Customer Service Representative",
  "Call Center Agent",
  "Virtual Assistant",
  "Administrative Assistant",
  "Executive Assistant",
  "Office Clerk",
  "Data Entry Specialist",
  "Operations Manager",
  "Supply Chain Specialist",
  "Logistics Coordinator",
  "Warehouse Associate",
  "Delivery Driver",
  "Professional Driver",
  "Security Guard",
  "Cashier",
  "Retail Associate",
  "Store Manager",
  "Chef",
  "Cook",
  "Baker",
  "Waiter / Waitress",
  "Barista",
  "Housekeeper",
  "Janitor",
  "Caregiver",
  "Nurse",
  "Medical Technologist",
  "Pharmacist",
  "Teacher",
  "Tutor",
  "Electrician",
  "Plumber",
  "Carpenter",
  "Welder",
  "Mechanic",
  "Construction Worker",
  "Civil Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Architect",
  "Landscaper",
  "Farm Worker",
]

// Municipalities/Cities of Albay with their barangays

const APPLICANT_SORT_OPTIONS = [
  { id: 'name:asc', sortBy: 'name', order: 'asc', label: 'Name (last name, A to Z)' },
  { id: 'name:desc', sortBy: 'name', order: 'desc', label: 'Name (last name, Z to A)' },
  { id: 'createdAt:desc', sortBy: 'createdAt', order: 'desc', label: 'Newest registered' },
  { id: 'createdAt:asc', sortBy: 'createdAt', order: 'asc', label: 'Oldest registered' },
  { id: 'status:asc', sortBy: 'status', order: 'asc', label: 'Verification status' },
  { id: 'docsApproved:desc', sortBy: 'docsApproved', order: 'desc', label: 'Documents approved (most first)' },
  { id: 'docsApproved:asc', sortBy: 'docsApproved', order: 'asc', label: 'Documents approved (least first)' },
  { id: 'location:asc', sortBy: 'location', order: 'asc', label: 'Location (A to Z)' },
  { id: 'location:desc', sortBy: 'location', order: 'desc', label: 'Location (Z to A)' },
]

const EMPLOYER_SORT_OPTIONS = [
  { id: 'companyName:asc', sortBy: 'companyName', order: 'asc', label: 'Company name (A to Z)' },
  { id: 'companyName:desc', sortBy: 'companyName', order: 'desc', label: 'Company name (Z to A)' },
  { id: 'createdAt:desc', sortBy: 'createdAt', order: 'desc', label: 'Newest' },
  { id: 'createdAt:asc', sortBy: 'createdAt', order: 'asc', label: 'Oldest' },
  { id: 'status:asc', sortBy: 'status', order: 'asc', label: 'Verification status' },
]

const EMPLOYER_REQUEST_SORT_OPTIONS = [
  { id: 'createdAt:desc', sortBy: 'createdAt', order: 'desc', label: 'Newest submitted' },
  { id: 'createdAt:asc', sortBy: 'createdAt', order: 'asc', label: 'Oldest submitted (longest waiting)' },
  { id: 'companyName:asc', sortBy: 'companyName', order: 'asc', label: 'Company name (A to Z)' },
  { id: 'companyName:desc', sortBy: 'companyName', order: 'desc', label: 'Company name (Z to A)' },
  { id: 'status:asc', sortBy: 'status', order: 'asc', label: 'Status' },
]

const MY_JOBS_SORT_OPTIONS = [
  { id: 'createdAt:desc', sortBy: 'createdAt', order: 'desc', label: 'Newest submitted' },
  { id: 'createdAt:asc', sortBy: 'createdAt', order: 'asc', label: 'Oldest submitted' },
  { id: 'title:asc', sortBy: 'title', order: 'asc', label: 'Job title (A to Z)' },
  { id: 'title:desc', sortBy: 'title', order: 'desc', label: 'Job title (Z to A)' },
  { id: 'deadline:asc', sortBy: 'deadline', order: 'asc', label: 'Application deadline (soonest first)' },
]

const normalizeSkills = (skills) => {
  if (Array.isArray(skills)) return skills.filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim())
  if (typeof skills === 'string') return skills.split(',').map((skill) => skill.trim()).filter(Boolean)
  return []
}

// Sorts jobs by how many of the applicant's skills they require.
// With no applicant skills, every matchCount is 0 and jobs fall back to newest-first.
export const sortJobsByMatch = (jobs, userSkills) => {
  const applicantSkills = normalizeSkills(userSkills)
  return (Array.isArray(jobs) ? jobs : [])
    .map((job) => {
      const jobSkills = normalizeSkills(job?.skills)
      const matchCount = applicantSkills.filter((skill) => jobSkills.includes(skill)).length
      return { job, matchCount }
    })
    .sort((a, b) => b.matchCount - a.matchCount || new Date(b.job.createdAt) - new Date(a.job.createdAt))
    .map(({ job }) => job)
}

function App() {
  const [activeRole, setActiveRole] = useState(() => typeof window !== "undefined" ? (localStorage.getItem('peso-active-role') || 'Applicant') : 'Applicant')
  const [activeView, setActiveView] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('peso-active-view') : null
    return saved === 'all-dashboard' ? 'dashboard' : (saved || 'dashboard')
  })
  const [currentUser, setCurrentUser] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userAccounts, setUserAccounts] = useState(initialAccounts)
  const [formData, setFormData] = useState(() => ({
    email: typeof window !== "undefined" ? localStorage.getItem("peso-portal-remembered-email") || "" : "",
    password: "",
  }))
  const [rememberMe, setRememberMe] = useState(() =>
    typeof window !== "undefined" && Boolean(localStorage.getItem("peso-portal-remembered-email")),
  )
  const [showPassword, setShowPassword] = useState(false)
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [profileData, setProfileData] = useState({
    name: "",
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    noMiddleName: false,
    location: "",
    skills: [],
    traits: "",
    summary: "",
    companyName: "",
    contactName: "",
    phone: "",
    website: "",
  })
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeInfo, setResumeInfo] = useState(null)
  const [nsrpVerificationInfo, setNsrpVerificationInfo] = useState(null)
  const [nsrpVerificationFile, setNsrpVerificationFile] = useState(null)
  const [nsrpVerificationUploading, setNsrpVerificationUploading] = useState(false)
  const [resumeUploading, setResumeUploading] = useState(false)

  const normalizeProfile = (userObj = {}, role) => {
    const base = userObj.profile || {}
    if (role === 'Employer') {
      return {
        name: base.name || '',
        establishmentAddress: getEmployerAddress(userObj),
        location: base.location || '',
        skills: normalizeSkills(base.skills),
        traits: base.traits || '',
        summary: base.summary || '',
        companyName: userObj.companyName || base.companyName || '',
        contactName: userObj.contactName || base.contactName || '',
        phone: userObj.phone || base.phone || '',
        website: userObj.website || base.website || '',
        profileImage: base.profileImage || '',
        bannerImage: base.bannerImage || '',
      }
    }
    // Applicant/Admin default mapping
    return {
      name: formatFullName(base) || base.name || '',
      firstName: base.firstName || '',
      middleName: base.middleName || '',
      lastName: base.lastName || '',
      suffix: base.suffix || '',
      noMiddleName: !base.middleName,
      location: base.location || '',
      skills: normalizeSkills(base.skills),
      traits: base.traits || '',
      summary: base.summary || '',
      companyName: base.companyName || '',
      contactName: base.contactName || '',
      phone: base.phone || '',
      website: base.website || '',
      profileImage: base.profileImage || '',
      bannerImage: base.bannerImage || '',
    }
  }

const toggleSkill = (selected, skill) => {
  const normalized = Array.isArray(selected) ? selected : []
  if (normalized.includes(skill)) {
    return normalized.filter((item) => item !== skill)
  }
  return [...normalized, skill]
}

// Tag-style skill/title picker: selected items as removable chips + "Add title" search input
function SkillTagPicker({ selected, onChange, disabled = false, theme = 'dark' }) {
  const [query, setQuery] = useState('')
  const normalized = Array.isArray(selected) ? selected : []
  const trimmed = query.trim()
  const suggestions = trimmed
    ? availableSkills.filter((skill) => skill.toLowerCase().includes(trimmed.toLowerCase()) && !normalized.includes(skill)).slice(0, 8)
    : []
  const inputCls = 'shared-form-control w-full rounded-2xl px-3 py-2 text-sm'
  const suggestionCls = theme === 'dark'
    ? 'cursor-pointer px-3 py-2 text-sm text-slate-200 hover:bg-slate-700'
    : 'cursor-pointer px-3 py-2 text-sm text-black hover:bg-slate-100'
  const chipCls = theme === 'dark'
    ? 'inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-sm font-medium text-cyan-200'
    : 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-black'
  return (
    <div className="skill-tag-picker mt-2 space-y-2">
      {normalized.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalized.map((skill) => (
            <span key={skill} className={`skill-tag-chip ${chipCls}`}>
              {skill}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${skill}`}
                  onClick={() => onChange(normalized.filter((item) => item !== skill))}
                  className={`skill-tag-remove ${theme === 'dark' ? 'text-cyan-300 hover:text-white' : 'text-slate-500 hover:text-black'}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Add title"
            className={`skill-tag-input ${inputCls}`}
          />
          {suggestions.length > 0 && (
            <div className={`skill-tag-suggestions absolute z-20 mt-1 w-full overflow-hidden rounded-xl border ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'} shadow-lg`}>
              {suggestions.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => {
                    onChange([...normalized, skill])
                    setQuery('')
                  }}
                  className={`skill-tag-suggestion block w-full text-left ${suggestionCls}`}
                >
                  {skill}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const [authView, setAuthView] = useState("login")
  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    noMiddleName: false,
    location: "",
    summary: "",
  })
  const [signupNameErrors, setSignupNameErrors] = useState({})
  const [signupResumeFile, setSignupResumeFile] = useState(null)
  const [signupDocs, setSignupDocs] = useState(emptyVerificationDocs)
  const [signupConsent, setSignupConsent] = useState(false)
  const [signupUploading, setSignupUploading] = useState(false)
  const [signupProgress, setSignupProgress] = useState("")
  const [employerRequests, setEmployerRequests] = useState({ items: [], total: 0, totalPages: 1, loading: false })
  const [adminUsers, setAdminUsers] = useState([])
  const [jobForm, setJobForm] = useState(emptyJobPosting)
  const [jobFieldErrors, setJobFieldErrors] = useState({})
  const [editJobFieldErrors, setEditJobFieldErrors] = useState({})
  const [jobSubmitting, setJobSubmitting] = useState(false)
  const [showCreateJobPosting, setShowCreateJobPosting] = useState(false)
  const [employerJobStatusFilter, setEmployerJobStatusFilter] = useState('all')
  const [editingJob, setEditingJob] = useState(null)
  const [editingJobCanSave, setEditingJobCanSave] = useState(false)
  const [editingJobForm, setEditingJobForm] = useState({
    title: '',
    customTitle: '',
    company: '',
    location: '',
    description: '',
    requirements: '',
    salary: '',
    slots: '',
    deadline: '',
    locationType: '',
    employmentType: '',
    skills: [],
  })
  const [availableJobs, setAvailableJobs] = useState([])
  const [jobTitleGroups, setJobTitleGroups] = useState([])
  const [jobTitleLoadError, setJobTitleLoadError] = useState("")
  const [appliedJobs, setAppliedJobs] = useState([])
  const [pendingJobs, setPendingJobs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [approvedJobs, setApprovedJobs] = useState([])
  const [declinedJobs, setDeclinedJobs] = useState([])
  const [referredApplicantIdsByJob, setReferredApplicantIdsByJob] = useState({})
  const [myJobs, setMyJobs] = useState([])
  const [jobSearchTerm, setJobSearchTerm] = useState('')
  const [adminJobSearchTerm, setAdminJobSearchTerm] = useState('')
  const [adminEmployerSearchTerm, setAdminEmployerSearchTerm] = useState('')
  const [adminEmployerStatusFilter, setAdminEmployerStatusFilter] = useState('all')
  const [adminJobStatusFilter, setAdminJobStatusFilter] = useState('all')
  const [jobSkillFilter, setJobSkillFilter] = useState('all')
  const [jobLocationFilter, setJobLocationFilter] = useState('all')
  const [jobLocationTypeFilter, setJobLocationTypeFilter] = useState('all')
  const [jobEmploymentTypeFilter, setJobEmploymentTypeFilter] = useState('all')
  const [jobLoading, setJobLoading] = useState(false)
  const [jobLoadError, setJobLoadError] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedNotification, setSelectedNotification] = useState(null)
  const [referralPrefill, setReferralPrefill] = useState({ jobId: '', applicantIds: [] })
  const [appMessage, setAppMessage] = useState(null)
  const [approvalNotice, setApprovalNotice] = useState(false)
  // Promise-based confirm dialog (one instance, used by every approve/decline flow)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const confirmResolveRef = useRef(null)

  // requestConfirm(config) -> Promise<{ confirmed, reason }>
  // config.onConfirm(reason) runs the actual request and returns { ok } or { error };
  // the dialog stays open (busy, then inline error + Retry) until it succeeds.
  const requestConfirm = useCallback((config) => new Promise((resolve) => {
    confirmResolveRef.current = resolve
    setConfirmError('')
    setConfirmBusy(false)
    setConfirmDialog(config)
  }), [])

  const closeConfirmDialog = useCallback((result) => {
    confirmResolveRef.current?.(result)
    confirmResolveRef.current = null
    setConfirmDialog(null)
    setConfirmBusy(false)
    setConfirmError('')
  }, [])

  const handleConfirmDialogConfirm = useCallback(async (reason) => {
    if (!confirmDialog?.onConfirm || confirmBusy) return
    setConfirmBusy(true)
    setConfirmError('')
    const result = await confirmDialog.onConfirm(reason)
    setConfirmBusy(false)
    if (result?.error) {
      setConfirmError(result.error)
      return
    }
    closeConfirmDialog({ confirmed: true, reason })
  }, [confirmDialog, confirmBusy, closeConfirmDialog])
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [reviewDocsApplicant, setReviewDocsApplicant] = useState(null)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [showSkillPrompt, setShowSkillPrompt] = useState(false)

  // Admin Applicants: server-side pagination + sorting (search debounced, page/sort kept in the URL)
  const debouncedDirectorySearch = useDebouncedValue(adminEmployerSearchTerm, 300)
  const applicantsPagination = usePagination({ resetDeps: [debouncedDirectorySearch], urlKey: 'page' })
  const applicantSort = useSort({ options: APPLICANT_SORT_OPTIONS, defaultId: 'name:asc', onChange: () => applicantsPagination.setPage(1) })
  const [adminApplicantsData, setAdminApplicantsData] = useState({ items: [], total: 0, totalPages: 1 })
  const [adminApplicantsLoading, setAdminApplicantsLoading] = useState(false)
  // Admin Employers: server-side pagination + sorting
  const employersPagination = usePagination({ resetDeps: [debouncedDirectorySearch, adminEmployerStatusFilter], urlKey: 'empPage' })
  const employerSort = useSort({ options: EMPLOYER_SORT_OPTIONS, defaultId: 'companyName:asc', urlSync: false, onChange: () => employersPagination.setPage(1) })
  const [adminEmployersData, setAdminEmployersData] = useState({ items: [], total: 0, totalPages: 1 })
  const [adminEmployersLoading, setAdminEmployersLoading] = useState(false)
  // Other long lists share the same hook with client-side slicing (no URL sync)
  const myJobsPagination = usePagination({ resetDeps: [employerJobStatusFilter], syncUrl: false })
  const myJobsSort = useSort({ options: MY_JOBS_SORT_OPTIONS, defaultId: 'createdAt:desc', urlSync: false, onChange: () => myJobsPagination.setPage(1) })
  const notifPagination = usePagination({ urlKey: 'notifPage' })
  const [notifTotal, setNotifTotal] = useState(0)
  const notifPageRef = useRef({ page: 1, pageSize: 10 })
  const employerRequestsPagination = usePagination({ urlKey: 'reqPage' })
  const requestSort = useSort({ options: EMPLOYER_REQUEST_SORT_OPTIONS, defaultId: 'createdAt:desc', urlSync: false, onChange: () => employerRequestsPagination.setPage(1) })

  const applicantProfileInitials = (formatFullName(profileData) || profileData.name || currentUser?.email || 'Applicant')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'A'

  const saveProfile = (nextProfile) => {
    const token = currentUser?.token || localStorage.getItem('peso-token')
    if (!token) return Promise.resolve({ ok: false })

    return fetch(`${API_URL}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile: nextProfile }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          alert(data.error)
          return { ok: false }
        }
        // Saving the profile confirms the (possibly migrated) name
        setCurrentUser((current) => current ? { ...current, needsNameConfirmation: false } : current)
        return { ok: true, data }
      })
      .catch((err) => {
        console.error(err)
        alert('Save failed')
        return { ok: false }
      })
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('peso-active-role', activeRole)
      localStorage.setItem('peso-active-view', activeView)
    }
  }, [activeRole, activeView])

  useEffect(() => {
    if (activeRole === "Admin" && activeView === "records") {
      setActiveView("employers")
    }
  }, [activeRole, activeView])

  const getToken = () =>
    currentUser?.token || (typeof window !== "undefined" ? localStorage.getItem('peso-token') : null)

  const updateRegistrationUser = useCallback((data) => {
    setCurrentUser((current) => ({ ...current, registration: data.registration }))
  }, [])

  const loadJobTitles = useCallback(async () => {
    const token = currentUser?.token || localStorage.getItem('peso-token')
    if (!token) return
    try {
      const response = await fetch(`${API_URL}/api/job-titles`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not load job titles')
      setJobTitleGroups(Array.isArray(data?.categories) ? data.categories : [])
      setJobTitleLoadError("")
    } catch (err) {
      console.error(err)
      setJobTitleLoadError(err?.message || 'Could not load job titles')
    }
  }, [currentUser?.token])

  useEffect(() => {
    if (isLoggedIn && ['Employer', 'Admin'].includes(activeRole)) loadJobTitles()
  }, [isLoggedIn, activeRole, loadJobTitles])

  const handleImageFile = (file, field) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return alert('Image must be under 2 MB')
    const reader = new FileReader()
    reader.onload = () => setProfileData((current) => ({ ...current, [field]: reader.result }))
    reader.readAsDataURL(file)
  }

  const handleViewResume = async () => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const applicantId = currentUser?.id || currentUser?._id
    if (!applicantId) return alert('Applicant record not found')
    const preview = window.open('', '_blank')
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicantId}/resume`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        preview?.close()
        const data = await response.json().catch(() => null)
        return alert(data?.error || 'Resume could not be opened')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (preview) preview.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      preview?.close()
      console.error(err)
      alert('Failed to open resume')
    }
  }

  // Employer requests: server-side pagination + sorting (newest submitted by default)
  const fetchEmployerRequests = useCallback(() => {
    const token = getToken()
    if (!token) return
    setEmployerRequests((current) => ({ ...current, loading: true }))
    const params = new URLSearchParams({
      page: String(employerRequestsPagination.page),
      limit: String(employerRequestsPagination.pageSize),
      sortBy: requestSort.sortBy,
      order: requestSort.order,
    })
    fetch(`${API_URL}/api/employer-requests?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.items)) {
          if (data.items.length === 0 && data.total > 0 && employerRequestsPagination.page > 1) {
            employerRequestsPagination.setPage(employerRequestsPagination.page - 1) // action emptied this page
            return
          }
          setEmployerRequests({ ...data, loading: false })
        }
      })
      .catch(() => setEmployerRequests((current) => ({ ...current, loading: false })))
  }, [employerRequestsPagination, requestSort.sortBy, requestSort.order])

  const fetchNotifications = () => {
    const token = getToken()
    if (!token) return

    const { page, pageSize } = notifPageRef.current
    fetch(`${API_URL}/api/notifications?page=${page}&limit=${pageSize}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.items) ? data.items : []
        // Deduplicate by _id to guard against double-fetch (StrictMode / overlapping effects)
        const seen = new Set()
        const unique = list.filter((n) => {
          const id = String(n?._id || n?.id || '')
          if (!id || seen.has(id)) return false
          seen.add(id)
          return true
        })
        setNotifications(unique)
        setUnreadCount(Number(data?.unreadCount) || 0)
        setNotifTotal(Number(data?.total) || 0)
      })
      .catch(() => {
        setNotifications([])
        setUnreadCount(0)
        setNotifTotal(0)
      })
  }

  // Keep the ref current so the 30s polling interval reads the live page
  useEffect(() => {
    notifPageRef.current = { page: notifPagination.page, pageSize: notifPagination.pageSize }
  }, [notifPagination.page, notifPagination.pageSize])

  // Refetch when the notifications page changes
  useEffect(() => {
    if (isLoggedIn) fetchNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPagination.page, notifPagination.pageSize])

  const fetchJobs = () => {
    const token = getToken()
    if (!token) return

    const headers = { Authorization: `Bearer ${token}` }
    // Server says email is unverified or registration incomplete: sync state so the right page shows
    const handleEmailGate = (r, data) => {
      if (r.status === 403 && data?.code === 'EMAIL_NOT_VERIFIED') {
        setCurrentUser((current) => ({ ...current, emailVerified: false }))
        return true
      }
      if (r.status === 403 && data?.code === 'REGISTRATION_INCOMPLETE') {
        setActiveView('complete')
        return true
      }
      if (r.status === 403 && data?.code === 'EMPLOYER_NOT_VERIFIED') {
        setCurrentUser((current) => ({ ...current, verificationStatus: data.status }))
        setActiveView('verification')
        return true
      }
      return false
    }
    if (activeRole === "Applicant") {
      setJobLoading(true)
      const approvedRequest = fetch(`${API_URL}/api/jobs?status=approved`, { headers })
        .then(async (r) => { const data = await r.json(); if (handleEmailGate(r, data)) return; setAvailableJobs(Array.isArray(data) ? sortJobsByMatch(data, profileData.skills) : []) })
        .catch(() => setAvailableJobs([]))

      const appliedRequest = fetch(`${API_URL}/api/jobs?status=applied`, { headers })
        .then((r) => r.json())
        .then((data) => setAppliedJobs(Array.isArray(data) ? data : []))
        .catch(() => setAppliedJobs([]))

      Promise.all([approvedRequest, appliedRequest]).finally(() => setJobLoading(false))
      return
    }

    if (activeRole === "Employer") {
      setJobLoading(true)
      fetch(`${API_URL}/api/jobs?status=mine`, { headers })
        .then(async (r) => {
          const data = await r.json()
          if (handleEmailGate(r, data)) return
          const jobs = Array.isArray(data) ? data : []
          setMyJobs(jobs)
          setPendingJobs(jobs.filter((job) => job.status === 'pending'))
        })
        .catch(() => setMyJobs([]))
        .finally(() => setJobLoading(false))
      return
    }

    if (activeRole === "Admin") {
      setJobLoading(true)
      setJobLoadError('')
      Promise.all(['pending', 'approved', 'declined'].map(async (status) => {
        const response = await fetch(`${API_URL}/api/jobs?status=${status}`, { headers })
        const data = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || `Could not load ${status} job postings`)
        return [status, data]
      }))
        .then((results) => {
          const lists = Object.fromEntries(results)
          setPendingJobs(lists.pending)
          setApprovedJobs(lists.approved)
          setDeclinedJobs(lists.declined)
        })
        .catch((error) => {
          console.error('Failed to load admin job postings:', error)
          setJobLoadError(error?.message || 'Could not load job postings. Try again.')
          setPendingJobs([])
          setApprovedJobs([])
          setDeclinedJobs([])
        })
        .finally(() => setJobLoading(false))
      fetchEmployerRequests()
      fetchAdminReferrals()
    }
  }

  const fetchAdminUsers = () => {
    const token = getToken()
    if (!token) return
    fetch(`${API_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setAdminUsers(Array.isArray(data) ? data : []))
      .catch(() => setAdminUsers([]))
  }

  // Server-paginated applicants for the admin Applicants directory.
  // Previous rows stay visible while the next page loads.
  const fetchAdminApplicants = useCallback(async () => {
    if (activeRole !== 'Admin') return
    const token = getToken()
    if (!token) return
    setAdminApplicantsLoading(true)
    try {
      const params = new URLSearchParams({
        role: 'Applicant',
        page: String(applicantsPagination.page),
        limit: String(applicantsPagination.pageSize),
        search: debouncedDirectorySearch,
        sortBy: applicantSort.sortBy,
        order: applicantSort.order,
      })
      const response = await fetch(`${API_URL}/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => null)
      if (!Array.isArray(data?.items)) return
      if (data.items.length === 0 && data.total > 0 && applicantsPagination.page > 1) {
        // An action emptied this page — step back one page
        applicantsPagination.setPage(applicantsPagination.page - 1)
        return
      }
      setAdminApplicantsData(data)
    } catch {
      // Keep the previous page's rows on failure
    } finally {
      setAdminApplicantsLoading(false)
    }
  }, [activeRole, applicantsPagination, debouncedDirectorySearch, applicantSort.sortBy, applicantSort.order])

  useEffect(() => {
    if (activeRole === 'Admin' && activeView === 'applicants') fetchAdminApplicants()
  }, [fetchAdminApplicants, activeRole, activeView])

  // Server-paginated + sorted employers for the admin Employers directory
  const fetchAdminEmployers = useCallback(async () => {
    if (activeRole !== 'Admin') return
    const token = getToken()
    if (!token) return
    setAdminEmployersLoading(true)
    try {
      const params = new URLSearchParams({
        role: 'Employer',
        page: String(employersPagination.page),
        limit: String(employersPagination.pageSize),
        search: debouncedDirectorySearch,
        sortBy: employerSort.sortBy,
        order: employerSort.order,
      })
      const response = await fetch(`${API_URL}/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => null)
      if (!Array.isArray(data?.items)) return
      if (data.items.length === 0 && data.total > 0 && employersPagination.page > 1) {
        employersPagination.setPage(employersPagination.page - 1)
        return
      }
      setAdminEmployersData(data)
    } catch {
      // Keep previous rows
    } finally {
      setAdminEmployersLoading(false)
    }
  }, [activeRole, employersPagination, debouncedDirectorySearch, employerSort.sortBy, employerSort.order])

  useEffect(() => {
    if (activeRole === 'Admin' && activeView === 'employers') fetchAdminEmployers()
  }, [fetchAdminEmployers, activeRole, activeView])

  useEffect(() => {
    if (activeRole === 'Admin' && activeView === 'requests') fetchEmployerRequests()
  }, [fetchEmployerRequests, activeRole, activeView])

  const fetchAdminReferrals = () => {
    const token = getToken()
    if (!token) return

    fetch(`${API_URL}/api/referrals/admin`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const referredByJob = (Array.isArray(data) ? data : []).reduce((current, referral) => {
          const jobId = String(referral.jobId || '')
          const applicantId = String(referral.applicantId || '')
          if (!jobId || !applicantId) return current
          return {
            ...current,
            [jobId]: [...new Set([...(current[jobId] || []), applicantId])],
          }
        }, {})
        setReferredApplicantIdsByJob(referredByJob)
      })
      .catch(() => setReferredApplicantIdsByJob({}))
  }

  const openCreateJobPosting = async () => {
    let address = getEmployerAddress({ establishmentAddress: profileData.establishmentAddress, profile: profileData })
    let company = profileData.companyName || ''
    // Refresh on every open: already signed-in sessions may predate address recovery.
    try {
      const response = await fetch(`${API_URL}/api/profile`, { headers: { Authorization: `Bearer ${getToken()}` } })
      const data = await response.json()
      if (response.ok && !data.error) {
        address = getEmployerAddress(data)
        company = data.companyName || company
        setProfileData((current) => ({ ...current, establishmentAddress: address }))
        setCurrentUser((current) => ({ ...current, establishmentAddress: address }))
      }
    } catch { /* Keep the registered address already loaded in this session. */ }
    setJobForm({ ...emptyJobPosting(), ...address, company })
    setJobFieldErrors({})
    setShowCreateJobPosting(true)
  }

  const handleCreateJob = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (jobSubmitting) return
    const payload = { ...jobForm, company: jobForm.company || profileData.companyName || '' }
    const { errors } = validateJobPosting(payload)
    setJobFieldErrors(errors)
    if (Object.keys(errors).length) { focusJobError(form); return }
    const token = getToken()
    if (!token) return alert('Not authenticated')
    setJobSubmitting(true)
    try {
      const response = await fetch(`${API_URL}/api/jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        if (data.fieldErrors) { setJobFieldErrors(data.fieldErrors); focusJobError(form) }
        else alert(data.error || 'Failed to submit job request')
        return
      }
      setJobForm(emptyJobPosting())
      setShowCreateJobPosting(false)
      fetchJobs()
      fetchNotifications()
      alert('Job request submitted for review')
    } catch (err) {
      console.error(err)
      alert('Failed to submit job request')
    } finally { setJobSubmitting(false) }
  }

  const openEditJob = (job, canSave = true) => {
    setEditingJob(job)
    setEditingJobCanSave(canSave)
    const knownTitle = jobTitleGroups.some((group) => group.titles.some((item) => item.name === job.title))
    setEditJobFieldErrors({})
    const normalized = normalizeJobPosting(job)
    setEditingJobForm({
      ...emptyJobPosting(),
      ...normalized,
      salaryMin: normalized.salaryMin ?? '',
      salaryMax: normalized.salaryMax ?? '',
      title: knownTitle ? job.title : 'Other',
      customTitle: knownTitle ? '' : (job.title || ''),
      company: job.company || '',
      location: job.location || '',
      description: job.description || '',
      requirements: job.requirements || '',
      salary: job.salary || '',
      slots: job.slots || '',
      deadline: job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : '',
      locationType: job.locationType || '',
      employmentType: normalized.employmentType || 'Full-time',
      skills: Array.isArray(job.skills) ? job.skills : [],
    })
  }

  const handleSaveEditedJob = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!editingJob || !editingJobCanSave) return
    if (jobSubmitting) return
    const keepDeadline = editingJob.deadline ? new Date(editingJob.deadline).toISOString().slice(0, 10) : ''
    const { errors } = validateJobPosting(editingJobForm, { keepDeadline })
    setEditJobFieldErrors(errors)
    if (Object.keys(errors).length) { focusJobError(form); return }

    const token = getToken()
    if (!token) return alert('Not authenticated')

    setJobSubmitting(true)
    try {
      const response = await fetch(`${API_URL}/api/jobs/${editingJob._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editingJobForm),
      })
      const data = await response.json().catch(() => null)
      if (data?.fieldErrors) { setEditJobFieldErrors(data.fieldErrors); focusJobError(form); return }
      if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`)

      setEditingJob(null)
      fetchJobs()
      fetchNotifications()
      alert('Job posting updated successfully')
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Failed to update job posting')
    } finally { setJobSubmitting(false) }
  }

  const handleReviewJob = async (jobId, status, options = {}) => {
    const token = getToken()
    if (!token) return { error: 'Not authenticated' }
    const declineReasonValue = typeof options.reason === 'string' ? options.reason.trim() : ''
    if (status === 'declined' && !declineReasonValue) return { error: 'Enter a reason before declining this job posting.' }

    // Approve must be confirmed via the shared ConfirmDialog by the caller;
    // options.confirm !== false callers (none in the UI) get the dialog here as a safety net.
    if (status === 'approved' && options.confirm !== false) {
      const allKnownJobs = [...pendingJobs, ...approvedJobs, ...declinedJobs]
      const matchedJob = allKnownJobs.find((job) => String(job?._id) === String(jobId))
      const jobTitle = matchedJob?.title || 'this job posting'
      const confirmation = await requestConfirm({
        title: `Approve "${jobTitle}"?`,
        note: 'It will become visible to applicants and the employer will be notified.',
        confirmLabel: 'Yes, approve',
        busyLabel: 'Approving...',
        onConfirm: async () => ({ ok: true }),
      })
      if (!confirmation.confirmed) return { ok: false, cancelled: true }
    }

    return fetch(`${API_URL}/api/jobs/${jobId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason: status === 'declined' ? declineReasonValue : '' }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`)
        if (!data?._id || String(data._id) !== String(jobId) || data.status !== status) {
          throw new Error('The server returned an unexpected job review result. Refresh the list and try again.')
        }
        return data
      })
      .then((data) => {
        fetchJobs()
        fetchNotifications()
        setSelectedNotification(null)
        if (!options.silent) alert(`Job ${status}`)
        return { ok: true, job: data }
      })
      .catch((err) => {
        console.error(err)
        const error = err?.message || 'Failed to update job status'
        if (!options.silent) alert(error)
        return { error }
      })
  }

  const handleBulkReviewJobs = async (jobIds, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const ids = Array.isArray(jobIds) ? jobIds : []
    if (ids.length === 0) return alert('Select at least one job posting first')

    const isApprove = status === 'approved'
    const confirmation = await requestConfirm({
      title: `${isApprove ? 'Approve' : 'Decline'} ${ids.length} selected job posting${ids.length === 1 ? '' : 's'}?`,
      note: isApprove ? 'They will become visible to applicants and employers will be notified.' : 'Employers will be notified with your reason.',
      confirmLabel: isApprove ? 'Yes, approve all' : 'Confirm decline',
      confirmTone: isApprove ? 'primary' : 'danger',
      busyLabel: isApprove ? 'Approving...' : 'Declining...',
      requireReason: !isApprove,
      quickReasons: isApprove ? [] : ['Incomplete details', 'Policy violation', 'Duplicate posting', 'Misleading information'],
      onConfirm: async (reason) => {
        if (!isApprove && reason.trim().length > 500) return { error: 'The decline reason must be 500 characters or fewer' }
        try {
          const results = await Promise.all(ids.map((jobId) =>
            fetch(`${API_URL}/api/jobs/${jobId}/status`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ status, reason: reason || '' }),
            }).then((r) => r.json()),
          ))
          const failed = results.filter((r) => r && r.error)
          fetchJobs()
          fetchNotifications()
          if (failed.length > 0) return { error: `${ids.length - failed.length} job(s) ${status}; ${failed.length} failed` }
          setAppMessage({ type: 'success', text: `${ids.length} job posting${ids.length === 1 ? '' : 's'} ${status}` })
          return { ok: true }
        } catch (err) {
          console.error(err)
          return { error: 'Failed to update job statuses' }
        }
      },
    })
    return confirmation
  }

  const handleApplyJob = async (jobId, nsrpAnswers) => {
    const token = getToken()
    if (!token) {
      return { error: 'Your session has expired. Sign in again to continue.' }
    }
    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ answers: nsrpAnswers }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        if (data?.fieldErrors) return { error: data.error, fieldErrors: data.fieldErrors }
        return { error: data?.error || 'Failed to apply' }
      }
      fetchJobs()
      const profileResponse = await fetch(`${API_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (profileResponse.ok) {
        const profile = await profileResponse.json()
        setCurrentUser((current) => ({ ...current, profile: profile.profile }))
        setProfileData((current) => ({ ...current, skills: profile.profile?.skills || [] }))
      }
      alert('Application submitted')
      return { ok: true }
    } catch (err) {
      console.error(err)
      return { error: 'Failed to apply. Check your connection and try again.' }
    }
  }

  const handleReviewApplicantVerification = (applicantId, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const reason = status === 'declined' ? (window.prompt('Reason for declining (optional)') || '') : ''
    fetch(`${API_URL}/api/applicants/${applicantId}/verification`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setAppMessage({ type: 'error', text: data.error })
        fetchAdminUsers()
        fetchAdminApplicants()
        setAppMessage({ type: 'success', text: `Applicant ${status}.` })
      })
      .catch((err) => {
        console.error(err)
        setAppMessage({ type: 'error', text: err?.message || 'Failed to update applicant' })
      })
  }

  const handleReviewEmployerRequest = async (requestId, status, reason = '') => {
    const token = getToken()
    if (!token) return { error: 'Not authenticated' }
    try {
      const response = await fetch(`${API_URL}/api/employer-requests/${requestId}/status`, {
        method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason: status === 'approved' ? '' : reason.trim() }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.error) return { error: data?.error || 'Failed to update employer request' }
    fetchEmployerRequests()
    fetchAdminEmployers()
    fetchNotifications()
    setAppMessage({ type: 'success', text: `Employer request ${status}.` })
    return { ok: true }
    } catch (err) {
    console.error(err)
    return { error: err?.message || 'Failed to update employer request' }
    }
  }

  // All employer request decisions go through the shared confirm dialog
  const confirmEmployerRequest = (requestId, companyName, status) => {
    if (status === 'approved') {
      return requestConfirm({
        title: `Approve ${companyName || 'this employer'}?`,
        note: 'The employer will be notified and gain access to employer features.',
        confirmLabel: 'Yes, approve',
        busyLabel: 'Approving...',
        onConfirm: () => handleReviewEmployerRequest(requestId, 'approved'),
      })
    }
    const needsResubmission = status === 'needs_resubmission'
    return requestConfirm({
      title: `${needsResubmission ? 'Request a new document from' : 'Decline'} ${companyName || 'this employer'}?`,
      note: 'The employer will be notified with your reason.',
      confirmLabel: needsResubmission ? 'Request new document' : 'Confirm decline',
      confirmTone: 'danger',
      busyLabel: needsResubmission ? 'Requesting...' : 'Declining...',
      requireReason: true,
      quickReasons: ['Document unreadable', "Details don't match", 'Not a registered establishment'],
      onConfirm: (reason) => handleReviewEmployerRequest(requestId, status, reason),
    })
  }

  // Fetches the NSRP PDF with the auth header; resolves to a PDF blob, or null after reporting the failure.
  const fetchNsrpPdfBlob = async (url) => {
    const token = getToken()
    if (!token) return null
    const unavailable = 'This document is unavailable or corrupted'
    try {
      const response = await fetch(`${API_URL}${url}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setAppMessage({ type: 'error', text: response.status === 422 || response.status === 404 ? unavailable : (data.error || unavailable) })
        return null
      }
      const blob = await response.blob()
      if (!blob.size) {
        setAppMessage({ type: 'error', text: unavailable })
        return null
      }
      const nameMatch = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')
      const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
      return Object.assign(pdf, { suggestedName: nameMatch?.[1] })
    } catch {
      setAppMessage({ type: 'error', text: unavailable })
      return null
    }
  }

  const openNsrpBlob = async (url) => {
    const preview = window.open('', '_blank')
    const blob = await fetchNsrpPdfBlob(url)
    if (!blob) {
      preview?.close()
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    if (preview) preview.location.href = objectUrl
    else window.open(objectUrl, '_blank')
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }

  const handleDownloadRequirements = async (requestId, filename) => {
    const blob = await fetchNsrpPdfBlob(`/api/employers/${requestId}/nsrp/download`)
    if (!blob) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = blob.suggestedName || filename || 'NSRP-employer.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  const handleViewRequirements = (requestId) => openNsrpBlob(`/api/employers/${requestId}/nsrp/view`)

  const handleReferApplicantFromJob = async (jobId, applicantEmail, isReferred = false) => {
    const token = getToken()
    if (!token) {
      if (isReferred) return setAppMessage({ type: 'error', text: 'Not authenticated. Please sign in again.' })
      return alert('Not authenticated')
    }

    const applicant = adminUsers.find(
      (user) => user.role === 'Applicant' && String(user.email || '').toLowerCase() === String(applicantEmail || '').toLowerCase(),
    )

    if (!applicant) {
      fetchAdminUsers()
      if (isReferred) return setAppMessage({ type: 'error', text: 'Applicant record not found yet. Please try again in a moment.' })
      return alert('Applicant record not found yet. Please try again in a moment.')
    }

    const applicantId = String(applicant.id || applicant._id)
    const applicantName = formatFullName(applicant.profile) || applicant.email
    if (!window.confirm(`${isReferred ? 'Cancel referral for' : 'Refer'} ${applicantName}${isReferred ? '?' : ' to this job?'}`)) return

    try {
      const response = await fetch(`${API_URL}/api/referrals`, {
        method: isReferred ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, applicantIds: [applicantId] }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`)

      fetchJobs()
      fetchNotifications()
      if (isReferred) {
        setAppMessage({ type: 'success', text: 'Referral cancelled successfully.' })
      } else {
        alert(data?.createdCount === 0 ? 'Applicant was already referred' : 'Applicant referred successfully')
      }
    } catch (err) {
      console.error(err)
      if (isReferred) {
        setAppMessage({ type: 'error', text: err?.message || 'Failed to cancel referral.' })
      } else {
        alert(err?.message || 'Failed to create referral')
      }
    }
  }

  const handleBulkReferApplicants = async (jobId, applicantIdsArray) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    if (!Array.isArray(applicantIdsArray) || applicantIdsArray.length === 0) return alert('Select at least one applicant to refer.')
    if (!window.confirm(`Refer ${applicantIdsArray.length} selected applicant${applicantIdsArray.length === 1 ? '' : 's'} to this job?`)) return

    try {
      const response = await fetch(`${API_URL}/api/referrals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, applicantIds: applicantIdsArray }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`)
      fetchJobs()
      fetchNotifications()
      alert(data?.createdCount === 0 ? 'Selected applicants were already referred' : `Referred ${data?.createdCount} applicant${data?.createdCount === 1 ? '' : 's'} successfully`)
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Failed to refer selected applicants')
    }
  }

  const isNewApplicationNotification = (notification) =>
    notification?.type === 'new_application' || notification?.kind === 'new_application'

  const isNotificationUnread = (notification) => !notification?.readAt && notification?.read !== true

  const markNotificationAsRead = async (notificationId) => {
    const token = getToken()
    if (!token || !notificationId) return

    try {
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        console.warn('Failed to mark notification as read:', payload?.error || response.status)
      }
    } catch (err) {
      console.warn('Failed to mark notification as read:', err?.message || err)
    }
  }

  const markNotificationLocallyRead = (notificationId) => {
    const stillUnread = notifications.some((item) => String(item._id) === String(notificationId) && isNotificationUnread(item))
    setNotifications((current) =>
      current.map((item) =>
        String(item._id) === String(notificationId) ? { ...item, read: true, readAt: item.readAt || new Date().toISOString() } : item,
      ),
    )
    if (stillUnread) setUnreadCount((count) => Math.max(0, count - 1))
  }

  const markAllNotificationsAsRead = async () => {
    const token = getToken()
    if (!token) return
    try {
      const response = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      const now = new Date().toISOString()
      setNotifications((current) => current.map((item) => ({ ...item, read: true, readAt: item.readAt || now })))
      setUnreadCount(0)
    } catch (err) {
      console.warn('Failed to mark notifications as read:', err?.message || err)
    }
  }

  const handleNotificationClick = async (notification) => {
    const notificationId = String(notification?._id || '')
    if (notificationId && isNotificationUnread(notification)) {
      markNotificationLocallyRead(notificationId)
      markNotificationAsRead(notificationId)
    }

    if (activeRole === 'Admin' && isNewApplicationNotification(notification)) {
      setReferralPrefill({
        jobId: notification?.metadata?.jobId ? String(notification.metadata.jobId) : '',
        applicantIds: notification?.metadata?.applicantId ? [String(notification.metadata.applicantId)] : [],
      })
      setSelectedNotification(null)
      setActiveView('peso-referrals')
      return
    }

    setSelectedNotification(notification)
  }

  useEffect(() => {
    // Unverified applicants don't fetch job data (the jobs view is hidden anyway)
    const applicantBlocked = activeRole === 'Applicant' && currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved'
    const employerBlocked = activeRole === 'Employer' && currentUser?.verificationStatus && currentUser.verificationStatus !== EMPLOYER_STATUS.APPROVED
    const registrationIncomplete = ['Applicant', 'Employer'].includes(activeRole) && currentUser?.registration && !currentUser.registration.complete
    if (isLoggedIn && !applicantBlocked && !employerBlocked && !registrationIncomplete) {
      fetchJobs()
      fetchNotifications()
    }
    if (isLoggedIn && activeRole === 'Employer' && currentUser?.verificationStatus && currentUser.verificationStatus !== EMPLOYER_STATUS.APPROVED && activeView !== 'verification') {
      setActiveView('verification')
    }
    if (isLoggedIn && activeRole === 'Employer' && currentUser?.verificationStatus === EMPLOYER_STATUS.APPROVED && activeView === 'verification') {
      setActiveView('dashboard')
    }
    if (isLoggedIn && activeRole === 'Admin' && ['records', 'employers', 'applicants', 'requests', 'jobs', 'peso-referrals'].includes(activeView)) fetchAdminUsers()
  }, [isLoggedIn, activeRole, activeView, currentUser?.verificationStatus, currentUser?.registration?.complete, profileData.skills])

  useEffect(() => {
    const registrationIncomplete = ['Applicant', 'Employer'].includes(activeRole) && currentUser?.registration && !currentUser.registration.complete
    if (isLoggedIn && !registrationIncomplete) {
      fetchNotifications()
    }
  }, [isLoggedIn, currentUser?.email, activeRole, currentUser?.registration])

  // Poll so the navbar bell badge stays current
  useEffect(() => {
    if (!isLoggedIn) return undefined
    const timer = setInterval(() => fetchNotifications(), 30000)
    return () => clearInterval(timer)
  }, [isLoggedIn, currentUser?.email, activeRole])

  useEffect(() => {
    const token = localStorage.getItem('peso-token')
    if (!token) return

    fetch(`${API_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          localStorage.removeItem('peso-token')
          return
        }
        const norm = normalizeProfile({ establishmentAddress: data.establishmentAddress, profile: data.profile, companyName: data.companyName, contactName: data.contactName, phone: data.phone }, data.role)
        setCurrentUser({ ...data, establishmentAddress: norm.establishmentAddress, token })
        setActiveRole(data.role)
        setIsLoggedIn(true)
        setProfileData(norm)
        setResumeInfo(data.resumeFile || null)
        setNsrpVerificationInfo(data.nsrpVerificationFile || null)
      })
      .catch(() => {
        localStorage.removeItem('peso-token')
      })
  }, [])

  const updateEmployerVerification = useCallback((data) => {
    if (!data) return
    setCurrentUser((current) => current ? ({
      ...current,
      email: data.email || current.email,
      verificationStatus: data.verificationStatus,
      verificationReason: data.verificationReason,
      requirementsFile: data.document || current.requirementsFile,
      requirementsSubmittedAt: data.submittedAt || current.requirementsSubmittedAt,
      approvalNoticePending: data.approvalNoticePending,
    }) : current)
    if (data.verificationStatus === EMPLOYER_STATUS.APPROVED && data.approvalNoticePending) {
      setApprovalNotice(true)
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn || activeRole !== 'Employer') return undefined

    const refreshEmployerVerification = () => {
      const token = getToken()
      if (!token) return
      fetch(`${API_URL}/api/employer/verification`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => {
          if (!response.ok) throw new Error('Could not refresh employer verification status.')
          return response.json()
        })
        .then((data) => {
          if (data.error) return
          updateEmployerVerification(data)
        })
        .catch((error) => console.error('Employer verification refresh failed:', error))
    }

    refreshEmployerVerification()
    const intervalId = window.setInterval(refreshEmployerVerification, 30000)
    return () => window.clearInterval(intervalId)
  }, [isLoggedIn, activeRole])

  const acknowledgeEmployerApproval = async () => {
    try {
      const response = await fetch(`${API_URL}/api/employer/verification/approval-notice/seen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!response.ok) {
        setAppMessage({ type: 'error', text: 'Could not dismiss the approval message. Please try again.' })
        return
      }
      setApprovalNotice(false)
      setCurrentUser((current) => ({ ...current, approvalNoticePending: false }))
      setActiveView('dashboard')
    } catch (error) {
      console.error('Employer approval notice update failed:', error)
      setAppMessage({ type: 'error', text: 'Could not dismiss the approval message. Please try again.' })
    }
  }

  const handleLogin = (event) => {
    event.preventDefault()
    // call backend login
    fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formData.email, password: formData.password }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)

        if (rememberMe) {
          localStorage.setItem('peso-portal-remembered-email', formData.email)
        } else {
          localStorage.removeItem('peso-portal-remembered-email')
        }

        if (data.token) localStorage.setItem('peso-token', data.token)

        setCurrentUser({ ...data.user, token: data.token })
        setActiveRole(data.user.role)
        const needsVerification = ['Employer', 'Applicant'].includes(data.user.role) && data.user.verificationStatus && data.user.verificationStatus !== 'approved'
        const registrationIncomplete = ['Applicant', 'Employer'].includes(data.user.role) && data.user.registration && !data.user.registration.complete
        const initialView = navigationByRole[data.user.role]?.find((item) => !['complete', 'verification'].includes(item.id))?.id || "dashboard"
        const employerWaiting = data.user.role === 'Employer' && data.user.verificationStatus !== EMPLOYER_STATUS.APPROVED
        setActiveView(employerWaiting ? 'verification' : registrationIncomplete ? 'complete' : needsVerification ? 'home' : initialView)
        setIsLoggedIn(true)
        setProfileData(normalizeProfile(data.user, data.user.role))
        setResumeInfo(data.user.resumeFile || null)
        setNsrpVerificationInfo(data.user.nsrpVerificationFile || null)
      })
      .catch((err) => {
        console.error(err)
        alert('Login failed')
      })
  }

  const uploadVerificationDoc = async (token, docKey, file, { idType } = {}) => {
    const payload = new FormData()
    payload.append('document', file)
    if (idType) payload.append('idType', idType)
    const response = await fetch(`${API_URL}/api/profile/verification-documents/${docKey}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.error) throw new Error(data?.error || `Failed to upload ${docKey}`)
    return data
  }

  const validateSignupNameFields = (form) => {
    const errors = {}
    const firstError = validateNameField(form.firstName, { label: 'First name', required: true })
    if (firstError) errors.firstName = firstError
    const lastError = validateNameField(form.lastName, { label: 'Last name', required: true })
    if (lastError) errors.lastName = lastError
    if (!form.noMiddleName) {
      const middleError = validateNameField(form.middleName, { label: 'Middle name', required: false })
      if (middleError) errors.middleName = middleError
    }
    return errors
  }

  const handleSignupNameBlur = (field) => {
    if (field === 'suffix') return
    const capitalized = capitalizeName(signupForm[field])
    const nextForm = { ...signupForm, [field]: capitalized }
    setSignupForm(nextForm)
    setSignupNameErrors(validateSignupNameFields(nextForm))
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    const nameErrors = validateSignupNameFields(signupForm)
    setSignupNameErrors(nameErrors)
    if (Object.keys(nameErrors).length > 0) return
    const passwordErrors = validatePassword(signupForm.password)
    if (passwordErrors.length > 0) {
      alert('Password requirements not met. Check the rules under the password field.')
      return
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      alert('Passwords do not match')
      return
    }
    if (!signupConsent) {
      alert('Please agree to the data privacy consent to continue')
      return
    }
    if (!validateVerificationDocs(signupDocs, signupConsent)) {
      alert('Please complete all required verification documents (NSRP form, birth certificate, and Valid ID #1 front)')
      return
    }
    if (!signupResumeFile) {
      alert('Please upload your resume (PDF, DOCX, JPG, or PNG; maximum 5 MB)')
      return
    }
    setSignupUploading(true)
    setSignupProgress('Validating your profile and documents…')
    try {
      const signupPayload = new FormData()
      Object.entries(signupForm).forEach(([key, value]) => {
        if (key !== 'confirmPassword') signupPayload.append(key, value)
      })
      signupPayload.append('consent', 'true')
      signupPayload.append('id1Type', signupDocs.id1.type)
      signupPayload.append('nsrpForm', signupDocs.nsrpForm)
      signupPayload.append('birthCertificate', signupDocs.birthCertificate)
      signupPayload.append('validId1Front', signupDocs.id1.front)
      signupPayload.append('resume', signupResumeFile)

      const signupResponse = await fetch(`${API_URL}/api/signup`, {
        method: 'POST',
        body: signupPayload,
      })
      const data = await signupResponse.json().catch(() => null)
      if (!signupResponse.ok || data?.error) throw new Error(data?.error || `Signup failed: ${signupResponse.status}`)

      if (signupDocs.id2.front) {
        try {
          await uploadVerificationDoc(data.token, 'validId2', signupDocs.id2.front, { idType: signupDocs.id2.type })
        } catch (err) {
          console.error('Optional second ID upload failed:', err)
        }
      }

      if (data.token) localStorage.setItem('peso-token', data.token)
      const applicantProfile = normalizeProfile(data.user, data.user.role || 'Applicant')
      setCurrentUser({ ...data.user, token: data.token, role: 'Applicant', verificationStatus: 'under_review' })
      setActiveRole('Applicant')
      setActiveView('home')
      setIsLoggedIn(true)
      setProfileData(applicantProfile)
      setSignupResumeFile(null)
      setSignupDocs(emptyVerificationDocs)
      setSignupConsent(false)
      setSignupProgress("")
      setAuthView("login")
      alert('Account created. Your documents were submitted for admin review.')
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Signup failed')
      setSignupProgress("")
    } finally {
      setSignupUploading(false)
      setSignupProgress("")
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("peso-portal-remembered-email")
    localStorage.removeItem('peso-token')
    setCurrentUser(null)
    setApprovalNotice(false)
    setIsLoggedIn(false)
    setFormData({ email: "", password: "" })
    setRememberMe(false)
    setShowPassword(false)
    setActiveRole("Applicant")
    setActiveView("home")
  }

  const normalizedSearchTerm = jobSearchTerm.trim().toLowerCase()
  const locationFilterOptions = Array.from(
    new Set(
      availableJobs
        .map((job) => (job.location || '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const appliedJobIds = new Set(appliedJobs.map((job) => String(job._id)))

  const filteredApplicantJobs = availableJobs.filter((job) => {
    if (appliedJobIds.has(String(job._id))) return false
    const normalizedSkills = normalizeSkills(job.skills)
    const locationValue = (job.location || '').trim()
    const matchesSearch =
      !normalizedSearchTerm ||
      [job.title, job.company, job.description, job.requirements]
        .filter((value) => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(normalizedSearchTerm))
    const matchesSkill = jobSkillFilter === 'all' || normalizedSkills.includes(jobSkillFilter)
    const matchesLocation = jobLocationFilter === 'all' || locationValue === jobLocationFilter
    const matchesLocationType = jobLocationTypeFilter === 'all' || (job.locationType || '') === jobLocationTypeFilter
    const matchesEmploymentType = jobEmploymentTypeFilter === 'all' || (job.employmentType || '') === jobEmploymentTypeFilter
    return matchesSearch && matchesSkill && matchesLocation && matchesLocationType && matchesEmploymentType
  })

  const normalizedAdminJobSearchTerm = adminJobSearchTerm.trim().toLowerCase()
  const matchesAdminJobSearch = (job) => {
    if (!normalizedAdminJobSearchTerm) return true
    return [job.title, job.company, job.location, job.description, job.requirements, job.createdBy]
      .filter((value) => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(normalizedAdminJobSearchTerm))
  }
  const filteredPendingJobs = pendingJobs.filter((job) => (activeRole === 'Admin' ? matchesAdminJobSearch(job) : true))
  const filteredApprovedJobs = approvedJobs.filter((job) => (activeRole === 'Admin' ? matchesAdminJobSearch(job) : true))
  const filteredDeclinedJobs = declinedJobs.filter((job) => (activeRole === 'Admin' ? matchesAdminJobSearch(job) : true))
  const registeredJobAddress = profileData.establishmentAddress || {}
  const jobSkillSuggestions = [...new Set([...availableSkills, ...myJobs.flatMap((job) => Array.isArray(job.skills) ? job.skills : [])])]
  const employerPendingJobs = myJobs.filter((job) => job.status === 'pending')
  const employerDeclinedJobs = myJobs.filter((job) => job.status === 'declined')
  const employerApprovedJobs = myJobs.filter((job) => job.status === 'approved')
  const filteredMyJobs = employerJobStatusFilter === 'all' ? myJobs : myJobs.filter((job) => (job.status || 'pending') === employerJobStatusFilter)
  const sortedMyJobs = sortItems(filteredMyJobs, myJobsSort.sortBy, myJobsSort.order)
  const showPendingAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'pending')
  const showApprovedAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'approved')
  const showDeclinedAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'declined')

  const selectedJobIsApplied = Boolean(selectedJob && (appliedJobIds.has(String(selectedJob._id)) || (selectedJob.applicants || []).some((applicant) => applicant.email === currentUser?.email)))
  const selectedNotificationIsPending = selectedNotification?.type === 'job_pending_review'
    && (selectedNotification?.status === 'pending' || (selectedNotification?.title || '').toLowerCase().includes('pending'))
  const accountNeedsVerification = Boolean(
    currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved',
  )

  useEffect(() => {
    if (activeView === 'all-dashboard') setActiveView('dashboard')
  }, [activeView])

  // Unverified applicants land on My Documents once (not every navigation)
  useEffect(() => {
    if (isLoggedIn && activeRole === 'Applicant' && currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved' && activeView === 'home') {
      setActiveView('documents')
    }
  }, [isLoggedIn, activeRole, currentUser?.verificationStatus, activeView])

  // Completed accounts may still have the checklist saved from an older session.
  useEffect(() => {
    if (isLoggedIn && ['Applicant', 'Employer'].includes(activeRole) && currentUser?.registration?.complete === true && activeView === 'complete') {
      setActiveView('dashboard')
    }
  }, [isLoggedIn, activeRole, currentUser?.registration?.complete, activeView])

  // Incomplete accounts can only leave the checklist through its profile/document links.
  useEffect(() => {
    if (isLoggedIn && currentUser?.registration && !currentUser.registration.complete && ['Applicant', 'Employer'].includes(activeRole) && !['complete', 'profile', 'documents', 'dashboard'].includes(activeView)) {
      setActiveView('complete')
    }
  }, [isLoggedIn, activeRole, currentUser?.registration, activeView])

  // /verify-email landing page (linked from verification emails)
  if (!isLoggedIn && typeof window !== 'undefined' && window.location.pathname === '/verify-email') {
    return <VerifyEmailPage onDone={() => { window.history.replaceState({}, '', '/'); setAuthView('login') }} />
  }

  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className={`auth-card${authView === 'login' ? '' : ' auth-card-wide'}`}>
          <div className="auth-logo" aria-label="Public Employment Service Office">
            <img
              src="/peso-logo.png"
              alt="Public Employment Service Office logo"
              onError={(event) => { event.currentTarget.style.display = 'none' }}
            />
          </div>
          <div className="auth-heading">
            <h1>{authView === "signup" ? "Sign Up" : authView === "employer" ? "Employer Sign Up" : "Welcome back"}</h1>
            <p>{authView === "employer" ? "Create your employer account." : "Enter your PESO account credentials to continue."}</p>
          </div>
          {authView === "signup" ? (
            <ApplicantSignupWizard onCancel={() => setAuthView("login")} />
          ) : authView === "login" ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="auth-password-toggle"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="auth-options">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={() => setRememberMe((value) => !value)}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="auth-link"
                >
                  Forgot password?
                </button>
              </div>
              <button type="submit" className="auth-primary-button auth-signin-button">Sign in</button>

              <div className="auth-divider"><span>NEW TO PESO PORTAL?</span></div>
              <div className="auth-account-actions">
                <button
                  type="button"
                  onClick={() => setAuthView("signup")}
                  className="auth-secondary-button"
                >
                  Create an account (Applicant)
                </button>
                <button
                  type="button"
                  onClick={() => setAuthView("employer")}
                  className="auth-secondary-button"
                >
                  Connect with us (Employer)
                </button>
              </div>
            </form>
          ) : authView === "employer" ? (
            <EmployerSignupWizard locations={albayLocations} onCancel={() => setAuthView("login")} />
          ) : (
            <form className="auth-form auth-detail-form applicant-signup-form" onSubmit={handleSignup}>
              <div>
                <label htmlFor="signup-first-name" className="block text-sm font-medium text-slate-200">
                  First name
                </label>
                <input
                  id="signup-first-name"
                  type="text"
                  value={signupForm.firstName}
                  onChange={(e) => setSignupForm({ ...signupForm, firstName: e.target.value })}
                  onBlur={() => handleSignupNameBlur('firstName')}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  required
                />
                {signupNameErrors.firstName && <p className="mt-1 text-xs text-rose-300">{signupNameErrors.firstName}</p>}
              </div>
              <div>
                <label htmlFor="signup-middle-name" className="block text-sm font-medium text-slate-200">
                  Middle name <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="signup-middle-name"
                  type="text"
                  value={signupForm.middleName}
                  onChange={(e) => setSignupForm({ ...signupForm, middleName: e.target.value })}
                  onBlur={() => handleSignupNameBlur('middleName')}
                  disabled={signupForm.noMiddleName}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={signupForm.noMiddleName}
                    onChange={(e) => {
                      const noMiddleName = e.target.checked
                      const nextForm = { ...signupForm, noMiddleName, middleName: noMiddleName ? '' : signupForm.middleName }
                      setSignupForm(nextForm)
                      setSignupNameErrors(validateSignupNameFields(nextForm))
                    }}
                  />
                  No middle name
                </label>
                {signupNameErrors.middleName && <p className="mt-1 text-xs text-rose-300">{signupNameErrors.middleName}</p>}
              </div>
              <div>
                <label htmlFor="signup-last-name" className="block text-sm font-medium text-slate-200">
                  Last name
                </label>
                <input
                  id="signup-last-name"
                  type="text"
                  value={signupForm.lastName}
                  onChange={(e) => setSignupForm({ ...signupForm, lastName: e.target.value })}
                  onBlur={() => handleSignupNameBlur('lastName')}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  required
                />
                {signupNameErrors.lastName && <p className="mt-1 text-xs text-rose-300">{signupNameErrors.lastName}</p>}
              </div>
              <div>
                <label htmlFor="signup-suffix" className="block text-sm font-medium text-slate-200">
                  Suffix <span className="text-slate-400">(optional)</span>
                </label>
                <select
                  id="signup-suffix"
                  value={signupForm.suffix}
                  onChange={(e) => setSignupForm({ ...signupForm, suffix: e.target.value })}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                >
                  {SUFFIX_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option === '' ? 'None' : option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="signup-location" className="block text-sm font-medium text-slate-200">
                  Location
                </label>
                <input
                  id="signup-location"
                  type="text"
                  value={signupForm.location}
                  onChange={(e) => setSignupForm({ ...signupForm, location: e.target.value })}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-summary" className="block text-sm font-medium text-slate-200">
                  About me
                </label>
                <textarea
                  id="signup-summary"
                  rows="3"
                  value={signupForm.summary}
                  onChange={(e) => setSignupForm({ ...signupForm, summary: e.target.value })}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-slate-200">
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-slate-200">
                  Password
                </label>
                <input
                  id="signup-password"
                  type={showSignupPassword ? "text" : "password"}
                  value={signupForm.password}
                  onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  autoComplete="new-password"
                  required
                />
                <PasswordChecklist password={signupForm.password} confirmPassword={signupForm.confirmPassword} />
              </div>
              <div>
                <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-slate-200">
                  Confirm password
                </label>
                <input
                  id="signup-confirm-password"
                  type={showSignupPassword ? "text" : "password"}
                  value={signupForm.confirmPassword}
                  onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                  className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword((current) => !current)}
                  className="mt-2 text-sm font-medium text-slate-600 hover:text-black"
                >
                  {showSignupPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>
              <div>
                <label htmlFor="signup-resume" className="block text-sm font-medium text-slate-200">
                  Resume (PDF, DOCX, JPG, or PNG; max 5 MB)
                </label>
                <input
                  id="signup-resume"
                  type="file"
                  accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,.jpg,.jpeg,image/png,.png"
                  onChange={(e) => setSignupResumeFile(e.target.files?.[0] || null)}
                  className="shared-form-control mt-2 w-full text-sm"
                  required
                />
              </div>
              <VerificationDocumentsForm
                docs={signupDocs}
                setDocs={setSignupDocs}
                consent={signupConsent}
                setConsent={setSignupConsent}
                disabled={signupUploading}
              />
              {signupProgress && <p className="text-sm font-medium text-cyan-300">{signupProgress}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={signupUploading || !signupResumeFile || !signupForm.firstName.trim() || !signupForm.lastName.trim() || !signupForm.location.trim() || !signupForm.summary.trim() || !validateVerificationDocs(signupDocs, signupConsent)} className="auth-primary-button auth-account-submit disabled:cursor-not-allowed disabled:opacity-40">
                  {signupUploading ? 'Creating account…' : 'Create account'}
                </button>
                <button type="button" onClick={() => setAuthView("login")} className="auth-secondary-button">
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  const navItems = navigationByRole[activeRole] || []
  const employerApproved = activeRole !== 'Employer' || !currentUser?.verificationStatus || currentUser.verificationStatus === EMPLOYER_STATUS.APPROVED
  const applicantApproved = activeRole !== 'Applicant' || !currentUser?.verificationStatus || currentUser.verificationStatus === 'approved'
  const registrationIncomplete = ['Applicant', 'Employer'].includes(activeRole) && currentUser?.registration && !currentUser.registration.complete

  const portalNavItems = navItems.filter((item) => {
    if (item.id === "profile") return false
    if (activeRole === 'Employer' && !employerApproved) return item.id === 'verification'
    if (registrationIncomplete) return item.id === 'complete'
    if (item.id === 'complete') return ['Applicant', 'Employer'].includes(activeRole) && currentUser?.registration?.complete === false
    if (activeRole === 'Employer') return employerApproved && item.id !== 'verification'
    // Unverified applicants only get My Documents (job listings stay hidden)
    if (activeRole === 'Applicant') return applicantApproved || item.id === 'documents'
    return true
  })
  // Server state is the source of truth; this is just UI gating
  const applicantDocAttention = activeRole === 'Applicant' ? (currentUser?.attentionCount || 0) : 0
  const showProfileTab = ["Applicant", "Employer"].includes(activeRole) && (activeRole !== 'Employer' || employerApproved)

  return (
    <div className={`portal-shell portal-shell-${activeRole.toLowerCase()}`}>
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-brand">
            <span className="portal-brand-fallback" aria-hidden="true">P</span>
            <img
              src="/peso-logo.png"
              alt="PESO logo"
              onLoad={(event) => { event.currentTarget.previousElementSibling.style.display = 'none' }}
              onError={(event) => { event.currentTarget.style.display = 'none' }}
            />
            <div>
              <p>PESO PORTAL</p>
              <h1>Online Employment Services Platform</h1>
            </div>
          </div>
          <div className="portal-header-actions flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveView("notify")}
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              className="portal-bell relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {unreadCount > 0 && (
                <span data-testid="notification-badge" className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {showProfileTab && (
              <button
                type="button"
                onClick={() => setActiveView("profile")}
                className={`portal-profile-button inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === "profile" ? "bg-cyan-500 text-slate-950" : "text-slate-200"
                }`}
              >
                <span className="portal-profile-icon inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-cyan-500 text-lg font-bold text-slate-950">
                  {profileData.profileImage ? (
                    <img src={profileData.profileImage} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    (profileData.companyName || profileData.name || currentUser?.email || '?').trim().charAt(0).toUpperCase()
                  )}
                </span>
                <span>Profile</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="portal-logout"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="portal-layout">
        <aside className="portal-sidebar">
          <div className="portal-session">
            <p className="portal-eyebrow">Session</p>
            <p>Signed in as</p>
            <strong>{currentUser?.email}</strong>
            <span>Role</span>
            <strong>{activeRole}</strong>
          </div>

          <nav className="portal-nav" aria-label={`${activeRole} navigation`}>
            {portalNavItems.map((item, index) => (
              <button
                key={`${item.id}-${item.label}-${index}`}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`portal-nav-item ${
                  activeView === item.id ? "is-active" : ""
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="portal-content">
          {['Applicant', 'Employer'].includes(activeRole) && currentUser && currentUser.emailVerified === false && (
            <EmailVerificationBanner
              email={currentUser.email}
              token={getToken()}
              onVerified={() => setCurrentUser((current) => ({ ...current, emailVerified: true }))}
            />
          )}
          {activeRole === 'Applicant' && currentUser?.needsNameConfirmation && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-sm font-medium text-cyan-900" role="alert">
              <span>We updated how names are stored. Please review and confirm your first, middle, and last name on your profile.</span>
              <button type="button" onClick={() => { setIsEditingProfile(true); setActiveView('profile') }} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
                Confirm my name
              </button>
            </div>
          )}
          {applicantDocAttention > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-800" role="alert">
              <span>{applicantDocAttention} document{applicantDocAttention === 1 ? '' : 's'} need{applicantDocAttention === 1 ? 's' : ''} your attention.</span>
              <button type="button" onClick={() => setActiveView('documents')} className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
                Review now
              </button>
            </div>
          )}

          <main className="space-y-6">
          {appMessage && (
            <div
              role="status"
              className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${
                appMessage.type === 'error'
                  ? 'border-rose-400/40 bg-rose-950/40 text-rose-200'
                  : 'border-cyan-400/40 bg-cyan-950/40 text-cyan-200'
              }`}
            >
              <p>{appMessage.text}</p>
              <button
                type="button"
                onClick={() => setAppMessage(null)}
                className="rounded-full border border-current px-3 py-1 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}
          {approvalNotice && activeRole === 'Employer' && (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-green-300 bg-green-50 p-5 text-green-950" role="status">
              <div>
                <h2 className="text-lg font-bold">Your account is approved</h2>
                <p className="mt-1 text-sm">You can now access employer features.</p>
              </div>
              <button type="button" onClick={acknowledgeEmployerApproval} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white">
                Go to dashboard
              </button>
            </section>
          )}
          {activeRole === 'Employer' && !employerApproved ? (
            <EmployerVerificationPage token={getToken()} onStatusChange={updateEmployerVerification} />
          ) : (
            <>
          {activeView === "complete" && ['Applicant', 'Employer'].includes(activeRole) && (
            <CompleteRegistrationPage
              role={activeRole}
              token={getToken()}
              onNavigate={(target) => setActiveView(target === 'continue' ? 'home' : target === 'documents' && activeRole === 'Applicant' ? 'documents' : target === 'dashboard' && activeRole === 'Employer' ? 'dashboard' : 'profile')}
              onUpdated={updateRegistrationUser}
            />
          )}
          {activeView === "documents" && activeRole === 'Applicant' && (
            <MyDocumentsPage
              applicantId={currentUser?.id || currentUser?._id}
              token={getToken()}
              onUpdated={() => {
                const token = getToken()
                if (!token) return
                fetch(`${API_URL}/api/profile`, { headers: { Authorization: `Bearer ${token}` } })
                  .then((r) => r.json())
                  .then((data) => {
                    if (!data?.error) {
                      setCurrentUser((current) => ({ ...current, verificationStatus: data.verificationStatus, verificationReason: data.verificationReason, attentionCount: data.attentionCount }))
                    }
                  })
                  .catch(() => {})
              }}
            />
          )}
          {activeView === "home" && (
            <section className="portal-card rounded-2xl border border-slate-300 bg-white p-8 text-black">
              <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
                PESO Job Portal
              </p>
              <h2 className="mt-2 text-3xl font-bold text-black">
                {activeRole === 'Employer'
                  ? `Welcome back, ${profileData.companyName || currentUser?.companyName || 'Employer'}`
                  : `Welcome back, ${formatFullName(profileData) || profileData.name || currentUser?.email || 'Applicant'}`}
              </h2>
              <p className="mt-3 max-w-2xl text-slate-600">
                {activeRole === 'Employer'
                  ? 'Post job openings, track admin approvals, and connect with qualified applicants in Albay.'
                  : 'Browse approved job openings from verified employers and track your applications in one place.'}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {activeRole === 'Employer' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveView('employer')}
                      className="rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
                    >
                      Manage Job Postings
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('notify')}
                      className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-black"
                    >
                      View Notifications
                    </button>
                  </>
                ) : (
                  <>
                    {applicantApproved && (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveView('jobs')}
                          className="rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
                        >
                          Browse Jobs
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveView('profile')}
                          className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-black"
                        >
                          Update My Profile
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {activeRole === 'Applicant' && !applicantApproved && (
                <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
                  <h3 className="text-lg font-semibold text-black">Account verification in progress</h3>
                  <p className="mt-2 text-sm text-slate-700">
                    Your NSRP registration form was submitted with your sign up. Once an admin approves it, you'll be able to browse jobs and apply. You can check the status or resubmit from your Profile page.
                  </p>
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    Status: {(currentUser?.verificationStatus || 'under_review').replace('_', ' ')}
                  </p>
                  {currentUser?.verificationStatus === 'declined' && currentUser?.verificationReason && (
                    <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">
                      {currentUser.verificationReason}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {activeRole === 'Employer' ? (
                  <>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">My job requests</p>
                      <p className="mt-2 text-3xl font-bold text-black">{myJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Approved postings</p>
                      <p className="mt-2 text-3xl font-bold text-black">{myJobs.filter((job) => job.status === 'approved').length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Total applicants</p>
                      <p className="mt-2 text-3xl font-bold text-black">{myJobs.reduce((acc, j) => acc + (j.applicants ? j.applicants.length : 0), 0)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Open jobs</p>
                      <p className="mt-2 text-3xl font-bold text-black">{availableJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">My applications</p>
                      <p className="mt-2 text-3xl font-bold text-black">{appliedJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Notifications</p>
                      <p className="mt-2 text-3xl font-bold text-black">{notifications.length}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-black">Getting started</h3>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {activeRole === 'Employer' ? (
                    <>
                      <li>Create and manage job postings for your establishment.</li>
                      <li>Review applicants and send referrals from the Job Postings tab.</li>
                      <li>Track your posting requests and notifications from your dashboard.</li>
                    </>
                  ) : (
                    <>
                      <li>Fill out your profile and upload your resume so employers can find you.</li>
                      <li>Browse open jobs and apply with your NSRP registration.</li>
                      <li>Watch your notifications for application updates and referrals.</li>
                    </>
                  )}
                </ul>
              </div>
            </section>
          )}
          {activeView === "dashboard" && (
            <section className="portal-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">Dashboard</h2>
              <p className="mb-6 mt-2 text-sm text-slate-600">
                {activeRole === 'Admin'
                  ? 'Monitor registrations, job requests, document reviews, referrals, and hiring across the portal.'
                  : activeRole === 'Employer'
                    ? 'Track your job postings, applicants, referrals, hiring, and recent activity.'
                    : 'Track your applications, referrals, document reviews, and account status.'}
              </p>
              <RoleDashboard token={getToken()} onNavigate={setActiveView} />
              {activeRole === 'Employer' && employerApproved && (
                <>
                  <div className="employer-dashboard-postings">
                    <div className="employer-dashboard-postings-heading">
                      <div>
                        <h3>Approved Job Postings</h3>
                        <p>All approved vacancies currently visible to applicants.</p>
                      </div>
                      <span>{myJobs.filter((job) => job.status === 'approved').length} approved</span>
                    </div>
                    {myJobs.filter((job) => job.status === 'approved').length === 0 ? (
                      <p className="employer-dashboard-empty">No approved job postings yet.</p>
                    ) : (
                      <div className="employer-dashboard-posting-list">
                        {myJobs.filter((job) => job.status === 'approved').map((job) => (
                          <article
                            key={job._id}
                            className="employer-dashboard-posting cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onClick={() => openEditJob(job, false)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openEditJob(job, false)
                              }
                            }}
                          >
                            <div>
                              <h4>{job.title}</h4>
                              <p>{job.company} \u2022 {job.location || 'Remote'}</p>
                              <p>Salary: {job.salary || 'Not specified'}</p>
                              <p>Skills: {Array.isArray(job.skills) ? job.skills.join(', ') : job.skills || 'None specified'}</p>
                            </div>
                            <span>{job.applicants?.length || 0} applicant{job.applicants?.length === 1 ? '' : 's'}</span>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <button type="button" onClick={() => setActiveView('employer')} className="mt-6 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Manage Postings</button>
                </>
              )}
            </section>
          )}

                {["employers", "applicants"].includes(activeView) && activeRole === "Admin" && (
                  <section className="portal-card directory-card">
                    <h2 className="text-xl font-semibold text-white">{activeView === "employers" ? "Employers" : "Applicants"}</h2>
                    <p className="mt-2 text-sm text-slate-400">Review employer approval status and applicant contact information.</p>

                    {(activeView === 'employers' || activeView === 'applicants') && (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                        <input
                          type="search"
                          value={adminEmployerSearchTerm}
                          onChange={(event) => setAdminEmployerSearchTerm(event.target.value)}
                          placeholder={activeView === 'employers' ? "Search company, email, contact, phone, or status" : "Search first, middle, or last name, or email"}
                          aria-label={activeView === 'employers' ? "Search employers" : "Search applicants"}
                          className="portal-control w-full"
                        />
                        {activeView === 'employers' ? (
                        <select
                          value={adminEmployerStatusFilter}
                          onChange={(event) => setAdminEmployerStatusFilter(event.target.value)}
                          aria-label="Filter employers by status"
                          className="portal-control w-full"
                        >
                          <option value="all">All statuses</option>
                          <option value="pending">Pending</option>
                          <option value="under_review">Under review</option>
                          <option value="approved">Approved</option>
                          <option value="declined">Declined</option>
                        </select>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                      </div>
                    )}

                    {(activeView === 'employers' || activeView === 'applicants') && (
                      <div className="mt-3">
                        <SortControl
                          options={activeView === 'applicants' ? APPLICANT_SORT_OPTIONS : EMPLOYER_SORT_OPTIONS}
                          value={activeView === 'applicants' ? applicantSort : employerSort}
                          onChange={activeView === 'applicants' ? applicantSort.setSortOption : employerSort.setSortOption}
                          onReset={activeView === 'applicants' ? applicantSort.resetSort : employerSort.resetSort}
                          ariaLabel={activeView === 'applicants' ? 'Sort applicants' : 'Sort employers'}
                        />
                      </div>
                    )}

                    <div className="portal-directory-wrap">
                      {[
                        { role: 'Employer', title: 'Employers', view: 'employers' },
                        { role: 'Applicant', title: 'Applicants', view: 'applicants' },
                      ].filter((directory) => directory.view === activeView).map((directory) => {
                        const isApplicantDirectory = directory.role === 'Applicant'
                        // Both directories are server-paginated + server-sorted
                        const directorySort = isApplicantDirectory ? applicantSort : employerSort
                        const directorySortOptions = isApplicantDirectory ? APPLICANT_SORT_OPTIONS : EMPLOYER_SORT_OPTIONS
                        const directoryPagination = isApplicantDirectory ? applicantsPagination : employersPagination
                        const users = isApplicantDirectory ? adminApplicantsData.items : adminEmployersData.items
                        const listTotal = isApplicantDirectory ? adminApplicantsData.total : adminEmployersData.total
                        const listLoading = isApplicantDirectory ? adminApplicantsLoading : adminEmployersLoading
                        const listEmptyMessage = isApplicantDirectory ? 'No applicants found.' : 'No employers found.'
                        return (
                          <div key={directory.role}>
                            <h3 className="portal-section-title">{directory.title}</h3>
                            {users.length === 0 && !listLoading ? (
                              <p className="portal-empty">{listEmptyMessage}</p>
                            ) : (
                              <div className={`portal-table-scroll${listLoading && users.length > 0 ? ' opacity-60 transition-opacity' : ''}`} aria-busy={listLoading}>
                                <table className={`portal-table portal-table-fit ${directory.role === 'Employer' ? 'portal-employers-table' : 'portal-applicants-table'}`}>
                                  <colgroup>
                                    {directory.role === 'Employer' ? (
                                      <>
                                        <col className="col-name" />
                                        <col className="col-email" />
                                        <col className="col-contact" />
                                        <col className="col-phone" />
                                        <col className="col-status" />
                                        <col className="col-actions" />
                                      </>
                                    ) : (
                                      <>
                                        <col className="col-name" />
                                        <col className="col-email" />
                                        <col className="col-location" />
                                        <col className="col-phone" />
                                        <col className="col-status" />
                                        <col className="col-actions" />
                                      </>
                                    )}
                                  </colgroup>
                                  <thead>
                                    <tr>
                                      {directory.role === 'Employer' ? (
                                        <SortableTh label="Company" sortKey="companyName" activeSortBy={employerSort.sortBy} order={employerSort.order} onSort={employerSort.toggleSort} />
                                      ) : (
                                        <SortableTh label="Name" sortKey="name" activeSortBy={applicantSort.sortBy} order={applicantSort.order} onSort={applicantSort.toggleSort} />
                                      )}
                                      <th>Email</th>
                                      {directory.role === 'Employer' ? (
                                        <th>Contact</th>
                                      ) : (
                                        <SortableTh label="Location" sortKey="location" activeSortBy={applicantSort.sortBy} order={applicantSort.order} onSort={applicantSort.toggleSort} />
                                      )}
                                      {directory.role === 'Employer' && <th>Phone</th>}
                                      {directory.role === 'Applicant' && <th className="applicant-phone-column">Phone</th>}
                                      <th>Status</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {users.length === 0 && listLoading ? (
                                      Array.from({ length: 5 }).map((_, skeletonIndex) => (
                                        <tr key={`skeleton-${skeletonIndex}`} aria-hidden="true" className="portal-skeleton-row">
                                          {Array.from({ length: directory.role === 'Employer' ? 6 : 6 }).map((_, cellIndex) => (
                                            <td key={cellIndex}><span className="portal-skeleton-cell" /></td>
                                          ))}
                                        </tr>
                                      ))
                                    ) : users.map((user) => {
                                      return (
                                        <tr key={user.id}>
                                          <td data-label={directory.role === 'Employer' ? 'Company' : 'Name'}>
                                            {directory.role === 'Applicant' ? (
                                              <button type="button" className="portal-applicant-name-button" onClick={() => setReviewDocsApplicant(user)}>
                                                {user.displayName || formatDisplayName(user.profile) || 'Unnamed applicant'}
                                              </button>
                                            ) : (
                                              <strong>{user.companyName || 'Unnamed employer'}</strong>
                                            )}
                                          </td>
                                          <td data-label="Email"><span className="portal-cell-truncate" title={user.email}>{user.email}</span></td>
                                          <td data-label={directory.role === 'Employer' ? 'Contact' : 'Location'}>
                                            {directory.role === 'Employer' ? user.contactName || 'Not provided' : user.profile?.location || 'Not provided'}
                                          </td>
                                          {directory.role === 'Employer' ? (
                                            <td data-label="Phone">{user.phone || 'Not provided'}</td>
                                          ) : (
                                            <td data-label="Phone" className="applicant-phone-column">{formatApplicantPhone(user.phone || user.profile?.phone || user.profile?.nsrp?.cellphone)}</td>
                                          )}
                                          <td data-label="Status">
                                            <div className="portal-status-stack">
                                              <span className={`portal-status status-${(directory.role === 'Employer' ? user.approvalStatus : user.verificationStatus) || 'approved'}`}>{(directory.role === 'Employer' ? user.approvalStatus : user.verificationStatus) || 'approved'}</span>
                                              {directory.role === 'Applicant' && user.emailVerified === false && (
                                                <span className="portal-badge border border-amber-400/60 bg-amber-500/10 text-amber-700">Unverified email</span>
                                              )}
                                              {directory.role === 'Applicant' && Array.isArray(user.verificationDocuments) && (
                                                <span className="text-xs text-slate-500">
                                                  {user.verificationDocuments.filter((doc) => doc.required && doc.status === 'approved').length} of 3 approved
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td data-label="Actions">
                                            {directory.role === 'Applicant' ? (
                                              <button type="button" className="portal-table-action" onClick={() => setReviewDocsApplicant(user)}>
                                                Review
                                              </button>
                                            ) : (
                                              <div className="portal-actions-row">
                                                {user.requirementsFile && (
                                                  <>
                                                    <button type="button" className="portal-table-action" onClick={() => handleViewRequirements(user.requirementsFile.requestId)}>View NSRP</button>
                                                    <button type="button" className="portal-table-action" onClick={() => handleDownloadRequirements(user.requirementsFile.requestId, user.requirementsFile.originalName)}>Download</button>
                                                  </>
                                                )}
                                                {user.requestId && ['pending', 'under_review'].includes(user.approvalStatus) && (
                                                  <>
                                                    <button type="button" className="portal-table-action" onClick={() => confirmEmployerRequest(user.requestId, user.companyName, 'approved')}>Approve</button>
                                                    <button type="button" className="portal-table-action" onClick={() => confirmEmployerRequest(user.requestId, user.companyName, 'declined')}>Decline</button>
                                                  </>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {(listTotal > 0 || listLoading) && (
                              <Pagination
                                page={directoryPagination.page}
                                pageSize={directoryPagination.pageSize}
                                totalItems={listTotal}
                                onPageChange={directoryPagination.setPage}
                                onPageSizeChange={directoryPagination.setPageSize}
                                loading={listLoading}
                                itemLabel={isApplicantDirectory ? 'applicants' : 'employers'}
                                ariaLabel={isApplicantDirectory ? 'Applicants pagination' : 'Employers pagination'}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

          {reviewDocsApplicant && (
            <VerificationDocsReviewModal
              applicant={reviewDocsApplicant}
              token={getToken()}
              onClose={() => setReviewDocsApplicant(null)}
              onReviewed={() => { fetchAdminUsers(); fetchAdminApplicants() }}
              onRestrict={(applicantId) => handleReviewApplicantVerification(applicantId, 'restricted')}
            />
          )}

          {activeView === "profile" && (<section className={`${activeRole === 'Employer' ? 'employer-profile-card portal-card' : activeRole === 'Applicant' ? 'applicant-profile-card portal-card' : ''} rounded-2xl border border-slate-800 bg-slate-900/70 p-6`}>
              {activeRole === 'Applicant' ? (
                <>
                  <h2 className="text-xl font-semibold text-white">Applicant Profile</h2>
                  <p className="mt-3 text-slate-400">Update your traits and personal information.</p>

                  {/* Banner and profile image preview */}
                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700">
                    <div
                      className="employer-banner h-36 w-full bg-slate-800 bg-cover bg-center"
                      style={profileData.bannerImage ? { backgroundImage: `url(${profileData.bannerImage})` } : undefined}
                    />
                    <div className="flex items-end gap-4 bg-slate-900/60 px-5 pb-4">
                      <div className="applicant-profile-avatar -mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-slate-900 bg-cyan-500 text-2xl font-bold text-slate-950">
                        {profileData.profileImage ? (
                          <img src={profileData.profileImage} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          applicantProfileInitials
                        )}
                      </div>
                      <p className="pb-1 text-lg font-semibold text-white">{formatFullName(profileData) || profileData.name || 'Your name'}</p>
                    </div>
                  </div>

                  {isEditingProfile && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="applicantProfileImageUpload" className="block text-sm font-medium text-slate-300">Profile Image</label>
                        <input
                          id="applicantProfileImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleImageFile(event.target.files?.[0], 'profileImage')}
                          className="shared-form-control mt-2 block w-full rounded-2xl px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="applicantBannerImageUpload" className="block text-sm font-medium text-slate-300">Banner Image</label>
                        <input
                          id="applicantBannerImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleImageFile(event.target.files?.[0], 'bannerImage')}
                          className="shared-form-control mt-2 block w-full rounded-2xl px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="applicant-profile-summary mt-6 rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
                    <div className="flex items-center gap-4">
                      <div className="applicant-profile-avatar flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500 text-lg font-bold text-slate-950">
                        {applicantProfileInitials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xl font-semibold text-white">{formatFullName(profileData) || profileData.name || 'Your name'}</p>
                        <p className="text-sm text-slate-400">{profileData.location || 'Add your location'}</p>
                        <p className="mt-1 text-sm text-cyan-300">{profileData.traits || 'Add a few key traits'}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {profileData.skills.length > 0 ? (
                        profileData.skills.map((skill) => (
                          <span key={skill} className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">Choose your skills to show on your profile.</span>
                      )}
                    </div>
                  </div>

                  <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-slate-300">
                        First Name
                      </label>
                      <input
                        id="firstName"
                        type="text"
                        value={profileData.firstName}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, firstName: event.target.value })}
                        onBlur={() => isEditingProfile && setProfileData((current) => ({ ...current, firstName: capitalizeName(current.firstName) }))}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="middleName" className="block text-sm font-medium text-slate-300">
                        Middle Name <span className="text-slate-500">(optional)</span>
                      </label>
                      <input
                        id="middleName"
                        type="text"
                        value={profileData.middleName}
                        disabled={!isEditingProfile || profileData.noMiddleName}
                        onChange={(event) => setProfileData({ ...profileData, middleName: event.target.value })}
                        onBlur={() => isEditingProfile && setProfileData((current) => ({ ...current, middleName: capitalizeName(current.middleName) }))}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                      {isEditingProfile && (
                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                          <input
                            type="checkbox"
                            checked={profileData.noMiddleName}
                            onChange={(event) => setProfileData({ ...profileData, noMiddleName: event.target.checked, middleName: event.target.checked ? '' : profileData.middleName })}
                          />
                          No middle name
                        </label>
                      )}
                    </div>
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium text-slate-300">
                        Last Name
                      </label>
                      <input
                        id="lastName"
                        type="text"
                        value={profileData.lastName}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, lastName: event.target.value })}
                        onBlur={() => isEditingProfile && setProfileData((current) => ({ ...current, lastName: capitalizeName(current.lastName) }))}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="suffix" className="block text-sm font-medium text-slate-300">
                        Suffix <span className="text-slate-500">(optional)</span>
                      </label>
                      <select
                        id="suffix"
                        value={profileData.suffix}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, suffix: event.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      >
                        {SUFFIX_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option === '' ? 'None' : option}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="summary" className="block text-sm font-medium text-slate-300">
                        About me
                      </label>
                      <textarea
                        id="summary"
                        rows="4"
                        value={profileData.summary}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, summary: event.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                        placeholder="Write a brief profile summary."
                      />
                    </div>
                    <div>
                      <label htmlFor="location" className="block text-sm font-medium text-slate-300">
                        Location
                      </label>
                      <input
                        id="location"
                        type="text"
                        value={profileData.location}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, location: event.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="traits" className="block text-sm font-medium text-slate-300">
                        Key Traits
                      </label>
                      <input
                        id="traits"
                        type="text"
                        value={profileData.traits}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, traits: event.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                        placeholder="e.g. reliable, detail-oriented, team player"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Skills <span className="text-slate-500">(optional)</span></label>
                      <SkillTagPicker
                        selected={profileData.skills}
                        disabled={!isEditingProfile}
                        onChange={(next) => setProfileData({ ...profileData, skills: next })}
                      />
                    </div>
                    <div>
                    </div>
                    <div className="flex gap-3">
                      {!isEditingProfile ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingProfile(true)}
                          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                        >
                          Edit Profile
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              saveProfile(profileData).then((result) => {
                                if (result.ok) {
                                  setIsEditingProfile(false)
                                  alert('Profile saved!')
                                }
                              })
                            }}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                          >
                            Save Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileData(normalizeProfile(currentUser, currentUser?.role))
                              setIsEditingProfile(false)
                            }}
                            className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-white">Employer Profile</h2>
                  <p className="mt-3 text-slate-400">Update your company details and contact information.</p>

                  {/* Banner and profile image preview */}
                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700">
                    <div
                      className="h-36 w-full bg-slate-800 bg-cover bg-center"
                      style={profileData.bannerImage ? { backgroundImage: `url(${profileData.bannerImage})` } : undefined}
                    />
                    <div className="flex items-end gap-4 bg-slate-900/60 px-5 pb-4">
                      <div className="-mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-slate-900 bg-slate-800 text-2xl font-bold text-cyan-300">
                        {profileData.profileImage ? (
                          <img src={profileData.profileImage} alt="Company profile" className="h-full w-full object-cover" />
                        ) : (
                          (profileData.companyName || 'C').trim().charAt(0).toUpperCase()
                        )}
                      </div>
                      <p className="pb-1 text-lg font-semibold text-white">{profileData.companyName || 'Your company'}</p>
                    </div>
                  </div>

                  {isEditingProfile && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="profileImageUpload" className="block text-sm font-medium text-slate-300">Profile Image</label>
                        <input
                          id="profileImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) return alert('Image must be under 2 MB')
                            const reader = new FileReader()
                            reader.onload = () => setProfileData((current) => ({ ...current, profileImage: reader.result }))
                            reader.readAsDataURL(file)
                          }}
                          className="shared-form-control mt-2 block w-full rounded-2xl px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="bannerImageUpload" className="block text-sm font-medium text-slate-300">Banner Image</label>
                        <input
                          id="bannerImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) return alert('Image must be under 2 MB')
                            const reader = new FileReader()
                            reader.onload = () => setProfileData((current) => ({ ...current, bannerImage: reader.result }))
                            reader.readAsDataURL(file)
                          }}
                          className="shared-form-control mt-2 block w-full rounded-2xl px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
                    <div>
                      <label htmlFor="companyName" className="block text-sm font-medium text-slate-300">Company Name</label>
                      <input
                        id="companyName"
                        type="text"
                        value={profileData.companyName}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, companyName: e.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="contactName" className="block text-sm font-medium text-slate-300">Contact Name</label>
                      <input
                        id="contactName"
                        type="text"
                        value={profileData.contactName}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, contactName: e.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="location" className="block text-sm font-medium text-slate-300">Location</label>
                      <input
                        id="location"
                        type="text"
                        value={profileData.location}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-slate-300">Phone</label>
                      <input
                        id="phone"
                        type="tel"
                        value={profileData.phone}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="website" className="block text-sm font-medium text-slate-300">Website</label>
                      <input
                        id="website"
                        type="text"
                        value={profileData.website}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="summary" className="block text-sm font-medium text-slate-300">Company Summary</label>
                      <textarea
                        id="summary"
                        rows="4"
                        value={profileData.summary}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, summary: event.target.value })}
                        className="shared-form-control mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                        placeholder="Brief description of company or services"
                      />
                    </div>
                    <div className="flex gap-3">
                      {!isEditingProfile ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingProfile(true)}
                          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                        >
                          Edit Profile
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const token = currentUser?.token || localStorage.getItem('peso-token')
                              if (!token) return alert('Not authenticated. Please log in again.')
                              // Preserve existing profile fields and update the editable ones, including top-level employer fields.
                              const editableProfile = { ...(currentUser?.profile || {}), location: profileData.location, website: profileData.website, summary: profileData.summary, profileImage: profileData.profileImage || '', bannerImage: profileData.bannerImage || '' }
                              fetch(`${API_URL}/api/profile`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ profile: editableProfile, companyName: profileData.companyName, contactName: profileData.contactName, phone: profileData.phone, website: profileData.website }),
                              })
                                .then((r) => r.json())
                                .then((data) => {
                                  if (data.error) return alert(data.error)
                                  setIsEditingProfile(false)
                                  alert('Profile saved!')
                                })
                                .catch((err) => {
                                  console.error(err)
                                  alert('Save failed')
                                })
                            }}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                          >
                            Save Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileData(normalizeProfile(currentUser, currentUser?.role))
                              setIsEditingProfile(false)
                            }}
                            className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                </>
              )}
            </section>
          )}

          {activeView === "employer" && (
            <section className="employer-module-card portal-card rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-semibold text-slate-900">Employer Module</h2>
              <p className="mt-3 text-slate-600">Submit job requests and track their review status.</p>

              <button
                type="button"
                onClick={openCreateJobPosting}
                className="mt-6 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Create Job Posting
              </button>

              {showCreateJobPosting && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-200/70 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="create-job-posting-title"
                  onClick={() => setShowCreateJobPosting(false)}
                >
                  <div
                    className="employer-form-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 id="create-job-posting-title" className="text-lg font-semibold text-black">Request a Job Posting</h3>
                      <button
                        type="button"
                        onClick={() => setShowCreateJobPosting(false)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
                      >
                        Close
                      </button>
                    </div>
                <form className="space-y-4 mt-4" noValidate onSubmit={handleCreateJob}>
                  <JobPostingFields value={jobForm} registeredAddress={registeredJobAddress} onChange={setJobForm} categories={jobTitleGroups} suggestions={jobSkillSuggestions} errors={jobFieldErrors} setErrors={setJobFieldErrors} disabled={jobSubmitting} />
                  {jobTitleLoadError && <p role="alert" className="text-sm text-rose-700">{jobTitleLoadError}</p>}
                  {Object.values(jobFieldErrors).some(Boolean) && <p role="alert" className="text-sm text-rose-700">Check the highlighted fields before submitting.</p>}
                  <button type="submit" disabled={jobSubmitting} className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{jobSubmitting ? 'Submitting...' : 'Submit Job Request'}</button>
                </form>
              </div>
                </div>
              )}

              <div className="employer-pending-panel mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">My Job Requests</h3>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'All', activeClass: 'bg-slate-200 text-slate-950', count: myJobs.length },
                      { id: 'pending', label: 'Pending', activeClass: 'bg-yellow-400 text-slate-950', count: employerPendingJobs.length },
                      { id: 'approved', label: 'Approved', activeClass: 'bg-green-500 text-slate-900', count: employerApprovedJobs.length },
                      { id: 'declined', label: 'Declined', activeClass: 'bg-red-500 text-slate-900', count: employerDeclinedJobs.length },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setEmployerJobStatusFilter(filter.id)}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                          employerJobStatusFilter === filter.id
                            ? filter.activeClass
                            : 'border border-slate-600 bg-white text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {filter.label} ({filter.count})
                      </button>
                    ))}
                  </div>
                </div>
                {filteredMyJobs.length === 0 ? (
                  <p className="mt-3 text-slate-600">{myJobs.length === 0 ? 'No job requests submitted yet.' : `No ${employerJobStatusFilter} job requests.`}</p>
                ) : (
                  <>
                    <div className="mt-3">
                      <SortControl
                        options={MY_JOBS_SORT_OPTIONS}
                        value={myJobsSort}
                        onChange={myJobsSort.setSortOption}
                        onReset={myJobsSort.resetSort}
                        ariaLabel="Sort my job requests"
                      />
                    </div>
                    <div className="mt-4 space-y-4">
                      {myJobsPagination.paginate(sortedMyJobs).map((job) => (
                        <div key={job._id}
                          role={job.status === 'pending' ? 'button' : undefined}
                          tabIndex={job.status === 'pending' ? 0 : undefined}
                          aria-label={job.status === 'pending' ? `Edit ${job.title}` : undefined}
                          onClick={job.status === 'pending' ? () => openEditJob(job, true) : undefined}
                          onKeyDown={job.status === 'pending' ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openEditJob(job, true)
                            }
                          } : undefined}
                          className={`employer-pending-item rounded-2xl border border-slate-200 bg-white p-4 ${job.status === 'pending' ? 'cursor-pointer transition hover:border-cyan-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500' : ''}`}>
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-lg font-semibold text-slate-900">{job.title}</p>
                              <p className="text-sm text-slate-600">{job.company} \u2022 {job.location || 'Remote'}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${job.status === 'approved' ? 'bg-cyan-500 text-slate-950' : job.status === 'declined' ? 'bg-rose-400 text-slate-950' : 'bg-amber-400 text-slate-950'}`}>
                              {job.status || 'pending'}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-slate-700">{job.description}</p>
                          {job.status === 'pending' && <p className="mt-2 text-xs font-medium text-cyan-700">Click to edit this pending request</p>}
                          {job.status === 'declined' && (
                            <p className="mt-2 text-sm text-rose-300">Reason: {job.reviewReason || 'No reason provided.'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <Pagination
                      page={myJobsPagination.page}
                      pageSize={myJobsPagination.pageSize}
                      totalItems={filteredMyJobs.length}
                      onPageChange={myJobsPagination.setPage}
                      onPageSizeChange={myJobsPagination.setPageSize}
                      itemLabel="job requests"
                      ariaLabel="My job requests pagination"
                    />
                  </>
                )}
              </div>

              {(employerPendingJobs.length > 0 || employerApprovedJobs.length > 0 || employerDeclinedJobs.length > 0) && (
                <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-600">
                  Pending: {employerPendingJobs.length} \u2022 Approved: {employerApprovedJobs.length} \u2022 Declined: {employerDeclinedJobs.length}
                </p>
              )}
            </section>
          )}

          {activeView === "jobs" && (
            <JobsView
              activeRole={activeRole}
              jobLoading={jobLoading}
              jobSearchTerm={jobSearchTerm}
              setJobSearchTerm={setJobSearchTerm}
              jobSkillFilter={jobSkillFilter}
              setJobSkillFilter={setJobSkillFilter}
              availableSkills={availableSkills}
              jobLocationFilter={jobLocationFilter}
              setJobLocationFilter={setJobLocationFilter}
              jobLocationTypeFilter={jobLocationTypeFilter}
              setJobLocationTypeFilter={setJobLocationTypeFilter}
              jobEmploymentTypeFilter={jobEmploymentTypeFilter}
              setJobEmploymentTypeFilter={setJobEmploymentTypeFilter}
              locationFilterOptions={locationFilterOptions}
              filteredApplicantJobs={filteredApplicantJobs}
              appliedJobs={appliedJobs}
              appliedJobIds={appliedJobIds}
              currentUser={currentUser}
              selectedJob={selectedJob}
              setSelectedJob={setSelectedJob}
              handleApplyJob={handleApplyJob}
              adminJobSearchTerm={adminJobSearchTerm}
              setAdminJobSearchTerm={setAdminJobSearchTerm}
              adminJobStatusFilter={adminJobStatusFilter}
              setAdminJobStatusFilter={setAdminJobStatusFilter}
              filteredPendingJobs={filteredPendingJobs}
              handleReviewJob={handleReviewJob}
              handleBulkReviewJobs={handleBulkReviewJobs}
              showPendingAdminSection={showPendingAdminSection}
              showApprovedAdminSection={showApprovedAdminSection}
              filteredApprovedJobs={filteredApprovedJobs}
              showDeclinedAdminSection={showDeclinedAdminSection}
              filteredDeclinedJobs={filteredDeclinedJobs}
              jobLoadError={jobLoadError}
              adminUsers={adminUsers}
              referredApplicantIdsByJob={referredApplicantIdsByJob}
              handleReferApplicantFromJob={handleReferApplicantFromJob}
              handleBulkReferApplicants={handleBulkReferApplicants}
              token={getToken()}
              handleEditPendingJob={openEditJob}
              applicantSkills={profileData.skills}
              onGoToProfile={() => { setIsEditingProfile(true); setActiveView('profile') }}
              onEditNsrp={() => {
                const url = new URL(window.location.href)
                url.searchParams.set('editNsrp', '1')
                window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
                setActiveView('documents')
              }}
            />
          )}
          {activeView === "job-titles" && activeRole === "Admin" && (
            <AdminJobTitlesPage token={getToken()} onChanged={loadJobTitles} />
          )}

          {activeView === "referrals" && activeRole === "Employer" && (
            <ReferralList
              token={getToken()}
              employerId={currentUser?._id || currentUser?.id || currentUser?.employerId}
            />
          )}

          {activeView === "notify" && (
            <section className="notifications-module employer-notifications-card portal-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">Notifications</h2>
              <p className="mt-3 text-black">Updates about your job posting approvals and other account activity.</p>

              {notifications.length === 0 ? (
                <p className="mt-6 text-black">You have no notifications yet.</p>
              ) : (
                <>
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <p className="text-sm text-black">Click a notification to view full details.</p>
                    <button
                      type="button"
                      onClick={markAllNotificationsAsRead}
                      disabled={unreadCount === 0}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black disabled:opacity-50"
                    >
                      Mark all as read
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {notifications.map((notification) => (
                      <button
                        key={notification._id}
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className={`${activeRole === 'Employer' ? 'employer-notification-item' : ''} w-full rounded-2xl border bg-white p-4 text-left ${isNotificationUnread(notification) ? 'border-cyan-500/50' : 'border-slate-300'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-black">{notification.title}</p>
                            <p className="mt-2 line-clamp-2 text-sm text-black">{notification.message}</p>
                            {activeRole === 'Admin' && isNewApplicationNotification(notification) && (
                              <>
                                <p className="mt-2 text-sm text-black">Applicant: {notification.metadata?.applicantName || 'Unknown applicant'}</p>
                                <p className="mt-1 text-sm text-black">Job: {notification.metadata?.jobTitle || 'Unknown job'} \u2022 Employer: {notification.metadata?.employerName || 'Unknown employer'}</p>
                              </>
                            )}
                            {activeRole === 'Admin' && notification.type === 'job_pending_review' && (
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Action available</p>
                            )}
                            {isNotificationUnread(notification) && (
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Unread</p>
                            )}
                          </div>
                          <span className="text-xs uppercase tracking-[0.2em] text-black">
                            {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Just now'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <Pagination
                    page={notifPagination.page}
                    pageSize={notifPagination.pageSize}
                    totalItems={notifTotal}
                    onPageChange={notifPagination.setPage}
                    onPageSizeChange={notifPagination.setPageSize}
                    itemLabel="notifications"
                    ariaLabel="Notifications pagination"
                  />
                </>
              )}
            </section>
          )}

          {showSkillPrompt && activeRole === 'Applicant' && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="skill-prompt-title"
              onClick={() => setShowSkillPrompt(false)}
            >
              <div
                className="applicant-skill-modal w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="skill-prompt-title" className="text-xl font-semibold text-slate-900">Tell us about your skills</h3>
                    <p className="mt-2 text-sm text-slate-600">Choose the skills that match your experience so employers can see them on your profile.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSkillPrompt(false)}
                    className="rounded-2xl border border-slate-300 bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-5">
                  <SkillTagPicker
                    theme="light"
                    selected={profileData.skills}
                    onChange={(next) => setProfileData({ ...profileData, skills: next })}
                  />
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSkillPrompt(false)
                      saveProfile(profileData).then((result) => {
                        if (result.ok) setActiveView('profile')
                      })
                    }}
                    className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {editingJob && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-200/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-job-title"
              onClick={() => setEditingJob(null)}
            >
              <form
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl"
                noValidate
                onSubmit={handleSaveEditedJob}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="edit-job-title" className="text-lg font-semibold text-black">{editingJobCanSave ? 'Edit Job Posting' : 'Job Posting Details'}</h2>
                    <p className="mt-1 text-sm text-black">{editingJobCanSave ? 'Update your pending job request before admin review.' : 'Approved postings are read-only.'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingJob(null)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
                  >
                    Cancel
                  </button>
                </div>

                <JobPostingFields id="edit-job" value={editingJobForm} registeredAddress={registeredJobAddress} onChange={setEditingJobForm} categories={jobTitleGroups} suggestions={jobSkillSuggestions} errors={editJobFieldErrors} setErrors={setEditJobFieldErrors} disabled={!editingJobCanSave || jobSubmitting} keepDeadline={editingJob.deadline ? new Date(editingJob.deadline).toISOString().slice(0, 10) : ''} />

                {editingJobCanSave && (
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={jobSubmitting}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      {jobSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {confirmDialog && (
            <ConfirmDialog
              title={confirmDialog.title}
              note={confirmDialog.note}
              confirmLabel={confirmDialog.confirmLabel}
              confirmTone={confirmDialog.confirmTone}
              busyLabel={confirmDialog.busyLabel}
              busy={confirmBusy}
              requireReason={confirmDialog.requireReason}
              quickReasons={confirmDialog.quickReasons || []}
              error={confirmError}
              onConfirm={handleConfirmDialogConfirm}
              onCancel={() => !confirmBusy && closeConfirmDialog({ confirmed: false })}
            />
          )}

          {selectedNotification && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setSelectedNotification(null)}
            >
              <div
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-black">Notification details</h3>
                    <p className="mt-2 text-sm font-semibold text-black">{selectedNotification.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNotification(null)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
                  >
                    Close
                  </button>
                </div>

                <p className="mt-4 text-sm text-black">{selectedNotification.message}</p>
                <p className="mt-2 text-sm text-black">
                  Time: {selectedNotification.createdAt ? new Date(selectedNotification.createdAt).toLocaleString() : 'Just now'}
                </p>

                {selectedNotification.company && (
                  <p className="mt-2 text-sm text-black">Company: {selectedNotification.company}</p>
                )}
                {selectedNotification.location && (
                  <p className="mt-1 text-sm text-black">Location: {selectedNotification.location}</p>
                )}
                {selectedNotification.salary && (
                  <p className="mt-1 text-sm text-black">Salary: {selectedNotification.salary}</p>
                )}
                {selectedNotification.requirements && (
                  <p className="mt-1 text-sm text-black">Requirements: {selectedNotification.requirements}</p>
                )}
                {selectedNotification.description && (
                  <p className="mt-1 text-sm text-black">Description: {selectedNotification.description}</p>
                )}

                {activeRole === 'Admin' && selectedNotificationIsPending && (
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNotification(null)
                        setAdminJobStatusFilter('pending')
                        setActiveView('jobs')
                      }}
                      className="rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Open job review
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === "requests" && activeRole === "Admin" && (
            <section className="admin-requests-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">Employer Requests</h2>
              <p className="mt-3 text-black">Review pending employer account requests.</p>

              <div className="mt-4">
                <SortControl
                  options={EMPLOYER_REQUEST_SORT_OPTIONS}
                  value={requestSort}
                  onChange={requestSort.setSortOption}
                  onReset={requestSort.resetSort}
                  ariaLabel="Sort employer requests"
                />
              </div>

              {employerRequests.items.length === 0 && !employerRequests.loading ? (
                <p className="mt-4 text-black">No pending employer requests.</p>
              ) : (
                <div className={`mt-6 space-y-4${employerRequests.loading ? ' opacity-60 transition-opacity' : ''}`} aria-busy={employerRequests.loading}>
                  {employerRequests.items.map((request) => (
                    <div key={request._id} className="admin-request-item rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">{request.companyName}</p>
                          <p className="text-sm text-slate-600">Contact: {request.contactName}</p>
                          <p className="text-sm text-slate-600">Email: {request.email}</p>
                          <p className="text-sm text-slate-600">Location: {request.location || 'N/A'}</p>
                          <p className="text-sm text-slate-600">Phone: {request.phone || 'N/A'}</p>
                          {request.message && <p className="mt-2 text-sm text-slate-700">{request.message}</p>}
                          <p className="mt-2 text-sm font-medium text-amber-800">Status: {request.status.replaceAll('_', ' ')}</p>
                          {request.resubmittedAt && <p className="mt-1 text-sm font-semibold text-blue-800">Resubmitted</p>}
                          {request.reviewReason && <p className="mt-1 text-sm text-rose-700">Previous review note: {request.reviewReason}</p>}
                          {request.requirementsFile && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleViewRequirements(request._id)}
                                className="rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                              >
                                View NSRP PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadRequirements(request._id, request.requirementsFile.originalName)}
                                className="rounded-2xl border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-cyan-800"
                              >
                                Download PDF
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => confirmEmployerRequest(request._id, request.companyName, 'approved')}
                            className="rounded-2xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmEmployerRequest(request._id, request.companyName, 'declined')}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmEmployerRequest(request._id, request.companyName, 'needs_resubmission')}
                            className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
                          >
                            Request new document
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {employerRequests.total > 0 && (
                <Pagination
                  page={employerRequestsPagination.page}
                  pageSize={employerRequestsPagination.pageSize}
                  totalItems={employerRequests.total}
                  onPageChange={employerRequestsPagination.setPage}
                  onPageSizeChange={employerRequestsPagination.setPageSize}
                  loading={employerRequests.loading}
                  itemLabel="requests"
                  ariaLabel="Employer requests pagination"
                />
              )}
            </section>
          )}

          {activeView === "peso-referrals" && activeRole === "Admin" && (
            <PesoReferralPanel
              token={getToken()}
              adminUsers={adminUsers}
              onLoadApplicants={fetchAdminUsers}
              initialJobId={referralPrefill.jobId}
              initialApplicantIds={referralPrefill.applicantIds}
            />
          )}
            </>
          )}
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
