import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import ConfirmDialog from './ConfirmDialog'
import { VERIFICATION_DEFAULTS } from '../../shared/verification.js'

const control = 'shared-form-control rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900'

export function NsrpAutomationBadge({ decision }) {
  if (!decision) return null
  return <div className="my-2 rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-xs text-slate-800">
    <strong>{decision.result === 'Auto-approved' ? 'Auto-approved' : decision.reason || decision.result}</strong>
    <span> · {new Date(decision.approvedAt || decision.at).toLocaleString()} · Rules {decision.rulesVersion}</span>
    {decision.report && <p>Data check: {decision.report.level} · {decision.report.summary.critical} critical · {decision.report.summary.warning} warning · {decision.report.summary.info} info</p>}
  </div>
}

export function AdminNsrpAccountDecision({ token, accountId, role, onChanged, compact = false }) {
  const [decision, setDecision] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/nsrp-automation/decisions?accountId=${accountId}&role=${role}`, { headers: { Authorization: `Bearer ${token}` } })
      if (response.ok) setDecision((await response.json()).items?.[0] || null)
    } catch { setError('Automation details unavailable') }
  }, [accountId, role, token])
  useEffect(() => { load() }, [load])
  const revoke = async (reason) => {
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/nsrp-automation/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: decision._id, reason }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setConfirm(false); await load(); onChanged?.()
    } catch (err) { setError(err.message || 'Revoke failed') }
    finally { setBusy(false) }
  }
  return <div>
    <NsrpAutomationBadge decision={decision} />
    {!compact && decision?.result === 'Auto-approved' && <button type="button" className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1 text-sm text-amber-900" onClick={() => { setError(''); setConfirm(true) }}>Revoke auto-approval</button>}
    {confirm && <ConfirmDialog title="Revoke auto-approval" note="Return this NSRP to pending review? The user will be notified." requireReason reasonMinLength={1} confirmLabel="Confirm revoke" busy={busy} error={error} onConfirm={revoke} onCancel={() => setConfirm(false)} />}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>
}

export default function AdminNsrpAutomation({ token, bannerOnly = false }) {
  const [settings, setSettings] = useState(null)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ result: '', from: '', to: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const headers = { Authorization: `Bearer ${token}` }
  const [dismissal, setDismissal] = useState(null)
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/nsrp-automation/settings`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Verification rules unavailable')
      setSettings({ ...VERIFICATION_DEFAULTS, ...await response.json() })
    } catch (err) { setError(err.message) }
  }, [token])
  useEffect(() => { load() }, [load])
  const loadLog = useCallback(async () => {
    if (bannerOnly) return
    try {
      const response = await fetch(`${API_URL}/api/admin/nsrp-automation/decisions?${new URLSearchParams({ ...filters, page })}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Auto-approval log unavailable')
      const body = await response.json(); setItems(body.items || []); setTotal(body.total || 0)
    } catch (err) { setError(err.message) }
  }, [bannerOnly, filters, page, token])
  useEffect(() => { loadLog() }, [loadLog])
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const changes = Object.fromEntries(Object.keys(VERIFICATION_DEFAULTS).map(key => [key, ['auditPercent', 'rateLimit'].includes(key) ? Number(settings[key]) : settings[key]]))
      const response = await fetch(`${API_URL}/api/admin/nsrp-automation/settings`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setSettings({ ...VERIFICATION_DEFAULTS, ...body }); setNotice('Verification rules saved. Existing approvals are unchanged.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const enabled = settings?.automaticApproval
  const dismissFinding = async (reason) => {
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/nsrp-automation/dismiss-finding`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dismissal, reason }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setDismissal(null); await loadLog()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
    {settings && <p className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 font-semibold">Auto-approval is {enabled ? 'ON' : 'OFF'} · Applicant: {settings.applicant ? 'ON' : 'OFF'} · Employer: {settings.employer ? 'ON' : 'OFF'}</p>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {!bannerOnly && <>
      <h2 className="mt-4 text-xl font-semibold">Verification rules</h2>
      {settings && <form onSubmit={save} className="my-4 grid gap-4 sm:grid-cols-2">
        <label><input type="checkbox" checked={settings.automaticApproval} onChange={event => setSettings({ ...settings, automaticApproval: event.target.checked })} /> Automatic approval</label>
        {['applicant', 'employer'].map((key) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} /> Auto-approve {key} NSRPs</label>)}
        {[['birthCertificate', 'Auto-approve birth certificates'], ['validId', 'Auto-approve valid IDs'], ['ocrTextReading', 'OCR text reading'], ['reviewToolsEnabled', 'Document review queues and actions']].map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={event => setSettings({ ...settings, [key]: event.target.checked })} /> {label}</label>)}
        <label>Minimum evidence<select className={`${control} block`} value={settings.minimumEvidence} onChange={event => setSettings({ ...settings, minimumEvidence: event.target.value })}><option value="independent">Independent evidence (recommended)</option><option value="none">None: typed data only, not recommended</option></select></label>
        <label><input type="checkbox" checked={settings.dataChecks} onChange={event => setSettings({ ...settings, dataChecks: event.target.checked })} /> Additional NSRP consistency and duplicate checks</label>
        <p className="text-sm text-slate-600 sm:col-span-2">Checks assess consistency and evidence, not authenticity. Image reading and supporting-document automatic approval will be available in later phases. The independent evidence default keeps typed-only submissions pending.</p>
        <label>Audit sample percentage<input type="number" min="0" max="100" required className={`${control} block`} value={settings.auditPercent} onChange={(event) => setSettings({ ...settings, auditPercent: event.target.value })} /></label>
        <label>Rate guard per IP and mobile / 24 hours<input type="number" min="1" max="5" required className={`${control} block`} value={settings.rateLimit} onChange={(event) => setSettings({ ...settings, rateLimit: event.target.value })} /></label>
        <button disabled={busy} type="submit" className="rounded-lg border border-cyan-500 bg-cyan-50 px-4 py-2">Save verification rules</button>
      </form>}
      {notice && <p role="status">{notice}</p>}
      <details><summary>Settings audit history</summary>{settings?.history?.map((entry, index) => <p key={index} className="my-1 text-xs">{new Date(entry.at).toLocaleString()} · {entry.by} · {JSON.stringify(entry.changes)}</p>)}</details>
      <h2 className="mt-6 text-xl font-semibold">Auto-approval log</h2>
      <div className="my-3 flex flex-wrap gap-3">
        <label>Decision<select className={`${control} block`} value={filters.result} onChange={(event) => { setFilters({ ...filters, result: event.target.value }); setPage(1) }}><option value="">All</option>{['Auto-approved', 'Audit sample', 'Manual'].map((value) => <option key={value}>{value}</option>)}</select></label>
        {['from', 'to'].map((key) => <label key={key}>{key === 'from' ? 'From date' : 'To date'}<input className={`${control} block`} type="date" value={filters[key]} onChange={(event) => { setFilters({ ...filters, [key]: event.target.value }); setPage(1) }} /></label>)}
        <button type="button" onClick={loadLog}>Refresh log</button>
      </div>
      <p className="text-xs">Dates use Asia/Manila. {total} decisions.</p>
      {items.map((item) => <article key={item._id} className="my-3 rounded-lg border border-slate-200 p-3">
        <p>{item.accountLabel} · {item.role} · Document v{item.version}</p><NsrpAutomationBadge decision={item} />
        <details><summary>Data check findings</summary>{item.report?.findings?.map((finding, index) => <div className="my-2 text-xs" key={index}>{finding.severity}: {finding.code}
          {item.dismissals?.some((entry) => entry.code === finding.code) ? <span> · Dismissed (manual review still required)</span> : <button type="button" className="ml-2 rounded border border-slate-300 px-2 py-1" onClick={() => { setError(''); setDismissal({ id: item._id, code: finding.code }) }}>Dismiss finding</button>}
        </div>)}</details>
        {item.result === 'Auto-approved' && <AdminNsrpAccountDecision token={token} accountId={String(item.accountId)} role={item.role} onChanged={loadLog} />}
      </article>)}
      <div className="flex gap-4"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>Next</button></div>
      {dismissal && <ConfirmDialog title="Dismiss data check finding" note="Dismissal does not approve the document. A dismissed critical finding keeps this account in manual review." requireReason reasonMinLength={1} busy={busy} error={error} onConfirm={dismissFinding} onCancel={() => setDismissal(null)} />}
    </>}
  </section>
}
