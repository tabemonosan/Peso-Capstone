import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

/**
 * Full-height-safe modal shell.
 * The overlay is top-aligned on small screens and centered on larger ones, and
 * the card is a flex column capped at (100dvh - 32px) with a fixed header and
 * footer. Only the body scrolls, so the top of the modal is always reachable.
 * Locks body scroll while open; Esc and the header's Close button call onClose.
 */
export default function OverlayModal({ onClose, labelledBy, header, footer, children, closeDisabled = false }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []
    if (focusable.length) focusable[0].focus()
    else dialogRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !closeDisabled) {
        event.preventDefault()
        onClose?.()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
      previousFocus?.focus?.()
    }
  }, [onClose, closeDisabled])

  return createPortal(
    <div
      data-testid="overlay-modal-overlay"
      className="peso-modal-overlay fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return
          const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []
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
        className="peso-modal-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-[min(1100px,100%)] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white text-black shadow-2xl"
      >
        <div className="flex-none border-b border-slate-200 p-4 sm:px-6">{header}</div>
        <div data-testid="overlay-modal-body" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
        {footer && (
          <div data-testid="overlay-modal-footer" className="flex-none border-t border-slate-200 p-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
