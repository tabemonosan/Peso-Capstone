import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
export const nsrpDigest = buffer => createHash('sha256').update(buffer).digest('hex')
export function importProof(secret, owner, buffer, answers) {
  return jwt.sign({ purpose: 'nsrp-import', owner, digest: nsrpDigest(buffer), answers }, secret, { expiresIn: '30m' })
}
export function reviewedImport(secret, token, owner, buffer) {
  try {
    const data = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (data.purpose === 'nsrp-import' && data.owner === owner && data.digest === nsrpDigest(buffer)) return data.answers
  } catch { /* Expired, replaced, or unreviewed imports must be read again. */ }
  throw Object.assign(new Error('Read and review the current NSRP again before using its details.'), { status: 409 })
}
let active = 0
export async function extractNsrp(buffer) {
  if (active >= 2) throw Object.assign(new Error('The NSRP reader is busy. Please try again shortly.'), { status: 429 })
  active++
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./nsrpImportWorker.js', import.meta.url), { workerData: buffer, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 256 } })
      let done = false
      const finish = (err, result) => { if (done) return; done = true; clearTimeout(timer); worker.terminate(); if (err) reject(Object.assign(new Error(err), { status: 422 })); else resolve(result) }
      const timer = setTimeout(() => finish('Reading took too long. Try a clearer typed PDF or enter your information manually.'), 45000)
      worker.once('message', data => finish(data.error, data.result))
      worker.once('error', () => finish('The NSRP could not be read. Try another PDF or enter your information manually.'))
      worker.once('exit', () => { if (!done) finish('The NSRP reader stopped. Please try again.') })
    })
  } finally { active-- }
}
