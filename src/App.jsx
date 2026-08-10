import { useEffect, useState } from "react"

const initialAccounts = [
  { email: "admin@peso.gov", password: "password123", role: "Admin" },
  { email: "employer@peso.gov", password: "password123", role: "Employer" },
  { email: "applicant@peso.gov", password: "password123", role: "Applicant" },
]

const navigationByRole = {
  Admin: [
    { id: "dashboard", label: "Dashboard" },
    { id: "records", label: "Records" },
    { id: "intake", label: "Intake Forms" },
    { id: "jobs", label: "Job Offers" },
    { id: "requests", label: "Employer Requests" },
    { id: "notify", label: "Notifications" },
  ],
  Employer: [
    { id: "dashboard", label: "Dashboard" },
    { id: "employer", label: "Employer Module" },
    { id: "jobs", label: "Post Vacancies" },
    { id: "notify", label: "Notifications" },
  ],
  Applicant: [
    { id: "dashboard", label: "My Dashboard" },
    { id: "profile", label: "Profile" },
    { id: "jobs", label: "Job Matches" },
    { id: "applications", label: "Applications" },
    { id: "match", label: "Matchmaking" },
    { id: "reputation", label: "Reputation" },
    { id: "notify", label: "Updates" },
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
    name: "",
    location: "",
    skills: [],
    traits: "",
    summary: "",
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
  const [employerRequests, setEmployerRequests] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
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
  const [myJobs, setMyJobs] = useState([])
  const [jobSearchTerm, setJobSearchTerm] = useState('')
  const [adminJobSearchTerm, setAdminJobSearchTerm] = useState('')
  const [adminJobStatusFilter, setAdminJobStatusFilter] = useState('all')
  const [jobSkillFilter, setJobSkillFilter] = useState('all')
  const [jobLocationFilter, setJobLocationFilter] = useState('all')
  const [jobLoading, setJobLoading] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedNotification, setSelectedNotification] = useState(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('peso-active-role', activeRole)
      localStorage.setItem('peso-active-view', activeView)
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
        .then((data) => setMyJobs(Array.isArray(data) ? data : []))
        .catch(() => setMyJobs([]))
        .finally(() => setJobLoading(false))

      fetch('http://localhost:4000/api/jobs?status=pending', { headers })
        .then((r) => r.json())
        .then((data) => setPendingJobs(Array.isArray(data) ? data : []))
        .catch(() => setPendingJobs([]))
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
      alert('Employer request submitted. Admin will review it.')
    } catch (err) {
      console.error('Employer request submit failed:', err)
      alert(err?.message || 'Failed to submit employer request')
    }
  }

  const handleReviewEmployerRequest = (requestId, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')

    fetch(`http://localhost:4000/api/employer-requests/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        fetchEmployerRequests()
        fetchNotifications()
        alert(`Employer request ${status}`)
      })
      .catch((err) => {
        console.error(err)
        alert('Failed to update employer request')
      })
  }

  useEffect(() => {
    if (isLoggedIn) {
      fetchJobs()
      fetchNotifications()
    }
    if (isLoggedIn && activeRole === 'Admin' && activeView === 'records') fetchAdminUsers()
  }, [isLoggedIn, activeRole, activeView, profileData.skills])

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
        setCurrentUser({ email: data.email, role: data.role, profile: data.profile, token })
        setActiveRole(data.role)
        setIsLoggedIn(true)
        setProfileData(norm)
      })
      .catch(() => {
        localStorage.removeItem('peso-token')
      })
  }, [])

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
        setActiveView('dashboard')
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
    // Call backend signup
    fetch('http://localhost:4000/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: signupForm.email,
        password: signupForm.password,
        name: signupForm.name,
        location: signupForm.location,
        skills: signupForm.skills,
        traits: signupForm.traits,
        summary: signupForm.summary,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        if (data.token) localStorage.setItem('peso-token', data.token)
        setCurrentUser({ ...data.user, token: data.token })
        setActiveRole('Applicant')
        setActiveView('dashboard')
        setIsLoggedIn(true)
        setProfileData(normalizeProfile(data.user, data.user.role || 'Applicant'))
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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-xl">
          <div className="text-center mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300">PESO Portal</p>
            <h1 className="mt-4 text-3xl font-semibold text-white">Welcome back</h1>
          </div>
          {authView === "login" ? (
            <form className="space-y-4" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-200">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-200">
                  Password
                </label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  autoComplete="current-password"
                />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={() => setRememberMe((value) => !value)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-cyan-300 hover:text-cyan-200"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <button
                type="submit"
                className="w-full rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Sign in
              </button>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setAuthView("signup")}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                >
                  Create an account (Applicant)
                </button>
                <button
                  type="button"
                  onClick={() => setAuthView("employer")}
                  className="w-full rounded-2xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  Connect with us (Employer)
                </button>
              </div>
            </form>
          ) : authView === "employer" ? (
            <form className="space-y-4" onSubmit={handleSubmitEmployerRequest}>
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
                <button type="submit" className="flex-1 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
                  Send request
                </button>
                <button
                  type="button"
                  onClick={() => setAuthView("login")}
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSignup}>
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
                <label htmlFor="signup-name" className="block text-sm font-medium text-slate-200">
                  Full name
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
                <label htmlFor="signup-location" className="block text-sm font-medium text-slate-200">
                  Location
                </label>
                <input
                  id="signup-location"
                  type="text"
                  value={signupForm.location}
                  onChange={(e) => setSignupForm({ ...signupForm, location: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200">Skills</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {availableSkills.map((skill) => (
                    <label
                      key={skill}
                      className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={signupForm.skills.includes(skill)}
                        onChange={() => setSignupForm({ ...signupForm, skills: toggleSkill(signupForm.skills, skill) })}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                      />
                      {skill}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="signup-traits" className="block text-sm font-medium text-slate-200">
                  Key traits
                </label>
                <input
                  id="signup-traits"
                  type="text"
                  value={signupForm.traits}
                  onChange={(e) => setSignupForm({ ...signupForm, traits: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="signup-summary" className="block text-sm font-medium text-slate-200">
                  Summary
                </label>
                <textarea
                  id="signup-summary"
                  rows="3"
                  value={signupForm.summary}
                  onChange={(e) => setSignupForm({ ...signupForm, summary: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  placeholder="Brief profile summary"
                />
              </div>

              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
                  Create account
                </button>
                <button
                  type="button"
                  onClick={() => setAuthView("login")}
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                >
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
  const portalNavItems = navItems.filter((item) => item.id !== "profile")
  const showProfileTab = ["Applicant", "Employer"].includes(activeRole)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">PESO Portal</p>
            <h1 className="text-2xl font-semibold text-white">Online Employment Services Platform</h1>
          </div>
          <div className="flex items-center gap-3">
            {showProfileTab && (
              <button
                type="button"
                onClick={() => setActiveView("profile")}
                className={`inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === "profile" ? "bg-cyan-500 text-slate-950" : "text-slate-200"
                }`}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-lg text-slate-950">
                  👤
                </span>
                <span>Profile</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="min-w-[240px] rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-lg shadow-slate-900/20">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">Session</p>
            <p className="mt-3 text-sm text-slate-400">Signed in as</p>
            <p className="text-lg font-semibold text-white">{currentUser?.email}</p>
            <p className="text-sm text-slate-400">Role: {activeRole}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {portalNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-medium ${
                  activeView === item.id ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {currentUser?.role === "Admin" && (
          <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold text-white">Access Control</h2>
            <p className="mt-2 text-sm text-slate-400">Admin can switch the portal role instantly.</p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-[220px]">
                <label htmlFor="admin-role" className="block text-sm font-medium text-slate-300">
                  Selected role
                </label>
                <select
                  id="admin-role"
                  value={adminSelectedRole}
                  onChange={(event) => setAdminSelectedRole(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
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
                className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Apply Role
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-400">Current portal role: {activeRole}</p>
          </section>
        )}

        <main className="space-y-6">
          {activeView === "dashboard" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Dashboard</h2>
              {activeRole === 'Employer' ? (
                <>
                  <p className="mt-3 text-slate-400">Employer dashboard — quick overview of your postings.</p>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                      <p className="text-sm text-slate-400">My job requests</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{myJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                      <p className="text-sm text-slate-400">Pending approvals</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{pendingJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                      <p className="text-sm text-slate-400">Total applicants</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{myJobs.reduce((acc, j) => acc + (j.applicants ? j.applicants.length : 0), 0)}</p>
                    </div>
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
                      className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                    >
                      Post a Vacancy
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-slate-400">Welcome to the portal dashboard.</p>
              )}

                {activeView === "records" && activeRole === "Admin" && (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                    <h2 className="text-xl font-semibold text-white">Accounts</h2>
                    <p className="mt-2 text-sm text-slate-400">List of accounts across Applicant, Employer, and Admin collections.</p>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
                        <h3 className="text-lg font-semibold text-white">Accounts</h3>
                        {adminUsers.length === 0 ? (
                          <p className="mt-3 text-slate-400">No accounts found. Click Refresh to load.</p>
                        ) : (
                          <ul className="mt-4 space-y-2">
                            {adminUsers.map((u) => (
                              <li key={u.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3">
                                <div>
                                  <p className="text-sm font-medium text-white">{u.email}</p>
                                  <p className="text-xs text-slate-400">{u.role} • {u.companyName || u.profile?.name || '—'}</p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedUser(u)}
                                    className="rounded-2xl bg-cyan-500 px-3 py-1 text-sm font-semibold text-slate-950"
                                  >
                                    View
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-4">
                          <button type="button" onClick={fetchAdminUsers} className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Refresh</button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
                        <h3 className="text-lg font-semibold text-white">Details</h3>
                        {!selectedUser ? (
                          <p className="mt-3 text-slate-400">Select an account to view details.</p>
                        ) : (
                          <div className="mt-3 text-sm text-slate-300">
                            <p><strong>Email:</strong> {selectedUser.email}</p>
                            <p><strong>Role:</strong> {selectedUser.role}</p>
                            {selectedUser.companyName && <p><strong>Company:</strong> {selectedUser.companyName}</p>}
                            {selectedUser.contactName && <p><strong>Contact:</strong> {selectedUser.contactName}</p>}
                            {selectedUser.phone && <p><strong>Phone:</strong> {selectedUser.phone}</p>}
                            {selectedUser.website && <p><strong>Website:</strong> {selectedUser.website}</p>}
                            <p className="mt-2"><strong>Profile:</strong></p>
                            <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(selectedUser.profile || {}, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}
            </section>
          )}

          {activeView === "profile" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              {activeRole === 'Applicant' ? (
                <>
                  <h2 className="text-xl font-semibold text-white">Applicant Profile</h2>
                  <p className="mt-3 text-slate-400">Update your traits and personal information.</p>
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
                      <label className="block text-sm font-medium text-slate-300">Skills</label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {availableSkills.map((skill) => (
                          <label
                            key={skill}
                            className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                          >
                            <input
                              type="checkbox"
                              checked={profileData.skills.includes(skill)}
                              onChange={() => setProfileData({ ...profileData, skills: toggleSkill(profileData.skills, skill) })}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                            />
                            {skill}
                          </label>
                        ))}
                      </div>
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
                      <label htmlFor="summary" className="block text-sm font-medium text-slate-300">
                        Summary
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
                    <button
                      type="button"
                      onClick={() => {
                        // persist profile via API (protected with JWT)
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
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Employer Module</h2>
              <p className="mt-3 text-slate-400">Request job postings and manage your vacancies.</p>

              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
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
                          className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
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

              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                <h3 className="text-lg font-semibold text-white">Your Job Postings</h3>
                {myJobs.length === 0 ? (
                  <p className="mt-3 text-slate-400">No job postings submitted yet.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {myJobs.map((job) => (
                      <div key={job._id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-lg font-semibold text-white">{job.title}</p>
                            <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                          </div>
                          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                            {job.status}
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
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">My Applications</h2>
              <p className="mt-3 text-slate-400">Jobs you applied to and their current posting status.</p>

              {appliedJobs.length === 0 ? (
                <p className="mt-6 text-slate-400">You have not applied to any job offers yet.</p>
              ) : (
                <div className="mt-6 space-y-3">
                  {appliedJobs.map((job) => {
                    const myApplication = (job.applicants || []).find((applicant) => applicant.email === currentUser?.email)
                    return (
                      <div key={`applied-${job._id}`} className="rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
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
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Job Offers</h2>
              <p className="mt-3 text-slate-400">View postings and manage approvals.</p>

              {jobLoading && <p className="mt-4 text-slate-300">Loading jobs…</p>}

              {activeRole === "Applicant" && (
                <div className="mt-6 space-y-6">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
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

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <h3 className="text-lg font-semibold text-white">Available Job Offers</h3>
                    {filteredApplicantJobs.length === 0 ? (
                      <p className="mt-4 text-slate-400">No approved jobs are available yet.</p>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {filteredApplicantJobs.map((job) => {
                          const alreadyApplied = appliedJobIds.has(String(job._id)) || job.applicants?.some((applicant) => applicant.email === currentUser?.email)
                          const isSelected = selectedJob && String(selectedJob._id) === String(job._id)
                          return (
                            <div key={job._id} className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
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
                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                  {activeRole === "Admin" && (
                    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
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
                      <h3 className="text-lg font-semibold text-white">Pending Job Postings</h3>
                      {filteredPendingJobs.length === 0 ? (
                        <p className="mt-3 text-slate-400">No pending job postings matched your search.</p>
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
                            <div key={job._id} className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-lg font-semibold text-white">{job.title}</p>
                                  <p className="text-sm text-slate-400">{job.company} • {job.location || 'Remote'}</p>
                                  <p className="mt-2 text-sm text-slate-300">{job.description}</p>
                                  <p className="mt-2 text-sm text-slate-400">Salary: {job.salary || 'Not specified'}</p>
                                  <p className="mt-2 text-sm text-slate-400">Posted by: {job.createdBy || 'N/A'}</p>
                                </div>
                                <span className="rounded-full bg-cyan-500 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-950">
                                  {(job.applicants || []).length} applicant{(job.applicants || []).length === 1 ? '' : 's'}
                                </span>
                              </div>

                              {(job.applicants || []).length > 0 ? (
                                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Applicants</p>
                                  <ul className="mt-3 space-y-2">
                                    {job.applicants.map((applicant) => (
                                      <li
                                        key={`${job._id}-${applicant.email}`}
                                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                                      >
                                        <p>{applicant.email}</p>
                                        <p className="text-xs text-slate-400">
                                          Applied: {applicant.appliedAt ? new Date(applicant.appliedAt).toLocaleString() : 'N/A'}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-slate-400">No applicants yet for this job offer.</p>
                              )}
                            </div>
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
            </section>
          )}
          {activeView === "notify" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Notifications</h2>
              <p className="mt-3 text-slate-400">Updates about your job posting approvals and other account activity.</p>

              {notifications.length === 0 ? (
                <p className="mt-6 text-slate-400">You have no notifications yet.</p>
              ) : (
                <>
                  <p className="mt-6 text-sm text-slate-400">Click a notification to enlarge and view full details.</p>
                  <div className="mt-3 space-y-3">
                    {notifications.map((notification) => (
                      <button
                        key={notification._id}
                        type="button"
                        onClick={() => setSelectedNotification(notification)}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-white">{notification.title}</p>
                            <p className="mt-2 line-clamp-2 text-sm text-slate-300">{notification.message}</p>
                            {activeRole === 'Admin' && ((notification.actionable && notification.status === 'pending') || String(notification._id || '').startsWith('job-pending-')) && (
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Action available</p>
                            )}
                          </div>
                          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
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

          {selectedNotification && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setSelectedNotification(null)}
            >
              <div
                className="w-full max-w-2xl rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Notification details</h3>
                    <p className="mt-2 text-sm font-semibold text-white">{selectedNotification.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNotification(null)}
                    className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200"
                  >
                    Close
                  </button>
                </div>

                <p className="mt-4 text-sm text-slate-300">{selectedNotification.message}</p>
                <p className="mt-2 text-sm text-slate-400">
                  Time: {selectedNotification.createdAt ? new Date(selectedNotification.createdAt).toLocaleString() : 'Just now'}
                </p>

                {selectedNotification.company && (
                  <p className="mt-2 text-sm text-slate-400">Company: {selectedNotification.company}</p>
                )}
                {selectedNotification.location && (
                  <p className="mt-1 text-sm text-slate-400">Location: {selectedNotification.location}</p>
                )}
                {selectedNotification.salary && (
                  <p className="mt-1 text-sm text-slate-400">Salary: {selectedNotification.salary}</p>
                )}
                {selectedNotification.requirements && (
                  <p className="mt-1 text-sm text-slate-400">Requirements: {selectedNotification.requirements}</p>
                )}
                {selectedNotification.description && (
                  <p className="mt-1 text-sm text-slate-400">Description: {selectedNotification.description}</p>
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
                      className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                    >
                      Decline here
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === "requests" && activeRole === "Admin" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Employer Requests</h2>
              <p className="mt-3 text-slate-400">Review pending employer account requests.</p>

              {employerRequests.length === 0 ? (
                <p className="mt-4 text-slate-400">No pending employer requests.</p>
              ) : (
                <div className="mt-6 space-y-4">
                  {employerRequests.map((request) => (
                    <div key={request._id} className="rounded-2xl border border-slate-700 bg-slate-950/80 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{request.companyName}</p>
                          <p className="text-sm text-slate-400">Contact: {request.contactName}</p>
                          <p className="text-sm text-slate-400">Email: {request.email}</p>
                          <p className="text-sm text-slate-400">Location: {request.location || 'N/A'}</p>
                          <p className="text-sm text-slate-400">Phone: {request.phone || 'N/A'}</p>
                          <p className="mt-2 text-sm text-slate-300">{request.message || 'No additional message provided.'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleReviewEmployerRequest(request._id, 'approved')}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewEmployerRequest(request._id, 'declined')}
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
        </main>
      </div>
    </div>
  )
}

export default App
