import { formatLocation, formatSalary, mapEmploymentType } from '../../shared/jobPosting.js'

export default function JobPostingDetails({ job, onClose, onEdit }) {
  const fields = [
    ['Status', job.status || 'pending'],
    ['Location', formatLocation(job) || 'Not specified'],
    ['Barangay', job.barangay || 'Not specified'],
    ['Location type', job.locationType || 'Not specified'],
    ['Employment type', mapEmploymentType(job.employmentType) || 'Not specified'],
    ['Educational attainment', job.education || 'Not Required'],
    ['Experience', job.experience || 'No Experience'],
    ['Salary', formatSalary(job) || 'Not specified'],
    ['Pay frequency', job.payFrequency || 'Monthly'],
    ['Negotiable', job.negotiable ? 'Yes' : 'No'],
    ['Required skills', (job.skills || []).join(', ') || 'Not specified'],
    ['Slots', job.slots ?? 'Not specified'],
    ['Application deadline', job.deadline ? new Date(job.deadline).toLocaleDateString() : 'Not specified'],
  ]
  return <>
    <div className="flex items-start justify-between gap-4">
      <div><h2 id="employer-job-details-title" className="text-xl font-bold text-slate-900">{job.title}</h2><p id="employer-job-details-company" className="mt-1 text-sm text-slate-600">{job.company}</p></div>
      {onClose && <button type="button" onClick={onClose} aria-label="Close job details" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Close</button>}
    </div>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2">
      {fields.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value}</dd></div>)}
    </dl>
    {['description', 'requirements'].map((key) => <section key={key} className="mt-4 rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-semibold">{key === 'description' ? 'Full description' : 'Requirements'}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{job[key] || 'Not specified'}</p></section>)}
    {job.status === 'declined' && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Reason: {job.reviewReason || 'No reason provided.'}</p>}
    {job.status === 'pending' && onEdit && <button type="button" onClick={onEdit} className="mt-5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Edit pending request</button>}
  </>
}
