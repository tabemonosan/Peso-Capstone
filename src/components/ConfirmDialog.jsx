import { useEffect, useRef, useState } from "react"
import Modal from "./Modal"

// Reusable confirmation step for destructive/admin actions. Approve-style
// actions must never fire on a single click — this dialog sits on top of any
// parent modal (higher z-index via a second portal layer).
//
// Props:
//   title        — exact statement of what is being approved/rejected
//   note         — short consequence note
//   confirmLabel — e.g. "Yes, approve" / "Confirm reject"
//   confirmTone  — 'primary' | 'danger'
//   busyLabel    — shown while the request runs, e.g. "Approving..."
//   requireReason — show a required textarea (min reasonMinLength chars)
//   quickReasons  — quick-pick chips that fill the reason textarea
//   error         — inline error message; keeps the dialog open
//   onConfirm(reason) — called with the reason string; parent runs the request
//   onCancel      — close without side effects
export default function ConfirmDialog({
  title,
  note,
  confirmLabel = "Confirm",
  confirmTone = "primary",
  busyLabel = "Working...",
  busy = false,
  requireReason = false,
  reasonMinLength = 5,
  quickReasons = [],
  initialReason = "",
  error = "",
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState(initialReason)
  const cancelRef = useRef(null)
  // Captured during render, before the Modal child moves focus into the dialog
  const openerRef = useRef(null)
  if (openerRef.current === null) openerRef.current = document.activeElement
  const reasonError = requireReason && reason.trim().length < reasonMinLength

  // Default focus lands on Cancel so a quick Enter never confirms;
  // when the dialog closes, focus returns to the button that opened it.
  useEffect(() => {
    const opener = openerRef.current
    const timer = setTimeout(() => cancelRef.current?.focus(), 0)
    return () => {
      clearTimeout(timer)
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus()
    }
  }, [])

  return (
    <Modal onClose={busy ? undefined : onCancel} labelledBy="confirm-dialog-title" describedBy="confirm-dialog-note" maxWidth="max-w-md" role="alertdialog">
      <div>
        <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-900">{title}</h3>
        {note && <p id="confirm-dialog-note" className="mt-1 text-sm text-slate-600">{note}</p>}

        {requireReason && (
          <div className="mt-3">
            {quickReasons.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {quickReasons.map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    disabled={busy}
                    onClick={() => setReason(quick)}
                    className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-cyan-500"
                  >
                    {quick}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              disabled={busy}
              placeholder={`Reason (at least ${reasonMinLength} characters)`}
              aria-label="Reason"
              aria-invalid={reason.length > 0 && reasonError}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
            {reason.length > 0 && reasonError && (
              <p className="mt-1 text-xs text-rose-600">Reason must be at least {reasonMinLength} characters.</p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
          >
            Cancel
          </button>
          {error ? (
            <button
              type="button"
              onClick={() => onConfirm(reason)}
              disabled={busy || (requireReason && reasonError)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${confirmTone === 'danger' ? 'bg-red-600' : 'bg-green-600'}`}
            >
              Retry
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm(reason)}
              disabled={busy || (requireReason && reasonError)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${confirmTone === 'danger' ? 'bg-red-600' : 'bg-green-600'}`}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
