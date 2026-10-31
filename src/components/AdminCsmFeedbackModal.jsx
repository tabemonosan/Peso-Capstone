import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import { CSM_TEXT, CSM_QUESTION_KEYS, CSM_RATING_VALUES } from '../../shared/csmQuestionnaire.js'
import Modal from './Modal'
import Pagination from './Pagination'

export default function AdminCsmFeedbackModal({ token, onClose }) {
  const [role, setRole] = useState('all')
  const [language, setLanguage] = useState('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ role, language, page: String(page), limit: String(limit) })
    fetch(`${API_URL}/api/csm/responses?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load feedback.')
        if (!cancelled) setData(body)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, role, language, page, limit, refresh])

  return <Modal onClose={onClose} labelledBy="csm-feedback-title" maxWidth="max-w-5xl">
    <div className="flex items-start justify-between gap-4">
      <div><h2 id="csm-feedback-title" className="text-xl font-bold">Client feedback</h2><p className="mt-2 text-sm text-slate-600">Submitted CSM questionnaires from applicants and employers. The supplied English and Tagalog versions have different SQD6 and SQD7 wording; each response retains its chosen version.</p></div>
      <button type="button" onClick={onClose} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Close</button>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">Respondent<select className="shared-form-control" value={role} onChange={(event) => { setRole(event.target.value); setPage(1) }}><option value="all">All respondents</option><option value="Applicant">Applicant / employee</option><option value="Employer">Employer</option></select></label>
      <label className="text-sm font-medium">Language<select className="shared-form-control" value={language} onChange={(event) => { setLanguage(event.target.value); setPage(1) }}><option value="all">All languages</option><option value="en">English</option><option value="tl">Tagalog</option></select></label>
      <button type="button" disabled={loading} onClick={() => setRefresh((current) => current + 1)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Refresh feedback</button>
    </div>
    {loading && <p role="status" className="mt-5 text-sm">Loading feedback...</p>}
    {error && <p role="alert" className="mt-5 text-sm text-rose-700">{error}</p>}
    {!loading && !error && !data.items.length && <p className="mt-5 text-sm text-slate-600">No questionnaires submitted in this view.</p>}
    {!loading && !error && data.items.map((record) => {
      const t = CSM_TEXT[record.language]
      const a = record.answers
      return <article key={record._id} className="mt-5 rounded-2xl border border-slate-200 p-4">
        <h3 className="font-semibold">{record.submitterRole === 'Applicant' ? 'Applicant / employee' : 'Employer'} · {t.language}</h3>
        <p className="mt-1 text-xs text-slate-600">CSM-{record._id.slice(-8).toUpperCase()} · {new Date(record.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-cyan-800">View questionnaire answers</summary>
          <div lang={record.language === 'tl' ? 'fil' : 'en'} className="mt-4 space-y-4">
            <dl className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              {[[t.clientType, t.clientTypes[['citizen', 'business', 'government'].indexOf(a.clientType)]], [t.date, a.date], [t.sex, t.sexes[['male', 'female'].indexOf(a.sex)]], [t.age, a.age], [t.name, a.name], [t.address, a.address], [t.email, a.email]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}
            </dl>
            {[['cc1', t.cc1, t.cc1Options], ['cc2', t.cc2, t.cc2Options], ['cc3', t.cc3, t.cc3Options]].map(([key, label, options]) => <div key={key}><p className="font-semibold">{label}</p><p className="mt-1">{options[Number(a[key]) - 1]}</p></div>)}
            {CSM_QUESTION_KEYS.map((key, index) => <div key={key} className="border-t border-slate-200 pt-3"><p className="font-semibold">{key}. {t.questions[index]}</p><p className="mt-1 text-cyan-900">{t.ratingLabels[CSM_RATING_VALUES.indexOf(a.ratings[key])]}</p></div>)}
            <div className="border-t border-slate-200 pt-3"><p className="font-semibold">{t.suggestions}</p><p className="mt-1 whitespace-pre-wrap break-words">{a.suggestions || '—'}</p></div>
          </div>
        </details>
      </article>
    })}
    {!loading && !error && data.total > 0 && <Pagination page={page} pageSize={limit} totalItems={data.total} onPageChange={setPage} onPageSizeChange={(value) => { setLimit(value); setPage(1) }} itemLabel="questionnaires" ariaLabel="Client feedback pagination" />}
  </Modal>
}
