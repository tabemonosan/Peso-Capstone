import { useState } from 'react'
import { API_URL } from '../config'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { VERIFICATION_DOC_LABELS } from '../../shared/verificationDocs.js'
export default function CheckDocumentsButton({ docs, nsrp = {}, disabled }) {
  const [busy, setBusy] = useState(false), [issues, setIssues] = useState(null), [error, setError] = useState('')
  const check = async () => {
    setBusy(true); setError('')
    try {
      const body = new FormData()
      body.append('verificationDetails', JSON.stringify({ birthCertificate: docs.birthDetails || {}, validId1: docs.id1, validId2: docs.id2 }))
      body.append('nsrpAnswers', JSON.stringify(nsrp))
      body.append('id1Type', docs.id1.type); body.append('id2Type', docs.id2.type)
      for (const [key, file] of Object.entries({ birthCertificate: docs.birthCertificate, validId1Front: docs.id1.front, validId1Back: docs.id1.back, validId2Front: docs.id2.front, validId2Back: docs.id2.back })) if (file) body.append(key, file)
      const response = await fetchWithTimeout(`${API_URL}/api/signup/check-documents`, { method: 'POST', body })
      const result = await response.json()
      if (!response.ok || !Array.isArray(result.issues)) throw new Error('Check unavailable')
      setIssues(result.issues)
    } catch { setError('The check is unavailable. You can still submit your documents for PESO review.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-slate-900">
    <p>After you submit, we compare your documents with the details you entered. If something doesn't match, your account may be waitlisted until you fix or explain it.</p>
    <button type="button" onClick={check} disabled={busy || disabled} className="mt-3 rounded-lg border border-cyan-500 bg-white px-3 py-2 font-semibold text-cyan-900">{busy ? 'Checking documents…' : 'Check my documents'}</button>
    <p className="mt-2 text-xs">This optional check uses your typed details and file quality. It does not read document text or block submission.</p>
    {issues && <div role="status" className="mt-3">{!issues.length ? 'No problems found by this preliminary check. PESO will still review your submission.' : <ul className="list-inside list-disc">{issues.map((issue, index) => <li key={index}>{VERIFICATION_DOC_LABELS[issue.docKey] || 'Document'}: {issue.message}</li>)}</ul>}</div>}
    {error && <p role="status" className="mt-2">{error}</p>}
  </section>
}
