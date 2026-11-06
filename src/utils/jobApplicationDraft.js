import { RESUME_MAX_BYTES, RESUME_TYPES } from '../../shared/jobApplication.js'

const fields = ['email', 'mobile', 'bachelorDegree', 'hasExperience', 'experience']
const pending = new Map()
export function applicationDraftKey(user, job) {
  const account = user?.id || user?._id || user?.email?.toLowerCase()
  return account && job?._id ? `peso-job-application:v1:${encodeURIComponent(account)}:${job._id}` : null
}
export function readApplicationDraft(key) {
  try {
    const draft = key && JSON.parse(localStorage.getItem(key))
    if (!draft || draft.version !== 1) return {}
    return { answers: Object.fromEntries(fields.filter((field) => typeof draft.answers?.[field] === 'string').map((field) => [field, draft.answers[field]])), step: Number.isInteger(draft.step) && draft.step >= 0 && draft.step <= 3 ? draft.step : 0 }
  } catch { return {} }
}
export function saveApplicationDraft(key, answers, step) {
  try {
    if (!key) return false
    localStorage.setItem(key, JSON.stringify({ version: 1, answers, step }))
    return true
  } catch { return false }
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Resume storage unavailable'))
    const request = indexedDB.open('peso-job-application-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('resumes')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Resume storage unavailable'))
  })
}
async function resumeTransaction(mode, operation) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    let request, transaction
    try { transaction = db.transaction('resumes', mode); request = operation(transaction.objectStore('resumes')) }
    catch (error) { db.close(); reject(error); return }
    transaction.oncomplete = () => { db.close(); resolve(request.result) }
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Resume storage unavailable')) }
  })
}
function queue(key, action) {
  const operation = (pending.get(key) || Promise.resolve()).catch(() => {}).then(action)
  pending.set(key, operation)
  operation.finally(() => { if (pending.get(key) === operation) pending.delete(key) }).catch(() => {})
  return operation
}
export async function loadApplicationResume(key) {
  if (!key) return null
  await pending.get(key)?.catch(() => {})
  const stored = await resumeTransaction('readonly', (store) => store.get(key))
  return stored?.blob ? new File([stored.blob], stored.name, { type: stored.type, lastModified: stored.lastModified }) : null
}
export function saveApplicationResume(key, file) {
  return queue(key, async () => {
    if (!key) throw new Error('Resume storage unavailable')
    if (file && (file.size > RESUME_MAX_BYTES || !Object.values(RESUME_TYPES).includes(file.type))) throw new Error('Invalid resume')
    return resumeTransaction('readwrite', (store) => file ? store.put({ blob: file, name: file.name, type: file.type, lastModified: file.lastModified }, key) : store.delete(key))
  })
}
export async function clearApplicationDraft(key) {
  try { if (key) localStorage.removeItem(key) } catch { /* Submission still succeeds when browser storage is unavailable. */ }
  if (key) await queue(key, () => resumeTransaction('readwrite', (store) => store.delete(key))).catch(() => {})
}
