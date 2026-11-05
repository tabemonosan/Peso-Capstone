import { useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { API_URL } from '../config'
import { manilaDate } from '../../shared/jobPosting.js'
import { activityReportRange, activityReportCsv, REPORT_PRESETS } from '../../shared/activityReport.js'
import './AdminReportMaker.css'

const label = value => String(value).replaceAll('_', ' ')
export default function AdminReportMaker({ token }) {
  const [preset, setPreset] = useState('today'), [start, setStart] = useState(manilaDate()), [end, setEnd] = useState(manilaDate())
  const [report, setReport] = useState(null), [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false), [error, setError] = useState('')
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])
  const generate = async event => {
    event.preventDefault(); setError('')
    let range
    try { range = activityReportRange({ preset, start, end }) } catch (err) { setError(err.message); return }
    controller.current?.abort(); controller.current = new AbortController()
    setBusy(true); setReport(null)
    try {
      const query = new URLSearchParams({ preset: 'custom', start: range.start, end: range.end })
      const response = await fetch(`${API_URL}/api/admin/reports?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.current.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not generate this report.')
      setReport(result)
    } catch (err) { if (err.name !== 'AbortError') setError(err.message) }
    finally { setBusy(false) }
  }
  const download = async format => {
    setExporting(true); setError('')
    try {
      const body = format === 'csv' ? activityReportCsv(report) : await (await import('../../shared/activityReportPdf.js')).activityReportPdf(report)
      const blob = new Blob([body], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/pdf' })
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = `peso-report-${report.range.start}-${report.range.end}.${format}`
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Could not download the report. Please try again.') }
    finally { setExporting(false) }
  }
  return <section className="portal-card report-maker">
    <header><p className="report-maker-eyebrow">PESO REPORTS</p><h2>Report maker</h2><p>Create an activity report for your chosen period. All dates use Philippine time.</p></header>
    <form onSubmit={generate} className="report-maker-controls">
      <label>Report period<select value={preset} onChange={event => setPreset(event.target.value)} disabled={busy}>{REPORT_PRESETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {preset === 'custom' && <><label>Start date<input type="date" required value={start} max={end || manilaDate()} onChange={event => setStart(event.target.value)} disabled={busy} /></label><label>End date<input type="date" required value={end} min={start} max={manilaDate()} onChange={event => setEnd(event.target.value)} disabled={busy} /></label></>}
      <button type="submit" disabled={busy}>{busy ? 'Generating report...' : 'Create report'}</button>
    </form>
    {error && <p role="alert" className="report-maker-error">{error}</p>}
    {!report && !busy && <p className="report-maker-empty">Choose a period and create a report to preview registrations, job postings, applications, referrals, interviews, hiring outcomes, and no-show reports.</p>}
    {busy && <p role="status">Preparing your report...</p>}
    {report && <article aria-label="Generated activity report" className="report-maker-preview">
      <div className="report-maker-result-heading"><div><h3>{report.title}</h3><p>{report.range.start} to {report.range.end} (inclusive) ? {report.range.timeZone}</p><p>Generated {new Date(report.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p></div><div className="report-maker-downloads"><button type="button" onClick={() => download('pdf')} disabled={exporting}>Download PDF</button><button type="button" onClick={() => download('csv')} disabled={exporting}>Download CSV</button></div></div>
      <div className="report-maker-metrics">{report.metrics.map(metric => <section key={metric.key}><h4>{metric.label}</h4><strong>{metric.count.toLocaleString('en-PH')}</strong><p>{metric.basis}</p></section>)}</div>
      <p className="report-maker-note">{report.note}</p>
      <section aria-label="Daily activity"><h3>Daily activity</h3><p>Days with recorded activity in this period.</p>
        {report.daily.length > 0 ? <><div className="report-maker-chart" aria-hidden="true"><ResponsiveContainer width="100%" height={260}><BarChart data={report.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="applicants" name="Applicant registrations" fill="#ad2f65" isAnimationActive={false} /><Bar dataKey="applications" name="Applications submitted" fill="#5b887b" isAnimationActive={false} /><Bar dataKey="outcomes" name="Hiring outcome reports" fill="#bb8a30" isAnimationActive={false} /></BarChart></ResponsiveContainer></div><div className="report-maker-table"><table><caption className="sr-only">Daily counts for every report metric</caption><thead><tr><th>Date</th>{report.metrics.map(metric => <th key={metric.key}>{metric.label}</th>)}</tr></thead><tbody>{report.daily.map(day => <tr key={day.date}><th scope="row">{day.date}</th>{report.metrics.map(metric => <td key={metric.key}>{day[metric.key] || 0}</td>)}</tr>)}</tbody></table></div></> : <p className="report-maker-empty">No activity recorded for this period.</p>}
      </section>
      <div className="report-maker-breakdowns">{report.metrics.filter(metric => metric.statuses?.length).map(metric => <section key={metric.key}><h3>{metric.label}</h3><p>Current status of records in the selected period</p><dl>{metric.statuses.map(row => <div key={row.status}><dt>{label(row.status)}</dt><dd>{row.count}</dd></div>)}</dl></section>)}</div>
    </article>}
  </section>
}
