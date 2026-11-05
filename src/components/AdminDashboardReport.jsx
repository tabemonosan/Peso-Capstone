import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PortalNavIcon from './PortalNavIcon'
import './AdminDashboardReport.css'

const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
const colors = ['#ad2f65', '#5b887b', '#bb8a30', '#8c6d9b', '#d46c98', '#786471']
const statusNames = { pending_admin: 'Awaiting PESO review', delivered: 'Delivered to employer', referred: 'Referred', received: 'Received', accepted: 'Accepted', declined: 'Declined', declined_by_admin: 'Declined by PESO', withdrawn: 'Withdrawn', withdrawn_by_admin: 'Returned to PESO', failed: 'Delivery failed', suspended: 'Suspended' }

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return reduced
}

function AnimatedCount({ value, reduced }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (reduced || typeof value !== 'number') { setShown(value); return }
    let frame, start
    const update = now => {
      start ??= now
      const progress = Math.min(1, (now - start) / 650)
      setShown(Math.round(value * (1 - (1 - progress) ** 3)))
      if (progress < 1) frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [value, reduced])
  return <span aria-label={String(value)}>{Number(shown).toLocaleString('en-PH')}</span>
}

function MetricRow({ label, value, destination, onNavigate, color, icon = 'referrals' }) {
  return <button type="button" className="report-metric-row" aria-label={`${label} ${value}`} onClick={() => onNavigate(destination)}>
    <span className="report-row-symbol" style={{ '--report-series': color || colors[0] }}><PortalNavIcon name={icon} /></span>
    <span>{label}</span><strong>{count(value).toLocaleString('en-PH')}</strong><span className="report-row-arrow" aria-hidden="true">↗</span>
  </button>
}

