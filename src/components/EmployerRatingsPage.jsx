import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'

export default function EmployerRatingsPage({ token }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchWithTimeout(`${API_URL}/api/employer/ratings?page=${page}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load company ratings.')
        if (active) setData(result)
      })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, page, retry])
  return <section className="portal-card rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Company ratings</h2>
    <p className="mt-2 text-sm text-slate-600">Ratings and feedback from employees. Reviewer identities are hidden.</p>
    {loading ? <p role="status" className="mt-6">Loading ratings...</p> : error ? <div className="mt-6"><p role="alert">{error}</p><button type="button" className="mt-3 rounded-full border px-4 py-2" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : data && <>
      {data.totalRatings > 0 ? <>
        <div className="mt-6 rounded-xl border border-pink-200 bg-pink-50 p-5">
          <p className="text-3xl font-bold" aria-label={`${Number(data.averageScore).toFixed(1)} out of 5 stars`}><span aria-hidden="true" className="text-amber-600">★ </span>{Number(data.averageScore).toFixed(1)}<span className="text-base font-normal"> / 5</span></p>
          <p className="mt-1 text-sm">{data.totalRatings} {data.totalRatings === 1 ? 'rating' : 'ratings'}</p>
        </div>
        <div className="mt-5 space-y-4" aria-label="Employee reviews">
          {data.ratings.map((rating, index) => <article key={`${page}-${index}`} className="rounded-xl border border-pink-200 p-4">
            <h3 className="font-semibold">Anonymous employee</h3>
            <p className="mt-2 text-amber-600" aria-label={`${rating.score} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(rating.score)}{'☆'.repeat(5 - rating.score)}</span></p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">{rating.comment?.trim() || 'No written feedback.'}</p>
          </article>)}
        </div>
        {data.totalRatings > data.pageSize && <nav aria-label="Ratings pagination" className="mt-5 flex items-center justify-center gap-4">
          <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-full border px-4 py-2 disabled:opacity-40">Previous</button>
          <span>Page {page} of {Math.ceil(data.totalRatings / data.pageSize)}</span>
          <button type="button" disabled={page * data.pageSize >= data.totalRatings} onClick={() => setPage(value => value + 1)} className="rounded-full border px-4 py-2 disabled:opacity-40">Next</button>
        </nav>}
      </> : <p className="mt-6 rounded-xl border border-pink-200 p-5">No employee ratings yet.</p>}
    </>}
  </section>
}
