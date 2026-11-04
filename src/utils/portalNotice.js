export const PORTAL_NOTICE_EVENT = 'peso:notice'
export function showNotice(text, type = 'error') {
  if (!text) return
  window.dispatchEvent(new CustomEvent(PORTAL_NOTICE_EVENT, { detail: { text: String(text), type: ['success', 'error', 'info', 'warning'].includes(type) ? type : 'info' } }))
}
