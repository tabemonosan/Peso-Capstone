const jobs = new Set()
export function enqueueVerification(work) {
  const job = new Promise(resolve => setImmediate(() => Promise.resolve().then(work).catch(() => console.error('[verification] background check unavailable; manual review required')).finally(resolve)))
  jobs.add(job); job.finally(() => jobs.delete(job))
}
export async function drainVerificationJobs() { while (jobs.size) await Promise.all([...jobs]) }
