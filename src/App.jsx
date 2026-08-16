import { useEffect, useState } from "react"
import JobsView from "./components/JobsView"
import ReferralList from "./components/ReferralList"
import PesoReferralPanel from "./components/PesoReferralPanel"

const initialAccounts = [
  { email: "admin@peso.gov", password: "password123", role: "Admin" },
  { email: "employer@peso.gov", password: "password123", role: "Employer" },
  { email: "applicant@peso.gov", password: "password123", role: "Applicant" },
]

const navigationByRole = {
  Admin: [
    { id: "employers", label: "Employers" },
    { id: "applicants", label: "Applicants" },
    { id: "requests", label: "Employer Requests" },
    { id: "jobs", label: "Job Postings" },
    { id: "peso-referrals", label: "Reports" },
  ],
  Employer: [
    { id: "dashboard", label: "Dashboard" },
    { id: "employer", label: "Job Postings" },
    { id: "referrals", label: "Reports" },
    { id: "reviews", label: "Reviews" },
    { id: "notify", label: "Notifications" },
  ],
  Applicant: [
    { id: "jobs", label: "Jobs" },
    { id: "applications", label: "Applied Jobs" },
    { id: "reputation", label: "Reviews" },
    { id: "notify", label: "Notifications" },
  ],
}

const availableSkills = [
  "Cooking",
  "Construction",
  "Cleaning",
  "Caregiving",
  "Driving",
  "Customer Service",
  "Data Entry",
  "Landscaping",
]

const normalizeSkills = (skills) => {
  if (Array.isArray(skills)) return skills.filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim())
  if (typeof skills === 'string') return skills.split(',').map((skill) => skill.trim()).filter(Boolean)
  return []
}

