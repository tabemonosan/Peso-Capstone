import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import { getNsrpFieldLabel } from '../../shared/nsrpFieldLabels.js'

export default function NsrpImportReview({ file, emailProof, token, disabled = false, autoRead = false, onUse }) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saved, setSaved] = useState(false)
  const read = useCallback(async (signal) => {
    setBusy(true); setError(''); setResult(null); setConfirmed(false); setSaved(false)
    try {
      const body = file ? new FormData() : undefined
      if (file) body.append('nsrpFile', file)
      const response = await fetch(`${API_URL}/api/${file ? 'signup/nsrp-import' : 'profile/nsrp-import/preview'}`, { method: 'POST', headers: file ? { 'X-Email-Proof': emailProof } : { Authorization: `Bearer ${token}` }, body, signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not read this NSRP.')
      if (!signal?.aborted) setResult(data)
    } catch (err) { if (!signal?.aborted) setError(err.message) }
    finally { if (!signal?.aborted) setBusy(false) }
  }, [file, emailProof, token])
  useEffect(() => {
    if (!autoRead || !file || disabled) return
    const controller = new AbortController()
    read(controller.signal)
    return () => controller.abort()
  }, [autoRead, file, disabled, read])
  async function useDetails() {
    setBusy(true); setError('')
    try {
      if (file) onUse(result)
      else {
        const response = await fetch(`${API_URL}/api/profile/nsrp-import/apply`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ importToken: result.importToken, confirmed: true }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not save the extracted details.')
        onUse(data)
      }
      setSaved(true); setResult(null)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section aria-label="Retrieve NSRP details" className="my-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-800">
    <h3 className="font-semibold">Use your completed NSRP</h3>
    <p className="mt-1">{autoRead ? 'Your details, education, work history, and checked skills are retrieved automatically from the PDF. Review the results before using them.' : 'Retrieve your details, education, work history, and checked skills from the PDF. Review the results before using them. Existing profile information is kept.'}</p>
    {autoRead && busy && <p role="status" className="mt-3">Reading your NSRP…</p>}
    {(!autoRead || error) && <button type="button" disabled={disabled || busy} onClick={() => read()} className="mt-3 rounded-lg border border-blue-300 bg-white px-4 py-2 font-medium disabled:opacity-50">{busy ? 'Reading…' : autoRead ? 'Try again' : 'Retrieve from NSRP'}</button>}
    {disabled && <p className="mt-2 text-xs">Save or cancel your profile edits first.</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {saved && <p role="status" className="mt-2 text-green-800">NSRP details added. You can review and edit your profile.</p>}
    {result && <div className="mt-4 space-y-3">
      <p className="font-medium">Check these details against your NSRP. Unreadable fields are left blank.</p>
      <div className="max-h-80 overflow-auto rounded-lg border border-blue-100 bg-white p-3">
        <dl className="space-y-3">{Object.entries(result.answers).filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value)).map(([field, value]) => <div key={field} className="grid gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium">{getNsrpFieldLabel(field)}</dt>
          <dd className="min-w-0 break-words">{Array.isArray(value) ? value.map((row, index) => <div key={index}>{typeof row === 'string' ? row : Object.entries(row).filter(([, entry]) => entry !== false && entry !== '').map(([key, entry]) => `${getNsrpFieldLabel(key)}: ${entry === true ? 'Yes' : entry}`).join(' · ')}</div>) : value}</dd>
        </div>)}</dl>
      </div>
      {result.warnings.map((warning, index) => <p key={index} className="text-amber-900">{warning}</p>)}
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />I checked these details against my NSRP.</label>
      <button type="button" disabled={!confirmed || disabled || busy} onClick={useDetails} className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">Use these details</button>
    </div>}
  </section>
}
