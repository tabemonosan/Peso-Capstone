import { API_URL } from '../config'

export const CONFIRMED_REQUEST = Symbol('confirmed-request')
let requestConfirmation = null
export function registerActionConfirmation(handler) {
  requestConfirmation = handler
  return () => { if (requestConfirmation === handler) requestConfirmation = null }
}

// These requests check data or update passive UI state; they are not business actions.
const passive = [
  /^\/api\/auth\/password-recovery\/verify\/?$/,
  /^\/api\/login\/?$/, /^\/api\/signup\/email-code\/verify\/?$/, /^\/api\/auth\/verify-email\/?$/,
  /^\/api\/nsrp\/(?:validate-signup|preview-signup|preview)\/?$/,
  /^\/api\/employer-registration\/preview\/?$/, /^\/api\/signup\/(?:check-documents|nsrp-import)\/?$/,
  /^\/api\/profile\/nsrp-import\/preview\/?$/, /^\/api\/applications\/validate-email\/?$/,
  /^\/api\/profile\/page-guides\/?$/, /^\/api\/notifications\/(?:read-all|[^/]+\/read)\/?$/,
  /^\/api\/employer\/verification\/approval-notice\/seen\/?$/,
]
export function mutationDescription(input, options = {}) {
  const method = String(options.method || input?.method || 'GET').toUpperCase()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null
  let url
  try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href) } catch { return null }
  const api = new URL(API_URL || '/', window.location.href)
  if (url.origin !== api.origin || !url.pathname.startsWith('/api/') || passive.some(pattern => pattern.test(url.pathname))) return null
  const path = url.pathname
  let title = 'Confirm this action?', note = 'This will submit your changes. Continue?', label = 'Confirm'
  if (method === 'DELETE') { title = 'Delete this item?'; note = 'This will remove the selected item. Continue?'; label = 'Confirm delete' }
  else if (/\/apply\/?$/.test(path)) { title = 'Submit this application?'; note = 'Your application and resume will be shared for this job.'; label = 'Confirm application' }
  else if (/^\/api\/(?:signup|employer-requests)\/?$/.test(path)) { title = 'Submit this registration?'; note = 'Your registration details and selected documents will be submitted.'; label = 'Confirm registration' }
  else if (/\/profile\/?$/.test(path)) { title = 'Save profile changes?'; note = 'These changes will be saved to your profile.'; label = 'Confirm save' }
  else if (/\/settings\/?$/.test(path)) { title = 'Save these settings?'; note = 'These settings will take effect after you confirm.'; label = 'Confirm save' }
  else if (/\/jobs\/?$/.test(path)) { title = 'Submit this job posting?'; note = 'The posting will be submitted to PESO for processing.'; label = 'Confirm submission' }
  else if (/\/jobs\/[^/]+\/?$/.test(path) && method === 'PUT') { title = 'Save job posting changes?'; note = 'The changes to this job posting will be saved.'; label = 'Confirm save' }
  else if (/\/ratings\/?$/.test(path)) { title = 'Submit this rating?'; note = 'Your rating will be recorded and may affect the recipient’s reputation.'; label = 'Confirm rating' }
  else if (/\/(?:resume|file|requirements|employer-requirements|nsrp-verification)\/?$/.test(path) || options.body instanceof FormData) { title = 'Submit these files and details?'; note = 'The selected files and entered details will be uploaded. Continue?'; label = 'Confirm upload' }
  else if (/\/email-code\/?$|\/resend-verification\/?$|\/password-recovery\/request\/?$/.test(path)) { title = 'Send a verification email?'; note = 'A verification email will be sent to the address you entered.'; label = 'Confirm send' }
  else if (/\/password-recovery\/reset\/?$/.test(path)) { title = 'Reset your password?'; note = 'Your password will be changed and existing sessions will end.'; label = 'Confirm reset' }
  else if (/\/status\/?$|\/respond\/?$|\/review\/?$/.test(path)) { title = 'Confirm this decision?'; note = 'This will record your decision and update the record.'; label = 'Confirm decision' }
  return { title, note, confirmLabel: label, confirmTone: method === 'DELETE' ? 'danger' : 'primary' }
}

export async function confirmMutation(input, options = {}) {
  if (options.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
  if (options[CONFIRMED_REQUEST] || !requestConfirmation) return true
  const description = mutationDescription(input, options)
  if (!description || document.querySelector('[data-action-confirmation="manual"]')) return true
  return requestConfirmation(description, options.signal || input?.signal)
}
export function cancelledActionResponse() {
  return new Response(JSON.stringify({ error: 'Action cancelled. No changes were submitted.', code: 'ACTION_CANCELLED', cancelled: true }), { status: 499, headers: { 'Content-Type': 'application/json' } })
}
export function installConfirmedFetch() {
  const original = globalThis.fetch
  const wrapped = async (input, options = {}) => {
    if (!await confirmMutation(input, options)) return cancelledActionResponse()
    const { [CONFIRMED_REQUEST]: _confirmed, ...nativeOptions } = options
    return original(input, nativeOptions)
  }
  globalThis.fetch = wrapped
  return () => { if (globalThis.fetch === wrapped) globalThis.fetch = original }
}
