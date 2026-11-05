import { useState } from 'react'
import Modal from './Modal'
import { MAX_PORTFOLIO_LINKS, validatePortfolioLinks } from '../../shared/portfolioLinks.js'

export default function PortfolioLinksEditor({ links = [], onSave, onClose }) {
  const [rows, setRows] = useState(() => links.map(({ label, url }) => ({ label, url })))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const change = (index, key, value) => setRows(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
  const save = async event => {
    event.preventDefault()
    if (busy) return
    const result = validatePortfolioLinks(rows)
    if (result.error) { setError(result.error); return }
    setError(''); setBusy(true)
    try {
      const saved = await onSave(result.links)
      if (saved?.ok) onClose()
      else setError('Could not save your links. Please try again.')
    } catch { setError('Could not save your links. Please try again.') }
    finally { setBusy(false) }
  }
  const input = 'shared-form-control mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
  return <Modal onClose={busy ? () => {} : onClose} labelledBy="portfolio-links-title">
    <h2 id="portfolio-links-title" className="text-xl font-semibold">Portfolio links</h2>
    <p className="mt-2 text-sm text-slate-600">Add up to 5 links to your portfolio, GitHub, LinkedIn, or work samples. Employers can view them on your applicant profile.</p>
    <form onSubmit={save} className="mt-4 space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        {rows.map((row, index) => <div key={index} className="rounded-xl border border-slate-200 p-3">
          <label className="block text-sm">Link title {index + 1}<input required maxLength={80} value={row.label} onChange={event => change(index, 'label', event.target.value)} placeholder="My portfolio" className={input} /></label>
          <label className="mt-2 block text-sm">Website URL {index + 1}<input required type="url" maxLength={2048} value={row.url} onChange={event => change(index, 'url', event.target.value)} placeholder="https://example.com" className={input} /></label>
          <button type="button" aria-label={`Remove link ${index + 1}`} onClick={() => setRows(current => current.filter((_, i) => i !== index))} className="mt-2 text-sm text-rose-700">Remove</button>
        </div>)}
        {rows.length < MAX_PORTFOLIO_LINKS && <button type="button" onClick={() => setRows(current => [...current, { label: '', url: '' }])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Add link</button>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2">Cancel</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-white">{busy ? 'Saving…' : 'Save links'}</button>
      </div>
    </form>
  </Modal>
}
