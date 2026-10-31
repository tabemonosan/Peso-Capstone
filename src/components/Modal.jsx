import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

// Shared modal shell used by the Job Postings detail modal and the
// verification documents modals. Renders via a portal to document.body so no
// parent's overflow, transform, or z-index can trap it. Behavior: focus trap,
// Esc to close, click-outside to close, scrollable body, body scroll lock.
export default function Modal({ onClose, labelledBy, describedBy, maxWidth = "max-w-3xl", role = "dialog", children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return createPortal(
    <div
      className="peso-modal-overlay fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/75 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onClose?.()
            return
          }
          if (event.key !== "Tab") return
          const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []
          if (!focusable.length) {
            event.preventDefault()
            dialogRef.current?.focus()
            return
          }
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
            event.preventDefault()
            first.focus()
          }
        }}
        className={`peso-modal-panel max-h-[92dvh] w-full ${maxWidth} overflow-y-auto rounded-t-2xl border border-slate-300 bg-white p-5 text-slate-900 shadow-2xl sm:rounded-2xl sm:p-6`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