export default function AdminDashboardReport({ data, onNavigate }) {
  const [days, setDays] = useState(30)
  const reduced = useReducedMotion()
  const stats = data.stats, workflow = stats.workflow
  const jobs = [
    { label: 'Jobs approved', short: 'Approved', value: count(stats.jobs?.approved), color: colors[1] },
    { label: 'Jobs pending', short: 'Pending', value: count(stats.jobs?.pending), color: colors[2] },
    { label: 'Jobs declined', short: 'Declined', value: count(stats.jobs?.declined), color: colors[0] },
  ]
  const totalJobs = jobs.reduce((sum, item) => sum + item.value, 0)
  let stop = 0
  const gradient = totalJobs ? jobs.map(item => { const previous = stop; stop += item.value / totalJobs * 100; return `${item.color} ${previous}% ${stop}%` }).join(', ') : 'var(--peso-line) 0% 100%'
  // Join by date: the two series need not have identical array positions.
  const dates = new Map()
  for (const row of data.charts?.registrations || []) dates.set(row.date, { date: row.date, registrations: count(row.count), applications: 0 })
  for (const row of data.charts?.applications || []) dates.set(row.date, { registrations: 0, ...dates.get(row.date), date: row.date, applications: count(row.count) })
  const allDays = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date))
  const end = allDays.at(-1)?.date
  const cutoff = end ? new Date(`${end}T00:00:00Z`) : null
  cutoff?.setUTCDate(cutoff.getUTCDate() - days + 1)
  const start = cutoff?.toISOString().slice(0, 10)
  const daily = allDays.filter(row => !start || row.date >= start)
  const registrations = daily.reduce((sum, row) => sum + row.registrations, 0)
  const applications = daily.reduce((sum, row) => sum + row.applications, 0)
  const applicationStates = Object.entries(workflow?.applicationsByStatus || {}).map(([key, value], index) => ({ key, label: statusNames[key] || key.replaceAll('_', ' '), value: count(value), color: colors[index % colors.length] }))
  const maxApplications = Math.max(1, ...applicationStates.map(item => item.value))
  const sources = workflow?.referralsBySource || stats.referrals?.bySource
  const auto = count(sources?.auto), manual = count(sources?.admin), sourceTotal = auto + manual
  const headlines = [
    { label: 'Applicants', value: count(stats.applicants), icon: 'applicants', to: 'applicants', note: 'Registered job seekers' },
    { label: 'Employers', value: count(stats.employers), icon: 'employers', to: 'employers', note: 'Registered establishments' },
    { label: 'Job postings', value: totalJobs, icon: 'jobs', to: 'jobs', note: 'Across all posting statuses' },
    { label: 'Hires', value: count(stats.hires), icon: 'check', to: 'employment-updates', note: 'Recorded hiring outcomes' },
  ]
  const queue = [
    { label: 'Documents awaiting review', value: count(stats.documentsAwaitingReview), destination: 'applicants', icon: 'requests' },
    ...(workflow ? [
      { label: 'Applications being reviewed', value: count(workflow.applicationsByStatus?.pending_admin), destination: 'peso-referrals', icon: 'jobs' },
      { label: 'No-show reports pending', value: count(workflow.reports?.noShowPending), destination: 'peso-referrals', icon: 'clock' },
      { label: 'Problem reports', value: count(workflow.reports?.problemPending), destination: 'peso-referrals', icon: 'requests' },
    ] : []),
  ]

  return <div className="admin-report">
    <header className="report-masthead">
      <div><p className="report-eyebrow">THE BIG PICTURE</p><h3>PESO performance report</h3><p>People, opportunities, and the work that connects them.</p></div>
      <span className="report-snapshot"><span /> Current system totals</span>
    </header>

    <section className="report-headlines" aria-label="Current system totals">
      {headlines.map((item, index) => <button key={item.label} type="button" className="report-headline" aria-label={`${item.label} ${item.value}`} onClick={() => onNavigate(item.to)} style={{ '--report-delay': `${index * 65}ms` }}>
        <span className="report-headline-top"><span className="report-headline-icon"><PortalNavIcon name={item.icon} /></span><span aria-hidden="true">↗</span></span>
        <span className="report-headline-label">{item.label}</span><strong><AnimatedCount value={item.value} reduced={reduced} /></strong><span className="report-headline-note">{item.note}</span>
      </button>)}
    </section>

    <div className="report-charts-grid">
      <section className="report-panel report-trend" aria-labelledby="report-trend-title">
        <div className="report-panel-heading"><div><p className="report-eyebrow">ACTIVITY OVER TIME</p><h3 id="report-trend-title">Registrations and applications</h3></div><div className="report-period" role="group" aria-label="Activity reporting period">{[7, 14, 30].map(value => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} days</button>)}</div></div>
        <div className="report-period-totals"><span><i style={{ background: colors[0] }} /><strong>{registrations.toLocaleString('en-PH')}</strong> registrations</span><span><i style={{ background: colors[1] }} /><strong>{applications.toLocaleString('en-PH')}</strong> applications</span><small>Last {days} days · combined applicant and employer registrations</small></div>
        {daily.length ? <div className="report-trend-chart" role="img" aria-label={`Last ${days} days: ${registrations} registrations and ${applications} applications. Daily figures are available below.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={daily} margin={{ top: 16, right: 12, bottom: 4, left: -22 }}>
            <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--peso-line)" /><XAxis dataKey="date" tickFormatter={date => String(date).slice(5)} minTickGap={26} tickLine={false} axisLine={false} tick={{ fill: 'var(--peso-muted)', fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--peso-muted)', fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--peso-surface)', border: '1px solid var(--peso-line)', borderRadius: 12 }} />
            <Line name="Registrations" type="monotone" dataKey="registrations" stroke={colors[0]} strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={!reduced} animationDuration={900} /><Line name="Applications" type="monotone" dataKey="applications" stroke={colors[1]} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={!reduced} animationDuration={1100} />
          </LineChart></ResponsiveContainer>
        </div> : <div className="report-empty-chart">No activity data is available for this period.</div>}
        <details className="report-daily-figures"><summary>View daily figures</summary><div><table><caption>Activity in the last {days} days</caption><thead><tr><th scope="col">Date</th><th scope="col">Registrations</th><th scope="col">Applications</th></tr></thead><tbody>{daily.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{row.registrations}</td><td>{row.applications}</td></tr>)}</tbody></table></div></details>
      </section>

      <section className="report-panel" aria-labelledby="report-jobs-title"><div className="report-panel-heading"><div><p className="report-eyebrow">OPPORTUNITY SNAPSHOT</p><h3 id="report-jobs-title">Job posting status</h3></div><span className="report-period-note">Current totals</span></div>
        <div className="report-donut-wrap"><div className="report-donut" role="img" aria-label={`${totalJobs} job postings: ${jobs.map(item => `${item.value} ${item.short.toLowerCase()}`).join(', ')}`} style={{ background: `conic-gradient(${gradient})` }}><div><strong><AnimatedCount value={totalJobs} reduced={reduced} /></strong><span>job postings</span></div></div></div>
        <div className="report-job-legend">{jobs.map(item => <MetricRow key={item.label} {...item} destination="jobs" onNavigate={onNavigate} icon={item.short === 'Pending' ? 'clock' : item.short === 'Approved' ? 'check' : 'jobs'} />)}</div>
      </section>
    </div>

    <div className="report-breakdowns-grid">
      <section className="report-panel" aria-labelledby="report-applications-title"><div className="report-panel-heading"><div><p className="report-eyebrow">APPLICATIONS AT A GLANCE</p><h3 id="report-applications-title">Application status</h3></div></div>
        {workflow ? <><button className="report-total-link" type="button" aria-label={`Applications ${count(workflow.applications)}`} onClick={() => onNavigate('peso-referrals')}><strong>{count(workflow.applications).toLocaleString('en-PH')}</strong><span>total applications <span aria-hidden="true">↗</span></span></button>
          {applicationStates.some(item => item.value) ? <ul className="report-horizontal-bars">{applicationStates.map(item => <li key={item.key}><div><span>{item.label}</span><strong>{item.value}</strong></div><span className="report-bar-track"><span style={{ width: `${item.value / maxApplications * 100}%`, background: item.color }} /></span></li>)}</ul> : <p className="report-empty-note">No applications recorded yet.</p>}</> : <p className="report-empty-note">An application breakdown is not available.</p>}
        <p className="report-footnote">Current statuses, across all recorded dates.</p>
      </section>

      <section className="report-panel" aria-labelledby="report-referrals-title"><div className="report-panel-heading"><div><p className="report-eyebrow">CONNECTING PEOPLE</p><h3 id="report-referrals-title">Referrals and interviews</h3></div></div>
        <MetricRow label="Referrals" value={count(stats.referrals?.total)} destination="peso-referrals" icon="referrals" onNavigate={onNavigate} />
        {sources ? <><div className="report-source-bar" role="img" aria-label={`${auto} automatic referrals and ${manual} admin referrals`}><span style={{ width: `${sourceTotal ? auto / sourceTotal * 100 : 0}%`, background: colors[0] }} /><span style={{ width: `${sourceTotal ? manual / sourceTotal * 100 : 0}%`, background: colors[1] }} /></div><MetricRow label="Automatic referrals" value={auto} destination="peso-referrals" onNavigate={onNavigate} color={colors[0]} /><MetricRow label="Admin referrals" value={manual} destination="peso-referrals" onNavigate={onNavigate} color={colors[1]} /></> : <p className="report-empty-note">No referral-source breakdown is available.</p>}
        {workflow && <div className="report-section-divider"><MetricRow label="Interviews scheduled" value={count(workflow.interviews?.scheduled)} destination="peso-referrals" onNavigate={onNavigate} icon="clock" /><MetricRow label="Applicants suspended" value={count(workflow.suspendedApplicants)} destination="peso-referrals" onNavigate={onNavigate} icon="applicants" color={colors[3]} /></div>}
        <p className="report-footnote">Scheduled interviews are upcoming invitations and confirmations.</p>
      </section>

      <section className="report-panel report-review-queue" aria-labelledby="report-review-title"><div className="report-panel-heading"><div><p className="report-eyebrow">WHERE TO FOCUS</p><h3 id="report-review-title">Review queue</h3></div><span className="report-queue-symbol" aria-hidden="true"><PortalNavIcon name="requests" /></span></div><p className="report-empty-note">Open a category to review its records.</p>
        {queue.map(item => <MetricRow key={item.label} {...item} onNavigate={onNavigate} color={item.value ? colors[2] : colors[1]} />)}
        <p className="report-footnote">A record may appear in more than one category.</p>
      </section>
    </div>

    <section className="report-panel report-recent-activity" aria-labelledby="report-activity-title"><div className="report-panel-heading"><div><p className="report-eyebrow">THE LATEST UPDATES</p><h3 id="report-activity-title">Recent activity</h3></div><span className="report-period-note">Most recent events</span></div>
      {!data.activity?.length ? <p className="report-empty-note">No recent activity.</p> : <ul>{data.activity.map(item => <li key={item.id}><span className="report-activity-dot" aria-hidden="true" /><div><p>{item.title}</p><span>{item.message}</span>{item.type === 'hire_report_submitted' && <button type="button" onClick={() => onNavigate('employment-updates')}>View hiring updates <span aria-hidden="true">↗</span></button>}</div><time dateTime={item.createdAt}>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</time></li>)}</ul>}
    </section>
  </div>
}
