import { useEffect, useState } from 'react'
import { API_URL } from '../config'
export default function AdminDocumentImageViewer({ token, accountId, docKey }) {
  const [data, setData] = useState(null), [file, setFile] = useState(null), [side, setSide] = useState('front'), [zoom, setZoom] = useState(1), [rotation, setRotation] = useState(0), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`${API_URL}/api/admin/document-verification/details?${new URLSearchParams({ role: 'Applicant', accountId, docKey })}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/applicants/${accountId}/verification-documents`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async responses => {
      if (responses.some(r => !r.ok)) throw new Error('Document viewer unavailable')
      const [details, documents] = await Promise.all(responses.map(r => r.json()))
      if (active) { setData(details); setFile(documents.documents.find(d => d.docKey === docKey)?.latest) }
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [token, accountId, docKey])
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>Loading document viewer…</p>
  const current = side === 'back' ? file?.back : file
  return <section className="mt-3 grid gap-4 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 lg:grid-cols-2">
    <div><div className="mb-2 flex flex-wrap gap-2">{['front', 'back'].map(value => <button type="button" className="rounded border bg-white p-2" key={value} disabled={value === 'back' && !file?.back} onClick={() => setSide(value)}>Show {value}</button>)}<button type="button" className="rounded border bg-white p-2" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>Zoom in</button><button type="button" className="rounded border bg-white p-2" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>Zoom out</button><button type="button" className="rounded border bg-white p-2" onClick={() => setRotation(rotation + 90)}>Rotate</button></div>
      <div className="h-96 overflow-auto rounded border border-slate-200 bg-slate-50">{current?.url ? current.mimetype === 'application/pdf' ? <iframe title="Verification document PDF" src={`${API_URL}${current.url}`} className="h-full w-full" /> : <img alt="Verification document for admin review" src={`${API_URL}${current.url}`} style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: 'center' }} /> : <p>File unavailable or purged.</p>}</div>
    </div>
    <div><h3 className="font-semibold">Declared details</h3>{Object.entries(data.declaredDetails).map(([key, value]) => <p key={key} className="break-words text-sm">{key}: {String(value || 'Not provided')}</p>)}{data.declaredDetails.format === 'Digital screenshot' && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">National ID screenshot: check carefully</p>}
      {data.authorizationCode && <label>PSA authorization code (admin only)<input type="password" readOnly value={data.authorizationCode} className="block rounded border bg-white p-2 text-slate-900" /></label>}
      <h3 className="mt-3 font-semibold">NSRP details</h3>{['surname', 'firstName', 'middleName', 'suffix', 'dob', 'placeOfBirth'].map(key => <p key={key} className="text-sm">{key}: {data.nsrp[key] || 'Not provided'}</p>)}
      <h3 className="mt-3 font-semibold">Image checks</h3><p>{data.quality?.warnings?.join(', ') || 'No quality warning recorded'}</p>
      <h3 className="mt-3 font-semibold">Cross-check</h3><table className="my-2 w-full text-sm"><thead><tr><th className="text-left">Field group</th><th className="text-left">Result</th><th className="text-left">Evidence</th></tr></thead><tbody>{(data.comparisons || []).map((row, index) => <tr key={index}><td>{row.fieldGroup}</td><td>{row.result.replaceAll('_', ' ')}</td><td>{row.evidence === 'independent' ? 'Independent' : 'Self-declared only'}</td></tr>)}</tbody></table>
      {Object.entries(data.readValues || {}).map(([field, value]) => <p key={field} className="text-sm">Document {field}: {value}</p>)}
      {data.explanation && <p className="mt-2 text-sm">Explanation: {data.explanation.category} — {data.explanation.note}</p>}
      {data.qr?.found && <><p>QR domain: {data.qr.domain || 'Non-URL QR'}</p>{data.qr.allowlisted ? <a className="text-cyan-800 underline" target="_blank" rel="noopener noreferrer" href={docKey === 'birthCertificate' ? 'https://e-cert.psahelpline.ph/verify' : 'https://verify.philsys.gov.ph'}>{docKey === 'birthCertificate' ? 'PSA verification' : 'PSA National ID check'}</a> : <p className="text-amber-900">QR destination is not on the allowlist. No link is opened.</p>}</>}
    </div>
  </section>
}
