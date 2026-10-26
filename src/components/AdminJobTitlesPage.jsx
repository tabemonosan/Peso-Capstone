import { useCallback, useEffect, useState } from "react"
import { API_URL } from "../config"
import Pagination from "./Pagination"
import { usePagination } from "../hooks/usePagination"

export default function AdminJobTitlesPage({ token, onChanged }) {
  const [categories, setCategories] = useState([])
  const titlesPagination = usePagination({ syncUrl: false })
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const loadTitles = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/job-titles`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not load job titles.")
      setCategories(data?.categories || [])
      setError("")
    } catch (loadError) {
      console.error(loadError)
      setError(loadError?.message || "Could not load job titles.")
    }
  }, [token])

  useEffect(() => {
    loadTitles()
  }, [loadTitles])

  const addTitle = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`${API_URL}/api/admin/job-titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, category }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not add job title.")
      setName("")
      setCategory("")
      setMessage("Job title added.")
      await loadTitles()
      onChanged?.()
    } catch (addError) {
      console.error(addError)
      setError(addError?.message || "Could not add job title.")
    } finally {
      setBusy(false)
    }
  }

  const removeTitle = async (id) => {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`${API_URL}/api/admin/job-titles/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not remove job title.")
      setMessage("Job title removed. Existing job postings are unchanged.")
      await loadTitles()
      onChanged?.()
    } catch (removeError) {
      console.error(removeError)
      setError(removeError?.message || "Could not remove job title.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-6 text-black">
      <h2 className="text-xl font-semibold">Manage Job Titles</h2>
      <p className="mt-2 text-sm text-slate-600">Add or remove options available to employers when creating job postings.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}

      <form onSubmit={addTitle} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium">
          Title
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium">
          Category
          <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={60} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>
        <button type="submit" disabled={busy} className="self-end rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
          Add title
        </button>
      </form>

      <div className="mt-6 space-y-5">
        {titlesPagination.paginate(categories).map((group) => (
          <section key={group.category} aria-label={group.category}>
            <h3 className="font-semibold">{group.category}</h3>
            <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">
              {group.titles.map((title) => (
                <li key={title.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>{title.name}</span>
                  <button type="button" disabled={busy} onClick={() => removeTitle(title.id)} className="rounded-lg border border-rose-300 px-3 py-1 text-sm font-medium text-rose-700 disabled:opacity-50">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {categories.length === 0 && !error && <p className="text-sm text-slate-600">No job titles have been added yet.</p>}
      </div>
      {categories.length > 0 && (
        <Pagination
          page={titlesPagination.page}
          pageSize={titlesPagination.pageSize}
          totalItems={categories.length}
          onPageChange={titlesPagination.setPage}
          onPageSizeChange={titlesPagination.setPageSize}
          itemLabel="categories"
          ariaLabel="Job titles pagination"
        />
      )}
    </section>
  )
}
