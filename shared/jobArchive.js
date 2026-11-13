// Archive is derived from the deadline, so it also works while the server is
// offline and never changes review status or deletes related application data.
export function jobArchiveAt(job = {}) {
  if (!job.deadline) return null
  // Older date-only values mean the end of that date in Philippine time.
  const deadline = typeof job.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(job.deadline)
    ? `${job.deadline}T23:59:59.999+08:00` : job.deadline
  const at = +new Date(deadline)
  // The deadline is inclusive; archive at the first millisecond after it.
  return Number.isFinite(at) ? new Date(at + 1).toISOString() : null
}
export function isJobArchived(job, now = Date.now()) {
  const at = jobArchiveAt(job)
  return at !== null && +new Date(now) >= +new Date(at)
}
export function partitionJobArchive(jobs = [], now = Date.now()) {
  const active = [], archived = []
  for (const job of jobs) (isJobArchived(job, now) ? archived : active).push(job)
  return { active, archived }
}
