import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { API_URL } from '../config'

// Read-only: cards only navigate to list pages, nothing here modifies data.
const cardsFor = (role, stats) => {
  if (role === 'Admin') {
    return [
      { label: 'Applicants', value: stats.applicants, to: 'applicants' },
      { label: 'Employers', value: stats.employers, to: 'employers' },
      { label: 'Jobs pending', value: stats.jobs.pending, to: 'jobs' },
      { label: 'Jobs approved', value: stats.jobs.approved, to: 'jobs' },
      { label: 'Jobs declined', value: stats.jobs.declined, to: 'jobs' },
      { label: 'Documents awaiting review', value: stats.documentsAwaitingReview, to: 'applicants' },
      { label: 'Hires', value: stats.hires, to: 'employment-updates' },
      { label: 'Referrals', value: stats.referrals.total, to: 'peso-referrals' },
    ]
  }
  if (role === 'Employer') {
    return [
      { label: 'Jobs pending', value: stats.jobs.pending, to: 'employer' },
      { label: 'Jobs approved', value: stats.jobs.approved, to: 'employer' },
      { label: 'Jobs declined', value: stats.jobs.declined, to: 'employer' },
      { label: 'Applicants', value: stats.applicants, to: 'employer' },
      { label: 'Referrals', value: stats.referrals.total, to: 'referrals' },
      { label: 'Hires reported', value: stats.hires, to: 'referrals' },
    ]
  }
  const accountStatus = { label: 'Account status', value: String(stats.verificationStatus).replace('_', ' '), to: 'profile' }
  if (stats.verificationStatus !== 'approved') return [accountStatus]
  return [
    { label: 'Applications', value: stats.applications, to: 'jobs' },
    { label: 'Referrals', value: stats.referrals.total, to: 'jobs' },
  ]
}

function Skeleton() {
  return (
    <div data-testid="dashboard-skeleton" className="animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-2xl bg-slate-200" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-200" />
        ))}
      </div>
    </div>
  )
}

const shortDate = (value) => String(value).slice(5)

export default function AllDashboard({ token, onNavigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error || 'Failed to load dashboard')
        return body
      })
      .then((body) => {
        if (!body?.stats) throw new Error('Failed to load dashboard')
        if (!cancelled) setData(body)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token])

  if (error) return <p role="alert" className="text-rose-700">{error}</p>
  if (!data) return <Skeleton />

  const cards = cardsFor(data.role, data.stats)
  const isAdmin = data.role === 'Admin'
  const showActivity = data.role !== 'Applicant' || data.stats.verificationStatus === 'approved'
  const chartData = isAdmin
    ? data.charts.registrations.map((row, i) => ({ date: row.date, registrations: row.count, applications: data.charts.applications[i]?.count || 0 }))
    : data.charts.applications.map((row) => ({ date: row.date, applications: row.count }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => onNavigate(card.to)}
            className="rounded-2xl border border-slate-300 bg-white p-4 text-left transition hover:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <p className="text-sm text-black">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold capitalize text-black">{card.value}</p>
          </button>
        ))}
      </div>

      {showActivity && <>
      <section className="rounded-2xl border border-slate-300 bg-white p-4">
        <h3 className="text-base font-semibold text-black">{isAdmin ? 'Registrations and applications' : 'Applications'} &bull; last 30 days</h3>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {isAdmin ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="registrations" stroke="#0891b2" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="applications" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="applications" fill="#0891b2" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-4">
        <h3 className="text-base font-semibold text-black">Recent activity</h3>
        {data.activity.length === 0 ? (
          <p className="mt-3 text-sm text-black">No recent activity.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {data.activity.map((item) => (
              <li key={item.id} className="py-3">
                <p className="text-sm font-semibold text-black">{item.title}</p>
                <p className="text-sm text-black">{item.message}</p>
                {isAdmin && item.type === 'hire_report_submitted' && <button type="button" onClick={() => onNavigate('employment-updates')} className="mt-2 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-900">View hiring updates</button>}
                <p className="mt-1 text-xs text-slate-600">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>}
    </div>
  )
}