function App() {
  const [activeRole, setActiveRole] = useState(() => typeof window !== "undefined" ? (localStorage.getItem('peso-active-role') || 'Applicant') : 'Applicant')
  const [activeView, setActiveView] = useState(() => typeof window !== "undefined" ? (localStorage.getItem('peso-active-view') || 'dashboard') : 'dashboard')
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
  const [adminSelectedRole, setAdminSelectedRole] = useState("Admin")
  const [profileData, setProfileData] = useState({
    name: "",
    location: "",
    skills: [],
    traits: "",
    summary: "",
    companyName: "",
    contactName: "",
    phone: "",
    website: "",
  })

  const normalizeProfile = (userObj = {}, role) => {
    const base = userObj.profile || {}
    if (role === 'Employer') {
      return {
        name: base.name || '',
        location: base.location || '',
        skills: normalizeSkills(base.skills),
        traits: base.traits || '',
        summary: base.summary || '',
        companyName: userObj.companyName || base.companyName || '',
        contactName: userObj.contactName || base.contactName || '',
        phone: userObj.phone || base.phone || '',
        website: userObj.website || base.website || '',
      }
    }
    // Applicant/Admin default mapping
    return {
      name: base.name || '',
      location: base.location || '',
      skills: normalizeSkills(base.skills),
      traits: base.traits || '',
      summary: base.summary || '',
      companyName: base.companyName || '',
      contactName: base.contactName || '',
      phone: base.phone || '',
      website: base.website || '',
    }
  }

const toggleSkill = (selected, skill) => {
  const normalized = Array.isArray(selected) ? selected : []
  if (normalized.includes(skill)) {
    return normalized.filter((item) => item !== skill)
  }
  return [...normalized, skill]
}

const sortJobsByMatch = (jobs, userSkills) => {
  const applicantSkills = normalizeSkills(userSkills)
  return jobs
    .map((job) => {
      const jobSkills = normalizeSkills(job.skills)
      const matchCount = applicantSkills.filter((skill) => jobSkills.includes(skill)).length
      return { job, matchCount }
    })
    .sort((a, b) => b.matchCount - a.matchCount || new Date(b.job.createdAt) - new Date(a.job.createdAt))
    .map(({ job }) => job)
}

const [authView, setAuthView] = useState("login")
  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  })
  const [employerRequestForm, setEmployerRequestForm] = useState({
    email: "",
    password: "",
    companyName: "",
    contactName: "",
    location: "",
    phone: "",
    message: "",
  })
  const [requirementsFile, setRequirementsFile] = useState(null)
  const [employerRequests, setEmployerRequests] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [jobForm, setJobForm] = useState({
    title: "",
    company: "",
    location: "",
    description: "",
    requirements: "",
    salary: "",
    skills: [],
  })
  const [availableJobs, setAvailableJobs] = useState([])
  const [appliedJobs, setAppliedJobs] = useState([])
  const [pendingJobs, setPendingJobs] = useState([])
  const [notifications, setNotifications] = useState([])
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
  const [jobLoading, setJobLoading] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedNotification, setSelectedNotification] = useState(null)
  const [referralPrefill, setReferralPrefill] = useState({ jobId: '', applicantIds: [] })
  const [appMessage, setAppMessage] = useState(null)
  const [declineRequestTarget, setDeclineRequestTarget] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [approveRequestTarget, setApproveRequestTarget] = useState(null)
  const [selectedDirectoryUser, setSelectedDirectoryUser] = useState(null)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [showSkillPrompt, setShowSkillPrompt] = useState(false)

  const applicantProfileInitials = (profileData.name || currentUser?.email || 'Applicant')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'A'

  const saveProfile = (nextProfile) => {
    const token = currentUser?.token || localStorage.getItem('peso-token')
    if (!token) return Promise.resolve({ ok: false })

    return fetch('http://localhost:4000/api/profile', {
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

  const fetchEmployerRequests = () => {
    const token = getToken()
    if (!token) return

    fetch('http://localhost:4000/api/employer-requests', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setEmployerRequests(Array.isArray(data) ? data : []))
      .catch(() => setEmployerRequests([]))
  }

  const fetchNotifications = () => {
    const token = getToken()
    if (!token) return

    fetch('http://localhost:4000/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => setNotifications([]))
  }

  const fetchJobs = () => {
    const token = getToken()
    if (!token) return

    const headers = { Authorization: `Bearer ${token}` }
    if (activeRole === "Applicant") {
      setJobLoading(true)
      const approvedRequest = fetch('http://localhost:4000/api/jobs?status=approved', { headers })
        .then((r) => r.json())
        .then((data) => setAvailableJobs(Array.isArray(data) ? sortJobsByMatch(data, profileData.skills) : []))
        .catch(() => setAvailableJobs([]))

      const appliedRequest = fetch('http://localhost:4000/api/jobs?status=applied', { headers })
        .then((r) => r.json())
        .then((data) => setAppliedJobs(Array.isArray(data) ? data : []))
        .catch(() => setAppliedJobs([]))

      Promise.all([approvedRequest, appliedRequest]).finally(() => setJobLoading(false))
      return
    }

    if (activeRole === "Employer") {
      setJobLoading(true)
      fetch('http://localhost:4000/api/jobs?status=mine', { headers })
        .then((r) => r.json())
        .then((data) => {
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
      const pendingRequest = fetch('http://localhost:4000/api/jobs?status=pending', { headers })
        .then((r) => r.json())
        .then((data) => setPendingJobs(Array.isArray(data) ? data : []))
        .catch(() => setPendingJobs([]))

      const approvedRequest = fetch('http://localhost:4000/api/jobs?status=approved', { headers })
        .then((r) => r.json())
        .then((data) => setApprovedJobs(Array.isArray(data) ? data : []))
        .catch(() => setApprovedJobs([]))

      const declinedRequest = fetch('http://localhost:4000/api/jobs?status=declined', { headers })
        .then((r) => r.json())
        .then((data) => setDeclinedJobs(Array.isArray(data) ? data : []))
        .catch(() => setDeclinedJobs([]))

      Promise.all([pendingRequest, approvedRequest, declinedRequest]).finally(() => setJobLoading(false))
      fetchEmployerRequests()
      fetchAdminReferrals()
    }
  }

  const fetchAdminUsers = () => {
    const token = getToken()
    if (!token) return
    fetch('http://localhost:4000/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setAdminUsers(Array.isArray(data) ? data : []))
      .catch(() => setAdminUsers([]))
  }

  const fetchAdminReferrals = () => {
    const token = getToken()
    if (!token) return

    fetch('http://localhost:4000/api/referrals/admin', { headers: { Authorization: `Bearer ${token}` } })
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

  const handleCreateJob = (event) => {
    event.preventDefault()
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const { title, company, description, skills } = jobForm
    if (!title || !company || !description) return alert('Title, company, and description are required')
    if (!Array.isArray(skills) || skills.length === 0) return alert('Please select at least one skill for the job')

    fetch('http://localhost:4000/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(jobForm),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        setJobForm({ title: '', company: '', location: '', description: '', requirements: '', salary: '', skills: [] })
        fetchJobs()
        fetchNotifications()
        alert('Job request submitted for review')
      })
      .catch((err) => {
        console.error(err)
        alert('Failed to submit job request')
      })
  }

  const handleReviewJob = (jobId, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    if (status === 'declined' && !window.confirm('Decline this job posting?')) return

    fetch(`http://localhost:4000/api/jobs/${jobId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        fetchJobs()
        fetchNotifications()
        setSelectedNotification(null)
        alert(`Job ${status}`)
      })
      .catch((err) => {
        console.error(err)
        alert('Failed to update job status')
      })
  }

  const handleApplyJob = (jobId) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')

    fetch(`http://localhost:4000/api/jobs/${jobId}/apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        fetchJobs()
        alert('Application submitted')
      })
      .catch((err) => {
        console.error(err)
        alert('Failed to apply')
      })
  }

  const handleSubmitEmployerRequest = async (event) => {
    event.preventDefault()
    const { email, password, companyName, contactName } = employerRequestForm
    if (!email || !password || !companyName || !contactName) return alert('Please fill in required fields')

    try {
      const response = await fetch('http://localhost:4000/api/employer-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employerRequestForm),
      })

      const contentType = response.headers.get('content-type') || ''
      const data = contentType.includes('application/json') ? await response.json() : null

      if (!response.ok) {
        const message = data?.error || `Request failed: ${response.status} ${response.statusText}`
        return alert(message)
      }

      setEmployerRequestForm({ email: '', password: '', companyName: '', contactName: '', location: '', phone: '', message: '' })
      setAuthView('login')
      alert('Employer account created. You can now sign in and submit your NSRP registration form for review.')
    } catch (err) {
      console.error('Employer request submit failed:', err)
      alert(err?.message || 'Failed to submit employer request')
    }
  }

  const handleSubmitEmployerRequirements = async (event) => {
    event.preventDefault()
    const token = getToken()
    if (!token || !requirementsFile) return alert('Select the NSRP registration PDF first')

    const payload = new FormData()
    payload.append('requirements', requirementsFile)
    try {
      const response = await fetch('http://localhost:4000/api/employer-requirements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) return alert(data?.error || 'Failed to submit requirements')
      setRequirementsFile(null)
      alert('NSRP registration form submitted for admin review.')
      const profileResponse = await fetch('http://localhost:4000/api/profile', { headers: { Authorization: `Bearer ${token}` } })
      const profile = await profileResponse.json().catch(() => null)
      if (profile && !profile.error) setCurrentUser((current) => ({ ...current, verificationStatus: profile.verificationStatus, verificationReason: profile.verificationReason }))
      fetchEmployerRequests()
    } catch (err) {
      alert(err?.message || 'Failed to submit requirements')
    }
  }

  const handleReviewEmployerRequest = (requestId, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')

    fetch(`http://localhost:4000/api/employer-requests/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason: status === 'declined' ? declineReason.trim() : '' }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setAppMessage({ type: 'error', text: data.error })
        fetchEmployerRequests()
        fetchNotifications()
        setDeclineRequestTarget(null)
        setDeclineReason('')
        setAppMessage({ type: 'success', text: `Employer request ${status}.` })
      })
      .catch((err) => {
        console.error(err)
        setAppMessage({ type: 'error', text: err?.message || 'Failed to update employer request' })
      })
  }

  const handleDownloadRequirements = async (requestId, filename) => {
    const token = getToken()
    if (!token) return
    const response = await fetch(`http://localhost:4000/api/employer-requirements/${requestId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return alert('Requirements PDF could not be downloaded')
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename || 'nsrp-registration-form.pdf'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleViewRequirements = async (requestId) => {
    const token = getToken()
    if (!token) return
    const preview = window.open('', '_blank')
    const response = await fetch(`http://localhost:4000/api/employer-requirements/${requestId}/view`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      preview?.close()
      return alert('Requirements PDF could not be opened')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    if (preview) preview.location.href = url
    else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleViewOwnRequirements = async () => {
    const token = getToken()
    if (!token) return
    const preview = window.open('', '_blank')
    const response = await fetch('http://localhost:4000/api/employer-requirements/current/view', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      preview?.close()
      return alert('Your submitted PDF could not be opened')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    if (preview) preview.location.href = url
    else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

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
    const applicantName = applicant.profile?.name || applicant.email
    if (!window.confirm(`${isReferred ? 'Cancel referral for' : 'Refer'} ${applicantName}${isReferred ? '?' : ' to this job?'}`)) return

    try {
      const response = await fetch('http://localhost:4000/api/referrals', {
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

  const isNewApplicationNotification = (notification) =>
    notification?.type === 'new_application' || notification?.kind === 'new_application'

  const markNotificationAsRead = async (notificationId) => {
    const token = getToken()
    if (!token || !notificationId) return

    try {
      const response = await fetch(`http://localhost:4000/api/notifications/${notificationId}/read`, {
        method: 'PUT',
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

  const handleNotificationClick = async (notification) => {
    if (activeRole === 'Admin' && isNewApplicationNotification(notification)) {
      const notificationId = String(notification?._id || '')
      if (notificationId && !notificationId.startsWith('job-')) {
        await markNotificationAsRead(notificationId)
      }

      setNotifications((current) =>
        current.map((item) =>
          String(item._id) === String(notification._id) ? { ...item, read: true } : item,
        ),
      )

      setReferralPrefill({
        jobId: notification?.jobId ? String(notification.jobId) : '',
        applicantIds: notification?.applicantId ? [String(notification.applicantId)] : [],
      })
      setSelectedNotification(null)
      setActiveView('peso-referrals')
      return
    }

    setSelectedNotification(notification)
  }

  useEffect(() => {
    if (isLoggedIn) {
      fetchJobs()
      fetchNotifications()
    }
    if (isLoggedIn && activeRole === 'Employer' && currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved' && !['dashboard', 'profile'].includes(activeView)) {
      setActiveView('dashboard')
    }
    if (isLoggedIn && activeRole === 'Admin' && ['records', 'employers', 'applicants', 'requests', 'jobs', 'peso-referrals'].includes(activeView)) fetchAdminUsers()
  }, [isLoggedIn, activeRole, activeView, currentUser?.verificationStatus, profileData.skills])

  useEffect(() => {
    if (isLoggedIn) {
      fetchNotifications()
    }
  }, [isLoggedIn, currentUser?.email])

  useEffect(() => {
    const token = localStorage.getItem('peso-token')
    if (!token) return

    fetch('http://localhost:4000/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          localStorage.removeItem('peso-token')
          return
        }
        const norm = normalizeProfile({ profile: data.profile }, data.role)
        setCurrentUser({ id: data.id, email: data.email, role: data.role, profile: data.profile, verificationStatus: data.verificationStatus, verificationReason: data.verificationReason, token })
        setActiveRole(data.role)
        setIsLoggedIn(true)
        setProfileData(norm)
      })
      .catch(() => {
        localStorage.removeItem('peso-token')
      })
  }, [])

  useEffect(() => {
    if (!isLoggedIn || activeRole !== 'Employer') return undefined

    const refreshEmployerVerification = () => {
      const token = getToken()
      if (!token) return
      fetch('http://localhost:4000/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) return
          setCurrentUser((current) => ({
            ...current,
            verificationStatus: data.verificationStatus,
            verificationReason: data.verificationReason,
            requirementsFile: data.requirementsFile,
          }))
        })
        .catch(() => {})
    }

    refreshEmployerVerification()
    const intervalId = window.setInterval(refreshEmployerVerification, 5000)
    return () => window.clearInterval(intervalId)
  }, [isLoggedIn, activeRole])

  const handleLogin = (event) => {
    event.preventDefault()
    // call backend login
    fetch('http://localhost:4000/api/login', {
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
        setActiveView(data.user.role === 'Employer' && data.user.verificationStatus !== 'approved' ? 'dashboard' : navigationByRole[data.user.role]?.[0]?.id || "dashboard")
        setIsLoggedIn(true)
        setProfileData(normalizeProfile(data.user, data.user.role))
      })
      .catch((err) => {
        console.error(err)
        alert('Login failed')
      })
  }

  const handleSignup = (event) => {
    event.preventDefault()
    if (signupForm.password !== signupForm.confirmPassword) {
      alert('Passwords do not match')
      return
    }
    // Call backend signup
    fetch('http://localhost:4000/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: signupForm.email,
        password: signupForm.password,
        name: signupForm.name,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        if (data.token) localStorage.setItem('peso-token', data.token)
        const applicantProfile = normalizeProfile(data.user, data.user.role || 'Applicant')
        setCurrentUser({ ...data.user, token: data.token, role: 'Applicant' })
        setActiveRole('Applicant')
        setActiveView('profile')
        setIsLoggedIn(true)
        setProfileData(applicantProfile)
        setShowSkillPrompt(true)
        setAuthView("login")
      })
      .catch((err) => {
        console.error(err)
        alert('Signup failed')
      })
  }

  const handleLogout = () => {
    localStorage.removeItem("peso-portal-remembered-email")
    localStorage.removeItem('peso-token')
    setCurrentUser(null)
    setIsLoggedIn(false)
    setFormData({ email: "", password: "" })
    setRememberMe(false)
    setShowPassword(false)
    setActiveRole("Applicant")
    setActiveView("dashboard")
  }

  const normalizedSearchTerm = jobSearchTerm.trim().toLowerCase()
  const locationFilterOptions = Array.from(
    new Set(
      availableJobs
        .map((job) => (job.location || '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const filteredApplicantJobs = availableJobs.filter((job) => {
    const normalizedSkills = normalizeSkills(job.skills)
    const locationValue = (job.location || '').trim()
    const matchesSearch =
      !normalizedSearchTerm ||
      [job.title, job.company, job.description, job.requirements]
        .filter((value) => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(normalizedSearchTerm))
    const matchesSkill = jobSkillFilter === 'all' || normalizedSkills.includes(jobSkillFilter)
    const matchesLocation = jobLocationFilter === 'all' || locationValue === jobLocationFilter
    return matchesSearch && matchesSkill && matchesLocation
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
  const showPendingAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'pending')
  const showApprovedAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'approved')
  const showDeclinedAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'declined')

  const appliedJobIds = new Set(appliedJobs.map((job) => String(job._id)))
  const selectedJobIsApplied = Boolean(selectedJob && (appliedJobIds.has(String(selectedJob._id)) || (selectedJob.applicants || []).some((applicant) => applicant.email === currentUser?.email)))
  const selectedNotificationId = selectedNotification?._id ? String(selectedNotification._id) : ''
  const selectedNotificationJobId = selectedNotification?.jobId || (selectedNotificationId.startsWith('job-pending-') ? selectedNotificationId.replace('job-pending-', '') : null)
  const selectedNotificationIsPending = selectedNotification?.status === 'pending' || (selectedNotification?.title || '').toLowerCase().includes('pending')
  const accountNeedsVerification = Boolean(
    currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved',
  ) || (
    currentUser?.role === 'Applicant' &&
    currentUser?.email?.toLowerCase() === 'third@gmail.com' &&
    currentUser?.verificationStatus !== 'approved'
  )

  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo" aria-label="Public Employment Service Office">
            <img
              src="/peso-logo.png"
              alt="Public Employment Service Office logo"
              onError={(event) => { event.currentTarget.style.display = 'none' }}
            />
          </div>
          <div className="auth-heading">
            <h1>{authView === "signup" ? "Sign Up" : "Welcome back"}</h1>
            <p>Enter your PESO account credentials to continue.</p>
          </div>
          {authView === "login" ? (
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
            <form className="auth-form auth-detail-form" onSubmit={handleSubmitEmployerRequest}>
              <div>
                <label htmlFor="employer-email" className="block text-sm font-medium text-slate-200">
                  Email
                </label>
                <input
                  id="employer-email"
                  type="email"
                  value={employerRequestForm.email}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, email: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="employer-password" className="block text-sm font-medium text-slate-200">
                  Password
                </label>
                <input
                  id="employer-password"
                  type="password"
                  value={employerRequestForm.password}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, password: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="employer-company" className="block text-sm font-medium text-slate-200">
                  Company Name
                </label>
                <input
                  id="employer-company"
                  type="text"
                  value={employerRequestForm.companyName}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, companyName: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="employer-contact" className="block text-sm font-medium text-slate-200">
                  Contact Name
                </label>
                <input
                  id="employer-contact"
                  type="text"
                  value={employerRequestForm.contactName}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, contactName: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="employer-location" className="block text-sm font-medium text-slate-200">
                  Location
                </label>
                <input
                  id="employer-location"
                  type="text"
                  value={employerRequestForm.location}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, location: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="employer-phone" className="block text-sm font-medium text-slate-200">
                  Phone
                </label>
                <input
                  id="employer-phone"
                  type="text"
                  value={employerRequestForm.phone}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, phone: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="employer-message" className="block text-sm font-medium text-slate-200">
                  Message
                </label>
                <textarea
                  id="employer-message"
                  rows="3"
                  value={employerRequestForm.message}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, message: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  placeholder="Tell us about your company or hiring needs."
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="auth-primary-button auth-account-submit">
                  Create employer account
                </button>
                <button
                  type="button"
                  onClick={() => setAuthView("login")}
                  className="auth-secondary-button"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form className="auth-form auth-detail-form applicant-signup-form" onSubmit={handleSignup}>
              <div>
                <label htmlFor="signup-name" className="block text-sm font-medium text-slate-200">
                  Name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  value={signupForm.name}
                  onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
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
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-slate-200">
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  value={signupForm.password}
                  onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-slate-200">
                  Confirm password
                </label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  value={signupForm.confirmPassword}
                  onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="auth-primary-button auth-account-submit">
                  Create account
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
  const employerApproved = activeRole !== 'Employer' || !currentUser?.verificationStatus || currentUser.verificationStatus === 'approved'
  const portalNavItems = navItems.filter((item) => item.id !== "profile" && (activeRole !== 'Employer' || employerApproved || ['dashboard', 'profile'].includes(item.id)))
  const showProfileTab = ["Applicant", "Employer"].includes(activeRole)

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
            {showProfileTab && (
              <button
                type="button"
                onClick={() => setActiveView("profile")}
                className={`portal-profile-button inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === "profile" ? "bg-cyan-500 text-slate-950" : "text-slate-200"
                }`}
              >
                <span className="portal-profile-icon inline-flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-lg text-slate-950">
                  👤
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
          {accountNeedsVerification && (
            <div className="portal-verification-notice" role="status">
              <div>
                <strong>Account is unverified</strong>
                <span>Verification is required before all account features become available.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVerificationEmail(currentUser?.email || '')
                  setShowVerificationModal(true)
                }}
                className="portal-verify-button"
              >
                Verify now
              </button>
            </div>
          )}

          {showVerificationModal && (
            <div
              className="portal-verification-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="verify-email-title"
              onClick={() => setShowVerificationModal(false)}
            >
              <form
                className="portal-verification-modal"
                onSubmit={(event) => {
                  event.preventDefault()
                  setCurrentUser((current) => ({ ...current, verificationStatus: 'approved' }))
                  setShowVerificationModal(false)
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="verify-email-title">Verify your email</h2>
                <p>Enter your email address to continue verification.</p>
                <label htmlFor="verification-email">Email address</label>
                <input
                  id="verification-email"
                  type="email"
                  value={verificationEmail}
                  onChange={(event) => setVerificationEmail(event.target.value)}
                  required
                />
                <label htmlFor="verification-code">Verification code</label>
                <input
                  id="verification-code"
                  type="text"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                />
                <div className="portal-verification-actions">
                  <button type="submit" className="portal-verify-submit">Verify email</button>
                  <button type="button" onClick={() => setShowVerificationModal(false)} className="portal-verify-cancel">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {currentUser?.role === "Admin" && (
          <section className="portal-card access-card">
            <h2 className="text-xl font-semibold text-black">Access Control</h2>
            <p className="mt-2 text-sm text-black">Admin can switch the portal role instantly.</p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-[220px]">
                <label htmlFor="admin-role" className="block text-sm font-medium text-black">
                  Selected role
                </label>
                <select
                  id="admin-role"
                  value={adminSelectedRole}
                  onChange={(event) => setAdminSelectedRole(event.target.value)}
                  className="portal-control"
                >
                  <option value="Admin">Admin</option>
                  <option value="Employer">Employer</option>
                  <option value="Applicant">Applicant</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveRole(adminSelectedRole)
                  const nextItems = navigationByRole[adminSelectedRole] || []
                  setActiveView(nextItems[0]?.id || "dashboard")
                }}
                className="portal-primary-button"
              >
                Apply Role
              </button>
            </div>
            <p className="mt-4 text-sm text-black">Current portal role: {activeRole}</p>
          </section>
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
          {activeView === "dashboard" && (
            <section className="admin-requests-card portal-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">Dashboard</h2>
              {activeRole === 'Employer' && !employerApproved ? (
                <div className="mt-4 rounded-2xl border border-amber-400/40 bg-slate-950/80 p-5">
                  <h3 className="text-lg font-semibold text-white">Employer verification</h3>
                  <p className="mt-2 text-sm text-slate-300">
                    Your account is active, but employer tools stay locked until the admin approves your NSRP registration form.
                  </p>
                  <p className="mt-3 text-sm text-amber-300">Status: {currentUser.verificationStatus.replace('_', ' ')}</p>
                  {currentUser.verificationStatus === 'declined' && (
                    <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-950/30 p-3">
                      <p className="text-sm font-semibold text-rose-300">Admin review message</p>
                      <p className="mt-1 text-sm text-slate-200">{currentUser.verificationReason || 'Please submit a corrected NSRP registration form for another review.'}</p>
                    </div>
                  )}
                  {currentUser.requirementsFile && (
                    <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-3">
                      <p className="text-sm font-semibold text-white">Submitted PDF</p>
                      <p className="mt-1 text-xs text-slate-400">{currentUser.requirementsFile.originalName}</p>
                      <button
                        type="button"
                        onClick={handleViewOwnRequirements}
                        className="mt-3 rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                      >
                        View submitted PDF
                      </button>
                    </div>
                  )}
                  {currentUser.verificationStatus === 'under_review' ? (
                    <p className="mt-5 text-sm text-amber-300">Your PDF is waiting for admin review. You cannot submit another file until this review is complete.</p>
                  ) : (
                    <form className="mt-5 space-y-3" onSubmit={handleSubmitEmployerRequirements}>
                      <label htmlFor="requirements-pdf" className="block text-sm font-medium text-slate-200">
                        {currentUser.verificationStatus === 'declined' ? 'Submit a corrected NSRP registration form (PDF, max 10 MB)' : 'NSRP registration form (PDF, max 10 MB)'}
                      </label>
                      <input
                        id="requirements-pdf"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => setRequirementsFile(event.target.files?.[0] || null)}
                        className="block w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                      <button type="submit" className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
                        Submit for review
                      </button>
                    </form>
                  )}
                </div>
              ) : activeRole === 'Employer' ? (
                <>
                  <p className="mt-3 text-black">Employer dashboard — quick overview of your postings.</p>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-300 bg-white p-4">
                      <p className="text-sm text-black">My job requests</p>
                      <p className="mt-2 text-2xl font-semibold text-black">{myJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-white p-4">
                      <p className="text-sm text-black">Pending approvals</p>
                      <p className="mt-2 text-2xl font-semibold text-black">{pendingJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-white p-4">
                      <p className="text-sm text-black">Total applicants</p>
                      <p className="mt-2 text-2xl font-semibold text-black">{myJobs.reduce((acc, j) => acc + (j.applicants ? j.applicants.length : 0), 0)}</p>
                    </div>
                  </div>

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
                          <article key={job._id} className="employer-dashboard-posting">
                            <div>
                              <h4>{job.title}</h4>
                              <p>{job.company} · {job.location || 'Remote'}</p>
                              <p>Salary: {job.salary || 'Not specified'}</p>
                              <p>Skills: {Array.isArray(job.skills) ? job.skills.join(', ') : job.skills || 'None specified'}</p>
                            </div>
                            <span>{job.applicants?.length || 0} applicant{job.applicants?.length === 1 ? '' : 's'}</span>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveView('employer')}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Manage Postings
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('jobs')}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      Job Request
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-slate-400">Welcome to the portal dashboard.</p>
              )}


            </section>
          )}

                {["employers", "applicants"].includes(activeView) && activeRole === "Admin" && (
                  <section className="portal-card directory-card">
                    <h2 className="text-xl font-semibold text-white">{activeView === "employers" ? "Employers" : "Applicants"}</h2>
                    <p className="mt-2 text-sm text-slate-400">Review employer approval status and applicant contact information.</p>

                    {activeView === 'employers' && (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                        <input
                          type="search"
                          value={adminEmployerSearchTerm}
                          onChange={(event) => setAdminEmployerSearchTerm(event.target.value)}
                          placeholder="Search company, email, contact, phone, or status"
                          aria-label="Search employers"
                          className="portal-control w-full"
                        />
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
                      </div>
                    )}

                    <div className="portal-directory-wrap">
                      {[
                        { role: 'Employer', title: 'Employers', view: 'employers' },
                        { role: 'Applicant', title: 'Applicants', view: 'applicants' },
                      ].filter((directory) => directory.view === activeView).map((directory) => {
                        const normalizedEmployerSearch = adminEmployerSearchTerm.trim().toLowerCase()
                        const users = adminUsers
                          .filter((user) => user.role === directory.role)
                          .filter((user) => {
                            if (directory.role !== 'Employer' || !normalizedEmployerSearch) return true
                            return [user.companyName, user.email, user.contactName, user.phone, user.approvalStatus]
                              .filter((value) => typeof value === 'string')
                              .some((value) => value.toLowerCase().includes(normalizedEmployerSearch))
                          })
                              .filter((user) => directory.role !== 'Employer' || adminEmployerStatusFilter === 'all' || user.approvalStatus === adminEmployerStatusFilter)
                          .sort((userA, userB) => {
                            if (directory.role !== 'Employer') return 0
                            const pendingA = ['pending', 'under_review'].includes(userA.approvalStatus)
                            const pendingB = ['pending', 'under_review'].includes(userB.approvalStatus)
                            return Number(pendingB) - Number(pendingA)
                          })
                        return (
                          <div key={directory.role}>
                            <h3 className="portal-section-title">{directory.title}</h3>
                            {users.length === 0 ? (
                              <p className="portal-empty">No {directory.title.toLowerCase()} found.</p>
                            ) : (
                              <div className="portal-table-scroll">
                                <table className={`portal-table ${directory.role === 'Employer' ? 'portal-employers-table' : ''}`}>
                                  <thead>
                                    <tr>
                                      <th>{directory.role === 'Employer' ? 'Company' : 'Name'}</th>
                                      <th>Email</th>
                                      <th>{directory.role === 'Employer' ? 'Contact' : 'Location'}</th>
                                      <th>{directory.role === 'Employer' ? 'Phone' : 'Skills'}</th>
                                      {directory.role === 'Employer' && <th>Status</th>}
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {users.map((user) => (
                                      <tr key={user.id}>
                                        <td><strong>{directory.role === 'Employer' ? user.companyName || 'Unnamed employer' : user.profile?.name || 'Unnamed applicant'}</strong></td>
                                        <td>{user.email}</td>
                                        <td>{directory.role === 'Employer' ? user.contactName || 'N/A' : user.profile?.location || 'N/A'}</td>
                                        <td>{directory.role === 'Employer' ? user.phone || 'N/A' : Array.isArray(user.profile?.skills) ? user.profile.skills.join(', ') : user.profile?.skills || 'N/A'}</td>
                                        {directory.role === 'Employer' && <td><span className={`portal-status status-${user.approvalStatus || 'pending'}`}>{user.approvalStatus || 'pending'}</span></td>}
                                        <td>
                                          <button type="button" className="portal-table-action" onClick={() => setSelectedDirectoryUser({ ...user, directoryRole: directory.role })}>View</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

          {activeView === "profile" && (
            <section className={`${activeRole === 'Employer' ? 'employer-profile-card portal-card' : activeRole === 'Applicant' ? 'applicant-profile-card portal-card' : ''} rounded-2xl border border-slate-800 bg-slate-900/70 p-6`}>
              {activeRole === 'Applicant' ? (
                <>
                  <h2 className="text-xl font-semibold text-white">Applicant Profile</h2>
                  <p className="mt-3 text-slate-400">Update your traits and personal information.</p>

                  <div className="applicant-profile-summary mt-6 rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
                    <div className="flex items-center gap-4">
                      <div className="applicant-profile-avatar flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500 text-lg font-bold text-slate-950">
                        {applicantProfileInitials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xl font-semibold text-white">{profileData.name || 'Your name'}</p>
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
                      <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                        Full Name
                      </label>
                      <input
                        id="name"
                        type="text"
                        value={profileData.name}
                        onChange={(event) => setProfileData({ ...profileData, name: event.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="summary" className="block text-sm font-medium text-slate-300">
                        About me
                      </label>
                      <textarea
                        id="summary"
                        rows="4"
                        value={profileData.summary}
                        onChange={(event) => setProfileData({ ...profileData, summary: event.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
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
                        onChange={(event) => setProfileData({ ...profileData, location: event.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
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
                        onChange={(event) => setProfileData({ ...profileData, traits: event.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                        placeholder="e.g. reliable, detail-oriented, team player"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Skills</label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {availableSkills.map((skill) => (
                          <label
                            key={skill}
                            className="applicant-profile-skill-option flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                          >
                            <input
                              type="checkbox"
                              checked={profileData.skills.includes(skill)}
                              onChange={() => setProfileData({ ...profileData, skills: toggleSkill(profileData.skills, skill) })}
                              className="applicant-profile-skill-checkbox h-4 w-4 rounded border-slate-600 bg-slate-800"
                            />
                            {skill}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        saveProfile(profileData).then((result) => {
                          if (result.ok) alert('Profile saved!')
                        })
                      }}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Save Profile
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-white">Employer Profile</h2>
                  <p className="mt-3 text-slate-400">Update your company details and contact information.</p>
                  <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
                    <div>
                      <label htmlFor="companyName" className="block text-sm font-medium text-slate-300">Company Name</label>
                      <input
                        id="companyName"
                        type="text"
                        value={profileData.companyName}
                        onChange={(e) => setProfileData({ ...profileData, companyName: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="contactName" className="block text-sm font-medium text-slate-300">Contact Name</label>
                      <input
                        id="contactName"
                        type="text"
                        value={profileData.contactName}
                        onChange={(e) => setProfileData({ ...profileData, contactName: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="location" className="block text-sm font-medium text-slate-300">Location</label>
                      <input
                        id="location"
                        type="text"
                        value={profileData.location}
                        onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-slate-300">Phone</label>
                      <input
                        id="phone"
                        type="text"
                        value={profileData.phone}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="website" className="block text-sm font-medium text-slate-300">Website</label>
                      <input
                        id="website"
                        type="text"
                        value={profileData.website}
                        onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="summary" className="block text-sm font-medium text-slate-300">Company Summary</label>
                      <textarea
                        id="summary"
                        rows="4"
                        value={profileData.summary}
                        onChange={(event) => setProfileData({ ...profileData, summary: event.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                        placeholder="Brief description of company or services"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const token = currentUser?.token || localStorage.getItem('peso-token')
                        fetch('http://localhost:4000/api/profile', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ profile: profileData }),
                        })
                          .then((r) => r.json())
                          .then((data) => {
                            if (data.error) return alert(data.error)
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
                  </form>
                </>
              )}
            </section>
          )}

          {activeView === "employer" && (
            <section className="employer-module-card portal-card rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Employer Module</h2>
              <p className="mt-3 text-slate-400">Submit job requests and track pending approvals.</p>

              <div className="employer-form-panel mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                <h3 className="text-lg font-semibold text-white">Request a Job Posting</h3>
                <form className="space-y-4 mt-4" onSubmit={handleCreateJob}>
                  <div>
                    <label htmlFor="job-title" className="block text-sm font-medium text-slate-200">
                      Job title
                    </label>
                    <input
                      id="job-title"
                      value={jobForm.title}
                      onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="e.g. Customer Service Specialist"
                    />
                  </div>
                  <div>
                    <label htmlFor="job-company" className="block text-sm font-medium text-slate-200">
                      Company
                    </label>
                    <input
                      id="job-company"
                      value={jobForm.company}
                      onChange={(e) => setJobForm({ ...jobForm, company: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="e.g. PESO Services"
                    />
                  </div>
                  <div>
                    <label htmlFor="job-location" className="block text-sm font-medium text-slate-200">
                      Location
                    </label>
                    <input
                      id="job-location"
                      value={jobForm.location}
                      onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="e.g. Manila"
                    />
                  </div>
                  <div>
                    <label htmlFor="job-description" className="block text-sm font-medium text-slate-200">
                      Description
                    </label>
                    <textarea
                      id="job-description"
                      rows="3"
                      value={jobForm.description}
                      onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="Describe the responsibilities and role."
                    />
                  </div>
                  <div>
                    <label htmlFor="job-requirements" className="block text-sm font-medium text-slate-200">
                      Requirements
                    </label>
                    <textarea
                      id="job-requirements"
                      rows="2"
                      value={jobForm.requirements}
                      onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="Describe the qualifications and expectations."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-200">Required Skills</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {availableSkills.map((skill) => (
                        <label
                          key={skill}
                          className="employer-skill-option flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={jobForm.skills.includes(skill)}
                            onChange={() => setJobForm({ ...jobForm, skills: toggleSkill(jobForm.skills, skill) })}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                          />
                          {skill}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="job-salary" className="block text-sm font-medium text-slate-200">
                      Salary
                    </label>
                    <input
                      id="job-salary"
                      value={jobForm.salary}
                      onChange={(e) => setJobForm({ ...jobForm, salary: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="e.g. PHP 25,000 - PHP 30,000"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Submit Job Request
                  </button>
                </form>
              </div>

              <div className="employer-pending-panel mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                <h3 className="text-lg font-semibold text-white">Pending Job Requests for Approval</h3>
                {pendingJobs.length === 0 ? (
                  <p className="mt-3 text-slate-400">No pending job requests right now.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {pendingJobs.map((job) => (
                      <div key={job._id} className="employer-pending-item rounded-2xl border border-slate-700 bg-slate-900 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-lg font-semibold text-white">{job.title}</p>
                            <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                          </div>
                          <span className="rounded-full bg-amber-400 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-950">
                            Pending
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">{job.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeView === "applications" && activeRole === "Applicant" && (
            <section className="applicant-applications-card portal-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">My Applications</h2>
              <p className="mt-3 text-black">Jobs you applied to and their current posting status.</p>

              {appliedJobs.length === 0 ? (
                <p className="mt-6 text-black">You have not applied to any job offers yet.</p>
              ) : (
                <div className="mt-6 space-y-3">
                  {appliedJobs.map((job) => {
                    const myApplication = (job.applicants || []).find((applicant) => applicant.email === currentUser?.email)
                    return (
                      <div key={`applied-${job._id}`} className="applicant-application-item rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
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
              locationFilterOptions={locationFilterOptions}
              filteredApplicantJobs={filteredApplicantJobs}
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
              showPendingAdminSection={showPendingAdminSection}
              showApprovedAdminSection={showApprovedAdminSection}
              filteredApprovedJobs={filteredApprovedJobs}
              showDeclinedAdminSection={showDeclinedAdminSection}
              filteredDeclinedJobs={filteredDeclinedJobs}
              adminUsers={adminUsers}
              referredApplicantIdsByJob={referredApplicantIdsByJob}
              handleReferApplicantFromJob={handleReferApplicantFromJob}
            />
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
                  <p className="mt-6 text-sm text-black">Click a notification to enlarge and view full details.</p>
                  <div className="mt-3 space-y-3">
                    {notifications.map((notification) => (
                      <button
                        key={notification._id}
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className={`${activeRole === 'Employer' ? 'employer-notification-item' : ''} w-full rounded-2xl border bg-white p-4 text-left ${isNewApplicationNotification(notification) && !notification.read ? 'border-cyan-500/50' : 'border-slate-300'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-black">{notification.title}</p>
                            <p className="mt-2 line-clamp-2 text-sm text-black">{notification.message}</p>
                            {activeRole === 'Admin' && isNewApplicationNotification(notification) && (
                              <>
                                <p className="mt-2 text-sm text-black">Applicant: {notification.applicantName || 'Unknown applicant'}</p>
                                <p className="mt-1 text-sm text-black">Job: {notification.jobTitle || 'Unknown job'} • Employer: {notification.employerName || 'Unknown employer'}</p>
                              </>
                            )}
                            {activeRole === 'Admin' && ((notification.actionable && notification.status === 'pending') || String(notification._id || '').startsWith('job-pending-')) && (
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Action available</p>
                            )}
                            {activeRole === 'Admin' && isNewApplicationNotification(notification) && !notification.read && (
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Unread application alert</p>
                            )}
                          </div>
                          <span className="text-xs uppercase tracking-[0.2em] text-black">
                            {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Just now'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

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

                <div className="mt-5 grid grid-cols-2 gap-2">
                  {availableSkills.map((skill) => (
                    <label
                      key={skill}
                      className="applicant-profile-skill-option flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={profileData.skills.includes(skill)}
                        onChange={() => setProfileData({ ...profileData, skills: toggleSkill(profileData.skills, skill) })}
                        className="applicant-profile-skill-checkbox h-4 w-4 rounded border-slate-400 bg-white"
                      />
                      {skill}
                    </label>
                  ))}
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

          {selectedDirectoryUser && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="directory-user-title"
              onClick={() => setSelectedDirectoryUser(null)}
            >
              <div
                className="admin-directory-modal w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="directory-user-title" className="text-lg font-semibold text-white">
                      {selectedDirectoryUser.directoryRole} details
                    </h2>
                    <p className="mt-2 text-sm text-cyan-300">{selectedDirectoryUser.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDirectoryUser(null)}
                    className="admin-modal-close rounded-2xl border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200"
                  >
                    Close
                  </button>
                </div>

                <div className="admin-modal-details mt-5 space-y-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
                  {selectedDirectoryUser.directoryRole === 'Employer' ? (
                    <>
                      <p><span className="font-semibold text-white">Company:</span> {selectedDirectoryUser.companyName || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Contact:</span> {selectedDirectoryUser.contactName || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Phone:</span> {selectedDirectoryUser.phone || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Location:</span> {selectedDirectoryUser.profile?.location || 'N/A'}</p>
                      <p><span className="font-semibold text-white">About me:</span> {selectedDirectoryUser.profile?.summary || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Status:</span> {selectedDirectoryUser.approvalStatus || 'approved'}</p>
                    </>
                  ) : (
                    <>
                      <p><span className="font-semibold text-white">Name:</span> {selectedDirectoryUser.profile?.name || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Location:</span> {selectedDirectoryUser.profile?.location || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Phone:</span> {selectedDirectoryUser.phone || selectedDirectoryUser.profile?.phone || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Skills:</span> {Array.isArray(selectedDirectoryUser.profile?.skills) ? selectedDirectoryUser.profile.skills.join(', ') : selectedDirectoryUser.profile?.skills || 'N/A'}</p>
                      <p><span className="font-semibold text-white">Traits:</span> {selectedDirectoryUser.profile?.traits || 'N/A'}</p>
                      <p><span className="font-semibold text-white">About me:</span> {selectedDirectoryUser.profile?.summary || 'N/A'}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {approveRequestTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="approve-request-title"
              onClick={() => setApproveRequestTarget(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="approve-request-title" className="text-lg font-semibold text-white">Approve employer request</h2>
                    <p className="mt-2 text-sm text-slate-400">{approveRequestTarget.companyName}</p>
                  </div>
                </div>
                <p className="mt-5 text-sm text-slate-300">Approve this employer? They will gain access to employer features.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setApproveRequestTarget(null)}
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const requestId = approveRequestTarget._id
                      setApproveRequestTarget(null)
                      handleReviewEmployerRequest(requestId, 'approved')
                    }}
                    className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Confirm approval
                  </button>
                </div>
              </div>
            </div>
          )}

          {declineRequestTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="decline-request-title"
              onClick={() => setDeclineRequestTarget(null)}
            >
              <form
                className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl"
                onSubmit={(event) => {
                  event.preventDefault()
                  const requestId = declineRequestTarget._id
                  setDeclineRequestTarget(null)
                  setDeclineReason('')
                  handleReviewEmployerRequest(requestId, 'declined')
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="decline-request-title" className="text-lg font-semibold text-white">Decline employer request</h2>
                    <p className="mt-2 text-sm text-slate-400">{declineRequestTarget.companyName}</p>
                  </div>
                </div>
                <label htmlFor="decline-reason" className="mt-5 block text-sm font-medium text-slate-200">
                  Reason for declining
                </label>
                <textarea
                  id="decline-reason"
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  rows="4"
                  required
                  placeholder="Explain what the employer needs to correct before resubmitting."
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeclineRequestTarget(null)}
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-2xl bg-rose-400 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Confirm decline
                  </button>
                </div>
              </form>
            </div>
          )}

          {selectedNotification && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setSelectedNotification(null)}
            >
              <div
                className="w-full max-w-2xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl"
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

                {activeRole === 'Admin' && selectedNotificationJobId && selectedNotificationIsPending && (
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReviewJob(selectedNotificationJobId, 'approved')}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Approve here
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewJob(selectedNotificationJobId, 'declined')}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      Decline here
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

              {employerRequests.length === 0 ? (
                <p className="mt-4 text-black">No pending employer requests.</p>
              ) : (
                <div className="mt-6 space-y-4">
                  {employerRequests.map((request) => (
                    <div key={request._id} className="admin-request-item rounded-2xl border border-slate-700 bg-slate-950/80 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{request.companyName}</p>
                          <p className="text-sm text-slate-400">Contact: {request.contactName}</p>
                          <p className="text-sm text-slate-400">Email: {request.email}</p>
                          <p className="text-sm text-slate-400">Location: {request.location || 'N/A'}</p>
                          <p className="text-sm text-slate-400">Phone: {request.phone || 'N/A'}</p>
                          <p className="mt-2 text-sm text-slate-300">{request.message || 'No additional message provided.'}</p>
                          <p className="mt-2 text-sm text-amber-300">Status: {request.status.replace('_', ' ')}</p>
                          {request.reviewReason && <p className="mt-1 text-sm text-rose-300">Previous review note: {request.reviewReason}</p>}
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
                                className="rounded-2xl border border-cyan-500/50 bg-slate-800 px-3 py-2 text-sm font-semibold text-cyan-300"
                              >
                                Download PDF
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setApproveRequestTarget(request)}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeclineRequestTarget(request)
                              setDeclineReason('')
                            }}
                            className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
