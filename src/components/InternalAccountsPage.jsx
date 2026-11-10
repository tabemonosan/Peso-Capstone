import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import { ADMIN_LABELS } from '../../shared/adminAccess.js'
import ConfirmDialog from './ConfirmDialog'
import Pagination from './Pagination'

const empty = { name: '', email: '', adminLevel: 'staff' }
export default function InternalAccountsPage({ token, currentId }) {
  const [data, setData] = useState({ items: [], total: 0 }), [page, setPage] = useState(1)
  const [form, setForm] = useState(empty), [action, setAction] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false), [credentials, setCredentials] = useState(null)
  const loginDetails = credentials ? `PESO login\nAccount: ${ADMIN_LABELS[credentials.adminLevel]}\nSign in: ${window.location.origin}\nEmail: ${credentials.email}\nInitial password: ${credentials.initialPassword}\nChoose your own password at first sign-in.` : ''
  const copyDetails = async () => {
    setError(''); setNotice('')
    try { await navigator.clipboard.writeText(loginDetails); setNotice('Login details copied.') }
    catch { setError('Could not copy automatically. Select and copy the login details below.') }
  }
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/internal-accounts?page=${page}&limit=20`, { headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setData(result)
    } catch (err) { setError(err.message || 'Accounts unavailable.') }
  }, [page, token])
  useEffect(() => { load() }, [load])
  const save = async reason => {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`${API_URL}/api/admin/internal-accounts${action.id ? `/${action.id}` : ''}${action.reset ? '/reset-password' : ''}`, { method: action.id && !action.reset ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action.changes, reason }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (!action.id) { setForm(empty); setCreating(false); setCredentials(result) }
      if (action.reset) setCredentials({ ...result, reset: true })
      setAction(null); setNotice('Account saved. Access changes take effect immediately.'); await load()
    } catch (err) { setError(err.message || 'Could not save account.') } finally { setBusy(false) }
  }
  return <section className="portal-card p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Internal accounts</h2>
    <p className="mt-2 text-sm text-slate-600">Create and manage Super Admin, Admin, and Staff access. Super Admin accounts are protected from deactivation and demotion.</p>
    {error && !action && <p role="alert" className="mt-3 text-rose-700">{error}</p>}{notice && <p role="status" className="mt-3 text-green-800">{notice}</p>}
    {credentials && <section aria-label="New account login details" className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <h3 className="font-semibold">{credentials.reset ? 'Password reset' : 'Account created'}</h3><p className="mt-1 text-sm">Copy these details before dismissing. The initial password is shown once.</p>
      <label className="mt-3 block text-sm">Login details<textarea readOnly className="shared-form-control mt-1 block w-full rounded-lg px-3 py-2 font-mono text-sm" rows={6} value={loginDetails} /></label>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white" onClick={copyDetails}>Copy login details</button><button type="button" className="rounded-full border border-slate-300 px-4 py-2 text-sm" onClick={() => { setCredentials(null); setNotice(''); setError('') }}>Dismiss login details</button></div>
    </section>}
    {!creating && <button type="button" className="mt-5 rounded-full bg-cyan-700 px-5 py-2 font-semibold text-white" onClick={() => { setCreating(true); setError(''); setNotice('') }}>Create account</button>}
    {creating && <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); setError(''); setAction({ changes: { ...form }, title: `Create ${ADMIN_LABELS[form.adminLevel]} account?` }) }}>
      {['name', 'email'].map(key => <label className="text-sm capitalize" key={key}>{key}<input className="shared-form-control mt-1 block w-full rounded-lg px-3 py-2" type={key === 'email' ? 'email' : 'text'} required maxLength={key === 'name' ? 100 : 254} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <label className="text-sm">Access level<select className="shared-form-control mt-1 block w-full rounded-lg px-3 py-2" value={form.adminLevel} onChange={event => setForm({ ...form, adminLevel: event.target.value })}>{['staff', 'admin'].map(value => <option key={value} value={value}>{ADMIN_LABELS[value]}</option>)}</select></label>
      <p className="text-sm text-slate-600 sm:col-span-2">An initial password is generated automatically. The account holder chooses their own password at first sign-in.</p>
      <div className="flex gap-2"><button className="rounded-full bg-cyan-700 px-5 py-2 font-semibold text-white" type="submit" disabled={busy}>Create account</button><button type="button" className="rounded-full border border-slate-300 px-4 py-2" onClick={() => { setCreating(false); setForm(empty) }}>Cancel</button></div>
    </form>}
    <div className="mt-6 space-y-3">{data.items.map(account => <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4" key={account.id}>
      <div><p className="font-semibold">{account.name || account.email}</p><p className="text-sm">{account.email} · {ADMIN_LABELS[account.adminLevel]} · {account.disabled ? 'Disabled' : 'Active'}</p></div>
      {account.id !== currentId && account.adminLevel !== 'super_admin' && <div className="flex flex-wrap gap-2"><select aria-label={`Access level for ${account.email}`} className="shared-form-control rounded-lg px-3 py-2" value={account.adminLevel} onChange={event => { setError(''); setAction({ id: account.id, changes: { adminLevel: event.target.value }, title: `Change access for ${account.email}?` }) }}>{Object.entries(ADMIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="rounded-full border border-rose-300 px-4 py-2 text-sm text-rose-800" onClick={() => { setError(''); setAction({ id: account.id, changes: { disabled: !account.disabled }, title: `${account.disabled ? 'Enable' : 'Disable'} ${account.email}?` }) }}>{account.disabled ? 'Enable' : 'Disable'}</button><button type="button" disabled={account.disabled || busy} className="rounded-full border border-cyan-300 px-4 py-2 text-sm text-cyan-900 disabled:opacity-50" onClick={() => { setError(''); setAction({ id: account.id, reset: true, title: `Reset password for ${account.email}?` }) }}>Reset password</button></div>}
    </article>)}</div>
    {data.total > 20 && <Pagination page={page} pageSize={20} totalItems={data.total} onPageChange={setPage} itemLabel="accounts" />}
    {action && <ConfirmDialog title={action.title} note={action.reset ? 'Existing sessions will end. Copy the new initial password and share it with the account holder. They must choose their own password at sign-in.' : action.id ? 'This account change is recorded in Activity Logs. Provide the reason for the change.' : `Create an account for ${action.changes.email}? An initial password will be generated for you to copy.`} requireReason={Boolean(action.id)} reasonMinLength={1} busy={busy} error={error} onConfirm={reason => save(action.id ? reason : 'New internal account')} onCancel={() => { if (!busy) setAction(null) }} />}
  </section>
}
