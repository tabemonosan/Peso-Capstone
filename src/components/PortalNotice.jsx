import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PORTAL_NOTICE_EVENT } from '../utils/portalNotice'

const styles = {
  success: ['Done', 'border-emerald-200 bg-emerald-50 text-emerald-950'],
  error: ['Action needed', 'border-rose-200 bg-rose-50 text-rose-950'],
  info: ['Update', 'border-blue-200 bg-blue-50 text-blue-950'],
  warning: ['Please check', 'border-amber-200 bg-amber-50 text-amber-950'],
}
function Notice({ notice, onDismiss }) {
  useEffect(() => {
    if (notice.type === 'error' || notice.type === 'warning') return
    const timer = setTimeout(() => onDismiss(notice.id), notice.type === 'success' ? 6000 : 8000)
    return () => clearTimeout(timer)
  }, [notice.id, notice.type, onDismiss])
  const [title, style] = styles[notice.type]
  return <div role={notice.type === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-lg ${style}`}>
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 break-words text-sm">{notice.text}</p></div>
    <button type="button" aria-label={`Dismiss notification: ${notice.text}`} onClick={() => onDismiss(notice.id)} className="shrink-0 rounded-full border border-current px-3 py-1 text-xs font-semibold">Dismiss</button>
  </div>
}
export default function PortalNotice() {
  const [notices, setNotices] = useState([])
  const sequence = useRef(0)
  const dismiss = useCallback(id => setNotices(current => current.filter(item => item.id !== id)), [])
  useEffect(() => {
    const receive = event => {
      const { text, type } = event.detail || {}
      if (typeof text !== 'string' || !text || !Object.hasOwn(styles, type)) return
      const notice = { id: ++sequence.current, text, type }
      setNotices(current => [...current.filter(item => item.text !== text || item.type !== type), notice].slice(-3))
    }
    window.addEventListener(PORTAL_NOTICE_EVENT, receive)
    return () => window.removeEventListener(PORTAL_NOTICE_EVENT, receive)
  }, [])
  return createPortal(<section aria-label="Portal notifications" className="pointer-events-none fixed inset-x-3 top-3 z-[1000] flex flex-col gap-3 sm:left-auto sm:right-6 sm:top-6 sm:w-full sm:max-w-md">{notices.map(notice => <Notice key={notice.id} notice={notice} onDismiss={dismiss} />)}</section>, document.body)
}
