import { API_URL } from '../config'
import { fetchWithTimeout } from './fetchWithTimeout'
export async function workflowRequest(token, path, body) {
  const response = await fetchWithTimeout(`${API_URL}/api/workflow${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'This request could not be completed.')
  return result
}
export const workflowDate = (date) => date ? new Date(date).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'
export const workflowControl = 'shared-form-control block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
